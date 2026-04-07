import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { generateMujocoXML, generateSDF, generateURDF } from '@/core/parsers';
import { findStandaloneXacroTruthFile } from '@/core/parsers/importRobotFile';
import {
  prefixMJCFSourceIdentifiers,
  resolveMJCFSource,
} from '@/core/parsers/mjcf/mjcfSourceResolver';
import { mergeAssembly } from '@/core/robot';
import { scheduleFailFastInDev } from '@/core/utils/runtimeDiagnostics';
import {
  DEFAULT_LINK,
  GeometryType,
  type AssemblyState,
  type BridgeJoint,
  type JointQuaternion,
  type RobotClosedLoopConstraint,
  type RobotData,
  type RobotFile,
  type RobotState,
  type UrdfJoint,
  type UrdfLink,
} from '@/types';
import { stripTransientJointMotionFromJoints } from '@/shared/utils/robot/semanticSnapshot';
import {
  getSourceCodeDocumentFlavor,
  type SourceCodeDocumentFlavor,
} from '@/app/utils/sourceCodeDisplay';
import {
  buildLightweightWorkspaceViewerReloadContent,
  buildWorkspaceAssemblyViewerState,
  buildWorkspaceAssemblyViewerDisplayRobotData,
  buildWorkspaceViewerRobotData,
  buildPreviewSceneSourceFromImportResult,
  createPreviewRobotStateFromImportResult,
  createRobotSourceSnapshot,
  createRobotSourceSnapshotFromUrdfContent,
  getWorkspaceAssemblyRenderFailureReason,
  getPreferredMjcfContent,
  getPreferredSdfContent,
  getPreferredUrdfContent,
  getWorkspaceAssemblyViewerRobotData,
  getSingleComponentWorkspaceMjcfViewerSource,
  isActiveWorkspaceTransformSession,
  normalizeWorkspaceAssemblyViewerDisplayRobotDataForSource,
  shouldKeepPristineSingleComponentWorkspaceOnSourceViewer,
  shouldUseGeneratedWorkspaceViewerReloadContent,
} from './workspaceSourceSyncUtils';
import { resolveRobotFileDataWithWorker } from './robotImportWorkerBridge';
import { useAnimatedWorkspaceViewerRobotData } from './useAnimatedWorkspaceViewerRobotData';
import {
  resolveWorkspaceViewerFallbackRobot,
  resolveWorkspaceViewerRobot,
  shouldPersistStableWorkspaceViewerRobot,
  shouldAnimateWorkspaceViewerRobot,
} from './workspaceViewerPresentation';

export interface JointMotionStateValue {
  angle?: number;
  quaternion?: JointQuaternion;
}

