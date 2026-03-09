import * as THREE from 'three';
import { getCollisionGeometryEntries, mergeAssembly, updateCollisionGeometryByObjectIndex } from '@/core/robot';
import type { AssemblyState, GeometryType as GeometryTypeValue, RobotData, UrdfJoint, UrdfLink, UrdfVisual } from '@/types';
import { GeometryType } from '@/types';
import {
  convertGeometryType,
  type MeshAnalysis,
  type MeshClearanceObstacle,
} from './geometryConversion';
import { analyzeMeshBatchWithWorker } from './meshAnalysisWorkerBridge';

export type CollisionOptimizationSource =
  | { kind: 'robot'; robot: RobotData }
  | { kind: 'assembly'; assembly: AssemblyState };

export type CollisionOptimizationScope = 'all' | 'mesh' | 'primitive' | 'selected';
export type MeshOptimizationStrategy = 'keep' | 'smart' | 'box' | 'sphere' | 'cylinder' | 'capsule';
export type CylinderOptimizationStrategy = 'keep' | 'capsule';
export type RodBoxOptimizationStrategy = 'keep' | 'capsule' | 'cylinder';

export interface CollisionOptimizationSettings {
  scope: CollisionOptimizationScope;
  meshStrategy: MeshOptimizationStrategy;
  cylinderStrategy: CylinderOptimizationStrategy;
  rodBoxStrategy: RodBoxOptimizationStrategy;
  avoidSiblingOverlap: boolean;
  selectedTargetId?: string | null;
}

export interface CollisionTargetRef {
  id: string;
  componentId?: string;
  componentName?: string;
  linkId: string;
  linkName: string;
  objectIndex: number;
  bodyIndex: number | null;
  geometry: UrdfVisual;
  isPrimary: boolean;
  sequenceIndex: number;
}

export type CollisionOptimizationReason =
  | 'mesh-smart-fit'
  | 'mesh-manual-fit'
  | 'cylinder-to-capsule'
  | 'rod-box-to-capsule'
  | 'rod-box-to-cylinder';

export type CollisionOptimizationStatus =
  | 'ready'
  | 'disabled'
  | 'missing-mesh-path'
  | 'mesh-analysis-failed'
  | 'no-rule-match';

export interface CollisionOptimizationCandidate {
  target: CollisionTargetRef;
  eligible: boolean;
  currentType: GeometryTypeValue;
  suggestedType: GeometryTypeValue | null;
  status: CollisionOptimizationStatus;
  reason?: CollisionOptimizationReason;
  nextGeometry?: UrdfVisual;
}

export interface CollisionOptimizationOperation {
  id: string;
  componentId?: string;
  linkId: string;
  objectIndex: number;
  nextGeometry: UrdfVisual;
  reason: CollisionOptimizationReason;
  fromType: GeometryTypeValue;
  toType: GeometryTypeValue;
}

export interface CollisionOptimizationAnalysis {
  targets: CollisionTargetRef[];
  filteredTargets: CollisionTargetRef[];
  candidates: CollisionOptimizationCandidate[];
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>;
}

export interface CollisionOptimizationBaseAnalysis {
  targets: CollisionTargetRef[];
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>;
  clearanceWorld: CollisionOptimizationClearanceWorld | null;
}

interface CollisionOptimizationClearanceWorld {
  robot: RobotData;
  linkWorldMatrices: Record<string, THREE.Matrix4>;
  broadPhaseByTargetId: Record<string, { center: THREE.Vector3; radius: number }>;
}

