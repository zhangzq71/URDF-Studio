import React, { useEffect } from 'react';
import type { Group as ThreeGroup, Object3D as ThreeObject3D } from 'three';
import { AlertCircle, FileCode, X } from 'lucide-react';
import type { RobotFile, RobotState, Theme } from '@/types';
import type { Language } from '@/shared/i18n';
import { translations } from '@/shared/i18n';
import { useResolvedTheme } from '@/shared/hooks';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { STUDIO_ENVIRONMENT_INTENSITY, WORKSPACE_CANVAS_BACKGROUND } from '@/shared/components/3d';
import { useVisualizerController, VisualizerPanels, VisualizerScene } from '@/features/visualizer';
import {
  useURDFViewerController,
  URDFViewerPanels,
  URDFViewerScene,
  buildViewerRobotLinksScopeSignature,
  createStableViewerResourceScope,
  type ToolMode,
  type ViewerDocumentLoadEvent,
  type ViewerJointMotionStateValue,
  type ViewerRobotDataResolution,
  type ViewerResourceScope,
} from '@/features/urdf-viewer';
import { resolveViewerJointScopeKey } from '@/app/utils/viewerJointScopeKey';
import {
  createInitialUnifiedViewerMountState,
  resolveUnifiedViewerMountState,
} from '@/app/utils/unifiedViewerMountState';
import { useUIStore } from '@/store';
import { useSelectionStore } from '@/store/selectionStore';

interface FilePreviewState {
  urdfContent: string;
  fileName: string;
}

interface UnifiedViewerProps {
  robot: RobotState;
  mode: 'skeleton' | 'detail' | 'hardware';
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
  onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision', objectIndex?: number) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  assets: Record<string, string>;
  lang: Language;
  theme: Theme;
  showVisual?: boolean;
  setShowVisual?: (show: boolean) => void;
  snapshotAction?: React.RefObject<(() => void) | null>;
  showToolbar?: boolean;
  setShowToolbar?: (show: boolean) => void;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
  showSkeletonOptionsPanel?: boolean;
  setShowSkeletonOptionsPanel?: (show: boolean) => void;
  showJointPanel?: boolean;
  setShowJointPanel?: (show: boolean) => void;
  availableFiles: RobotFile[];
  urdfContent: string;
  sourceFilePath?: string;
  sourceFile?: RobotFile | null;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  jointAngleState?: Record<string, number>;
  jointMotionState?: Record<string, ViewerJointMotionStateValue>;
  onJointChange?: (jointName: string, angle: number) => void;
  syncJointChangesToApp?: boolean;
  selection?: { type: 'link' | 'joint' | null; id: string | null; subType?: 'visual' | 'collision'; objectIndex?: number };
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
}

