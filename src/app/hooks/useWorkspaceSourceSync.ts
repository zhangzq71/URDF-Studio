import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMujocoXML, generateSDF, generateURDF } from '@/core/parsers';
import { findStandaloneXacroTruthFile } from '@/core/parsers/importRobotFile';
import { prefixMJCFSourceIdentifiers, resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { scheduleFailFastInDev } from '@/core/utils/runtimeDiagnostics';
import { DEFAULT_LINK, GeometryType, type AssemblyState, type BridgeJoint, type JointQuaternion, type RobotClosedLoopConstraint, type RobotData, type RobotFile, type RobotState, type UrdfJoint, type UrdfLink } from '@/types';
import { stripTransientJointMotionFromJoints } from '@/shared/utils/robot/semanticSnapshot';
import { getSourceCodeDocumentFlavor, type SourceCodeDocumentFlavor } from '@/app/utils/sourceCodeDisplay';
import {
  buildWorkspaceViewerRobotData,
  buildPreviewSceneSourceFromImportResult,
  createPreviewRobotStateFromImportResult,
  createRobotSourceSnapshot,
  createRobotSourceSnapshotFromUrdfContent,
  getPreferredMjcfContent,
  getPreferredSdfContent,
  getPreferredUrdfContent,
  getWorkspaceAssemblyViewerRobotData,
  getSingleComponentWorkspaceMjcfViewerSource,
} from './workspaceSourceSyncUtils';
import { resolveRobotFileDataWithWorker } from './robotImportWorkerBridge';

export interface JointMotionStateValue {
  angle?: number;
  quaternion?: JointQuaternion;
}

interface UseWorkspaceSourceSyncOptions {
  assemblyState: AssemblyState | null;
  assemblyBridgePreview?: BridgeJoint | null;
  sidebarTab: string;
  getMergedRobotData: () => RobotData | null | undefined;
  selection: RobotState['selection'];
  robotName: string;
  robotLinks: Record<string, UrdfLink>;
  robotJoints: Record<string, UrdfJoint>;
  rootLinkId: string;
  robotMaterials?: RobotState['materials'];
  closedLoopConstraints?: RobotClosedLoopConstraint[];
  isCodeViewerOpen: boolean;
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  allFileContents: Record<string, string>;
  originalUrdfContent: string | null;
  isSelectedUsdHydrating: boolean;
  assets: Record<string, string>;
  getUsdPreparedExportCache: (path: string) => { robotData?: RobotData } | null;
  setSelectedFile: (file: RobotFile | null) => void;
  setAvailableFiles: (files: RobotFile[]) => void;
  setAllFileContents: (contents: Record<string, string>) => void;
  setOriginalUrdfContent: (content: string | null) => void;
}

function areJointSourceCompatible(
  prev: Record<string, UrdfJoint>,
  next: Record<string, UrdfJoint>,
): boolean {
  type ComparableJoint = UrdfJoint & { angle?: number };
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of nextKeys) {
    const prevJoint = prev[key] as ComparableJoint | undefined;
    const nextJoint = next[key] as ComparableJoint | undefined;
    if (!prevJoint || !nextJoint) return false;
    if (prevJoint === nextJoint) continue;

    const comparedKeys = new Set<keyof ComparableJoint>([
      ...(Object.keys(prevJoint) as Array<keyof ComparableJoint>),
      ...(Object.keys(nextJoint) as Array<keyof ComparableJoint>),
    ]);

    for (const comparedKey of comparedKeys) {
      if (comparedKey === 'angle') continue;
      if (prevJoint[comparedKey] !== nextJoint[comparedKey]) {
        return false;
      }
    }
  }

  return true;
}