interface CollisionClearanceContext {
  siblingGeometries?: UrdfVisual[];
  meshClearanceObstacles?: MeshClearanceObstacle[];
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const DEFAULT_CANDIDATE_ANALYSIS_YIELD_EVERY = 8;

export interface CollisionOptimizationAsyncOptions {
  signal?: AbortSignal;
  yieldEvery?: number;
  includeClearanceData?: boolean;
  includeMeshClearanceObstacles?: boolean;
  pointCollectionLimit?: number;
  surfacePointLimit?: number;
}

function createAbortError(): DOMException {
  return new DOMException('Collision optimization analysis aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function yieldToMainThread(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

async function maybeYieldAfterBatch(
  index: number,
  yieldEvery: number,
  signal?: AbortSignal,
): Promise<void> {
  if (yieldEvery > 0 && (index + 1) % yieldEvery === 0) {
    throwIfAborted(signal);
    await yieldToMainThread();
  }
}

function createTargetId(componentId: string | undefined, linkId: string, objectIndex: number): string {
  return `${componentId ?? 'robot'}::${linkId}::${objectIndex}`;
}

function getLinkGroupKey(target: Pick<CollisionTargetRef, 'componentId' | 'linkId'>): string {
  return `${target.componentId ?? 'robot'}::${target.linkId}`;
}

function createMeshAnalysisCacheKey(geometry: Pick<UrdfVisual, 'meshPath' | 'dimensions'>): string {
  return [
    geometry.meshPath ?? '',
    geometry.dimensions?.x ?? 1,
    geometry.dimensions?.y ?? 1,
    geometry.dimensions?.z ?? 1,
  ].join('::');
}

function cloneGeometry(geometry: UrdfVisual): UrdfVisual {
  return {
    ...geometry,
    dimensions: { ...geometry.dimensions },
    origin: {
      xyz: { ...geometry.origin.xyz },
      rpy: { ...geometry.origin.rpy },
    },
  };
}

function normalizeGeometry(geometry: UrdfVisual): UrdfVisual {
  return {
    ...cloneGeometry(geometry),
    dimensions: {
      x: Number.isFinite(geometry.dimensions?.x) ? geometry.dimensions.x : 0,
      y: Number.isFinite(geometry.dimensions?.y) ? geometry.dimensions.y : 0,
      z: Number.isFinite(geometry.dimensions?.z) ? geometry.dimensions.z : 0,
    },
    origin: {
      xyz: {
        x: Number.isFinite(geometry.origin?.xyz?.x) ? geometry.origin.xyz.x : 0,
        y: Number.isFinite(geometry.origin?.xyz?.y) ? geometry.origin.xyz.y : 0,
        z: Number.isFinite(geometry.origin?.xyz?.z) ? geometry.origin.xyz.z : 0,
      },
      rpy: {
        r: Number.isFinite(geometry.origin?.rpy?.r) ? geometry.origin.rpy.r : 0,
        p: Number.isFinite(geometry.origin?.rpy?.p) ? geometry.origin.rpy.p : 0,
        y: Number.isFinite(geometry.origin?.rpy?.y) ? geometry.origin.rpy.y : 0,
      },
    },
  };
}

function createOriginMatrix(origin?: UrdfVisual['origin']): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(
    origin?.xyz?.x ?? 0,
    origin?.xyz?.y ?? 0,
    origin?.xyz?.z ?? 0,
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      origin?.rpy?.r ?? 0,
      origin?.rpy?.p ?? 0,
      origin?.rpy?.y ?? 0,
      'ZYX',
    ),
  );
  matrix.compose(position, quaternion, UNIT_SCALE);
  return matrix;
}

function createJointMotionMatrix(joint: UrdfJoint): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().identity();
  const angle = Number.isFinite(joint.angle) ? joint.angle! : 0;

  if (joint.type === 'revolute' || joint.type === 'continuous') {
    const axisVector = new THREE.Vector3(joint.axis.x, joint.axis.y, joint.axis.z);
    if (axisVector.lengthSq() > 1e-12 && Math.abs(angle) > 1e-12) {
      axisVector.normalize();
      matrix.makeRotationAxis(axisVector, angle);
    }
    return matrix;
  }

  if (joint.type === 'prismatic') {
    const axisVector = new THREE.Vector3(joint.axis.x, joint.axis.y, joint.axis.z);
    if (axisVector.lengthSq() > 1e-12 && Math.abs(angle) > 1e-12) {
      axisVector.normalize().multiplyScalar(angle);
      matrix.makeTranslation(axisVector.x, axisVector.y, axisVector.z);
    }
  }

  return matrix;
}

function computeLinkWorldMatrices(robot: RobotData): Record<string, THREE.Matrix4> {
  const linkMatrices: Record<string, THREE.Matrix4> = {};
  const jointsByParent = new Map<string, UrdfJoint[]>();

  Object.values(robot.joints).forEach((joint) => {
    const siblings = jointsByParent.get(joint.parentLinkId) ?? [];
    siblings.push(joint);
    jointsByParent.set(joint.parentLinkId, siblings);
  });

  const visit = (linkId: string, parentMatrix: THREE.Matrix4) => {
    if (linkMatrices[linkId]) {
      return;
    }

    linkMatrices[linkId] = parentMatrix.clone();
    const childJoints = jointsByParent.get(linkId) ?? [];

    childJoints.forEach((joint) => {
      const childMatrix = parentMatrix.clone()
        .multiply(createOriginMatrix(joint.origin))
        .multiply(createJointMotionMatrix(joint));
      visit(joint.childLinkId, childMatrix);
    });
  };

  if (robot.rootLinkId) {
    visit(robot.rootLinkId, new THREE.Matrix4().identity());
  }

  return linkMatrices;
}