interface UseWorkspaceSourceSyncOptions {
  assemblyState: AssemblyState | null;
  assemblyRevision: number;
  assemblyBridgePreview?: BridgeJoint | null;
  assemblySelection?: { type: 'assembly' | 'component' | null; id: string | null };
  workspaceTransformPending: boolean;
  sidebarTab: string;
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

function buildVisibleAssemblyState(assemblyState: AssemblyState | null): AssemblyState | null {
  if (!assemblyState) {
    return null;
  }

  const visibleComponents = Object.fromEntries(
    Object.entries(assemblyState.components).filter(([, component]) => component.visible !== false),
  );
  if (Object.keys(visibleComponents).length === 0) {
    return null;
  }

  const visibleComponentIds = new Set(Object.keys(visibleComponents));
  const visibleBridges = Object.fromEntries(
    Object.entries(assemblyState.bridges).filter(
      ([, bridge]) =>
        visibleComponentIds.has(bridge.parentComponentId) &&
        visibleComponentIds.has(bridge.childComponentId),
    ),
  );

  return {
    ...assemblyState,
    components: visibleComponents,
    bridges: visibleBridges,
  };
}

interface DeferredWorkspaceSourceSyncTask {
  cacheKey: string;
  fileName: string;
  sourceRobotState: RobotState;
}

export function useWorkspaceSourceSync({
  assemblyState,
  assemblyRevision,
  assemblyBridgePreview = null,
  assemblySelection,
  workspaceTransformPending,
  sidebarTab,
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
  const [filePreviewFile, setFilePreviewFile] = useState<RobotFile | null>(null);
  const [previewRobot, setPreviewRobot] = useState<RobotState | null>(null);
  const [filePreview, setFilePreview] = useState<
    { urdfContent: string; fileName: string } | undefined
  >(undefined);
  const [selectedFilePreviewSourceSnapshot, setSelectedFilePreviewSourceSnapshot] = useState<
    string | null
  >(null);
  const [selectedXacroBaselineSourceSnapshot, setSelectedXacroBaselineSourceSnapshot] = useState<
    string | null
  >(null);
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
  const deferredWorkspaceSourceSyncIdleRef = useRef<number | null>(null);
  const deferredWorkspaceSourceSyncTimeoutRef = useRef<number | null>(null);
  const deferredWorkspaceSourceSyncRequestRef = useRef(0);
  const activeSourceFile = useMemo(
    () => filePreviewFile ?? selectedFile,
    [filePreviewFile, selectedFile],
  );
  const readCachedGeneratedSource = useCallback(
    (cacheKey: string, buildSource: () => string): string => {
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
    },
    [],
  );
  const sourceCodeDocumentFlavor = useMemo<SourceCodeDocumentFlavor>(
    () => getSourceCodeDocumentFlavor(activeSourceFile),
    [activeSourceFile],
  );
  const sourceRobotJoints = useMemo(() => {
    if (areJointSourceCompatible(sourceJointsRef.current, robotJoints)) {
      return sourceJointsRef.current;
    }

    const nextSourceJoints = stripTransientJointMotionFromJoints(robotJoints);
    sourceJointsRef.current = nextSourceJoints;
    return nextSourceJoints;
  }, [robotJoints]);
  const currentRobotSourceState = useMemo<RobotState>(
    () => ({
      name: robotName,
      links: robotLinks,
      joints: sourceRobotJoints,
      rootLinkId,
      materials: robotMaterials,
      closedLoopConstraints,
      selection: { type: null, id: null },
    }),
    [closedLoopConstraints, robotLinks, robotMaterials, robotName, rootLinkId, sourceRobotJoints],
  );
  const currentRobotSourceSnapshot = useMemo(
    () => createRobotSourceSnapshot(currentRobotSourceState),
    [currentRobotSourceState],
  );
  const selectedFileReuseBaselineRobotData = useMemo(() => {
    if (selectedFile?.format !== 'usd') {
      return null;
    }

    return getUsdPreparedExportCache(selectedFile.name)?.robotData ?? null;
  }, [getUsdPreparedExportCache, selectedFile]);
  const shouldReuseSelectedFileViewerForWorkspace = useMemo(
    () =>
      isWorkspaceAssembly &&
      hasWorkspaceComponents &&
      shouldKeepPristineSingleComponentWorkspaceOnSourceViewer({
        assemblyState,
        activeFile: selectedFile,
        sourceSnapshot: currentRobotSourceSnapshot,
        sourceRobotData: selectedFileReuseBaselineRobotData,
        assemblySelectionType: assemblySelection?.type ?? null,
      }),
    [
      assemblySelection?.type,
      assemblyState,
      currentRobotSourceSnapshot,
      selectedFileReuseBaselineRobotData,
      hasWorkspaceComponents,
      isWorkspaceAssembly,
      selectedFile,
    ],
  );
  const sourceSceneAssemblyComponentId = useMemo(() => {
    if (!shouldReuseSelectedFileViewerForWorkspace || !assemblyState) {
      return null;
    }

    const visibleComponents = Object.values(assemblyState.components).filter(
      (component) => component.visible !== false,
    );
    if (visibleComponents.length !== 1 || Object.keys(assemblyState.bridges).length > 0) {
      return null;
    }

    return visibleComponents[0]?.id ?? null;
  }, [assemblyState, shouldReuseSelectedFileViewerForWorkspace]);
  // Keep the current robot rendered while the workspace is empty or still a
  // pristine single-component seed so switching to workspace does not trigger
  // a redundant viewer reload before the assembly actually diverges.
  const shouldRenderAssembly =
    isWorkspaceAssembly && hasWorkspaceComponents && !shouldReuseSelectedFileViewerForWorkspace;
  const hasActiveWorkspaceTransformTarget = useMemo(
    () =>
      isActiveWorkspaceTransformSession({
        shouldRenderAssembly,
        shouldReuseSelectedFileViewerForWorkspace,
        workspaceTransformPending,
      }),
    [shouldRenderAssembly, shouldReuseSelectedFileViewerForWorkspace, workspaceTransformPending],
  );
  const previousShouldRenderAssemblyRef = useRef(shouldRenderAssembly);
  const lastStableViewerRobotRef = useRef<RobotState | null>(null);
  const deferredAssemblyState = useDeferredValue(assemblyState);
  const isPreviewingAssemblyBridge = shouldRenderAssembly && Boolean(assemblyBridgePreview);
  const assemblyStateForViewerDisplay = isPreviewingAssemblyBridge
    ? assemblyState
    : deferredAssemblyState;
  const visibleAssemblyStateForViewerDisplay = useMemo(
    () => (shouldRenderAssembly ? buildVisibleAssemblyState(assemblyStateForViewerDisplay) : null),
    [assemblyStateForViewerDisplay, shouldRenderAssembly],
  );
  const mergedRobotData = useMemo(() => {
    if (!shouldRenderAssembly || !visibleAssemblyStateForViewerDisplay) {
      return null;
    }

    return mergeAssembly(visibleAssemblyStateForViewerDisplay);
  }, [shouldRenderAssembly, visibleAssemblyStateForViewerDisplay]);
  const viewerAssemblyState = useMemo(() => {
    if (!shouldRenderAssembly || !visibleAssemblyStateForViewerDisplay) {
      return null;
    }

    return buildWorkspaceAssemblyViewerState({
      assemblyState: visibleAssemblyStateForViewerDisplay,
      bridgePreview: assemblyBridgePreview,
    });
  }, [assemblyBridgePreview, shouldRenderAssembly, visibleAssemblyStateForViewerDisplay]);
  const viewerMergedRobotData = useMemo(() => {
    if (!shouldRenderAssembly || !visibleAssemblyStateForViewerDisplay) {
      return null;
    }

    return getWorkspaceAssemblyViewerRobotData({
      assemblyState: visibleAssemblyStateForViewerDisplay,
      fallbackMergedRobotData: mergedRobotData,
      bridgePreview: assemblyBridgePreview,
    });
  }, [
    assemblyBridgePreview,
    mergedRobotData,
    shouldRenderAssembly,
    visibleAssemblyStateForViewerDisplay,
  ]);
  const workspaceAssemblyRenderFailureReason = useMemo(
    () =>
      getWorkspaceAssemblyRenderFailureReason({
        shouldRenderAssembly,
        hasDisplayAssemblyState: Boolean(visibleAssemblyStateForViewerDisplay),
        mergedRobotData,
        viewerMergedRobotData,
      }),
    [
      mergedRobotData,
      shouldRenderAssembly,
      viewerMergedRobotData,
      visibleAssemblyStateForViewerDisplay,
    ],
  );
  const deferredShouldRenderAssembly = useDeferredValue(shouldRenderAssembly);
  const deferredViewerAssemblyState = useDeferredValue(viewerAssemblyState);
  const deferredViewerMergedRobotData = useDeferredValue(viewerMergedRobotData);
  const deferredWorkspaceAssemblyRenderFailureReason = useDeferredValue(
    workspaceAssemblyRenderFailureReason,
  );
  const workspaceViewerAssemblyStateForDisplay = isPreviewingAssemblyBridge
    ? viewerAssemblyState
    : deferredViewerAssemblyState;
  const workspaceViewerMergedRobotDataForDisplay = isPreviewingAssemblyBridge
    ? viewerMergedRobotData
    : deferredViewerMergedRobotData;
  const workspaceAssemblyRenderFailureReasonForDisplay = isPreviewingAssemblyBridge
    ? workspaceAssemblyRenderFailureReason
    : deferredWorkspaceAssemblyRenderFailureReason;
  const animateWorkspaceViewerRobot = shouldAnimateWorkspaceViewerRobot({
    shouldRenderAssembly,
    previouslyRenderedAssembly: previousShouldRenderAssemblyRef.current,
    isPreviewingAssemblyBridge,
  });

  const emptyRobot = useMemo<RobotState>(
    () => ({
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
    }),
    [],
  );
  const workspaceViewerRobotData = useMemo(() => {
    if (!deferredShouldRenderAssembly) {
      return null;
    }

    if (
      workspaceAssemblyRenderFailureReasonForDisplay ||
      !workspaceViewerMergedRobotDataForDisplay
    ) {
      return null;
    }

    return (
      buildWorkspaceAssemblyViewerDisplayRobotData({
        assemblyState: workspaceViewerAssemblyStateForDisplay,
        mergedRobotData: workspaceViewerMergedRobotDataForDisplay,
      }) ?? buildWorkspaceViewerRobotData(workspaceViewerMergedRobotDataForDisplay)
    );
  }, [
    deferredShouldRenderAssembly,
    workspaceAssemblyRenderFailureReasonForDisplay,
    workspaceViewerAssemblyStateForDisplay,
    workspaceViewerMergedRobotDataForDisplay,
  ]);
  const animatedWorkspaceViewerRobotData = useAnimatedWorkspaceViewerRobotData(
    workspaceViewerRobotData,
    animateWorkspaceViewerRobot,
  );

  const sourceViewerRobot = useMemo<RobotState>(() => {
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
    robotJoints,
    robotLinks,
    robotMaterials,
    robotName,
    rootLinkId,
    selection,
  ]);
  const robot = useMemo<RobotState>(() => {
    if (shouldRenderAssembly) {
      if (mergedRobotData) {
        return { ...mergedRobotData, selection };
      }

      return emptyRobot;
    }

    return sourceViewerRobot;
  }, [emptyRobot, mergedRobotData, selection, shouldRenderAssembly, sourceViewerRobot]);
  const hasWorkspaceDisplayRobot = Boolean(
    animatedWorkspaceViewerRobotData ?? workspaceViewerRobotData,
  );
  // Preserve the last painted scene until the workspace viewer has a real
  // display robot, so switching into Professional mode does not flash empty.
  const viewerFallbackRobot = useMemo(
    () =>
      resolveWorkspaceViewerFallbackRobot({
        shouldRenderAssembly,
        hasWorkspaceDisplayRobot,
        liveRobot: sourceViewerRobot,
        lastStableViewerRobot: lastStableViewerRobotRef.current,
        selection,
      }),
    [hasWorkspaceDisplayRobot, selection, shouldRenderAssembly, sourceViewerRobot],
  );
  const viewerRobot = useMemo<RobotState>(
    () =>
      resolveWorkspaceViewerRobot({
        shouldRenderAssembly,
        liveRobot: viewerFallbackRobot,
        workspaceViewerRobotData,
        animatedWorkspaceViewerRobotData,
        selection,
      }),
    [
      animatedWorkspaceViewerRobotData,
      viewerFallbackRobot,
      selection,
      shouldRenderAssembly,
      workspaceViewerRobotData,
    ],
  );

  useEffect(() => {
    previousShouldRenderAssemblyRef.current = shouldRenderAssembly;
  }, [shouldRenderAssembly]);

  useEffect(() => {
    if (
      !shouldPersistStableWorkspaceViewerRobot({
        shouldRenderAssembly,
        hasWorkspaceDisplayRobot,
      })
    ) {
      return;
    }

    lastStableViewerRobotRef.current = viewerRobot;
  }, [hasWorkspaceDisplayRobot, shouldRenderAssembly, viewerRobot]);

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

  const workspaceViewerMjcfSourceFile = useMemo(
    () =>
      getSingleComponentWorkspaceMjcfViewerSource({
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
    })
      .then((result) => {
        if (requestId !== selectedFilePreviewRequestRef.current) {
          return;
        }

        const previewRobotState = createPreviewRobotStateFromImportResult(selectedFile, result);
        setSelectedFilePreviewSourceSnapshot(
          previewRobotState ? createRobotSourceSnapshot(previewRobotState) : null,
        );
      })
      .catch((error) => {
        if (requestId !== selectedFilePreviewRequestRef.current) {
          return;
        }

        setSelectedFilePreviewSourceSnapshot(null);
        scheduleFailFastInDev(
          'useWorkspaceSourceSync:selectedFilePreviewSourceSnapshot',
          new Error(`Failed to build preview snapshot for "${selectedFile.name}".`, {
            cause: error,
          }),
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
    })
      .then((snapshot) => {
        if (requestId !== selectedXacroBaselineRequestRef.current) {
          return;
        }

        setSelectedXacroBaselineSourceSnapshot(snapshot);
      })
      .catch((error) => {
        if (requestId !== selectedXacroBaselineRequestRef.current) {
          return;
        }

        setSelectedXacroBaselineSourceSnapshot(null);
        scheduleFailFastInDev(
          'useWorkspaceSourceSync:selectedXacroBaselineSourceSnapshot',
          new Error(`Failed to build Xacro baseline snapshot for "${selectedFile.name}".`, {
            cause: error,
          }),
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
      shouldRenderAssembly ||
      !selectedFile ||
      (!isSelectedUrdfSource && !isSelectedXacroSource && !isSelectedSdfSource)
    ) {
      sourceBaselineRef.current = { fileName: null, snapshot: null };
      return;
    }
  }, [
    isSelectedSdfSource,
    isSelectedUrdfSource,
    isSelectedXacroSource,
    selectedFile,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedUrdfSource) {
      return;
    }

    if (selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name &&
      sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
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
      sourceBaselineRef.current.fileName === selectedFile.name &&
      sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
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
      sourceBaselineRef.current.fileName === selectedFile.name &&
      sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
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
      shouldRenderAssembly ||
      !selectedFile ||
      (!isSelectedUrdfSource && !isSelectedXacroSource && !isSelectedSdfSource)
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

    return readCachedGeneratedSource(`urdf:${currentRobotSourceSnapshot}`, () =>
      generateURDF(currentRobotSourceState, { includeHardware: 'auto' }),
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

    return readCachedGeneratedSource(`viewer-urdf:${currentRobotSourceSnapshot}`, () =>
      generateURDF(currentRobotSourceState, { preserveMeshPaths: true }),
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
        : (originalUrdfContent ?? viewerGeneratedUrdfContent);
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
    const shouldGenerateMjcfSource =
      !shouldRenderAssembly &&
      !isSelectedUsdHydrating &&
      (selectedFile?.format === 'mjcf' ||
        (isCodeViewerOpen && sourceCodeDocumentFlavor === 'equivalent-mjcf'));

    if (!shouldGenerateMjcfSource) {
      return null;
    }

    return readCachedGeneratedSource(`mjcf:${currentRobotSourceSnapshot}`, () =>
      generateMujocoXML(currentRobotSourceState, {
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

    return readCachedGeneratedSource(`sdf:${currentRobotSourceSnapshot}`, () =>
      generateSDF(currentRobotSourceState),
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
    () =>
      selectedFile?.format === 'mjcf'
        ? `${selectedFile.name}\u0000${resolvedMjcfSource?.content ?? selectedFile.content}`
        : null,
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
      !generatedMjcfContent ||
      selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot ||
      mjcfViewerBaselineContentRef.current !== null
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

  const workspaceViewerNeedsGeneratedUrdfContent = useMemo(() => {
    if (!shouldRenderAssembly || !workspaceViewerRobotData) {
      return false;
    }

    return shouldUseGeneratedWorkspaceViewerReloadContent({
      robotLinks: workspaceViewerRobotData.links,
      hasActiveTransformTarget: hasActiveWorkspaceTransformTarget,
    });
  }, [hasActiveWorkspaceTransformTarget, shouldRenderAssembly, workspaceViewerRobotData]);
  const workspaceViewerGeneratedUrdfContent = useMemo(() => {
    if (!workspaceViewerNeedsGeneratedUrdfContent || !workspaceViewerRobotData) {
      return null;
    }

    const normalizedWorkspaceViewerRobotData =
      normalizeWorkspaceAssemblyViewerDisplayRobotDataForSource(workspaceViewerRobotData);

    return readCachedGeneratedSource(`workspace-viewer-urdf:${assemblyRevision}`, () =>
      generateURDF(
        {
          ...normalizedWorkspaceViewerRobotData,
          selection: { type: null, id: null },
        },
        { preserveMeshPaths: true },
      ),
    );
  }, [
    assemblyRevision,
    readCachedGeneratedSource,
    workspaceViewerNeedsGeneratedUrdfContent,
    workspaceViewerRobotData,
  ]);
  const workspaceViewerMjcfContent = useMemo(() => {
    if (
      !shouldRenderAssembly ||
      !workspaceViewerMjcfSourceFile ||
      !workspaceResolvedMjcfSource ||
      !assemblyState
    ) {
      return null;
    }

    const visibleComponent = Object.values(assemblyState.components).find(
      (component) =>
        component.visible !== false && component.sourceFile === workspaceViewerMjcfSourceFile.name,
    );

    if (!visibleComponent) {
      return null;
    }

    const componentSnapshot = createRobotSourceSnapshot({
      ...visibleComponent.robot,
      selection: { type: null, id: null },
    });

    return readCachedGeneratedSource(
      `workspace-viewer-mjcf:${workspaceViewerMjcfSourceFile.name}:${componentSnapshot}`,
      () =>
        prefixMJCFSourceIdentifiers(
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

  const workspaceViewerReloadContent = useMemo(() => {
    if (!shouldRenderAssembly) {
      return null;
    }

    if (workspaceViewerMjcfContent) {
      return workspaceViewerMjcfContent;
    }

    if (workspaceViewerNeedsGeneratedUrdfContent) {
      return workspaceViewerGeneratedUrdfContent;
    }

    return buildLightweightWorkspaceViewerReloadContent(assemblyRevision);
  }, [
    assemblyRevision,
    shouldRenderAssembly,
    workspaceViewerGeneratedUrdfContent,
    workspaceViewerMjcfContent,
    workspaceViewerNeedsGeneratedUrdfContent,
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

    if (
      selectedFile.format === 'usd' &&
      sourceCodeDocumentFlavor === 'equivalent-mjcf' &&
      isCodeViewerOpen
    ) {
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
  }, [hasMjcfViewerEdits, selectedFile?.format, shouldRenderAssembly, workspaceViewerMjcfContent]);

  const syncTextFileContent = useCallback(
    (fileName: string, content: string, options: { syncOriginalContent?: boolean } = {}) => {
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
          availableFiles.map((file) => (file.name === fileName ? { ...file, content } : file)),
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
    },
    [
      allFileContents,
      availableFiles,
      originalUrdfContent,
      selectedFile,
      setAllFileContents,
      setAvailableFiles,
      setOriginalUrdfContent,
      setSelectedFile,
    ],
  );

  const cancelDeferredWorkspaceSourceSync = useCallback(() => {
    deferredWorkspaceSourceSyncRequestRef.current += 1;
    if (
      deferredWorkspaceSourceSyncIdleRef.current !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(deferredWorkspaceSourceSyncIdleRef.current);
    }
    if (deferredWorkspaceSourceSyncTimeoutRef.current !== null) {
      window.clearTimeout(deferredWorkspaceSourceSyncTimeoutRef.current);
    }
    deferredWorkspaceSourceSyncIdleRef.current = null;
    deferredWorkspaceSourceSyncTimeoutRef.current = null;
  }, []);

  const urdfContentForViewer = useMemo(() => {
    if (shouldRenderAssembly) {
      return workspaceViewerReloadContent ?? '';
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
    workspaceViewerReloadContent,
    shouldRenderAssembly,
  ]);

  const viewerSourceFilePath = useMemo(() => {
    if (shouldRenderAssembly) {
      return workspaceResolvedMjcfSource?.effectiveFile.name ?? workspaceViewerMjcfSourceFile?.name;
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
      !selectedFile ||
      selectedFile.format !== 'urdf' ||
      !generatedUrdfContent ||
      !hasSourceStoreEdits
    ) {
      return;
    }

    syncTextFileContent(selectedFile.name, generatedUrdfContent);
  }, [generatedUrdfContent, hasSourceStoreEdits, selectedFile, syncTextFileContent]);

  useEffect(() => {
    if (!shouldRenderAssembly || !assemblyState) {
      cancelDeferredWorkspaceSourceSync();
      return;
    }

    cancelDeferredWorkspaceSourceSync();
    const immediateSourceFileName =
      isCodeViewerOpen && selectedFile?.format === 'urdf' ? selectedFile.name : null;
    const deferredSourceSyncTasks: DeferredWorkspaceSourceSyncTask[] = [];

    Object.values(assemblyState.components).forEach((component) => {
      const sourceFile = availableFiles.find((file) => file.name === component.sourceFile);
      if (!sourceFile) return;

      const sourceRobotState: RobotState = {
        ...component.robot,
        selection: { type: null, id: null },
      };

      if (sourceFile.format === 'urdf') {
        const componentSnapshot = createRobotSourceSnapshot(sourceRobotState);
        const sourceSyncTask: DeferredWorkspaceSourceSyncTask = {
          fileName: sourceFile.name,
          cacheKey: `component-urdf:${sourceFile.name}:${componentSnapshot}`,
          sourceRobotState,
        };

        if (sourceFile.name === immediateSourceFileName) {
          syncTextFileContent(
            sourceFile.name,
            readCachedGeneratedSource(sourceSyncTask.cacheKey, () =>
              generateURDF(sourceRobotState, { includeHardware: 'auto' }),
            ),
          );
          return;
        }

        deferredSourceSyncTasks.push(sourceSyncTask);
      }
    });

    if (deferredSourceSyncTasks.length === 0) {
      return;
    }

    const requestId = ++deferredWorkspaceSourceSyncRequestRef.current;
    const flushDeferredWorkspaceSourceSync = () => {
      deferredWorkspaceSourceSyncIdleRef.current = null;
      deferredWorkspaceSourceSyncTimeoutRef.current = null;

      if (deferredWorkspaceSourceSyncRequestRef.current !== requestId) {
        return;
      }

      const generatedComponentSources = new Map<string, string>();
      deferredSourceSyncTasks.forEach((task) => {
        generatedComponentSources.set(
          task.fileName,
          readCachedGeneratedSource(task.cacheKey, () =>
            generateURDF(task.sourceRobotState, { includeHardware: 'auto' }),
          ),
        );
      });

      if (deferredWorkspaceSourceSyncRequestRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        if (deferredWorkspaceSourceSyncRequestRef.current !== requestId) {
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
              file.name === fileName ? { ...file, content } : file,
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
      });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      deferredWorkspaceSourceSyncIdleRef.current = window.requestIdleCallback(
        flushDeferredWorkspaceSourceSync,
        { timeout: 250 },
      );
      return cancelDeferredWorkspaceSourceSync;
    }

    deferredWorkspaceSourceSyncTimeoutRef.current = window.setTimeout(
      flushDeferredWorkspaceSourceSync,
      16,
    );
    return cancelDeferredWorkspaceSourceSync;
  }, [
    allFileContents,
    assemblyState,
    availableFiles,
    cancelDeferredWorkspaceSourceSync,
    isCodeViewerOpen,
    readCachedGeneratedSource,
    shouldRenderAssembly,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    syncTextFileContent,
  ]);

  useEffect(
    () => () => {
      cancelDeferredWorkspaceSourceSync();
    },
    [cancelDeferredWorkspaceSourceSync],
  );

  useEffect(() => {
    if (!filePreviewFile) {
      filePreviewRequestRef.current += 1;
      setPreviewRobot(null);
      setFilePreview(undefined);
      return;
    }

    const requestId = ++filePreviewRequestRef.current;

    // Keep the current preview scene mounted until the replacement preview payload is ready.
    // Clearing it immediately causes a visible blank-frame handoff when switching mesh/model
    // previews, even if the shared canvas itself no longer remounts.
    void resolveRobotFileDataWithWorker(filePreviewFile, {
      availableFiles,
      assets,
      allFileContents,
      usdRobotData: getUsdPreparedExportCache(filePreviewFile.name)?.robotData ?? null,
    })
      .then((result) => {
        if (requestId !== filePreviewRequestRef.current) {
          return;
        }

        const nextPreviewRobot = createPreviewRobotStateFromImportResult(filePreviewFile, result);
        const previewUrdf = buildPreviewSceneSourceFromImportResult(filePreviewFile, {
          availableFiles,
          previewRobot: nextPreviewRobot,
          importResult: result,
        });

        const shouldActivatePreview =
          previewUrdf != null &&
          (filePreviewFile.format === 'usd' || previewUrdf.trim().length > 0);

        if (!shouldActivatePreview) {
          return;
        }

        setPreviewRobot(nextPreviewRobot);
        setFilePreview({ urdfContent: previewUrdf, fileName: filePreviewFile.name });
      })
      .catch((error) => {
        if (requestId !== filePreviewRequestRef.current) {
          return;
        }

        scheduleFailFastInDev(
          'useWorkspaceSourceSync:filePreview',
          new Error(`Failed to resolve file preview for "${filePreviewFile.name}".`, {
            cause: error,
          }),
        );
      });
  }, [allFileContents, assets, availableFiles, filePreviewFile, getUsdPreparedExportCache]);

  const sourceCodeContent =
    filePreviewFile?.content ??
    syncedSourceContent ??
    (selectedFile ? selectedFile.content : urdfContentForViewer);

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
    workspaceAssemblyRenderFailureReason,
    emptyRobot,
    robot,
    viewerRobot,
    sourceSceneAssemblyComponentId,
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
