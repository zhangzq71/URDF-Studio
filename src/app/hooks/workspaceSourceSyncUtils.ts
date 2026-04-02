import * as THREE from 'three';
import { computeLinkWorldMatrices, isSyntheticWorldRoot, mergeAssembly } from '@/core/robot';
import {
  cloneAssemblyTransform,
  isAssemblyComponentIndividuallyTransformable,
  isIdentityAssemblyTransform,
} from '@/core/robot/assemblyTransforms';
import { generateURDF } from '@/core/parsers';
import { rewriteRobotMeshPathsForSource } from '@/core/parsers/meshPathUtils';
import {
  createUsdPlaceholderRobotData,
  resolveRobotFileData,
  type RobotImportResult,
} from '@/core/parsers/importRobotFile';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import {
  DEFAULT_LINK,
  GeometryType,
  JointType,
  type AssemblyState,
  type AssemblyComponent,
  type BridgeJoint,
  type RobotData,
  type RobotFile,
  type RobotState,
  type UrdfJoint,
  type UrdfLink,
} from '@/types';
import { collectURDFMaterialsFromLinks } from '@/features/urdf-viewer';
import { parseEditableRobotSourceWithWorker } from './robotImportWorkerBridge';

type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

function sortKeysDeep(value: unknown): JsonLike {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, JsonLike>>((acc, key) => {
        const nextValue = (value as Record<string, unknown>)[key];
        if (nextValue !== undefined) {
          acc[key] = sortKeysDeep(nextValue);
        }
        return acc;
      }, {});
  }

  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return value as JsonLike;
  }

  return null;
}

const GENERATED_WORKSPACE_URDF_FOLDER = 'generated';
const GENERATED_WORKSPACE_URDF_SUFFIX = '.generated.urdf';

function sanitizeGeneratedWorkspaceUrdfStem(value: string): string {
  const sanitized = value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_./-]+|[_./-]+$/g, '');

  return sanitized || 'workspace';
}

export function createRobotSourceSnapshot(robot: RobotState): string {
  return JSON.stringify(sortKeysDeep({
    name: robot.name,
    rootLinkId: robot.rootLinkId,
    links: robot.links,
    joints: robot.joints,
    materials: robot.materials ?? null,
    closedLoopConstraints: robot.closedLoopConstraints ?? null,
  }));
}

export function canUseLightweightWorkspaceViewerReloadContent(
  robotLinks?: Record<string, UrdfLink> | null,
): boolean {
  return collectURDFMaterialsFromLinks(robotLinks).size > 0;
}

export function buildLightweightWorkspaceViewerReloadContent(assemblyRevision: number): string {
  return `<robot name="workspace_viewer_${assemblyRevision}" />`;
}