function transformGeometryToTargetLinkFrame(
  geometry: UrdfVisual,
  sourceLinkMatrix: THREE.Matrix4,
  targetLinkInverseMatrix: THREE.Matrix4,
): UrdfVisual {
  const relativeMatrix = targetLinkInverseMatrix.clone()
    .multiply(sourceLinkMatrix)
    .multiply(createOriginMatrix(geometry.origin));
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  relativeMatrix.decompose(position, quaternion, scale);
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'ZYX');

  return {
    ...geometry,
    dimensions: geometry.dimensions ? { ...geometry.dimensions } : geometry.dimensions,
    origin: {
      xyz: {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      rpy: {
        r: rotation.x,
        p: rotation.y,
        y: rotation.z,
      },
    },
  };
}

function transformMeshObstaclePointsToTargetLinkFrame(
  points: NonNullable<MeshAnalysis['surfacePoints']>,
  sourceLinkMatrix: THREE.Matrix4,
  geometryOrigin: UrdfVisual['origin'],
  targetLinkInverseMatrix: THREE.Matrix4,
): MeshClearanceObstacle {
  const transformMatrix = targetLinkInverseMatrix.clone()
    .multiply(sourceLinkMatrix)
    .multiply(createOriginMatrix(geometryOrigin));
  const transformedPoint = new THREE.Vector3();

  return {
    points: points.map((point) => {
      transformedPoint.set(point.x, point.y, point.z).applyMatrix4(transformMatrix);
      return {
        x: transformedPoint.x,
        y: transformedPoint.y,
        z: transformedPoint.z,
      };
    }),
  };
}

function buildCollisionTargetsForRobot(
  robot: RobotData,
  componentMeta?: { componentId: string; componentName: string },
): CollisionTargetRef[] {
  const targets: CollisionTargetRef[] = [];

  Object.values(robot.links).forEach((link) => {
    const entries = getCollisionGeometryEntries(link);
    entries.forEach((entry, index) => {
      targets.push({
        id: createTargetId(componentMeta?.componentId, link.id, entry.objectIndex),
        componentId: componentMeta?.componentId,
        componentName: componentMeta?.componentName,
        linkId: link.id,
        linkName: link.name,
        objectIndex: entry.objectIndex,
        bodyIndex: entry.bodyIndex,
        geometry: cloneGeometry(entry.geometry),
        isPrimary: entry.bodyIndex === null,
        sequenceIndex: index,
      });
    });
  });

  return targets;
}

export function collectCollisionTargets(source: CollisionOptimizationSource): CollisionTargetRef[] {
  if (source.kind === 'robot') {
    return buildCollisionTargetsForRobot(source.robot);
  }

  return Object.values(source.assembly.components).flatMap((component) =>
    buildCollisionTargetsForRobot(component.robot, {
      componentId: component.id,
      componentName: component.name,
    }),
  );
}

function filterTargets(
  targets: CollisionTargetRef[],
  settings: CollisionOptimizationSettings,
): CollisionTargetRef[] {
  if (settings.scope === 'selected') {
    return settings.selectedTargetId
      ? targets.filter((target) => target.id === settings.selectedTargetId)
      : [];
  }

  if (settings.scope === 'mesh') {
    return targets.filter((target) => target.geometry.type === GeometryType.MESH);
  }

  if (settings.scope === 'primitive') {
    return targets.filter((target) => target.geometry.type !== GeometryType.MESH);
  }

  return targets;
}

function isRodLikeBox(geometry: UrdfVisual): boolean {
  if (geometry.type !== GeometryType.BOX) return false;

  const dims = [geometry.dimensions.x, geometry.dimensions.y, geometry.dimensions.z]
    .map((value) => Math.max(value, 1e-6))
    .sort((left, right) => left - right);
  const [smallest, middle, largest] = dims;

  return largest / Math.max(middle, smallest) >= 1.75
    && Math.abs(middle - smallest) / Math.max(middle, smallest) <= 0.35;
}

