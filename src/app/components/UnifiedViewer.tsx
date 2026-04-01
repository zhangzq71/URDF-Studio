import React, { useEffect } from 'react';
import type { Group as ThreeGroup, Object3D as ThreeObject3D } from 'three';
import { AlertCircle, FileCode, X } from 'lucide-react';
import type { AppMode, InteractionSelection, RobotFile, RobotState, Theme } from '@/types';
import type { Language } from '@/shared/i18n';
import { translations } from '@/shared/i18n';
import { useResolvedTheme } from '@/shared/hooks';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import {
  STUDIO_ENVIRONMENT_INTENSITY,
  WORKSPACE_CANVAS_BACKGROUND,
  type SnapshotCaptureAction,
} from '@/shared/components/3d';
import { useVisualizerController, VisualizerPanels, VisualizerScene } from '@/features/visualizer';
import {
  useURDFViewerController,
  URDFViewerPanels,
  URDFViewerScene,
  type URDFViewerController,
  type ViewerHelperKind,
  buildViewerRobotLinksScopeSignature,
  resolveDefaultViewerToolMode,
  type ToolMode,
  type ViewerDocumentLoadEvent,
  type ViewerJointMotionStateValue,
  type ViewerRobotDataResolution,
  type ViewerRobotSourceFormat,
  type ViewerResourceScope,
} from '@/features/urdf-viewer';
import { resolveViewerJointScopeKey } from '@/app/utils/viewerJointScopeKey';
import {
  createInitialUnifiedViewerMountState,
  resolveUnifiedViewerSessionState,
  resolveUnifiedViewerMountState,
} from '@/app/utils/unifiedViewerMountState';
import { resolveUnifiedViewerHandoffReadyState } from '@/app/utils/unifiedViewerHandoffReadyState';
import { resolveUnifiedViewerForcedSessionState } from '@/app/utils/unifiedViewerForcedSessionState';
import { resolveUnifiedViewerLoadReleaseState } from '@/app/utils/unifiedViewerLoadReleaseState';
import {
  captureUnifiedViewerOptionsVisibility,
  shouldRestoreUnifiedViewerOptionsPanel,
} from '@/app/utils/unifiedViewerOptionsRestore';
import { buildUnifiedViewerSceneProps } from '@/app/utils/unifiedViewerSceneProps';
import { buildUnifiedViewerResourceScopes } from '@/app/utils/unifiedViewerResourceScopes';
import { resolveUnifiedViewerViewportState } from '@/app/utils/unifiedViewerViewportState';
import { useUIStore } from '@/store';
import { useSelectionStore } from '@/store/selectionStore';
import type { DocumentLoadState } from '@/store/assetsStore';
import { setRegressionViewerResourceScope } from '@/shared/debug/regressionBridge';

interface FilePreviewState {
  urdfContent: string;
  fileName: string;
}

interface UnifiedViewerProps {
  robot: RobotState;
  mode: AppMode;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision', helperKind?: ViewerHelperKind) => void;
  onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
  onHover?: (
    type: 'link' | 'joint' | null,
    id: string | null,
    subType?: 'visual' | 'collision',
    objectIndex?: number,
    helperKind?: ViewerHelperKind,
  ) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  assets: Record<string, string>;
  lang: Language;
  theme: Theme;
  showVisual?: boolean;
  setShowVisual?: (show: boolean) => void;
  snapshotAction?: React.RefObject<SnapshotCaptureAction | null>;
  showToolbar?: boolean;
  setShowToolbar?: (show: boolean) => void;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
  showVisualizerOptionsPanel?: boolean;
  setShowVisualizerOptionsPanel?: (show: boolean) => void;
  showJointPanel?: boolean;
  setShowJointPanel?: (show: boolean) => void;
  availableFiles: RobotFile[];
  urdfContent: string;
  viewerSourceFormat?: ViewerRobotSourceFormat;
  sourceFilePath?: string;
  sourceFile?: RobotFile | null;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  jointAngleState?: Record<string, number>;
  jointMotionState?: Record<string, ViewerJointMotionStateValue>;
  onJointChange?: (jointName: string, angle: number) => void;
  syncJointChangesToApp?: boolean;
  selection?: InteractionSelection;
  focusTarget?: string | null;
  isMeshPreview?: boolean;
  onTransformPendingChange?: (pending: boolean) => void;
  onCollisionTransformPreview?: (linkId: string, position: { x: number; y: number; z: number }, rotation: { r: number; p: number; y: number }, objectIndex?: number) => void;
  onCollisionTransform?: (linkId: string, position: { x: number; y: number; z: number }, rotation: { r: number; p: number; y: number }, objectIndex?: number) => void;
  filePreview?: FilePreviewState;
  onClosePreview?: () => void;
  pendingViewerToolMode?: ToolMode | null;
  onConsumePendingViewerToolMode?: () => void;
  viewerReloadKey?: number;
  documentLoadState: DocumentLoadState;
}

