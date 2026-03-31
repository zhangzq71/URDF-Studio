import { computeLinkWorldMatrices, isSyntheticWorldRoot } from '@/core/robot';
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
  type RobotData,
  type RobotFile,
  type RobotState,
  type UrdfJoint,
} from '@/types';
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
  if (hasViewerEdits) {
    return generatedContent ?? sourceContent ?? null;
  }

  return sourceContent ?? generatedContent ?? null;
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
}: {
  selectedFile: RobotFile | null;
  shouldRenderAssembly: boolean;
}): RobotFile | null {
  return shouldRenderAssembly ? null : selectedFile;
}

export function shouldReseedSingleComponentAssemblyFromActiveFile({
  assemblyState,
  activeFile,
}: {
  assemblyState: AssemblyState | null;
  activeFile: RobotFile | null;
}): boolean {
  if (!assemblyState || !activeFile || activeFile.format === 'mesh') {
    return false;
  }

  const components = Object.values(assemblyState.components);
  if (components.length !== 1 || Object.keys(assemblyState.bridges).length > 0) {
    return false;
  }

  return components[0]?.sourceFile !== activeFile.name;
}

const WORKSPACE_VIEWER_WORLD_ROOT_ID = '__workspace_world__';
const WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_SPAN = 0.9;
const WORKSPACE_VIEWER_ROOT_LAYOUT_MAX_SPAN = 2.6;
const WORKSPACE_VIEWER_ROOT_LAYOUT_GAP = 0.45;
const WORKSPACE_VIEWER_ROOT_LAYOUT_BODY_PADDING = 0.8;

interface MatrixWithElements {
  elements: ArrayLike<number>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function estimateWorkspaceViewerRootLayoutSpan(
  rootLinkId: string,
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  childJointsByParent: Record<string, UrdfJoint[]>,
  linkWorldMatrices: Record<string, MatrixWithElements>,
): number {
  const subtreeLinkIds = collectRootSubtreeLinkIds(rootLinkId, childJointsByParent)
    .filter((linkId) => Boolean(robot.links[linkId]));

  if (subtreeLinkIds.length === 0) {
    return WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_SPAN;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  subtreeLinkIds.forEach((linkId) => {
    const matrix = linkWorldMatrices[linkId];
    const elements = matrix?.elements;
    if (!elements || elements.length < 14) {
      return;
    }

    const x = Number(elements[12] ?? 0);
    const y = Number(elements[13] ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_SPAN;
  }

  const authoredSpan = Math.max(maxX - minX, maxY - minY);
  return clamp(
    Math.max(authoredSpan + WORKSPACE_VIEWER_ROOT_LAYOUT_BODY_PADDING, WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_SPAN),
    WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_SPAN,
    WORKSPACE_VIEWER_ROOT_LAYOUT_MAX_SPAN,
  );
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
  const layoutSpans = rootLinkIds.map((rootLinkId) => (
    estimateWorkspaceViewerRootLayoutSpan(rootLinkId, robot, childJointsByParent, linkWorldMatrices)
  ));
  const totalSpan = layoutSpans.reduce((sum, span) => sum + span, 0)
    + WORKSPACE_VIEWER_ROOT_LAYOUT_GAP * Math.max(0, layoutSpans.length - 1);

  let cursor = -totalSpan / 2;
  const syntheticRootLinkId = robot.links[WORKSPACE_VIEWER_WORLD_ROOT_ID]
    ? `${WORKSPACE_VIEWER_WORLD_ROOT_ID}_${rootLinkIds.length}`
    : WORKSPACE_VIEWER_WORLD_ROOT_ID;
  const links = {
    ...robot.links,
    [syntheticRootLinkId]: buildWorkspaceViewerSyntheticRootLink(syntheticRootLinkId),
  };
  const joints = { ...robot.joints };

  rootLinkIds.forEach((rootLinkId, index) => {
    const span = layoutSpans[index] ?? WORKSPACE_VIEWER_ROOT_LAYOUT_MIN_SPAN;
    const centerX = cursor + span / 2;
    cursor += span + WORKSPACE_VIEWER_ROOT_LAYOUT_GAP;

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