function pickSmartMeshStrategy(analysis: MeshAnalysis): MeshOptimizationStrategy {
  const dims = [analysis.bounds.x, analysis.bounds.y, analysis.bounds.z]
    .map((value) => Math.max(value, 1e-6))
    .sort((left, right) => left - right);
  const [smallest, middle, largest] = dims;

  const nearSphere = largest / smallest <= 1.12;
  if (nearSphere) {
    return 'sphere';
  }

  const rodLike = largest / Math.max(middle, smallest) >= 1.75
    && Math.abs(middle - smallest) / Math.max(middle, smallest) <= 0.28;
  if (rodLike) {
    return analysis.primitiveFits?.capsule ? 'capsule' : 'cylinder';
  }

  return 'box';
}

function toGeometryType(strategy: MeshOptimizationStrategy): GeometryTypeValue {
  switch (strategy) {
    case 'box':
      return GeometryType.BOX;
    case 'sphere':
      return GeometryType.SPHERE;
    case 'cylinder':
      return GeometryType.CYLINDER;
    case 'capsule':
      return GeometryType.CAPSULE;
    case 'keep':
    case 'smart':
    default:
      return GeometryType.BOX;
  }
}

function buildSiblingGeometries(
  targets: CollisionTargetRef[],
  target: CollisionTargetRef,
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>,
): UrdfVisual[] {
  const groupKey = getLinkGroupKey(target);
  return targets
    .filter((candidate) => candidate.id !== target.id && getLinkGroupKey(candidate) === groupKey)
    .map((candidate) => {
      if (candidate.geometry.type !== GeometryType.MESH) {
        return cloneGeometry(candidate.geometry);
      }

      const analysis = meshAnalysisByTargetId[candidate.id];
      if (!analysis) {
        return cloneGeometry(candidate.geometry);
      }

      const converted = convertGeometryType(candidate.geometry, GeometryType.BOX, analysis);
      return {
        ...normalizeGeometry(candidate.geometry),
        type: GeometryType.BOX,
        dimensions: { ...converted.dimensions },
        origin: {
          xyz: { ...converted.origin.xyz },
          rpy: { ...converted.origin.rpy },
        },
        meshPath: undefined,
      };
    });
}

function computeWorldBroadPhaseSphere(
  geometry: UrdfVisual,
  meshAnalysis: MeshAnalysis | null | undefined,
  sourceLinkMatrix: THREE.Matrix4 | undefined,
): { center: THREE.Vector3; radius: number } | null {
  if (!sourceLinkMatrix) {
    return null;
  }

  const radius = computeBroadPhaseRadius(geometry, meshAnalysis);
  if (!radius || radius <= 1e-8) {
    return null;
  }

  const localCenter = computeBroadPhaseCenter(geometry, meshAnalysis);
  const worldCenter = new THREE.Vector3(localCenter.x, localCenter.y, localCenter.z)
    .applyMatrix4(sourceLinkMatrix);

  return {
    center: worldCenter,
    radius,
  };
}

function buildCollisionOptimizationClearanceWorld(
  source: CollisionOptimizationSource,
  targets: CollisionTargetRef[],
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>,
): CollisionOptimizationClearanceWorld | null {
  const robot = source.kind === 'robot' ? source.robot : mergeAssembly(source.assembly);
  if (!robot.rootLinkId || Object.keys(robot.links).length === 0) {
    return null;
  }

  const linkWorldMatrices = computeLinkWorldMatrices(robot);
  if (Object.keys(linkWorldMatrices).length === 0) {
    return null;
  }

  const broadPhaseByTargetId: Record<string, { center: THREE.Vector3; radius: number }> = {};
  targets.forEach((target) => {
    const sphere = computeWorldBroadPhaseSphere(
      target.geometry,
      meshAnalysisByTargetId[target.id],
      linkWorldMatrices[target.linkId],
    );
    if (sphere) {
      broadPhaseByTargetId[target.id] = sphere;
    }
  });

  return {
    robot,
    linkWorldMatrices,
    broadPhaseByTargetId,
  };
}

