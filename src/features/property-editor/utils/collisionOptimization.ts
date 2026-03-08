import { getCollisionGeometryEntries, updateCollisionGeometryByObjectIndex } from '@/core/robot';
import type { AssemblyState, GeometryType as GeometryTypeValue, RobotData, UrdfLink, UrdfVisual } from '@/types';
import { GeometryType } from '@/types';
import { computeMeshAnalysisFromAssets, convertGeometryType, type MeshAnalysis } from './geometryConversion';

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

function createTargetId(componentId: string | undefined, linkId: string, objectIndex: number): string {
  return `${componentId ?? 'robot'}::${linkId}::${objectIndex}`;
}

function getLinkGroupKey(target: Pick<CollisionTargetRef, 'componentId' | 'linkId'>): string {
  return `${target.componentId ?? 'robot'}::${target.linkId}`;
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

function buildMeshCandidate(
  target: CollisionTargetRef,
  settings: CollisionOptimizationSettings,
  analysis: MeshAnalysis | null | undefined,
  siblingGeometries: UrdfVisual[] | undefined,
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
    {
      siblingGeometries: settings.avoidSiblingOverlap ? siblingGeometries : undefined,
    },
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
  siblingGeometries: UrdfVisual[] | undefined,
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
      {
        siblingGeometries: settings.avoidSiblingOverlap ? siblingGeometries : undefined,
      },
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
      {
        siblingGeometries: settings.avoidSiblingOverlap ? siblingGeometries : undefined,
      },
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
): CollisionOptimizationCandidate {
  const siblingGeometries = buildSiblingGeometries(targets, target, meshAnalysisByTargetId);

  if (target.geometry.type === GeometryType.MESH) {
    return buildMeshCandidate(target, settings, meshAnalysisByTargetId[target.id], siblingGeometries);
  }

  return buildPrimitiveCandidate(target, settings, siblingGeometries);
}

export async function analyzeCollisionOptimization(
  source: CollisionOptimizationSource,
  assets: Record<string, string>,
  settings: CollisionOptimizationSettings,
): Promise<CollisionOptimizationAnalysis> {
  const targets = collectCollisionTargets(source);

  const meshTargets = targets.filter((target) => target.geometry.type === GeometryType.MESH && Boolean(target.geometry.meshPath));
  const meshAnalysisEntries = await Promise.all(
    meshTargets.map(async (target) => {
      const analysis = await computeMeshAnalysisFromAssets(
        target.geometry.meshPath!,
        assets,
        target.geometry.dimensions,
      );
      return [target.id, analysis] as const;
    }),
  );

  const meshAnalysisByTargetId: Record<string, MeshAnalysis | null> = {};
  meshAnalysisEntries.forEach(([targetId, analysis]) => {
    meshAnalysisByTargetId[targetId] = analysis;
  });

  const filteredTargets = filterTargets(targets, settings);
  const candidates = filteredTargets.map((target) =>
    buildCandidate(target, targets, settings, meshAnalysisByTargetId),
  );

  return {
    targets,
    filteredTargets,
    candidates,
    meshAnalysisByTargetId,
  };
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