type RaycastableObject = ThreeObject3D & {
  raycast?: ThreeObject3D['raycast'];
};

const NOOP_RAYCAST: ThreeObject3D['raycast'] = () => {};
const INACTIVE_SCENE_UNMOUNT_DELAY_MS = 15_000;

function syncGroupRaycastInteractivity(
  root: ThreeGroup | null,
  interactive: boolean,
  originalRaycasts: WeakMap<RaycastableObject, NonNullable<RaycastableObject['raycast']>>,
) {
  if (!root) {
    return;
  }

  root.traverse((child) => {
    const raycastable = child as RaycastableObject;
    if (typeof raycastable.raycast !== 'function') {
      return;
    }

    if (interactive) {
      const originalRaycast = originalRaycasts.get(raycastable);
      if (originalRaycast && raycastable.raycast === NOOP_RAYCAST) {
        raycastable.raycast = originalRaycast;
      }
      return;
    }

    if (raycastable.raycast === NOOP_RAYCAST) {
      return;
    }

    originalRaycasts.set(raycastable, raycastable.raycast);
    raycastable.raycast = NOOP_RAYCAST;
  });
}

function FilePreviewBanner({
  fileName,
  onClose,
  lang,
}: {
  fileName: string;
  onClose: () => void;
  lang: Language;
}) {
  const t = translations[lang];
  const displayName = fileName.split('/').pop() ?? fileName;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border-black bg-panel-bg px-3 py-2 shadow-lg">
      <FileCode className="w-4 h-4 shrink-0 text-system-blue" />
      <span className="max-w-[320px] truncate text-sm font-medium text-text-primary" title={fileName}>
        {t.filePreview}: {displayName}
      </span>
      <button
        onClick={onClose}
        className="ml-1 rounded p-0.5 text-text-tertiary transition-colors hover:bg-element-hover hover:text-text-secondary"
        title={t.closePreview}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function FilePreviewError({ lang }: { lang: Language }) {
  const t = translations[lang];
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 pointer-events-none">
      <AlertCircle className="w-5 h-5" />
      <span className="text-sm">{t.noPreviewImage}</span>
    </div>
  );
}

interface ViewerSceneConnectorProps {
  controller: URDFViewerController;
  active: boolean;
  activePreview?: FilePreviewState;
  viewerResourceScope: ViewerResourceScope;
  retainedRobot?: ThreeObject3D | null;
  effectiveSourceFile: RobotFile | null | undefined;
  effectiveSourceFilePath?: string;
  effectiveUrdfContent: string;
  effectiveSourceFormat?: ViewerRobotSourceFormat;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  onSceneReadyForDisplay?: () => void;
  onRuntimeRobotLoaded?: (robot: ThreeObject3D) => void;
  mode: 'detail';
  selection?: UnifiedViewerProps['selection'];
  onHover?: UnifiedViewerProps['onHover'];
  onMeshSelect?: UnifiedViewerProps['onMeshSelect'];
  robot: RobotState;
  focusTarget?: string | null;
  onCollisionTransformPreview?: UnifiedViewerProps['onCollisionTransformPreview'];
  onCollisionTransform?: UnifiedViewerProps['onCollisionTransform'];
  isMeshPreview?: boolean;
  viewerReloadKey?: number;
  t: typeof translations.en;
}

const ViewerSceneConnector = React.memo(function ViewerSceneConnector({
  controller,
  active,
  activePreview,
  viewerResourceScope,
  retainedRobot,
  effectiveSourceFile,
  effectiveSourceFilePath,
  effectiveUrdfContent,
  effectiveSourceFormat,
  onRobotDataResolved,
  onDocumentLoadEvent,
  onSceneReadyForDisplay,
  onRuntimeRobotLoaded,
  mode,
  selection,
  onHover,
  onMeshSelect,
  robot,
  focusTarget,
  onCollisionTransformPreview,
  onCollisionTransform,
  isMeshPreview = false,
  viewerReloadKey = 0,
  t,
}: ViewerSceneConnectorProps) {
  const shouldSubscribeToHoveredSelection = effectiveSourceFile?.format === 'usd' && !isMeshPreview;
  const hoveredSelection = useSelectionStore(
    React.useCallback(
      (state) => (shouldSubscribeToHoveredSelection ? state.hoveredSelection : undefined),
      [shouldSubscribeToHoveredSelection],
    ),
  );
  const sceneProps = buildUnifiedViewerSceneProps({
    controller,
    active,
    hasActivePreview: Boolean(activePreview),
    hoveredSelection,
    viewerResourceScope,
    retainedRobot,
    effectiveSourceFile,
    effectiveSourceFilePath,
    effectiveUrdfContent,
    effectiveSourceFormat,
    onRobotDataResolved,
    onDocumentLoadEvent,
    onSceneReadyForDisplay,
    onRuntimeRobotLoaded,
    mode,
    selection,
    onHover,
    onMeshSelect,
    robot,
    focusTarget,
    onCollisionTransformPreview,
    onCollisionTransform,
    isMeshPreview,
    viewerReloadKey,
  });

  return (
    <URDFViewerScene {...sceneProps} t={t} />
  );
});