function buildNearbyCollisionClearanceContext(
  targets: CollisionTargetRef[],
  target: CollisionTargetRef,
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>,
  clearanceWorld: CollisionOptimizationClearanceWorld | null,
  includeMeshClearanceObstacles = true,
): CollisionClearanceContext {
  if (!clearanceWorld) {
    const siblingGeometries = buildSiblingGeometries(targets, target, meshAnalysisByTargetId);
    return {
      siblingGeometries: siblingGeometries.length > 0 ? siblingGeometries : undefined,
    };
  }

  const currentLinkMatrix = clearanceWorld.linkWorldMatrices[target.linkId];
  if (!currentLinkMatrix) {
    const siblingGeometries = buildSiblingGeometries(targets, target, meshAnalysisByTargetId);
    return {
      siblingGeometries: siblingGeometries.length > 0 ? siblingGeometries : undefined,
    };
  }

  const currentLinkInverseMatrix = currentLinkMatrix.clone().invert();
  const targetSphere = clearanceWorld.broadPhaseByTargetId[target.id] ?? null;
  const siblingGeometries: UrdfVisual[] = [];
  const meshClearanceObstacles: MeshClearanceObstacle[] = [];

  targets.forEach((candidate) => {
    if (candidate.id === target.id) {
      return;
    }

    const sourceLinkMatrix = clearanceWorld.linkWorldMatrices[candidate.linkId];
    if (!sourceLinkMatrix) {
      return;
    }

    const obstacleSphere = clearanceWorld.broadPhaseByTargetId[candidate.id] ?? null;
    if (targetSphere && obstacleSphere) {
      const maxInfluenceDistance = targetSphere.radius + obstacleSphere.radius + 0.05;
      if (targetSphere.center.distanceTo(obstacleSphere.center) > maxInfluenceDistance) {
        return;
      }
    }

    const geometry = candidate.geometry;
    const analysis = meshAnalysisByTargetId[candidate.id];
    const meshObstacle = includeMeshClearanceObstacles
      && analysis?.surfacePoints?.length
      && geometry.type === GeometryType.MESH
      ? transformMeshObstaclePointsToTargetLinkFrame(
          analysis.surfacePoints,
          sourceLinkMatrix,
          geometry.origin,
          currentLinkInverseMatrix,
        )
      : null;

    if (meshObstacle?.points.length) {
      meshClearanceObstacles.push(meshObstacle);
    }

    if (geometry.type !== GeometryType.MESH || !analysis) {
      siblingGeometries.push(
        transformGeometryToTargetLinkFrame(geometry, sourceLinkMatrix, currentLinkInverseMatrix),
      );
      return;
    }

    const boxedGeometry = convertGeometryType(geometry, GeometryType.BOX, analysis);
    siblingGeometries.push(transformGeometryToTargetLinkFrame({
      ...geometry,
      type: GeometryType.BOX,
      dimensions: { ...boxedGeometry.dimensions },
      origin: {
        xyz: { ...boxedGeometry.origin.xyz },
        rpy: { ...boxedGeometry.origin.rpy },
      },
      meshPath: undefined,
    }, sourceLinkMatrix, currentLinkInverseMatrix));
  });

  return {
    siblingGeometries: siblingGeometries.length > 0 ? siblingGeometries : undefined,
    meshClearanceObstacles: meshClearanceObstacles.length > 0 ? meshClearanceObstacles : undefined,
  };
}

function buildMeshCandidate(
  target: CollisionTargetRef,
  settings: CollisionOptimizationSettings,
  analysis: MeshAnalysis | null | undefined,
  clearanceContext: CollisionClearanceContext,
): CollisionOptimizationCandidate {
  if (settings.meshStrategy === 'keep') {
    return {
      target,
      eligible: false,
      currentType: target.geometry.type,
      suggestedType: null,
      status: 'disabled',
    };
  }

  if (!target.geometry.meshPath) {
    return {
      target,
      eligible: false,
      currentType: target.geometry.type,
      suggestedType: null,
      status: 'missing-mesh-path',
    };
  }

  if (!analysis) {
    return {
      target,
      eligible: false,
      currentType: target.geometry.type,
      suggestedType: null,
      status: 'mesh-analysis-failed',
    };
  }

  const resolvedStrategy = settings.meshStrategy === 'smart'
    ? pickSmartMeshStrategy(analysis)
    : settings.meshStrategy;
  const suggestedType = toGeometryType(resolvedStrategy);
  const converted = convertGeometryType(
    target.geometry,
    suggestedType,
    analysis,
    settings.avoidSiblingOverlap ? clearanceContext : undefined,
  );

  const nextGeometry: UrdfVisual = {
    ...normalizeGeometry(target.geometry),
    type: converted.type,
    dimensions: { ...converted.dimensions },
    origin: {
      xyz: { ...converted.origin.xyz },
      rpy: { ...converted.origin.rpy },
    },
    meshPath: undefined,
  };

  return {
    target,
    eligible: true,
    currentType: target.geometry.type,
    suggestedType,
    status: 'ready',
    reason: settings.meshStrategy === 'smart' ? 'mesh-smart-fit' : 'mesh-manual-fit',
    nextGeometry,
  };
}