export function useWorkspaceSourceSync({
  assemblyState,
  assemblyBridgePreview = null,
  sidebarTab,
  getMergedRobotData,
  selection,
  robotName,
  robotLinks,
  robotJoints,
  rootLinkId,
  robotMaterials,
  closedLoopConstraints,
  isCodeViewerOpen,
  selectedFile,
  availableFiles,
  allFileContents,
  originalUrdfContent,
  isSelectedUsdHydrating,
  assets,
  getUsdPreparedExportCache,
  setSelectedFile,
  setAvailableFiles,
  setAllFileContents,
  setOriginalUrdfContent,
}: UseWorkspaceSourceSyncOptions) {
  const generatedSourceCacheRef = useRef(new Map<string, string>());
  const isWorkspaceAssembly = Boolean(assemblyState && sidebarTab === 'workspace');
  const hasWorkspaceComponents = Boolean(
    assemblyState && Object.keys(assemblyState.components).length > 0,
  );
  // Keep the current robot rendered while the workspace is empty so switching
  // modes does not force an unnecessary viewer reload to an empty assembly.
  const shouldRenderAssembly = isWorkspaceAssembly && hasWorkspaceComponents;
  const [filePreviewFile, setFilePreviewFile] = useState<RobotFile | null>(null);
  const [previewRobot, setPreviewRobot] = useState<RobotState | null>(null);
  const [filePreview, setFilePreview] = useState<{ urdfContent: string; fileName: string } | undefined>(undefined);
  const [selectedFilePreviewSourceSnapshot, setSelectedFilePreviewSourceSnapshot] = useState<string | null>(null);
  const [selectedXacroBaselineSourceSnapshot, setSelectedXacroBaselineSourceSnapshot] = useState<string | null>(null);
  const sourceJointsRef = useRef<Record<string, UrdfJoint>>({});
  const sourceBaselineRef = useRef<{ fileName: string | null; snapshot: string | null }>({
    fileName: null,
    snapshot: null,
  });
  const mjcfViewerBaselineKeyRef = useRef<string | null>(null);
  const mjcfViewerBaselineContentRef = useRef<string | null>(null);
  const selectedFilePreviewRequestRef = useRef(0);
  const selectedXacroBaselineRequestRef = useRef(0);
  const filePreviewRequestRef = useRef(0);
  const activeSourceFile = useMemo(
    () => filePreviewFile ?? selectedFile,
    [filePreviewFile, selectedFile],
  );
  const readCachedGeneratedSource = useCallback((cacheKey: string, buildSource: () => string): string => {
    const cache = generatedSourceCacheRef.current;
    const cachedSource = cache.get(cacheKey);
    if (cachedSource !== undefined) {
      cache.delete(cacheKey);
      cache.set(cacheKey, cachedSource);
      return cachedSource;
    }

    const nextSource = buildSource();
    cache.set(cacheKey, nextSource);

    while (cache.size > 64) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      cache.delete(oldestKey);
    }

    return nextSource;
  }, []);
  const sourceCodeDocumentFlavor = useMemo<SourceCodeDocumentFlavor>(
    () => getSourceCodeDocumentFlavor(activeSourceFile),
    [activeSourceFile],
  );

  const mergedRobotData = useMemo(() => {
    if (!shouldRenderAssembly) return null;
    return getMergedRobotData() ?? null;
  }, [assemblyState, getMergedRobotData, shouldRenderAssembly]);
  const viewerMergedRobotData = useMemo(() => {
    if (!shouldRenderAssembly) {
      return null;
    }

    return getWorkspaceAssemblyViewerRobotData({
      assemblyState,
      fallbackMergedRobotData: mergedRobotData,
      bridgePreview: assemblyBridgePreview,
    });
  }, [assemblyBridgePreview, assemblyState, mergedRobotData, shouldRenderAssembly]);

  const emptyRobot = useMemo<RobotState>(() => ({
    name: '',
    links: {
      empty_root: {
        ...DEFAULT_LINK,
        id: 'empty_root',
        name: 'base_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
        inertial: {
          ...DEFAULT_LINK.inertial,
          mass: 0,
        },
      },
    },
    joints: {},
    rootLinkId: 'empty_root',
    selection: { type: null, id: null },
  }), []);
  const workspaceViewerRobotData = useMemo(() => {
    if (!shouldRenderAssembly) {
      return null;
    }

    return buildWorkspaceViewerRobotData(viewerMergedRobotData ?? emptyRobot);
  }, [emptyRobot, shouldRenderAssembly, viewerMergedRobotData]);

  const robot = useMemo<RobotState>(() => {
    if (shouldRenderAssembly) {
      if (mergedRobotData) {
        return { ...mergedRobotData, selection };
      }

      return emptyRobot;
    }

    if (isSelectedUsdHydrating) {
      return emptyRobot;
    }

    return {
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      materials: robotMaterials,
      closedLoopConstraints,
      selection,
    };
  }, [
    closedLoopConstraints,
    emptyRobot,
    isSelectedUsdHydrating,
    mergedRobotData,
    robotJoints,
    robotLinks,
    robotMaterials,
    robotName,
    rootLinkId,
    selection,
    shouldRenderAssembly,
  ]);
  const viewerRobot = useMemo<RobotState>(() => {
    if (shouldRenderAssembly) {
      if (viewerMergedRobotData) {
        return { ...viewerMergedRobotData, selection };
      }

      return emptyRobot;
    }

    return robot;
  }, [emptyRobot, robot, selection, shouldRenderAssembly, viewerMergedRobotData]);

  const jointAngleState = useMemo(() => {
    const angles: Record<string, number> = {};
    Object.values(robot.joints).forEach((joint) => {
      const angle = (joint as UrdfJoint & { angle?: number }).angle;
      if (angle !== undefined) {
        angles[joint.name] = angle;
      }
    });

    return angles;
  }, [robot.joints]);

  const jointMotionState = useMemo<Record<string, JointMotionStateValue>>(() => {
    const motions: Record<string, JointMotionStateValue> = {};
    Object.values(robot.joints).forEach((joint) => {
      const nextState: JointMotionStateValue = {};
      if (joint.angle !== undefined) {
        nextState.angle = joint.angle;
      }
      if (joint.quaternion) {
        nextState.quaternion = joint.quaternion;
      }
      if (nextState.angle !== undefined || nextState.quaternion) {
        motions[joint.name] = nextState;
      }
    });

    return motions;
  }, [robot.joints]);

  const showVisual = useMemo(() => {
    return Object.values(robot.links).some((link) => link.visible !== false);
  }, [robot.links]);

  const sourceRobotJoints = useMemo(() => {
    if (areJointSourceCompatible(sourceJointsRef.current, robotJoints)) {
      return sourceJointsRef.current;
    }

    const nextSourceJoints = stripTransientJointMotionFromJoints(robotJoints);
    sourceJointsRef.current = nextSourceJoints;
    return nextSourceJoints;
  }, [robotJoints]);

  const currentRobotSourceState = useMemo<RobotState>(() => ({
    name: robotName,
    links: robotLinks,
    joints: sourceRobotJoints,
    rootLinkId,
    materials: robotMaterials,
    closedLoopConstraints,
    selection: { type: null, id: null },
  }), [closedLoopConstraints, robotLinks, robotMaterials, robotName, rootLinkId, sourceRobotJoints]);

  const currentRobotSourceSnapshot = useMemo(
    () => createRobotSourceSnapshot(currentRobotSourceState),
    [currentRobotSourceState],
  );
  const workspaceRobotSourceSnapshot = useMemo(() => {
    if (!workspaceViewerRobotData) {
      return null;
    }

    return createRobotSourceSnapshot({
      ...workspaceViewerRobotData,
      selection: { type: null, id: null },
    });
  }, [workspaceViewerRobotData]);
  const workspaceViewerMjcfSourceFile = useMemo(
    () => getSingleComponentWorkspaceMjcfViewerSource({
      assemblyState,
      availableFiles,
    }),
    [assemblyState, availableFiles],
  );
  const workspaceResolvedMjcfSource = useMemo(() => {
    if (!workspaceViewerMjcfSourceFile) {
      return null;
    }

    return resolveMJCFSource(workspaceViewerMjcfSourceFile, availableFiles);
  }, [availableFiles, workspaceViewerMjcfSourceFile]);

  const selectedXacroTruthFile = useMemo(() => {
    if (shouldRenderAssembly || selectedFile?.format !== 'xacro') {
      return null;
    }

    return findStandaloneXacroTruthFile(selectedFile, availableFiles);
  }, [availableFiles, selectedFile, shouldRenderAssembly]);

  const selectedXacroResolvedSourceFilePath = useMemo(
    () => selectedXacroTruthFile?.name ?? selectedFile?.name ?? null,
    [selectedFile?.name, selectedXacroTruthFile],
  );

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || selectedFile.format === 'xacro') {
      setSelectedFilePreviewSourceSnapshot(null);
      return;
    }

    const requestId = ++selectedFilePreviewRequestRef.current;

    void resolveRobotFileDataWithWorker(selectedFile, {
      availableFiles,
      assets,
      allFileContents,
      usdRobotData: getUsdPreparedExportCache(selectedFile.name)?.robotData ?? null,
    }).then((result) => {
      if (requestId !== selectedFilePreviewRequestRef.current) {
        return;
      }

      const previewRobotState = createPreviewRobotStateFromImportResult(selectedFile, result);
      setSelectedFilePreviewSourceSnapshot(
        previewRobotState ? createRobotSourceSnapshot(previewRobotState) : null,
      );
    }).catch((error) => {
      if (requestId !== selectedFilePreviewRequestRef.current) {
        return;
      }

      setSelectedFilePreviewSourceSnapshot(null);
      scheduleFailFastInDev(
        'useWorkspaceSourceSync:selectedFilePreviewSourceSnapshot',
        new Error(`Failed to build preview snapshot for "${selectedFile.name}".`, { cause: error }),
      );
    });
  }, [
    allFileContents,
    assets,
    availableFiles,
    getUsdPreparedExportCache,
    selectedFile,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || selectedFile?.format !== 'xacro' || !originalUrdfContent) {
      setSelectedXacroBaselineSourceSnapshot(null);
      return;
    }

    const requestId = ++selectedXacroBaselineRequestRef.current;
    const sourcePath = selectedXacroResolvedSourceFilePath ?? selectedFile.name;

    void createRobotSourceSnapshotFromUrdfContent(originalUrdfContent, {
      sourcePath,
    }).then((snapshot) => {
      if (requestId !== selectedXacroBaselineRequestRef.current) {
        return;
      }

      setSelectedXacroBaselineSourceSnapshot(snapshot);
    }).catch((error) => {
      if (requestId !== selectedXacroBaselineRequestRef.current) {
        return;
      }

      setSelectedXacroBaselineSourceSnapshot(null);
      scheduleFailFastInDev(
        'useWorkspaceSourceSync:selectedXacroBaselineSourceSnapshot',
        new Error(`Failed to build Xacro baseline snapshot for "${selectedFile.name}".`, { cause: error }),
      );
    });
  }, [
    originalUrdfContent,
    selectedFile,
    selectedXacroResolvedSourceFilePath,
    shouldRenderAssembly,
  ]);

  const isSelectedUrdfSource = selectedFile?.format === 'urdf';
  const isSelectedXacroSource = selectedFile?.format === 'xacro';
  const isSelectedSdfSource = selectedFile?.format === 'sdf';

  useEffect(() => {
    if (
      shouldRenderAssembly
      || !selectedFile
      || (!isSelectedUrdfSource && !isSelectedXacroSource && !isSelectedSdfSource)
    ) {
      sourceBaselineRef.current = { fileName: null, snapshot: null };
      return;
    }
  }, [isSelectedSdfSource, isSelectedUrdfSource, isSelectedXacroSource, selectedFile, shouldRenderAssembly]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedUrdfSource) {
      return;
    }

    if (selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name
      && sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    sourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isSelectedUrdfSource,
    selectedFile,
    selectedFilePreviewSourceSnapshot,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedXacroSource) {
      return;
    }

    if (selectedXacroBaselineSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name
      && sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    sourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isSelectedXacroSource,
    selectedFile,
    selectedXacroBaselineSourceSnapshot,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedSdfSource) {
      return;
    }

    if (selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name
      && sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    sourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isSelectedSdfSource,
    selectedFile,
    selectedFilePreviewSourceSnapshot,
    shouldRenderAssembly,
  ]);

  const hasSourceStoreEdits = useMemo(() => {
    if (
      shouldRenderAssembly
      || !selectedFile
      || (!isSelectedUrdfSource && !isSelectedXacroSource && !isSelectedSdfSource)
    ) {
      return false;
    }

    const baseline = sourceBaselineRef.current;
    if (!baseline.fileName || baseline.fileName !== selectedFile.name) {
      return false;
    }

    return baseline.snapshot !== currentRobotSourceSnapshot;
  }, [
    currentRobotSourceSnapshot,
    isSelectedSdfSource,
    isSelectedUrdfSource,
    isSelectedXacroSource,
    selectedFile,
    shouldRenderAssembly,
  ]);

  const generatedUrdfContent = useMemo(() => {
    if (shouldRenderAssembly || isSelectedUsdHydrating || selectedFile?.format === 'mjcf') {
      return null;
    }

    return readCachedGeneratedSource(
      `urdf:${currentRobotSourceSnapshot}`,
      () => generateURDF(currentRobotSourceState, { includeHardware: 'auto' }),
    );
  }, [
    currentRobotSourceSnapshot,
    currentRobotSourceState,
    isSelectedUsdHydrating,
    readCachedGeneratedSource,
    selectedFile?.format,
    shouldRenderAssembly,
  ]);

  const viewerGeneratedUrdfContent = useMemo(() => {
    if (shouldRenderAssembly || isSelectedUsdHydrating) {
      return null;
    }

    return readCachedGeneratedSource(
      `viewer-urdf:${currentRobotSourceSnapshot}`,
      () => generateURDF(currentRobotSourceState, { preserveMeshPaths: true }),
    );
  }, [
    currentRobotSourceSnapshot,
    currentRobotSourceState,
    isSelectedUsdHydrating,
    readCachedGeneratedSource,
    selectedFile?.format,
    shouldRenderAssembly,
  ]);

  const viewerUrdfContent = useMemo(() => {
    if (shouldRenderAssembly || isSelectedUsdHydrating || selectedFile?.format === 'mjcf') {
      return null;
    }

    if (selectedFile?.format === 'xacro') {
      return hasSourceStoreEdits
        ? viewerGeneratedUrdfContent
        : originalUrdfContent ?? viewerGeneratedUrdfContent;
    }

    return getPreferredUrdfContent({
      fileContent: selectedFile?.format === 'urdf' ? selectedFile.content : null,
      originalContent: originalUrdfContent,
      generatedContent: viewerGeneratedUrdfContent,
      hasStoreEdits: isSelectedUrdfSource ? hasSourceStoreEdits : true,
    });
  }, [
    hasSourceStoreEdits,
    isSelectedUrdfSource,
    isSelectedUsdHydrating,
    originalUrdfContent,
    selectedFile,
    viewerGeneratedUrdfContent,
    shouldRenderAssembly,
  ]);

  const generatedMjcfContent = useMemo(() => {
    const shouldGenerateMjcfSource = !shouldRenderAssembly && !isSelectedUsdHydrating && (
      selectedFile?.format === 'mjcf'
      || (isCodeViewerOpen && sourceCodeDocumentFlavor === 'equivalent-mjcf')
    );

    if (!shouldGenerateMjcfSource) {
      return null;
    }

    return readCachedGeneratedSource(
      `mjcf:${currentRobotSourceSnapshot}`,
      () => generateMujocoXML(currentRobotSourceState, {
        meshdir: 'meshes/',
        includeSceneHelpers: false,
      }),
    );
  }, [
    currentRobotSourceSnapshot,
    currentRobotSourceState,
    isCodeViewerOpen,
    isSelectedUsdHydrating,
    readCachedGeneratedSource,
    selectedFile?.format,
    shouldRenderAssembly,
    sourceCodeDocumentFlavor,
  ]);

  const generatedSdfContent = useMemo(() => {
    if (shouldRenderAssembly || isSelectedUsdHydrating || selectedFile?.format !== 'sdf') {
      return null;
    }

    return readCachedGeneratedSource(
      `sdf:${currentRobotSourceSnapshot}`,
      () => generateSDF(currentRobotSourceState),
    );
  }, [
    currentRobotSourceSnapshot,
    currentRobotSourceState,
    isSelectedUsdHydrating,
    readCachedGeneratedSource,
    selectedFile?.format,
    shouldRenderAssembly,
  ]);

  const resolvedMjcfSource = useMemo(() => {
    if (!selectedFile || selectedFile.format !== 'mjcf') {
      return null;
    }

    return resolveMJCFSource(selectedFile, availableFiles);
  }, [availableFiles, selectedFile]);

  const mjcfViewerBaselineKey = useMemo(
    () => (selectedFile?.format === 'mjcf'
      ? `${selectedFile.name}\u0000${resolvedMjcfSource?.content ?? selectedFile.content}`
      : null),
    [resolvedMjcfSource?.content, selectedFile],
  );

  useEffect(() => {
    if (!mjcfViewerBaselineKey) {
      mjcfViewerBaselineKeyRef.current = null;
      mjcfViewerBaselineContentRef.current = null;
      return;
    }

    if (mjcfViewerBaselineKeyRef.current !== mjcfViewerBaselineKey) {
      mjcfViewerBaselineKeyRef.current = mjcfViewerBaselineKey;
      mjcfViewerBaselineContentRef.current = null;
    }

    if (
      !generatedMjcfContent
      || selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot
      || mjcfViewerBaselineContentRef.current !== null
    ) {
      return;
    }

    mjcfViewerBaselineContentRef.current = generatedMjcfContent;
  }, [
    currentRobotSourceSnapshot,
    generatedMjcfContent,
    mjcfViewerBaselineKey,
    selectedFilePreviewSourceSnapshot,
  ]);

  const hasMjcfViewerEdits = useMemo(() => {
    if (!mjcfViewerBaselineKey || !generatedMjcfContent) {
      return false;
    }

    if (mjcfViewerBaselineKeyRef.current !== mjcfViewerBaselineKey) {
      return false;
    }

    if (mjcfViewerBaselineContentRef.current === null) {
      return false;
    }

    return mjcfViewerBaselineContentRef.current !== generatedMjcfContent;
  }, [generatedMjcfContent, mjcfViewerBaselineKey]);

  const workspaceViewerContent = useMemo(() => {
    if (!shouldRenderAssembly || !workspaceRobotSourceSnapshot) {
      return null;
    }

    return readCachedGeneratedSource(
      `workspace-viewer-urdf:${workspaceRobotSourceSnapshot}`,
      () => generateURDF({
        ...workspaceViewerRobotData!,
        selection: { type: null, id: null },
      }, { preserveMeshPaths: true }),
    );
  }, [
    readCachedGeneratedSource,
    shouldRenderAssembly,
    workspaceViewerRobotData,
    workspaceRobotSourceSnapshot,
  ]);
  const workspaceViewerMjcfContent = useMemo(() => {
    if (!shouldRenderAssembly || !workspaceViewerMjcfSourceFile || !workspaceResolvedMjcfSource || !assemblyState) {
      return null;
    }

    const visibleComponent = Object.values(assemblyState.components)
      .find((component) => component.visible !== false && component.sourceFile === workspaceViewerMjcfSourceFile.name);

    if (!visibleComponent) {
      return null;
    }

    const componentSnapshot = createRobotSourceSnapshot({
      ...visibleComponent.robot,
      selection: { type: null, id: null },
    });

    return readCachedGeneratedSource(
      `workspace-viewer-mjcf:${workspaceViewerMjcfSourceFile.name}:${componentSnapshot}`,
      () => prefixMJCFSourceIdentifiers(
        workspaceResolvedMjcfSource.content,
        `${visibleComponent.name}_`,
      ),
    );
  }, [
    assemblyState,
    readCachedGeneratedSource,
    shouldRenderAssembly,
    workspaceResolvedMjcfSource,
    workspaceViewerMjcfSourceFile,
  ]);

  const syncedSourceContent = useMemo(() => {
    if (!selectedFile || shouldRenderAssembly) {
      return null;
    }

    if (selectedFile.format === 'urdf') {
      return getPreferredUrdfContent({
        fileContent: selectedFile.content,
        originalContent: originalUrdfContent,
        generatedContent: generatedUrdfContent,
        hasStoreEdits: hasSourceStoreEdits,
      });
    }

    if (selectedFile.format === 'xacro') {
      return selectedFile.content;
    }

    if (selectedFile.format === 'mjcf' && isCodeViewerOpen) {
      return getPreferredMjcfContent({
        sourceContent: selectedFile.content,
        generatedContent: generatedMjcfContent,
        hasViewerEdits: hasMjcfViewerEdits,
      });
    }

    if (selectedFile.format === 'sdf' && isCodeViewerOpen) {
      return getPreferredSdfContent({
        fileContent: selectedFile.content,
        generatedContent: generatedSdfContent,
        hasStoreEdits: hasSourceStoreEdits,
      });
    }

    if (selectedFile.format === 'usd' && sourceCodeDocumentFlavor === 'equivalent-mjcf' && isCodeViewerOpen) {
      return generatedMjcfContent;
    }

    return null;
  }, [
    generatedMjcfContent,
    generatedSdfContent,
    generatedUrdfContent,
    hasMjcfViewerEdits,
    hasSourceStoreEdits,
    isCodeViewerOpen,
    originalUrdfContent,
    resolvedMjcfSource,
    selectedFile,
    sourceCodeDocumentFlavor,
    shouldRenderAssembly,
  ]);

  const viewerSourceFormat = useMemo<'auto' | 'urdf' | 'mjcf' | 'sdf' | 'xacro'>(() => {
    if (shouldRenderAssembly) {
      return workspaceViewerMjcfContent ? 'mjcf' : 'urdf';
    }

    if (selectedFile?.format === 'mjcf' && hasMjcfViewerEdits) {
      return 'urdf';
    }

    switch (selectedFile?.format) {
      case 'urdf':
      case 'mjcf':
      case 'sdf':
      case 'xacro':
        return selectedFile.format;
      default:
        return 'auto';
    }
  }, [
    hasMjcfViewerEdits,
    selectedFile?.format,
    shouldRenderAssembly,
    workspaceViewerMjcfContent,
  ]);

  const syncTextFileContent = useCallback((
    fileName: string,
    content: string,
    options: { syncOriginalContent?: boolean } = {},
  ) => {
    const { syncOriginalContent = false } = options;

    if (selectedFile?.name === fileName && selectedFile.content !== content) {
      setSelectedFile({
        ...selectedFile,
        content,
      });
    }

    const needsAvailableFileSync = availableFiles.some(
      (file) => file.name === fileName && file.content !== content,
    );

    if (needsAvailableFileSync) {
      setAvailableFiles(
        availableFiles.map((file) =>
          file.name === fileName
            ? { ...file, content }
            : file,
        ),
      );
    }

    if (allFileContents[fileName] !== content) {
      setAllFileContents({
        ...allFileContents,
        [fileName]: content,
      });
    }

    if (syncOriginalContent && originalUrdfContent !== content) {
      setOriginalUrdfContent(content);
    }
  }, [
    allFileContents,
    availableFiles,
    originalUrdfContent,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setOriginalUrdfContent,
    setSelectedFile,
  ]);

  const urdfContentForViewer = useMemo(() => {
    if (shouldRenderAssembly) {
      return workspaceViewerMjcfContent ?? workspaceViewerContent!;
    }

    if (selectedFile?.format === 'usd' && isSelectedUsdHydrating) {
      return selectedFile.content ?? '';
    }

    if (selectedFile?.format === 'mjcf') {
      const sourceMjcfContent = resolvedMjcfSource?.content ?? selectedFile.content;

      if (!hasMjcfViewerEdits) {
        return sourceMjcfContent;
      }

      return viewerGeneratedUrdfContent ?? sourceMjcfContent;
    }

    return viewerUrdfContent ?? viewerGeneratedUrdfContent;
  }, [
    hasMjcfViewerEdits,
    isSelectedUsdHydrating,
    resolvedMjcfSource,
    selectedFile,
    viewerGeneratedUrdfContent,
    viewerUrdfContent,
    workspaceViewerMjcfContent,
    workspaceViewerContent,
    shouldRenderAssembly,
  ]);

  const viewerSourceFilePath = useMemo(() => {
    if (shouldRenderAssembly) {
      return workspaceResolvedMjcfSource?.effectiveFile.name
        ?? workspaceViewerMjcfSourceFile?.name;
    }

    if (selectedFile?.format === 'mjcf') {
      return resolvedMjcfSource?.effectiveFile.name ?? selectedFile.name;
    }

    if (selectedFile?.format === 'xacro') {
      return hasSourceStoreEdits
        ? selectedFile.name
        : (selectedXacroResolvedSourceFilePath ?? selectedFile.name);
    }

    return selectedFile?.name;
  }, [
    hasSourceStoreEdits,
    resolvedMjcfSource,
    selectedFile,
    selectedXacroResolvedSourceFilePath,
    shouldRenderAssembly,
    workspaceResolvedMjcfSource,
    workspaceViewerMjcfSourceFile,
  ]);

  useEffect(() => {
    if (
      !selectedFile
      || selectedFile.format !== 'urdf'
      || !generatedUrdfContent
      || !hasSourceStoreEdits
    ) {
      return;
    }

    syncTextFileContent(selectedFile.name, generatedUrdfContent);
  }, [generatedUrdfContent, hasSourceStoreEdits, selectedFile, syncTextFileContent]);

  useEffect(() => {
    if (!shouldRenderAssembly || !assemblyState) {
      return;
    }

    const generatedComponentSources = new Map<string, string>();

    Object.values(assemblyState.components).forEach((component) => {
      const sourceFile = availableFiles.find((file) => file.name === component.sourceFile);
      if (!sourceFile) return;

      const sourceRobotState: RobotState = {
        ...component.robot,
        selection: { type: null, id: null },
      };

      if (sourceFile.format === 'urdf') {
        const componentSnapshot = createRobotSourceSnapshot(sourceRobotState);
        generatedComponentSources.set(
          sourceFile.name,
          readCachedGeneratedSource(
            `component-urdf:${sourceFile.name}:${componentSnapshot}`,
            () => generateURDF(sourceRobotState, { includeHardware: 'auto' }),
          ),
        );
      }

    });

    if (generatedComponentSources.size === 0) {
      return;
    }

    let nextAvailableFiles: RobotFile[] | null = null;
    let nextAllFileContents: Record<string, string> | null = null;
    let nextSelectedFile: RobotFile | null = null;

    for (const [fileName, content] of generatedComponentSources) {
      if (selectedFile?.name === fileName && selectedFile.content !== content) {
        nextSelectedFile = {
          ...selectedFile,
          content,
        };
      }

      if (availableFiles.some((file) => file.name === fileName && file.content !== content)) {
        const baseFiles = nextAvailableFiles ?? availableFiles;
        nextAvailableFiles = baseFiles.map((file) =>
          file.name === fileName
            ? { ...file, content }
            : file,
        );
      }

      if (allFileContents[fileName] !== content) {
        nextAllFileContents = {
          ...(nextAllFileContents ?? allFileContents),
          [fileName]: content,
        };
      }
    }

    if (nextSelectedFile) {
      setSelectedFile(nextSelectedFile);
    }

    if (nextAvailableFiles) {
      setAvailableFiles(nextAvailableFiles);
    }

    if (nextAllFileContents) {
      setAllFileContents(nextAllFileContents);
    }
  }, [
    allFileContents,
    assemblyState,
    availableFiles,
    readCachedGeneratedSource,
    shouldRenderAssembly,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
  ]);

  useEffect(() => {
    if (!filePreviewFile) {
      setPreviewRobot(null);
      setFilePreview(undefined);
      return;
    }

    const requestId = ++filePreviewRequestRef.current;
    setPreviewRobot(null);
    setFilePreview(undefined);

    void resolveRobotFileDataWithWorker(filePreviewFile, {
      availableFiles,
      assets,
      allFileContents,
      usdRobotData: getUsdPreparedExportCache(filePreviewFile.name)?.robotData ?? null,
    }).then((result) => {
      if (requestId !== filePreviewRequestRef.current) {
        return;
      }

      const nextPreviewRobot = createPreviewRobotStateFromImportResult(filePreviewFile, result);
      const previewUrdf = buildPreviewSceneSourceFromImportResult(filePreviewFile, {
        availableFiles,
        previewRobot: nextPreviewRobot,
        importResult: result,
      });

      setPreviewRobot(nextPreviewRobot);
      setFilePreview(
        previewUrdf != null
          ? { urdfContent: previewUrdf, fileName: filePreviewFile.name }
          : undefined,
      );
    }).catch((error) => {
      if (requestId !== filePreviewRequestRef.current) {
        return;
      }

      setPreviewRobot(null);
      setFilePreview(undefined);
      scheduleFailFastInDev(
        'useWorkspaceSourceSync:filePreview',
        new Error(`Failed to resolve file preview for "${filePreviewFile.name}".`, { cause: error }),
      );
    });
  }, [
    allFileContents,
    assets,
    availableFiles,
    filePreviewFile,
    getUsdPreparedExportCache,
  ]);

  const sourceCodeContent = filePreviewFile?.content
    ?? syncedSourceContent
    ?? (selectedFile ? selectedFile.content : urdfContentForViewer);

  const handlePreviewFile = useCallback((file: RobotFile) => {
    setFilePreviewFile(file);
  }, []);

  const handleClosePreview = useCallback(() => {
    setFilePreviewFile(null);
  }, []);

  useEffect(() => {
    if (!filePreviewFile) return;
    const exists = availableFiles.some((file) => file.name === filePreviewFile.name);
    if (!exists) {
      setFilePreviewFile(null);
    }
  }, [availableFiles, filePreviewFile]);

  return {
    isWorkspaceAssembly,
    shouldRenderAssembly,
    mergedRobotData,
    emptyRobot,
    robot,
    viewerRobot,
    jointAngleState,
    jointMotionState,
    showVisual,
    urdfContentForViewer,
    viewerSourceFormat,
    viewerSourceFilePath,
    workspaceViewerMjcfSourceFile,
    filePreview,
    previewRobot,
    previewFileName: filePreviewFile?.name,
    sourceCodeFileName: activeSourceFile?.name,
    sourceCodeContent,
    sourceCodeDocumentFlavor,
    handlePreviewFile,
    handleClosePreview,
  };
}