const emptySelection = { type: null as null, id: null as null };

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
  controller: ReturnType<typeof useURDFViewerController>;
  active: boolean;
  activePreview?: FilePreviewState;
  viewerResourceScope: ViewerResourceScope;
  effectiveSourceFile: RobotFile | null | undefined;
  effectiveSourceFilePath?: string;
  effectiveUrdfContent: string;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  mode: 'detail' | 'hardware';
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
  effectiveSourceFile,
  effectiveSourceFilePath,
  effectiveUrdfContent,
  onRobotDataResolved,
  onDocumentLoadEvent,
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
  const hoveredSelection = useSelectionStore((state) => state.hoveredSelection);
  const groundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);

  return (
    <URDFViewerScene
      controller={controller}
      active={active}
      sourceFile={effectiveSourceFile}
      availableFiles={viewerResourceScope.availableFiles}
      urdfContent={effectiveUrdfContent}
      assets={viewerResourceScope.assets}
      onRobotDataResolved={onRobotDataResolved}
      onDocumentLoadEvent={onDocumentLoadEvent}
      sourceFilePath={effectiveSourceFilePath}
      groundPlaneOffset={groundPlaneOffset}
      mode={activePreview ? 'detail' : mode}
      selection={activePreview ? emptySelection : selection}
      hoveredSelection={activePreview ? undefined : hoveredSelection}
      hoverSelectionEnabled={active && !activePreview}
      onHover={active && !activePreview ? onHover : undefined}
      onMeshSelect={active && !activePreview ? onMeshSelect : undefined}
      robotLinks={activePreview ? undefined : robot.links}
      robotJoints={activePreview ? undefined : robot.joints}
      focusTarget={activePreview ? undefined : focusTarget}
      onCollisionTransformPreview={activePreview ? undefined : onCollisionTransformPreview}
      onCollisionTransform={activePreview ? undefined : onCollisionTransform}
      isMeshPreview={activePreview ? false : isMeshPreview}
      runtimeInstanceKey={viewerReloadKey}
      toolMode={controller.toolMode}
      t={t}
    />
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
  showSkeletonOptionsPanel = true,
  setShowSkeletonOptionsPanel,
  showJointPanel = true,
  setShowJointPanel,
  availableFiles,
  urdfContent,
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
}: UnifiedViewerProps) => {
  const t = translations[lang];
  const activePreview = mode === 'skeleton' ? undefined : filePreview;
  const isPreviewing = !!activePreview;
  const isViewerMode = isPreviewing || mode === 'detail' || mode === 'hardware';
  const viewerVisible = isViewerMode;
  const visualizerVisible = !isViewerMode;
  const [viewerSceneMode, setViewerSceneMode] = React.useState<'detail' | 'hardware'>(
    mode === 'hardware' ? 'hardware' : 'detail',
  );
  const [mountState, setMountState] = React.useState(() => createInitialUnifiedViewerMountState({
    mode,
    isPreviewing,
  }));
  const effectiveJointAngleState = isPreviewing ? undefined : jointAngleState;
  const effectiveJointMotionState = isPreviewing ? undefined : jointMotionState;
  const effectiveSyncJointChangesToApp = isPreviewing ? false : syncJointChangesToApp;
  const resolvedTheme = useResolvedTheme(theme);
  const viewerOptionsVisibleRef = React.useRef(showOptionsPanel);
  const skeletonOptionsVisibleRef = React.useRef(showSkeletonOptionsPanel);
  const viewerUnmountTimerRef = React.useRef<number | null>(null);
  const visualizerUnmountTimerRef = React.useRef<number | null>(null);
  const optionsVisibleAtPointerDownRef = React.useRef({
    viewer: showOptionsPanel,
    skeleton: showSkeletonOptionsPanel,
  });

  useEffect(() => {
    viewerOptionsVisibleRef.current = showOptionsPanel;
  }, [showOptionsPanel]);

  useEffect(() => {
    skeletonOptionsVisibleRef.current = showSkeletonOptionsPanel;
  }, [showSkeletonOptionsPanel]);

  useEffect(() => {
    setMountState((current) => resolveUnifiedViewerMountState(current, {
      mode,
      isPreviewing,
    }));
  }, [isPreviewing, mode]);

  // Keep quick mode flips warm, but unmount the inactive scene once the user
  // settles so hidden useFrame subscriptions stop consuming work in the background.
  useEffect(() => {
    if (viewerVisible) {
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
  }, [mountState.viewerMounted, viewerVisible]);

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

  useEffect(() => {
    if (mode === 'detail' || mode === 'hardware') {
      setViewerSceneMode(mode);
    }
  }, [mode]);

  useEffect(() => () => {
    if (viewerUnmountTimerRef.current !== null) {
      window.clearTimeout(viewerUnmountTimerRef.current);
      viewerUnmountTimerRef.current = null;
    }
    if (visualizerUnmountTimerRef.current !== null) {
      window.clearTimeout(visualizerUnmountTimerRef.current);
      visualizerUnmountTimerRef.current = null;
    }
  }, []);

  const visualizerController = useVisualizerController({
    robot,
    onUpdate,
    mode,
    propShowVisual: showVisual,
    propSetShowVisual: setShowVisual,
  });
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
    active: isViewerMode,
    jointStateScopeKey: resolveViewerJointScopeKey({
      previewFileName: activePreview?.fileName,
      sourceFile,
      sourceFilePath,
      robotName: robot.name,
    }),
  });

  const effectiveUrdfContent = activePreview ? activePreview.urdfContent : urdfContent;
  const effectiveSourceFilePath = activePreview ? activePreview.fileName : sourceFilePath;
  const effectiveSourceFile = activePreview ? null : sourceFile;
  const controlLayerKey = 'shared';
  const workspaceEnvironment = 'studio' as const;
  const workspaceEnvironmentIntensity = isViewerMode
    ? STUDIO_ENVIRONMENT_INTENSITY.viewer[resolvedTheme]
    : STUDIO_ENVIRONMENT_INTENSITY.workspace[resolvedTheme];
  const showWorldOriginAxesPreference = useUIStore((state) => state.viewOptions.showAxes);
  const showUsageGuidePreference = useUIStore((state) => state.viewOptions.showUsageGuide);
  const showWorldOriginAxes = showWorldOriginAxesPreference && (isViewerMode
    ? !viewerController.showOrigins
    : !(
      (mode === 'skeleton' && visualizerController.state.showSkeletonOrigin)
      || (mode === 'detail' && visualizerController.state.showDetailOrigin)
      || (mode === 'hardware' && visualizerController.state.showHardwareOrigin)
    ));
  const viewerResourceScopeRef = React.useRef<ViewerResourceScope | null>(null);
  const visualizerResourceScopeRef = React.useRef<ViewerResourceScope | null>(null);
  const viewerGroupRef = React.useRef<ThreeGroup | null>(null);
  const visualizerGroupRef = React.useRef<ThreeGroup | null>(null);
  const viewerRaycastCacheRef = React.useRef(
    new WeakMap<RaycastableObject, NonNullable<RaycastableObject['raycast']>>(),
  );
  const visualizerRaycastCacheRef = React.useRef(
    new WeakMap<RaycastableObject, NonNullable<RaycastableObject['raycast']>>(),
  );
  const viewerRobotLinksScopeSignature = React.useMemo(
    () => buildViewerRobotLinksScopeSignature(activePreview ? undefined : robot.links),
    [activePreview, robot.links],
  );
  const viewerRobotLinksForScope = React.useMemo(
    () => (activePreview ? undefined : robot.links),
    [activePreview, viewerRobotLinksScopeSignature],
  );
  const visualizerRobotLinksScopeSignature = React.useMemo(
    () => buildViewerRobotLinksScopeSignature(robot.links),
    [robot.links],
  );
  const visualizerRobotLinksForScope = React.useMemo(
    () => robot.links,
    [visualizerRobotLinksScopeSignature],
  );

  const viewerResourceScope = React.useMemo(() => {
    const next = createStableViewerResourceScope(viewerResourceScopeRef.current, {
      assets,
      availableFiles,
      sourceFile: effectiveSourceFile,
      sourceFilePath: effectiveSourceFilePath,
      robotLinks: viewerRobotLinksForScope,
    });
    viewerResourceScopeRef.current = next;
    return next;
  }, [assets, availableFiles, effectiveSourceFile, effectiveSourceFilePath, viewerRobotLinksForScope]);

  const visualizerResourceScope = React.useMemo(() => {
    const next = createStableViewerResourceScope(visualizerResourceScopeRef.current, {
      assets,
      availableFiles,
      sourceFile,
      sourceFilePath,
      robotLinks: visualizerRobotLinksForScope,
    });
    visualizerResourceScopeRef.current = next;
    return next;
  }, [assets, availableFiles, sourceFile, sourceFilePath, visualizerRobotLinksForScope]);

  const handleWorkspacePointerDownCapture = React.useCallback(() => {
    optionsVisibleAtPointerDownRef.current = {
      viewer: showOptionsPanel,
      skeleton: showSkeletonOptionsPanel,
    };
  }, [showOptionsPanel, showSkeletonOptionsPanel]);

  // Blank-canvas clicks should clear selection, not dismiss an already-open options panel.
  const restoreViewerOptionsIfNeeded = React.useCallback(() => {
    if (!optionsVisibleAtPointerDownRef.current.viewer || !setShowOptionsPanel) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!viewerOptionsVisibleRef.current) {
        setShowOptionsPanel(true);
      }
    });
  }, [setShowOptionsPanel]);

  const restoreSkeletonOptionsIfNeeded = React.useCallback(() => {
    if (!optionsVisibleAtPointerDownRef.current.skeleton || !setShowSkeletonOptionsPanel) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!skeletonOptionsVisibleRef.current) {
        setShowSkeletonOptionsPanel(true);
      }
    });
  }, [setShowSkeletonOptionsPanel]);

  const handleViewerPointerMissed = React.useCallback(() => {
    viewerController.handlePointerMissed();
    restoreViewerOptionsIfNeeded();
  }, [restoreViewerOptionsIfNeeded, viewerController]);

  const handleVisualizerPointerMissed = React.useCallback(() => {
    visualizerController.clearSelection();
    restoreSkeletonOptionsIfNeeded();
  }, [restoreSkeletonOptionsIfNeeded, visualizerController]);

  const visualizerSceneSignature = React.useMemo(
    () => [
      robot.name,
      robot.rootLinkId,
      Object.keys(robot.links).length,
      Object.keys(robot.joints).length,
      mode,
    ].join(':'),
    [mode, robot.joints, robot.links, robot.name, robot.rootLinkId],
  );

  useEffect(() => {
    const root = viewerGroupRef.current;
    syncGroupRaycastInteractivity(root, viewerVisible, viewerRaycastCacheRef.current);

    return () => {
      syncGroupRaycastInteractivity(root, true, viewerRaycastCacheRef.current);
    };
  }, [viewerVisible, mountState.viewerMounted, viewerReloadKey]);

  useEffect(() => {
    const root = visualizerGroupRef.current;
    // Hidden R3F groups can still receive pointer raycasts, so explicitly disable
    // the inactive scene to prevent background hover/selection from leaking across modes.
    syncGroupRaycastInteractivity(root, visualizerVisible, visualizerRaycastCacheRef.current);

    return () => {
      syncGroupRaycastInteractivity(root, true, visualizerRaycastCacheRef.current);
    };
  }, [mountState.visualizerMounted, visualizerSceneSignature, visualizerVisible]);

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
      containerRef={isViewerMode ? viewerController.containerRef : visualizerController.panel.containerRef}
      sceneRef={isViewerMode ? undefined : visualizerController.sceneRef}
      snapshotAction={snapshotAction}
      onPointerDownCapture={handleWorkspacePointerDownCapture}
      onPointerMissed={isViewerMode ? handleViewerPointerMissed : handleVisualizerPointerMissed}
      onMouseMove={isViewerMode ? viewerController.handleMouseMove : visualizerController.panel.handleMouseMove}
      onMouseUp={isViewerMode ? viewerController.handleMouseUp : visualizerController.panel.handleMouseUp}
      onMouseLeave={
        isViewerMode
          ? viewerController.handleMouseUp
          : (event) => {
              void event;
              visualizerController.panel.handleMouseUp();
              visualizerController.clearHover();
            }
      }
      environment={workspaceEnvironment}
      environmentIntensity={workspaceEnvironmentIntensity}
      cameraFollowPrimary={isViewerMode}
      controlLayerKey={controlLayerKey}
      showWorldOriginAxes={showWorldOriginAxes}
      orbitControlsProps={
        isViewerMode
          ? {
              minDistance: 0.1,
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
      contextLostMessage={isViewerMode ? t.webglContextRestoring : undefined}
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
        ) : isViewerMode ? (
          <URDFViewerPanels
            lang={lang}
            mode={mode as 'detail' | 'hardware'}
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
            mode={mode}
            lang={lang}
            showOptionsPanel={showSkeletonOptionsPanel}
            setShowOptionsPanel={setShowSkeletonOptionsPanel}
            controller={visualizerController}
          />
        )
      }
    >
      {mountState.viewerMounted ? (
        <group ref={viewerGroupRef} visible={viewerVisible}>
          <ViewerSceneConnector
            controller={viewerController}
            active={viewerVisible}
            activePreview={activePreview}
            viewerResourceScope={viewerResourceScope}
            effectiveSourceFile={effectiveSourceFile}
            effectiveSourceFilePath={effectiveSourceFilePath}
            effectiveUrdfContent={effectiveUrdfContent}
            onRobotDataResolved={onRobotDataResolved}
            onDocumentLoadEvent={onDocumentLoadEvent}
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
      {mountState.visualizerMounted ? (
        <group ref={visualizerGroupRef} visible={visualizerVisible}>
          <VisualizerScene
            robot={robot}
            onSelect={onSelect}
            onUpdate={onUpdate}
            mode={mode}
            assets={visualizerResourceScope.assets}
            lang={lang}
            controller={visualizerController}
            active={visualizerVisible}
          />
        </group>
      ) : null}
    </WorkspaceCanvas>
  );
});