function buildPrimitiveCandidate(
  target: CollisionTargetRef,
  settings: CollisionOptimizationSettings,
  clearanceContext: CollisionClearanceContext,
): CollisionOptimizationCandidate {
  if (target.geometry.type === GeometryType.CYLINDER) {
    if (settings.cylinderStrategy === 'keep') {
      return {
        target,
        eligible: false,
        currentType: target.geometry.type,
        suggestedType: null,
        status: 'disabled',
      };
    }

    const converted = convertGeometryType(
      target.geometry,
      GeometryType.CAPSULE,
      undefined,
      settings.avoidSiblingOverlap ? clearanceContext : undefined,
    );

    return {
      target,
      eligible: true,
      currentType: target.geometry.type,
      suggestedType: GeometryType.CAPSULE,
      status: 'ready',
      reason: 'cylinder-to-capsule',
      nextGeometry: {
        ...normalizeGeometry(target.geometry),
        type: GeometryType.CAPSULE,
        dimensions: { ...converted.dimensions },
        origin: {
          xyz: { ...converted.origin.xyz },
          rpy: { ...converted.origin.rpy },
        },
      },
    };
  }

  if (target.geometry.type === GeometryType.BOX && settings.rodBoxStrategy !== 'keep' && isRodLikeBox(target.geometry)) {
    const suggestedType = settings.rodBoxStrategy === 'capsule'
      ? GeometryType.CAPSULE
      : GeometryType.CYLINDER;
    const converted = convertGeometryType(
      target.geometry,
      suggestedType,
      undefined,
      settings.avoidSiblingOverlap ? clearanceContext : undefined,
    );

    return {
      target,
      eligible: true,
      currentType: target.geometry.type,
      suggestedType,
      status: 'ready',
      reason: settings.rodBoxStrategy === 'capsule' ? 'rod-box-to-capsule' : 'rod-box-to-cylinder',
      nextGeometry: {
        ...normalizeGeometry(target.geometry),
        type: suggestedType,
        dimensions: { ...converted.dimensions },
        origin: {
          xyz: { ...converted.origin.xyz },
          rpy: { ...converted.origin.rpy },
        },
      },
    };
  }

  return {
    target,
    eligible: false,
    currentType: target.geometry.type,
    suggestedType: null,
    status: 'no-rule-match',
  };
}

function buildCandidate(
  target: CollisionTargetRef,
  targets: CollisionTargetRef[],
  settings: CollisionOptimizationSettings,
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>,
  clearanceWorld: CollisionOptimizationClearanceWorld | null,
): CollisionOptimizationCandidate {
  const clearanceContext = buildNearbyCollisionClearanceContext(
    targets,
    target,
    meshAnalysisByTargetId,
    clearanceWorld,
  );

  if (target.geometry.type === GeometryType.MESH) {
    return buildMeshCandidate(target, settings, meshAnalysisByTargetId[target.id], clearanceContext);
  }

  return buildPrimitiveCandidate(target, settings, clearanceContext);
}

export function buildCollisionOptimizationAnalysis(
  baseAnalysis: CollisionOptimizationBaseAnalysis,
  settings: CollisionOptimizationSettings,
): CollisionOptimizationAnalysis {
  const filteredTargets = filterTargets(baseAnalysis.targets, settings);
  const candidates = filteredTargets.map((target) =>
    buildCandidate(
      target,
      baseAnalysis.targets,
      settings,
      baseAnalysis.meshAnalysisByTargetId,
      baseAnalysis.clearanceWorld,
    ),
  );

  return {
    targets: baseAnalysis.targets,
    filteredTargets,
    candidates,
    meshAnalysisByTargetId: baseAnalysis.meshAnalysisByTargetId,
  };
}