export const UnifiedViewer = React.memo(({
  robot,
  mode,
  onSelect,
  onMeshSelect,
  onHover,
  onUpdate,
  assets,
  lang,
  theme,
  showVisual,
  setShowVisual,
  snapshotAction,
  showToolbar = true,
  setShowToolbar,
  showOptionsPanel = true,
  setShowOptionsPanel,
  showVisualizerOptionsPanel = true,
  setShowVisualizerOptionsPanel,
  showJointPanel = true,
  setShowJointPanel,
  availableFiles,
  urdfContent,
  viewerSourceFormat,
  sourceFilePath,
  sourceFile,
  onRobotDataResolved,
  onDocumentLoadEvent,
  jointAngleState,
  jointMotionState,
  onJointChange,
  syncJointChangesToApp = false,
  selection,
  focusTarget,
  isMeshPreview = false,
  onTransformPendingChange,
  onCollisionTransformPreview,
  onCollisionTransform,
  filePreview,
  onClosePreview,
  pendingViewerToolMode = null,
  onConsumePendingViewerToolMode,
  viewerReloadKey = 0,
  documentLoadState,
}: UnifiedViewerProps) => {
  const t = translations[lang];
  const groundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);
  const setGroundPlaneOffset = useUIStore((state) => state.setGroundPlaneOffset);
  const [forcedViewerSession, setForcedViewerSession] = React.useState(false);
  const viewerToolSessionActive = pendingViewerToolMode === 'measure' || forcedViewerSession;
  const sessionState = React.useMemo(() => resolveUnifiedViewerSessionState({
    mode,
    filePreview,
    forceViewerSession: viewerToolSessionActive,
  }), [filePreview, mode, viewerToolSessionActive]);
  const { activePreview, isPreviewing, isViewerMode } = sessionState;
  const viewerSceneMode = sessionState.viewerSceneMode;
  const [mountState, setMountState] = React.useState(() => createInitialUnifiedViewerMountState({
    mode,
    isPreviewing,
    forceViewerSession: viewerToolSessionActive,
  }));
  const [viewerSceneReady, setViewerSceneReady] = React.useState(!isViewerMode);
  const effectiveJointAngleState = isPreviewing ? undefined : jointAngleState;
  const effectiveJointMotionState = isPreviewing ? undefined : jointMotionState;
  const effectiveSyncJointChangesToApp = isPreviewing ? false : syncJointChangesToApp;
  const resolvedTheme = useResolvedTheme(theme);
  const viewerOptionsVisibleRef = React.useRef(showOptionsPanel);
  const visualizerOptionsVisibleRef = React.useRef(showVisualizerOptionsPanel);
  const viewerUnmountTimerRef = React.useRef<number | null>(null);
  const visualizerUnmountTimerRef = React.useRef<number | null>(null);
  const previousIsViewerModeRef = React.useRef(isViewerMode);
  const viewerPendingLoadScopeRef = React.useRef<string | null>(null);
  const viewerReleasedLoadScopeRef = React.useRef<string | null>(null);
  const viewerResourceScopeRef = React.useRef<ViewerResourceScope | null>(null);
  const visualizerResourceScopeRef = React.useRef<ViewerResourceScope | null>(null);
  const optionsVisibleAtPointerDownRef = React.useRef(captureUnifiedViewerOptionsVisibility({
    showViewerOptions: showOptionsPanel,
    showVisualizerOptions: showVisualizerOptionsPanel,
  }));

  useEffect(() => {
    viewerOptionsVisibleRef.current = showOptionsPanel;
  }, [showOptionsPanel]);

  useEffect(() => {
    visualizerOptionsVisibleRef.current = showVisualizerOptionsPanel;
  }, [showVisualizerOptionsPanel]);

  useEffect(() => {
    setMountState((current) => resolveUnifiedViewerMountState(current, {
      mode,
      isPreviewing,
      forceViewerSession: viewerToolSessionActive,
    }));
  }, [isPreviewing, mode, viewerToolSessionActive]);

  const visualizerRobot = robot;
  const viewerRobotLinksScopeSignature = React.useMemo(
    () => buildViewerRobotLinksScopeSignature(activePreview ? undefined : robot.links),
    [activePreview, robot.links],
  );
  const viewerRobotLinksForScope = React.useMemo(
    () => (activePreview ? undefined : robot.links),
    [activePreview, viewerRobotLinksScopeSignature],
  );
  const visualizerRobotLinksScopeSignature = React.useMemo(
    () => buildViewerRobotLinksScopeSignature(visualizerRobot.links),
    [visualizerRobot.links],
  );
  const visualizerRobotLinksForScope = React.useMemo(
    () => visualizerRobot.links,
    [visualizerRobotLinksScopeSignature],
  );
  const {
    effectiveUrdfContent,
    effectiveSourceFilePath,
    effectiveSourceFile,
    activeViewportFileName,
    viewerResourceScope,
    visualizerResourceScope,
  } = React.useMemo(() => {
    const next = buildUnifiedViewerResourceScopes({
      activePreview,
      urdfContent,
      sourceFilePath,
      sourceFile,
      assets,
      availableFiles,
      viewerRobotLinks: viewerRobotLinksForScope,
      visualizerRobotLinks: visualizerRobotLinksForScope,
      previousViewerResourceScope: viewerResourceScopeRef.current,
      previousVisualizerResourceScope: visualizerResourceScopeRef.current,
    });
    viewerResourceScopeRef.current = next.viewerResourceScope;
    visualizerResourceScopeRef.current = next.visualizerResourceScope;
    return next;
  }, [
    activePreview,
    assets,
    availableFiles,
    sourceFile,
    sourceFilePath,
    urdfContent,
    viewerRobotLinksForScope,
    visualizerRobotLinksForScope,
  ]);

  React.useEffect(() => {
    setRegressionViewerResourceScope({
      sourceFileName: effectiveSourceFile?.name ?? null,
      sourceFilePath: effectiveSourceFilePath ?? null,
      assetKeys: Object.keys(viewerResourceScope.assets).sort((left, right) => left.localeCompare(right)),
      availableFileNames: viewerResourceScope.availableFiles
        .map((file) => file.name)
        .sort((left, right) => left.localeCompare(right)),
      signature: viewerResourceScope.signature,
    });

    return () => {
      setRegressionViewerResourceScope(null);
    };
  }, [
    effectiveSourceFile?.name,
    effectiveSourceFilePath,
    viewerResourceScope,
  ]);

  const pendingViewerLoadScopeKey = viewerPendingLoadScopeRef.current;
  const releasedViewerLoadScopeKey = viewerReleasedLoadScopeRef.current;
  const {
    viewerLoadScopeKey,
    hasPendingViewerHandoffForScope,
    visualizerAvailableForViewportHandoff,
    startViewerViewportHandoff,
    continueViewerViewportHandoff,
    keepExistingViewerViewportHandoff,
    displayVisualizerWhileViewerLoads,
    keepViewerMountedDuringHandoff,
    viewerVisible,
    visualizerVisible,
    shouldRenderViewerScene,
    shouldRenderVisualizerScene,
    activeScene,
    useViewerCanvasPresentation,
    visualizerRuntimeMode,
  } = React.useMemo(() => resolveUnifiedViewerViewportState({
    mode,
    isViewerMode,
    isPreviewing,
    mountState,
    previousIsViewerMode: previousIsViewerModeRef.current,
    viewerSceneReady,
    activeViewportFileName,
    viewerReloadKey,
    pendingViewerLoadScopeKey,
    releasedViewerLoadScopeKey,
    documentLoadState,
    shouldUseVisualizerViewportHandoff: false,
  }), [
    activeViewportFileName,
    documentLoadState,
    isPreviewing,
    isViewerMode,
    mode,
    mountState,
    pendingViewerLoadScopeKey,
    releasedViewerLoadScopeKey,
    viewerReloadKey,
    viewerSceneReady,
  ]);
  const handoffReadyState = React.useMemo(() => resolveUnifiedViewerHandoffReadyState({
    isViewerMode,
    isPreviewing,
    visualizerAvailableForViewportHandoff,
    viewerLoadScopeKey,
    pendingViewerLoadScopeKey,
    releasedViewerLoadScopeKey,
    startViewerViewportHandoff,
    continueViewerViewportHandoff,
    keepExistingViewerViewportHandoff,
    hasPendingViewerHandoffForScope,
  }), [
    continueViewerViewportHandoff,
    hasPendingViewerHandoffForScope,
    isPreviewing,
    isViewerMode,
    keepExistingViewerViewportHandoff,
    pendingViewerLoadScopeKey,
    releasedViewerLoadScopeKey,
    startViewerViewportHandoff,
    viewerLoadScopeKey,
    visualizerAvailableForViewportHandoff,
  ]);
  const viewerGroupRef = React.useRef<ThreeGroup | null>(null);
  const visualizerGroupRef = React.useRef<ThreeGroup | null>(null);
  const viewerRaycastCacheRef = React.useRef(
    new WeakMap<RaycastableObject, NonNullable<RaycastableObject['raycast']>>(),
  );
  const viewerRetainedRobotRef = React.useRef<ThreeObject3D | null>(null);
  const viewerRetainedRobotReleaseTimerRef = React.useRef<number | null>(null);
  const visualizerRaycastCacheRef = React.useRef(
    new WeakMap<RaycastableObject, NonNullable<RaycastableObject['raycast']>>(),
  );
  const clearRetainedViewerRobot = React.useCallback(() => {
    if (viewerRetainedRobotReleaseTimerRef.current !== null) {
      window.clearTimeout(viewerRetainedRobotReleaseTimerRef.current);
      viewerRetainedRobotReleaseTimerRef.current = null;
    }

    viewerRetainedRobotRef.current = null;
  }, []);

  useEffect(() => {
    previousIsViewerModeRef.current = isViewerMode;
  }, [isViewerMode]);

  useEffect(() => {
    viewerPendingLoadScopeRef.current = handoffReadyState.pendingViewerLoadScopeKey;
    setViewerSceneReady(handoffReadyState.viewerSceneReady);
  }, [
    handoffReadyState.pendingViewerLoadScopeKey,
    handoffReadyState.viewerSceneReady,
  ]);

  // Keep quick mode flips warm, but unmount the inactive scene once the user
  // settles so hidden useFrame subscriptions stop consuming work in the background.
  useEffect(() => {
    if (viewerVisible || keepViewerMountedDuringHandoff) {
      if (viewerUnmountTimerRef.current !== null) {
        window.clearTimeout(viewerUnmountTimerRef.current);
        viewerUnmountTimerRef.current = null;
      }
      return;
    }

    if (!mountState.viewerMounted) {
      return;
    }

    viewerUnmountTimerRef.current = window.setTimeout(() => {
      viewerUnmountTimerRef.current = null;
      setMountState((current) => (current.viewerMounted
        ? { ...current, viewerMounted: false }
        : current));
    }, INACTIVE_SCENE_UNMOUNT_DELAY_MS);

    return () => {
      if (viewerUnmountTimerRef.current !== null) {
        window.clearTimeout(viewerUnmountTimerRef.current);
        viewerUnmountTimerRef.current = null;
      }
    };
  }, [keepViewerMountedDuringHandoff, mountState.viewerMounted, viewerVisible]);

  useEffect(() => {
    if (visualizerVisible) {
      if (visualizerUnmountTimerRef.current !== null) {
        window.clearTimeout(visualizerUnmountTimerRef.current);
        visualizerUnmountTimerRef.current = null;
      }
      return;
    }

    if (!mountState.visualizerMounted) {
      return;
    }

    visualizerUnmountTimerRef.current = window.setTimeout(() => {
      visualizerUnmountTimerRef.current = null;
      setMountState((current) => (current.visualizerMounted
        ? { ...current, visualizerMounted: false }
        : current));
    }, INACTIVE_SCENE_UNMOUNT_DELAY_MS);

    return () => {
      if (visualizerUnmountTimerRef.current !== null) {
        window.clearTimeout(visualizerUnmountTimerRef.current);
        visualizerUnmountTimerRef.current = null;
      }
    };
  }, [mountState.visualizerMounted, visualizerVisible]);

  useEffect(() => () => {
    if (viewerUnmountTimerRef.current !== null) {
      window.clearTimeout(viewerUnmountTimerRef.current);
      viewerUnmountTimerRef.current = null;
    }
    if (visualizerUnmountTimerRef.current !== null) {
      window.clearTimeout(visualizerUnmountTimerRef.current);
      visualizerUnmountTimerRef.current = null;
    }
    clearRetainedViewerRobot();
  }, [clearRetainedViewerRobot]);

  const visualizerController = useVisualizerController({
    robot: visualizerRobot,
    onUpdate,
    mode: visualizerRuntimeMode,
    propShowVisual: showVisual,
    propSetShowVisual: setShowVisual,
  });
  const viewerDefaultToolMode = resolveDefaultViewerToolMode(effectiveSourceFile?.format);
  const viewerToolModeScopeKey = effectiveSourceFile
    ? `${effectiveSourceFile.format}:${effectiveSourceFile.name}`
    : (effectiveSourceFilePath ? `inline:${effectiveSourceFilePath}` : 'inline:unified-viewer');
  const viewerController = useURDFViewerController({
    onJointChange,
    syncJointChangesToApp: effectiveSyncJointChangesToApp,
    showJointPanel,
    jointAngleState: effectiveJointAngleState,
    jointMotionState: effectiveJointMotionState,
    onSelect,
    onMeshSelect,
    onHover,
    selection,
    showVisual,
    setShowVisual,
    onTransformPendingChange,
    groundPlaneOffset,
    setGroundPlaneOffset,
    active: isViewerMode,
    jointStateScopeKey: resolveViewerJointScopeKey({
      previewFileName: activePreview?.fileName,
      sourceFile,
      sourceFilePath,
      robotName: robot.name,
    }),
    defaultToolMode: viewerDefaultToolMode,
    toolModeScopeKey: viewerToolModeScopeKey,
  });
  const nextForcedViewerSession = resolveUnifiedViewerForcedSessionState({
    forcedViewerSession,
    pendingViewerToolMode,
    viewerToolMode: viewerController.toolMode,
  });

  useEffect(() => {
    if (forcedViewerSession === nextForcedViewerSession) {
      return;
    }

    setForcedViewerSession(nextForcedViewerSession);
  }, [forcedViewerSession, nextForcedViewerSession]);

  const handleViewerDocumentLoadEvent = React.useCallback((event: ViewerDocumentLoadEvent) => {
    // `ready` means the runtime finished loading, not that the first frame has
    // already painted. Releasing handoff on `ready` can still expose one blank
    // frame, so only terminate immediately on hard errors.
    if (event.status === 'error') {
      const releaseState = resolveUnifiedViewerLoadReleaseState({
        pendingViewerLoadScopeKey: viewerPendingLoadScopeRef.current,
        viewerLoadScopeKey,
      });
      if (!releaseState.canReleaseViewerLoadScope) {
        onDocumentLoadEvent?.(event);
        return;
      }

      viewerReleasedLoadScopeRef.current = releaseState.releasedViewerLoadScopeKey;
      viewerPendingLoadScopeRef.current = releaseState.pendingViewerLoadScopeKey;
      setViewerSceneReady(releaseState.viewerSceneReady);
    }
    onDocumentLoadEvent?.(event);
  }, [onDocumentLoadEvent, viewerLoadScopeKey]);
  const handleViewerSceneReadyForDisplay = React.useCallback(() => {
    const releaseState = resolveUnifiedViewerLoadReleaseState({
      pendingViewerLoadScopeKey: viewerPendingLoadScopeRef.current,
      viewerLoadScopeKey,
    });
    if (!releaseState.canReleaseViewerLoadScope) {
      return;
    }

    viewerReleasedLoadScopeRef.current = releaseState.releasedViewerLoadScopeKey;
    viewerPendingLoadScopeRef.current = releaseState.pendingViewerLoadScopeKey;
    setViewerSceneReady(releaseState.viewerSceneReady);
  }, [viewerLoadScopeKey]);

  const controlLayerKey = 'shared';
  const workspaceEnvironment = 'studio' as const;
  const workspaceEnvironmentIntensity = useViewerCanvasPresentation
    ? STUDIO_ENVIRONMENT_INTENSITY.viewer[resolvedTheme]
    : STUDIO_ENVIRONMENT_INTENSITY.workspace[resolvedTheme];
  const showWorldOriginAxesPreference = useUIStore((state) => state.viewOptions.showAxes);
  const showUsageGuidePreference = useUIStore((state) => state.viewOptions.showUsageGuide);
  const showWorldOriginAxes = showWorldOriginAxesPreference && (activeScene === 'viewer'
    ? !viewerController.showOrigins
    : !visualizerController.state.showOrigin);

  const handleWorkspacePointerDownCapture = React.useCallback(() => {
    optionsVisibleAtPointerDownRef.current = captureUnifiedViewerOptionsVisibility({
      showViewerOptions: showOptionsPanel,
      showVisualizerOptions: showVisualizerOptionsPanel,
    });
  }, [showOptionsPanel, showVisualizerOptionsPanel]);

  // Blank-canvas clicks should clear selection, not dismiss an already-open options panel.
  const restoreOptionsPanelIfNeeded = React.useCallback((
    wasVisibleAtPointerDown: boolean,
    panelVisibleRef: React.MutableRefObject<boolean>,
    restoreOptionsPanel: ((show: boolean) => void) | undefined,
  ) => {
    if (!shouldRestoreUnifiedViewerOptionsPanel({
      wasVisibleAtPointerDown,
      isVisibleNow: panelVisibleRef.current,
      hasRestoreHandler: Boolean(restoreOptionsPanel),
    }) || !restoreOptionsPanel) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (shouldRestoreUnifiedViewerOptionsPanel({
        wasVisibleAtPointerDown,
        isVisibleNow: panelVisibleRef.current,
        hasRestoreHandler: true,
      })) {
        restoreOptionsPanel(true);
      }
    });
  }, []);

  const handleViewerPointerMissed = React.useCallback(() => {
    viewerController.handlePointerMissed();
    restoreOptionsPanelIfNeeded(
      optionsVisibleAtPointerDownRef.current.viewer,
      viewerOptionsVisibleRef,
      setShowOptionsPanel,
    );
  }, [restoreOptionsPanelIfNeeded, setShowOptionsPanel, viewerController]);

  const handleVisualizerPointerMissed = React.useCallback(() => {
    visualizerController.clearSelection();
    restoreOptionsPanelIfNeeded(
      optionsVisibleAtPointerDownRef.current.visualizer,
      visualizerOptionsVisibleRef,
      setShowVisualizerOptionsPanel,
    );
  }, [restoreOptionsPanelIfNeeded, setShowVisualizerOptionsPanel, visualizerController]);

  const visualizerSceneSignature = React.useMemo(
    () => [
      visualizerRobot.name,
      visualizerRobot.rootLinkId,
      Object.keys(visualizerRobot.links).length,
      Object.keys(visualizerRobot.joints).length,
      visualizerRuntimeMode,
    ].join(':'),
    [
      visualizerRobot.joints,
      visualizerRobot.links,
      visualizerRobot.name,
      visualizerRobot.rootLinkId,
      visualizerRuntimeMode,
    ],
  );

  useEffect(() => {
    const root = viewerGroupRef.current;
    syncGroupRaycastInteractivity(root, viewerVisible, viewerRaycastCacheRef.current);

    return () => {
      syncGroupRaycastInteractivity(root, true, viewerRaycastCacheRef.current);
    };
  }, [viewerVisible, shouldRenderViewerScene, viewerReloadKey]);

  useEffect(() => {
    if (
      viewerVisible
      || keepViewerMountedDuringHandoff
      || mountState.viewerMounted
      || !viewerRetainedRobotRef.current
    ) {
      if (viewerRetainedRobotReleaseTimerRef.current !== null) {
        window.clearTimeout(viewerRetainedRobotReleaseTimerRef.current);
        viewerRetainedRobotReleaseTimerRef.current = null;
      }
      return;
    }

    // Preserve the last URDF scene only while the viewer is still mounted or
    // actively handoffing. After the scene has been torn down, release the
    // retained graph so Three.js resources are no longer pinned by this ref.
    viewerRetainedRobotReleaseTimerRef.current = window.setTimeout(() => {
      viewerRetainedRobotReleaseTimerRef.current = null;
      viewerRetainedRobotRef.current = null;
    }, 0);

    return () => {
      if (viewerRetainedRobotReleaseTimerRef.current !== null) {
        window.clearTimeout(viewerRetainedRobotReleaseTimerRef.current);
        viewerRetainedRobotReleaseTimerRef.current = null;
      }
    };
  }, [keepViewerMountedDuringHandoff, mountState.viewerMounted, viewerVisible]);

  useEffect(() => {
    if (effectiveSourceFile?.format === 'usd' || !effectiveSourceFile) {
      clearRetainedViewerRobot();
    }
  }, [clearRetainedViewerRobot, effectiveSourceFile]);

  useEffect(() => {
    const root = visualizerGroupRef.current;
    // Hidden R3F groups can still receive pointer raycasts, so explicitly disable
    // the inactive scene to prevent background hover/selection from leaking across modes.
    syncGroupRaycastInteractivity(root, visualizerVisible, visualizerRaycastCacheRef.current);

    return () => {
      syncGroupRaycastInteractivity(root, true, visualizerRaycastCacheRef.current);
    };
  }, [shouldRenderVisualizerScene, visualizerSceneSignature, visualizerVisible]);

  useEffect(() => {
    if (!pendingViewerToolMode || !isViewerMode) {
      return;
    }

    setShowToolbar?.(true);
    viewerController.handleToolModeChange(pendingViewerToolMode);
    onConsumePendingViewerToolMode?.();
  }, [
    isViewerMode,
    onConsumePendingViewerToolMode,
    pendingViewerToolMode,
    setShowToolbar,
    viewerController,
  ]);

  return (
    <WorkspaceCanvas
      theme={theme}
      lang={lang}
      robotName={activePreview ? activePreview.fileName : (robot.name || 'robot')}
      renderKey={`${activeScene}:${displayVisualizerWhileViewerLoads ? 'handoff' : 'stable'}:${viewerReloadKey}`}
      containerRef={activeScene === 'viewer' ? viewerController.containerRef : visualizerController.panel.containerRef}
      sceneRef={activeScene === 'viewer' ? undefined : visualizerController.sceneRef}
      snapshotAction={snapshotAction}
      onPointerDownCapture={handleWorkspacePointerDownCapture}
      onPointerMissed={activeScene === 'viewer' ? handleViewerPointerMissed : handleVisualizerPointerMissed}
      onMouseMove={activeScene === 'viewer' ? viewerController.handleMouseMove : visualizerController.panel.handleMouseMove}
      onMouseUp={activeScene === 'viewer' ? viewerController.handleMouseUp : visualizerController.panel.handleMouseUp}
      onMouseLeave={
        activeScene === 'viewer'
          ? viewerController.handleMouseUp
          : (event) => {
              void event;
              visualizerController.panel.handleMouseUp();
              visualizerController.clearHover();
            }
      }
      environment={workspaceEnvironment}
      environmentIntensity={workspaceEnvironmentIntensity}
      cameraFollowPrimary={useViewerCanvasPresentation}
      controlLayerKey={controlLayerKey}
      showWorldOriginAxes={showWorldOriginAxes}
      orbitControlsProps={
        activeScene === 'viewer'
          ? {
              minDistance: 0.05,
              maxDistance: 2000,
              enabled: !viewerController.isDragging,
              onStart: () => {
                viewerController.isOrbitDragging.current = true;
              },
              onEnd: () => {
                viewerController.isOrbitDragging.current = false;
              },
            }
          : undefined
      }
      background={WORKSPACE_CANVAS_BACKGROUND}
      contextLostMessage={activeScene === 'viewer' ? t.webglContextRestoring : undefined}
      showUsageGuide={showUsageGuidePreference}
      overlays={
        activePreview ? (
          <>
            <FilePreviewBanner
              fileName={activePreview.fileName}
              onClose={() => onClosePreview?.()}
              lang={lang}
            />
            {!activePreview.urdfContent && <FilePreviewError lang={lang} />}
          </>
        ) : activeScene === 'viewer' ? (
          <URDFViewerPanels
            lang={lang}
            controller={viewerController}
            onUpdate={onUpdate}
            showToolbar={showToolbar}
            setShowToolbar={setShowToolbar}
            showOptionsPanel={showOptionsPanel}
            setShowOptionsPanel={setShowOptionsPanel}
            showJointPanel={showJointPanel}
            setShowJointPanel={setShowJointPanel}
          />
        ) : (
          <VisualizerPanels
            mode={visualizerRuntimeMode}
            lang={lang}
            showOptionsPanel={showVisualizerOptionsPanel}
            setShowOptionsPanel={setShowVisualizerOptionsPanel}
            controller={visualizerController}
          />
        )
      }
    >
      {shouldRenderViewerScene ? (
        // Keep stable identities for the viewer/visualizer scene roots. When the
        // viewer root is inserted ahead of an already-mounted visualizer root,
        // unkeyed sibling groups can be reused by R3F and end up carrying the
        // wrong `visible` state, which presents as a blank white stage.
        <group key="viewer-scene-root" ref={viewerGroupRef} visible={viewerVisible}>
          <ViewerSceneConnector
            controller={viewerController}
            active={viewerVisible}
            activePreview={activePreview}
            viewerResourceScope={viewerResourceScope}
            retainedRobot={viewerRetainedRobotRef.current}
            effectiveSourceFile={effectiveSourceFile}
            effectiveSourceFilePath={effectiveSourceFilePath}
            effectiveUrdfContent={effectiveUrdfContent}
            effectiveSourceFormat={viewerSourceFormat}
            onRobotDataResolved={onRobotDataResolved}
            onDocumentLoadEvent={handleViewerDocumentLoadEvent}
            onSceneReadyForDisplay={handleViewerSceneReadyForDisplay}
            onRuntimeRobotLoaded={(loadedRobot) => {
              viewerRetainedRobotRef.current = loadedRobot;
            }}
            mode={viewerSceneMode}
            selection={selection}
            onHover={onHover}
            onMeshSelect={onMeshSelect}
            robot={robot}
            focusTarget={focusTarget}
            onCollisionTransformPreview={onCollisionTransformPreview}
            onCollisionTransform={onCollisionTransform}
            isMeshPreview={isMeshPreview}
            viewerReloadKey={viewerReloadKey}
            t={t}
          />
        </group>
      ) : null}
      {shouldRenderVisualizerScene ? (
        <group key="visualizer-scene-root" ref={visualizerGroupRef} visible={visualizerVisible}>
          <VisualizerScene
            robot={visualizerRobot}
            onSelect={onSelect}
            onUpdate={onUpdate}
            mode={visualizerRuntimeMode}
            assets={visualizerResourceScope.assets}
            lang={lang}
            controller={visualizerController}
            active={visualizerVisible}
            onDocumentLoadEvent={!isViewerMode ? handleViewerDocumentLoadEvent : undefined}
          />
        </group>
      ) : null}
    </WorkspaceCanvas>
  );
});