export function isGeneratedWorkspaceUrdfFileName(fileName: string | null | undefined): boolean {
  const normalized = String(fileName || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');

  return normalized.startsWith(`${GENERATED_WORKSPACE_URDF_FOLDER}/`)
    && normalized.endsWith(GENERATED_WORKSPACE_URDF_SUFFIX);
}

export function buildGeneratedWorkspaceUrdfFileName({
  assemblyName,
  availableFiles,
  preferredFileName,
}: {
  assemblyName: string;
  availableFiles: RobotFile[];
  preferredFileName?: string | null;
}): string {
  if (preferredFileName) {
    return preferredFileName;
  }

  const existingNames = new Set(availableFiles.map((file) => file.name));
  const baseStem = sanitizeGeneratedWorkspaceUrdfStem(assemblyName);
  let suffix = 0;

  while (true) {
    const candidateStem = suffix === 0 ? baseStem : `${baseStem}_${suffix + 1}`;
    const candidate = `${GENERATED_WORKSPACE_URDF_FOLDER}/${candidateStem}${GENERATED_WORKSPACE_URDF_SUFFIX}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }
}

export function createGeneratedWorkspaceUrdfFile({
  assemblyName,
  mergedRobotData,
  availableFiles,
  preferredFileName,
}: {
  assemblyName: string;
  mergedRobotData: RobotData;
  availableFiles: RobotFile[];
  preferredFileName?: string | null;
}): {
  file: RobotFile;
  robot: RobotState;
  snapshot: string;
} {
  const robot: RobotState = {
    ...mergedRobotData,
    selection: { type: null, id: null },
  };
  const fileName = buildGeneratedWorkspaceUrdfFileName({
    assemblyName,
    availableFiles,
    preferredFileName,
  });
  const file: RobotFile = {
    name: fileName,
    format: 'urdf',
    content: generateURDF(robot, {
      includeHardware: 'auto',
      preserveMeshPaths: true,
    }),
  };

  return {
    file,
    robot,
    snapshot: createRobotSourceSnapshot(robot),
  };
}

interface CreateRobotSourceSnapshotFromUrdfContentOptions {
  sourcePath: string;
}

export async function createRobotSourceSnapshotFromUrdfContent(
  content: string,
  { sourcePath }: CreateRobotSourceSnapshotFromUrdfContentOptions,
): Promise<string | null> {
  const parsed = await parseEditableRobotSourceWithWorker({
    file: {
      format: 'urdf',
      name: sourcePath,
    },
    content,
  });

  if (!parsed) {
    return null;
  }

  return createRobotSourceSnapshot(
    rewriteRobotMeshPathsForSource(
      {
        ...parsed,
        selection: { type: null, id: null },
      },
      sourcePath,
    ),
  );
}

interface PreferredMjcfContentOptions {
  sourceContent?: string | null;
  generatedContent?: string | null;
  hasViewerEdits: boolean;
}

export function getPreferredMjcfContent({
  sourceContent,
  generatedContent,
  hasViewerEdits,
}: PreferredMjcfContentOptions): string | null {
  if (sourceContent) {
    return sourceContent;
  }

  if (hasViewerEdits) {
    return generatedContent ?? null;
  }

  return generatedContent ?? null;
}

interface PreferredXmlContentOptions {
  fileContent?: string | null;
  originalContent?: string | null;
  generatedContent?: string | null;
  hasStoreEdits: boolean;
}

interface UseEmptyRobotForUsdHydrationOptions {
  selectedFileFormat?: RobotFile['format'] | null;
  selectedFileName?: string | null;
  documentLoadStatus?: 'idle' | 'loading' | 'hydrating' | 'ready' | 'error';
  documentLoadFileName?: string | null;
}

function getPreferredXmlContent({
  fileContent,
  originalContent,
  generatedContent,
  hasStoreEdits,
}: PreferredXmlContentOptions): string | null {
  if (hasStoreEdits) {
    return generatedContent ?? fileContent ?? originalContent ?? null;
  }

  return fileContent ?? originalContent ?? generatedContent ?? null;
}

export function getPreferredUrdfContent(options: PreferredXmlContentOptions): string | null {
  return getPreferredXmlContent(options);
}

export function getPreferredSdfContent(options: PreferredXmlContentOptions): string | null {
  return getPreferredXmlContent(options);
}

export function getPreferredXacroContent(options: PreferredXmlContentOptions): string | null {
  return getPreferredXmlContent(options);
}

export function shouldUseEmptyRobotForUsdHydration({
  selectedFileFormat,
  selectedFileName,
  documentLoadStatus,
  documentLoadFileName,
}: UseEmptyRobotForUsdHydrationOptions): boolean {
  return (
    selectedFileFormat === 'usd'
    && documentLoadStatus === 'hydrating'
    && Boolean(selectedFileName)
    && selectedFileName === documentLoadFileName
  );
}

export function getViewerSourceFile({
  selectedFile,
  shouldRenderAssembly,
  workspaceSourceFile = null,
}: {
  selectedFile: RobotFile | null;
  shouldRenderAssembly: boolean;
  workspaceSourceFile?: RobotFile | null;
}): RobotFile | null {
  return shouldRenderAssembly ? workspaceSourceFile : selectedFile;
}

export function getSingleComponentWorkspaceMjcfViewerSource({
  assemblyState,
  availableFiles,
}: {
  assemblyState: AssemblyState | null;
  availableFiles: RobotFile[];
}): RobotFile | null {
  if (!assemblyState) {
    return null;
  }

  const visibleComponents = Object.values(assemblyState.components)
    .filter((component) => component.visible !== false);

  if (visibleComponents.length !== 1) {
    return null;
  }

  const visibleComponentIds = new Set(visibleComponents.map((component) => component.id));
  const hasVisibleBridges = Object.values(assemblyState.bridges).some((bridge) => (
    visibleComponentIds.has(bridge.parentComponentId)
    && visibleComponentIds.has(bridge.childComponentId)
  ));

  if (hasVisibleBridges) {
    return null;
  }

  const sourceFilePath = visibleComponents[0]?.sourceFile;
  if (!sourceFilePath) {
    return null;
  }

  const sourceFile = availableFiles.find((file) => file.name === sourceFilePath) ?? null;
  return sourceFile?.format === 'mjcf' ? sourceFile : null;
}

export function getWorkspaceAssemblyViewerRobotData({
  assemblyState,
  fallbackMergedRobotData = null,
  bridgePreview = null,
}: {
  assemblyState: AssemblyState | null;
  fallbackMergedRobotData?: RobotData | null;
  bridgePreview?: BridgeJoint | null;
}): RobotData | null {
  if (!assemblyState) {
    return null;
  }

  if (!bridgePreview) {
    return fallbackMergedRobotData ?? null;
  }

  const visibleComponents = Object.fromEntries(
    Object.entries(assemblyState.components).filter(([, component]) => component.visible !== false),
  );
  const visibleComponentIds = new Set(Object.keys(visibleComponents));

  if (visibleComponentIds.size === 0) {
    return null;
  }

  const visibleBridges = Object.fromEntries(
    Object.entries(assemblyState.bridges).filter(([, bridge]) => (
      visibleComponentIds.has(bridge.parentComponentId)
      && visibleComponentIds.has(bridge.childComponentId)
    )),
  );

  if (
    visibleComponentIds.has(bridgePreview.parentComponentId)
    && visibleComponentIds.has(bridgePreview.childComponentId)
  ) {
    const parentComponent = visibleComponents[bridgePreview.parentComponentId];
    const childComponent = visibleComponents[bridgePreview.childComponentId];
    const hasParentLink = Boolean(parentComponent?.robot.links[bridgePreview.parentLinkId]);
    const hasChildLink = Boolean(childComponent?.robot.links[bridgePreview.childLinkId]);

    if (hasParentLink && hasChildLink) {
      visibleBridges[bridgePreview.id] = bridgePreview;
    }
  }

  return mergeAssembly({
    ...assemblyState,
    components: visibleComponents,
    bridges: visibleBridges,
  });
}

function buildWorkspaceViewerComponentRootJointId(componentId: string): string {
  return `${WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX}${componentId}`;
}

function decomposeMatrixToOrigin(matrix: THREE.Matrix4) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  matrix.decompose(position, quaternion, scale);
  euler.setFromQuaternion(quaternion, 'ZYX');

  return {
    xyz: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    rpy: {
      r: euler.x,
      p: euler.y,
      y: euler.z,
    },
  };
}

function buildAssemblyTransformMatrix(
  transform?: AssemblyComponent['transform'] | AssemblyState['transform'],
) {
  const normalized = cloneAssemblyTransform(transform);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      normalized.position.x,
      normalized.position.y,
      normalized.position.z,
    ),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      normalized.rotation.r,
      normalized.rotation.p,
      normalized.rotation.y,
      'ZYX',
    )),
    new THREE.Vector3(1, 1, 1),
  );
}

function buildVisibleAssemblyComponentMap(assemblyState: AssemblyState) {
  return Object.fromEntries(
    Object.entries(assemblyState.components).filter(([, component]) => component.visible !== false),
  );
}

function resolveWorkspaceViewerRootComponentIds({
  componentEntries,
  mergedRobotData,
}: {
  componentEntries: Array<[string, AssemblyState['components'][string]]>;
  mergedRobotData: RobotData;
}): {
  rootComponentByComponentId: Map<string, string>;
  rootComponentIds: string[];
} {
  const componentIdByRootLinkId = new Map<string, string>();
  const componentIdByLinkId = new Map<string, string>();

  componentEntries.forEach(([componentId, component]) => {
    componentIdByRootLinkId.set(component.robot.rootLinkId, componentId);
    Object.keys(component.robot.links).forEach((linkId) => {
      componentIdByLinkId.set(linkId, componentId);
    });
  });

  const parentComponentByChild = new Map<string, string>();
  Object.values(mergedRobotData.joints).forEach((joint) => {
    const childComponentId = componentIdByRootLinkId.get(joint.childLinkId);
    if (!childComponentId) {
      return;
    }

    const parentComponentId = componentIdByLinkId.get(joint.parentLinkId);
    if (!parentComponentId || parentComponentId === childComponentId) {
      return;
    }

    parentComponentByChild.set(childComponentId, parentComponentId);
  });

  const rootComponentByComponentId = new Map<string, string>();
  componentEntries.forEach(([componentId]) => {
    const visited = new Set<string>([componentId]);
    let currentComponentId = componentId;

    while (true) {
      const parentComponentId = parentComponentByChild.get(currentComponentId);
      if (!parentComponentId || visited.has(parentComponentId)) {
        rootComponentByComponentId.set(componentId, currentComponentId);
        return;
      }

      visited.add(parentComponentId);
      currentComponentId = parentComponentId;
    }
  });

  const rootComponentIds = componentEntries
    .map(([componentId]) => rootComponentByComponentId.get(componentId) ?? componentId)
    .filter((componentId, index, values) => values.indexOf(componentId) === index);

  return {
    rootComponentByComponentId,
    rootComponentIds,
  };
}

export function buildWorkspaceAssemblyViewerDisplayRobotData({
  assemblyState,
  mergedRobotData,
}: {
  assemblyState: AssemblyState | null;
  mergedRobotData: RobotData | null;
}): RobotData | null {
  if (!assemblyState || !mergedRobotData) {
    return mergedRobotData;
  }

  const visibleComponents = buildVisibleAssemblyComponentMap(assemblyState);
  const componentEntries = Object.entries(visibleComponents);
  if (componentEntries.length === 0) {
    return null;
  }

  if (componentEntries.length === 1) {
    const [componentId, component] = componentEntries[0];
    const componentTransform = cloneAssemblyTransform(component.transform);
    const joints: RobotData['joints'] = {
      ...component.robot.joints,
    };

    joints[buildWorkspaceViewerComponentRootJointId(componentId)] = {
      id: buildWorkspaceViewerComponentRootJointId(componentId),
      name: buildWorkspaceViewerComponentRootJointId(componentId),
      type: JointType.FIXED,
      parentLinkId: WORKSPACE_VIEWER_WORLD_ROOT_ID,
      childLinkId: component.robot.rootLinkId,
      origin: {
        xyz: componentTransform.position,
        rpy: componentTransform.rotation,
      },
      dynamics: { damping: 0, friction: 0 },
      hardware: {
        armature: 0,
        motorType: 'None',
        motorId: '',
        motorDirection: 1,
      },
    };

    return {
      name: mergedRobotData.name,
      version: mergedRobotData.version,
      links: {
        [WORKSPACE_VIEWER_WORLD_ROOT_ID]: buildWorkspaceViewerSyntheticRootLink(WORKSPACE_VIEWER_WORLD_ROOT_ID),
        ...component.robot.links,
      },
      joints,
      rootLinkId: WORKSPACE_VIEWER_WORLD_ROOT_ID,
      materials: mergedRobotData.materials,
      closedLoopConstraints: mergedRobotData.closedLoopConstraints,
      inspectionContext: mergedRobotData.inspectionContext,
    };
  }

  const childJointsByParent = buildChildJointsByParent(mergedRobotData.joints);
  const linkWorldMatrices = computeLinkWorldMatrices(mergedRobotData);
  const {
    rootComponentByComponentId,
    rootComponentIds,
  } = resolveWorkspaceViewerRootComponentIds({
    componentEntries,
    mergedRobotData,
  });

  const rootOffsetByComponentId = new Map<string, number>();
  const hasExplicitRootPlacement = rootComponentIds.some((componentId) => (
    isAssemblyComponentIndividuallyTransformable(assemblyState, componentId)
    && !isIdentityAssemblyTransform(visibleComponents[componentId]?.transform)
  ));

  if (rootComponentIds.length <= 1 || hasExplicitRootPlacement) {
    rootComponentIds.forEach((componentId) => {
      rootOffsetByComponentId.set(componentId, 0);
    });
  } else {
    const layoutIntervals = rootComponentIds.map((componentId) => {
      const rootComponent = visibleComponents[componentId];
      return estimateWorkspaceViewerRootLayoutInterval(
        rootComponent?.robot.rootLinkId ?? mergedRobotData.rootLinkId,
        mergedRobotData,
        childJointsByParent,
        linkWorldMatrices,
      );
    });
    const totalWidth = layoutIntervals.reduce((sum, interval) => sum + interval.width, 0)
      + WORKSPACE_VIEWER_ROOT_LAYOUT_GAP * Math.max(0, layoutIntervals.length - 1);

    let cursor = -totalWidth / 2;
    rootComponentIds.forEach((componentId, index) => {
      const interval = layoutIntervals[index] ?? buildDefaultWorkspaceViewerRootLayoutInterval();
      rootOffsetByComponentId.set(componentId, cursor - interval.left);
      cursor += interval.width + WORKSPACE_VIEWER_ROOT_LAYOUT_GAP;
    });
  }

  const links: RobotData['links'] = {
    [WORKSPACE_VIEWER_WORLD_ROOT_ID]: buildWorkspaceViewerSyntheticRootLink(WORKSPACE_VIEWER_WORLD_ROOT_ID),
  };
  const joints: RobotData['joints'] = {};

  componentEntries.forEach(([componentId, component]) => {
    Object.entries(component.robot.links).forEach(([linkId, link]) => {
      links[linkId] = link;
    });
    Object.entries(component.robot.joints).forEach(([jointId, joint]) => {
      joints[jointId] = joint;
    });

    const semanticRootMatrix = linkWorldMatrices[component.robot.rootLinkId]?.clone() ?? new THREE.Matrix4().identity();
    const rootComponentId = rootComponentByComponentId.get(componentId) ?? componentId;
    const rootOffsetX = rootOffsetByComponentId.get(rootComponentId) ?? 0;
    const offsetMatrix = new THREE.Matrix4().makeTranslation(rootOffsetX, 0, 0);
    const componentTransformMatrix = isAssemblyComponentIndividuallyTransformable(assemblyState, componentId)
      ? buildAssemblyTransformMatrix(component.transform)
      : new THREE.Matrix4().identity();
    const worldMatrix = offsetMatrix
      .clone()
      .multiply(componentTransformMatrix)
      .multiply(semanticRootMatrix);
    const syntheticJointId = buildWorkspaceViewerComponentRootJointId(componentId);

    joints[syntheticJointId] = {
      id: syntheticJointId,
      name: syntheticJointId,
      type: JointType.FIXED,
      parentLinkId: WORKSPACE_VIEWER_WORLD_ROOT_ID,
      childLinkId: component.robot.rootLinkId,
      origin: decomposeMatrixToOrigin(worldMatrix),
      dynamics: { damping: 0, friction: 0 },
      hardware: {
        armature: 0,
        motorType: 'None',
        motorId: '',
        motorDirection: 1,
      },
    };
  });

  return {
    name: mergedRobotData.name,
    version: mergedRobotData.version,
    links,
    joints,
    rootLinkId: WORKSPACE_VIEWER_WORLD_ROOT_ID,
    materials: mergedRobotData.materials,
    closedLoopConstraints: mergedRobotData.closedLoopConstraints,
    inspectionContext: mergedRobotData.inspectionContext,
  };
}

export function normalizeWorkspaceAssemblyViewerDisplayRobotDataForSource(
  robot: RobotData,
): RobotData {
  const joints: RobotData['joints'] = {};

  Object.entries(robot.joints).forEach(([jointId, joint]) => {
    if (
      joint.parentLinkId === WORKSPACE_VIEWER_WORLD_ROOT_ID
      && jointId.startsWith(WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX)
    ) {
      joints[jointId] = {
        ...joint,
        origin: {
          xyz: { x: 0, y: 0, z: 0 },
          rpy: { r: 0, p: 0, y: 0 },
        },
      };
      return;
    }

    joints[jointId] = joint;
  });

  return {
    ...robot,
    joints,
  };
}

export function shouldReseedSingleComponentAssemblyFromActiveFile({
  assemblyState,
  activeFile,
}: {
  assemblyState: AssemblyState | null;
  activeFile: RobotFile | null;
}): boolean {
  if (!activeFile || activeFile.format === 'mesh') {
    return false;
  }

  if (!assemblyState) {
    return true;
  }

  const components = Object.values(assemblyState.components);
  if (components.length === 0) {
    return true;
  }

  if (components.length !== 1 || Object.keys(assemblyState.bridges).length > 0) {
    return false;
  }

  return components[0]?.sourceFile !== activeFile.name;
}

function sanitizeWorkspaceSeedNameFromFile(fileName: string): string {
  const base = fileName.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'robot';
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_');
  return sanitized || 'robot';
}

function buildAssemblySeedRobotFromSourceSnapshot({
  sourceSnapshot,
  component,
}: {
  sourceSnapshot: string;
  component: Pick<AssemblyComponent, 'id' | 'name'>;
}): RobotState | null {
  let parsedSnapshot: RobotData | null = null;

  try {
    parsedSnapshot = JSON.parse(sourceSnapshot) as RobotData;
  } catch {
    return null;
  }

  if (!parsedSnapshot?.rootLinkId || !parsedSnapshot.links || !parsedSnapshot.joints) {
    return null;
  }

  const idPrefix = `${component.id}_`;
  const linkIdMap: Record<string, string> = {};
  const linkNameMap: Record<string, string> = {};
  const links: RobotData['links'] = {};
  const joints: RobotData['joints'] = {};
  const materials: NonNullable<RobotData['materials']> = {};

  Object.entries(parsedSnapshot.links).forEach(([id, link]) => {
    const nextId = `${idPrefix}${id}`;
    const originalName = link.name?.trim() || id;
    const isRootLink = id === parsedSnapshot?.rootLinkId;
    const nextName = isRootLink ? component.name : `${component.name}_${originalName}`;

    linkIdMap[id] = nextId;
    linkNameMap[originalName] = nextId;

    links[nextId] = {
      ...link,
      id: nextId,
      name: nextName,
    };
  });

  Object.entries(parsedSnapshot.materials || {}).forEach(([key, material]) => {
    const targetLinkId = linkIdMap[key] || linkNameMap[key] || key;
    materials[targetLinkId] = { ...material };
  });

  Object.entries(parsedSnapshot.joints).forEach(([id, joint]) => {
    const nextId = `${idPrefix}${id}`;
    const originalName = joint.name?.trim() || id;
    joints[nextId] = {
      ...joint,
      id: nextId,
      name: `${component.name}_${originalName}`,
      parentLinkId: linkIdMap[joint.parentLinkId] ?? `${idPrefix}${joint.parentLinkId}`,
      childLinkId: linkIdMap[joint.childLinkId] ?? `${idPrefix}${joint.childLinkId}`,
    };
  });

  const closedLoopConstraints = (parsedSnapshot.closedLoopConstraints || []).map((constraint) => ({
    ...constraint,
    id: `${idPrefix}${constraint.id}`,
    linkAId: linkIdMap[constraint.linkAId] ?? `${idPrefix}${constraint.linkAId}`,
    linkBId: linkIdMap[constraint.linkBId] ?? `${idPrefix}${constraint.linkBId}`,
    source: constraint.source
      ? {
          ...constraint.source,
          body1Name: `${component.name}_${constraint.source.body1Name}`,
          body2Name: `${component.name}_${constraint.source.body2Name}`,
        }
      : undefined,
  }));

  return {
    name: parsedSnapshot.name,
    rootLinkId: linkIdMap[parsedSnapshot.rootLinkId] ?? `${idPrefix}${parsedSnapshot.rootLinkId}`,
    links,
    joints,
    materials: Object.keys(materials).length > 0 ? materials : undefined,
    closedLoopConstraints: closedLoopConstraints.length > 0 ? closedLoopConstraints : undefined,
    selection: { type: null, id: null },
  };
}

export function shouldReuseSourceViewerForSingleComponentAssembly({
  assemblyState,
  activeFile,
  sourceSnapshot,
}: {
  assemblyState: AssemblyState | null;
  activeFile: RobotFile | null;
  sourceSnapshot: string | null;
}): boolean {
  if (!assemblyState || !activeFile || activeFile.format === 'mesh') {
    return false;
  }

  const visibleComponents = Object.values(assemblyState.components)
    .filter((component) => component.visible !== false);

  if (visibleComponents.length !== 1 || Object.keys(assemblyState.bridges).length > 0) {
    return false;
  }

  if (!isIdentityAssemblyTransform(assemblyState.transform)) {
    return false;
  }

  const [component] = visibleComponents;
  if (!isIdentityAssemblyTransform(component.transform)) {
    return false;
  }
  const expectedSeedName = sanitizeWorkspaceSeedNameFromFile(activeFile.name);

  if (
    component.sourceFile !== activeFile.name
    || component.name !== expectedSeedName
    || component.id !== `comp_${expectedSeedName}`
  ) {
    return false;
  }

  if (!sourceSnapshot) {
    return true;
  }

  const expectedSeedRobot = buildAssemblySeedRobotFromSourceSnapshot({
    sourceSnapshot,
    component,
  });

  if (!expectedSeedRobot) {
    return false;
  }

  return createRobotSourceSnapshot(expectedSeedRobot) === createRobotSourceSnapshot({
    ...component.robot,
    selection: { type: null, id: null },
  });
}

export function shouldKeepPristineSingleComponentWorkspaceOnSourceViewer({
  assemblyState,
  activeFile,
  sourceSnapshot,
  assemblySelectionType,
}: {
  assemblyState: AssemblyState | null;
  activeFile: RobotFile | null;
  sourceSnapshot: string | null;
  assemblySelectionType?: 'assembly' | 'component' | null;
}): boolean {
  if (!shouldReuseSourceViewerForSingleComponentAssembly({
    assemblyState,
    activeFile,
    sourceSnapshot,
  })) {
    return false;
  }

  // Keep the current-file viewer stable while the workspace is still just the
  // untouched single-component seed. A component-row selection should not swap
  // rendering paths underneath the user before the assembly has actually
  // diverged.
  return assemblySelectionType !== 'assembly';
}

export const WORKSPACE_VIEWER_WORLD_ROOT_ID = '__workspace_world__';
const WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH = 0.9;
const WORKSPACE_VIEWER_ROOT_LAYOUT_GAP = 0.12;
const WORKSPACE_VIEWER_ROOT_LAYOUT_SIDE_PADDING = 0.12;
export const WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX = `${WORKSPACE_VIEWER_WORLD_ROOT_ID}::component::`;

interface MatrixWithElements {
  elements: ArrayLike<number>;
}

interface WorkspaceViewerRootLayoutInterval {
  left: number;
  right: number;
  width: number;
}

function buildChildJointsByParent(
  joints: Record<string, UrdfJoint>,
): Record<string, UrdfJoint[]> {
  const grouped: Record<string, UrdfJoint[]> = {};

  Object.values(joints).forEach((joint) => {
    if (!grouped[joint.parentLinkId]) {
      grouped[joint.parentLinkId] = [];
    }

    grouped[joint.parentLinkId].push(joint);
  });

  return grouped;
}

function collectRootSubtreeLinkIds(
  rootLinkId: string,
  childJointsByParent: Record<string, UrdfJoint[]>,
): string[] {
  const visited = new Set<string>();
  const queue = [rootLinkId];

  while (queue.length > 0) {
    const currentLinkId = queue.shift();
    if (!currentLinkId || visited.has(currentLinkId)) {
      continue;
    }

    visited.add(currentLinkId);
    const childJoints = childJointsByParent[currentLinkId] ?? [];
    childJoints.forEach((joint) => {
      if (!visited.has(joint.childLinkId)) {
        queue.push(joint.childLinkId);
      }
    });
  }

  return [...visited];
}

function buildDefaultWorkspaceViewerRootLayoutInterval(): WorkspaceViewerRootLayoutInterval {
  return {
    left: -WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH / 2,
    right: WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH / 2,
    width: WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH,
  };
}

function estimateWorkspaceViewerRootLayoutInterval(
  rootLinkId: string,
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  childJointsByParent: Record<string, UrdfJoint[]>,
  linkWorldMatrices: Record<string, MatrixWithElements>,
): WorkspaceViewerRootLayoutInterval {
  const subtreeLinkIds = collectRootSubtreeLinkIds(rootLinkId, childJointsByParent)
    .filter((linkId) => Boolean(robot.links[linkId]));

  if (subtreeLinkIds.length === 0) {
    return buildDefaultWorkspaceViewerRootLayoutInterval();
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  subtreeLinkIds.forEach((linkId) => {
    const matrix = linkWorldMatrices[linkId];
    const elements = matrix?.elements;
    if (!elements || elements.length < 13) {
      return;
    }

    const x = Number(elements[12] ?? 0);
    if (!Number.isFinite(x)) {
      return;
    }

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return buildDefaultWorkspaceViewerRootLayoutInterval();
  }

  const paddedLeft = minX - WORKSPACE_VIEWER_ROOT_LAYOUT_SIDE_PADDING;
  const paddedRight = maxX + WORKSPACE_VIEWER_ROOT_LAYOUT_SIDE_PADDING;
  const paddedWidth = Math.max(0, paddedRight - paddedLeft);

  if (paddedWidth >= WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH) {
    return {
      left: paddedLeft,
      right: paddedRight,
      width: paddedWidth,
    };
  }

  const centerX = (paddedLeft + paddedRight) / 2;
  return {
    left: centerX - WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH / 2,
    right: centerX + WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH / 2,
    width: WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_WIDTH,
  };
}

function collectWorkspaceViewerRootLinkIds(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
): string[] {
  const childLinkIds = new Set<string>();
  Object.values(robot.joints).forEach((joint) => {
    childLinkIds.add(joint.childLinkId);
  });

  const rootLinkIds = [
    robot.rootLinkId,
    ...Object.keys(robot.links).filter((linkId) => !childLinkIds.has(linkId)),
  ].filter((linkId, index, values): linkId is string => (
    Boolean(linkId)
    && Boolean(robot.links[linkId])
    && values.indexOf(linkId) === index
  ));

  if (rootLinkIds.length > 0) {
    return rootLinkIds;
  }

  const fallbackLinkId = Object.keys(robot.links).find((linkId) => Boolean(robot.links[linkId]));
  return fallbackLinkId ? [fallbackLinkId] : [];
}

function buildWorkspaceViewerSyntheticRootLink(
  syntheticRootLinkId: string,
) {
  return {
    ...DEFAULT_LINK,
    id: syntheticRootLinkId,
    name: 'world',
    visible: false,
    visual: {
      ...DEFAULT_LINK.visual,
      type: GeometryType.NONE,
      dimensions: { x: 0, y: 0, z: 0 },
    },
    visualBodies: [],
    collision: {
      ...DEFAULT_LINK.collision,
      type: GeometryType.NONE,
      dimensions: { x: 0, y: 0, z: 0 },
    },
    collisionBodies: [],
    inertial: undefined,
  };
}

export function buildWorkspaceViewerRobotData(robot: RobotData): RobotData {
  const rootLinkIds = collectWorkspaceViewerRootLinkIds(robot);
  if (rootLinkIds.length <= 1) {
    return robot;
  }

  const robotStateForSemantics: RobotState = {
    ...robot,
    selection: { type: null, id: null },
  };
  if (isSyntheticWorldRoot(robotStateForSemantics, robot.rootLinkId)) {
    return robot;
  }

  const childJointsByParent = buildChildJointsByParent(robot.joints);
  const linkWorldMatrices = computeLinkWorldMatrices(robot);
  const layoutIntervals = rootLinkIds.map((rootLinkId) => (
    estimateWorkspaceViewerRootLayoutInterval(rootLinkId, robot, childJointsByParent, linkWorldMatrices)
  ));
  const totalWidth = layoutIntervals.reduce((sum, interval) => sum + interval.width, 0)
    + WORKSPACE_VIEWER_ROOT_LAYOUT_GAP * Math.max(0, layoutIntervals.length - 1);

  let cursor = -totalWidth / 2;
  const syntheticRootLinkId = robot.links[WORKSPACE_VIEWER_WORLD_ROOT_ID]
    ? `${WORKSPACE_VIEWER_WORLD_ROOT_ID}_${rootLinkIds.length}`
    : WORKSPACE_VIEWER_WORLD_ROOT_ID;
  const links = {
    ...robot.links,
    [syntheticRootLinkId]: buildWorkspaceViewerSyntheticRootLink(syntheticRootLinkId),
  };
  const joints = { ...robot.joints };

  rootLinkIds.forEach((rootLinkId, index) => {
    const interval = layoutIntervals[index] ?? buildDefaultWorkspaceViewerRootLayoutInterval();
    const centerX = cursor - interval.left;
    cursor += interval.width + WORKSPACE_VIEWER_ROOT_LAYOUT_GAP;

    const jointId = `${syntheticRootLinkId}_joint_${index + 1}`;
    joints[jointId] = {
      id: jointId,
      name: jointId,
      type: JointType.FIXED,
      parentLinkId: syntheticRootLinkId,
      childLinkId: rootLinkId,
      origin: {
        xyz: { x: centerX, y: 0, z: 0 },
        rpy: { r: 0, p: 0, y: 0 },
      },
      dynamics: { damping: 0, friction: 0 },
      hardware: {
        armature: 0,
        motorType: 'None',
        motorId: '',
        motorDirection: 1,
      },
    };
  });

  return {
    ...robot,
    links,
    joints,
    rootLinkId: syntheticRootLinkId,
  };
}

interface CreatePreviewRobotStateOptions {
  availableFiles: RobotFile[];
  assets?: Record<string, string>;
  allFileContents?: Record<string, string>;
  usdRobotData?: RobotData | null;
}

export function createPreviewRobotState(
  file: RobotFile,
  {
    availableFiles,
    assets,
    allFileContents,
    usdRobotData,
  }: CreatePreviewRobotStateOptions,
): RobotState | null {
  const resolved = resolveRobotFileData(file, {
    availableFiles,
    assets,
    allFileContents,
    usdRobotData,
  });

  return createPreviewRobotStateFromImportResult(file, resolved);
}

export function createPreviewRobotStateFromImportResult(
  file: RobotFile,
  resolved: RobotImportResult,
): RobotState | null {
  if (resolved.status === 'ready') {
    return {
      ...resolved.robotData,
      selection: { type: null, id: null },
    };
  }

  if (resolved.status === 'needs_hydration' && file.format === 'usd') {
    return {
      ...createUsdPlaceholderRobotData(file),
      selection: { type: null, id: null },
    };
  }

  return null;
}

export function buildPreviewSceneSourceFromImportResult(
  file: RobotFile,
  {
    availableFiles,
    previewRobot,
    importResult,
  }: {
    availableFiles: RobotFile[];
    previewRobot: RobotState | null;
    importResult: RobotImportResult;
  },
): string | null {
  if (file.format === 'urdf') {
    return file.content;
  }

  if (file.format === 'xacro') {
    if (importResult.status === 'ready') {
      return importResult.resolvedUrdfContent ?? '';
    }

    return importResult.status === 'error' && importResult.reason === 'source_only_fragment'
      ? null
      : '';
  }

  if (file.format === 'mjcf') {
    if (importResult.status !== 'ready') {
      return importResult.status === 'error' && importResult.reason === 'source_only_fragment'
        ? null
        : importResult.status === 'error'
          ? ''
          : null;
    }

    return resolveMJCFSource(file, availableFiles).content;
  }

  if (file.format === 'usd') {
    return '';
  }

  if (!previewRobot) {
    return importResult.status === 'error' ? '' : null;
  }

  return generateURDF(previewRobot, { preserveMeshPaths: true });
}