export async function prepareCollisionOptimizationBaseAnalysis(
  source: CollisionOptimizationSource,
  assets: Record<string, string>,
  options: CollisionOptimizationAsyncOptions = {},
): Promise<CollisionOptimizationBaseAnalysis> {
  const targets = collectCollisionTargets(source);
  const meshTargets = targets.filter((target) => target.geometry.type === GeometryType.MESH && Boolean(target.geometry.meshPath));
  const meshAnalysisByTargetId: Record<string, MeshAnalysis | null> = {};
  const includeClearanceData = options.includeClearanceData ?? false;
  const includeMeshClearanceObstacles = options.includeMeshClearanceObstacles ?? includeClearanceData;
  const clearancePointCollectionLimit = Math.max(options.pointCollectionLimit ?? 1024, 1);
  const clearanceSurfacePointLimit = Math.max(options.surfacePointLimit ?? 512, 1);
  const workerResults = await analyzeMeshBatchWithWorker({
    assets,
    tasks: meshTargets.map((target) => ({
      targetId: target.id,
      cacheKey: createMeshAnalysisCacheKey(target.geometry),
      meshPath: target.geometry.meshPath!,
      dimensions: target.geometry.dimensions,
    })),
    options: {
      includePrimitiveFits: false,
      includeSurfacePoints: includeMeshClearanceObstacles,
      pointCollectionLimit: includeMeshClearanceObstacles ? clearancePointCollectionLimit : 1,
      surfacePointLimit: includeMeshClearanceObstacles ? clearanceSurfacePointLimit : 1,
    },
    signal: options.signal,
  });

  meshTargets.forEach((target, index) => {
    throwIfAborted(options.signal);
    meshAnalysisByTargetId[target.id] = workerResults[target.id] ?? null;
  });

  throwIfAborted(options.signal);
  const clearanceWorld = includeClearanceData
    ? buildCollisionOptimizationClearanceWorld(
        source,
        targets,
        meshAnalysisByTargetId,
      )
    : null;

  return {
    targets,
    meshAnalysisByTargetId,
    clearanceWorld,
  };
}

export async function buildCollisionClearanceContextForTarget(
  robot: RobotData,
  assets: Record<string, string>,
  linkId: string,
  objectIndex: number,
  options: Pick<
    CollisionOptimizationAsyncOptions,
    'includeMeshClearanceObstacles' | 'pointCollectionLimit' | 'surfacePointLimit'
  > = {},
): Promise<{
  siblingGeometries?: UrdfVisual[];
  meshClearanceObstacles?: MeshClearanceObstacle[];
}> {
  const baseAnalysis = await prepareCollisionOptimizationBaseAnalysis(
    { kind: 'robot', robot },
    assets,
    {
      includeClearanceData: true,
      includeMeshClearanceObstacles: options.includeMeshClearanceObstacles,
      pointCollectionLimit: options.pointCollectionLimit,
      surfacePointLimit: options.surfacePointLimit,
    },
  );

  const target = baseAnalysis.targets.find((entry) =>
    entry.linkId === linkId && entry.objectIndex === objectIndex
  );

  if (!target) {
    return {};
  }

  return buildNearbyCollisionClearanceContext(
    baseAnalysis.targets,
    target,
    baseAnalysis.meshAnalysisByTargetId,
    baseAnalysis.clearanceWorld,
    options.includeMeshClearanceObstacles ?? true,
  );
}

export async function buildCollisionOptimizationAnalysisAsync(
  baseAnalysis: CollisionOptimizationBaseAnalysis,
  settings: CollisionOptimizationSettings,
  options: CollisionOptimizationAsyncOptions = {},
): Promise<CollisionOptimizationAnalysis> {
  const filteredTargets = filterTargets(baseAnalysis.targets, settings);
  const candidates: CollisionOptimizationCandidate[] = [];
  const yieldEvery = Math.max(options.yieldEvery ?? DEFAULT_CANDIDATE_ANALYSIS_YIELD_EVERY, 1);

  for (let index = 0; index < filteredTargets.length; index += 1) {
    throwIfAborted(options.signal);

    const target = filteredTargets[index];
    candidates.push(
      buildCandidate(
        target,
        baseAnalysis.targets,
        settings,
        baseAnalysis.meshAnalysisByTargetId,
        baseAnalysis.clearanceWorld,
      ),
    );

    await maybeYieldAfterBatch(index, yieldEvery, options.signal);
  }

  return {
    targets: baseAnalysis.targets,
    filteredTargets,
    candidates,
    meshAnalysisByTargetId: baseAnalysis.meshAnalysisByTargetId,
  };
}

export async function analyzeCollisionOptimization(
  source: CollisionOptimizationSource,
  assets: Record<string, string>,
  settings: CollisionOptimizationSettings,
): Promise<CollisionOptimizationAnalysis> {
  const baseAnalysis = await prepareCollisionOptimizationBaseAnalysis(source, assets);
  return buildCollisionOptimizationAnalysisAsync(baseAnalysis, settings);
}

function computeBroadPhaseRadius(
  geometry: UrdfVisual,
  meshAnalysis?: MeshAnalysis | null,
): number | null {
  const dims = geometry.dimensions;

  switch (geometry.type) {
    case GeometryType.SPHERE:
      return Math.max(dims.x, 0);
    case GeometryType.BOX:
      return Math.hypot(dims.x, dims.y, dims.z) / 2;
    case GeometryType.CYLINDER:
      return Math.hypot(Math.max(dims.x, 0), Math.max(dims.y, 0) / 2);
    case GeometryType.CAPSULE:
      return Math.max(Math.max(dims.y, 0) / 2, Math.max(dims.x, 0));
    case GeometryType.MESH:
      if (!meshAnalysis) return null;
      return Math.hypot(meshAnalysis.bounds.x, meshAnalysis.bounds.y, meshAnalysis.bounds.z) / 2;
    default:
      return null;
  }
}

function computeBroadPhaseCenter(
  geometry: UrdfVisual,
  meshAnalysis?: MeshAnalysis | null,
): { x: number; y: number; z: number } {
  const origin = geometry.origin?.xyz ?? { x: 0, y: 0, z: 0 };

  if (geometry.type === GeometryType.MESH && meshAnalysis?.bounds) {
    return {
      x: origin.x + meshAnalysis.bounds.cx,
      y: origin.y + meshAnalysis.bounds.cy,
      z: origin.z + meshAnalysis.bounds.cz,
    };
  }

  return {
    x: origin.x,
    y: origin.y,
    z: origin.z,
  };
}

export function countSameLinkOverlapWarnings(
  targets: CollisionTargetRef[],
  meshAnalysisByTargetId: Record<string, MeshAnalysis | null>,
  overridesByTargetId: Record<string, UrdfVisual | undefined> = {},
): number {
  const grouped = new Map<string, CollisionTargetRef[]>();
  targets.forEach((target) => {
    const key = getLinkGroupKey(target);
    const group = grouped.get(key) ?? [];
    group.push(target);
    grouped.set(key, group);
  });

  let overlapPairs = 0;

  grouped.forEach((groupTargets) => {
    for (let index = 0; index < groupTargets.length; index += 1) {
      const leftTarget = groupTargets[index];
      const leftGeometry = overridesByTargetId[leftTarget.id] ?? leftTarget.geometry;
      const leftRadius = computeBroadPhaseRadius(leftGeometry, meshAnalysisByTargetId[leftTarget.id]);
      if (!leftRadius || leftRadius <= 1e-8) continue;

      for (let innerIndex = index + 1; innerIndex < groupTargets.length; innerIndex += 1) {
        const rightTarget = groupTargets[innerIndex];
        const rightGeometry = overridesByTargetId[rightTarget.id] ?? rightTarget.geometry;
        const rightRadius = computeBroadPhaseRadius(rightGeometry, meshAnalysisByTargetId[rightTarget.id]);
        if (!rightRadius || rightRadius <= 1e-8) continue;

        const leftCenter = computeBroadPhaseCenter(leftGeometry, meshAnalysisByTargetId[leftTarget.id]);
        const rightCenter = computeBroadPhaseCenter(rightGeometry, meshAnalysisByTargetId[rightTarget.id]);
        const dx = leftCenter.x - rightCenter.x;
        const dy = leftCenter.y - rightCenter.y;
        const dz = leftCenter.z - rightCenter.z;
        const distance = Math.hypot(dx, dy, dz);

        if (distance + 1e-6 < leftRadius + rightRadius) {
          overlapPairs += 1;
        }
      }
    }
  });

  return overlapPairs;
}

export function buildCollisionOptimizationOperations(
  candidates: CollisionOptimizationCandidate[],
  checkedIds: Set<string>,
): CollisionOptimizationOperation[] {
  return candidates
    .filter((candidate) => candidate.eligible && candidate.nextGeometry && checkedIds.has(candidate.target.id) && candidate.reason)
    .map((candidate) => ({
      id: candidate.target.id,
      componentId: candidate.target.componentId,
      linkId: candidate.target.linkId,
      objectIndex: candidate.target.objectIndex,
      nextGeometry: cloneGeometry(candidate.nextGeometry!),
      reason: candidate.reason!,
      fromType: candidate.currentType,
      toType: candidate.suggestedType!,
    }));
}

export function applyCollisionOptimizationOperationsToLinks(
  links: Record<string, UrdfLink>,
  operations: CollisionOptimizationOperation[],
): Record<string, UrdfLink> {
  const nextLinks: Record<string, UrdfLink> = { ...links };

  operations.forEach((operation) => {
    const link = nextLinks[operation.linkId];
    if (!link) return;

    nextLinks[operation.linkId] = updateCollisionGeometryByObjectIndex(
      link,
      operation.objectIndex,
      operation.nextGeometry,
    );
  });

  return nextLinks;
}
