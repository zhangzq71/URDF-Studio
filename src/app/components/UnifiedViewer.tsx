import React, { useEffect } from 'react';
import { AlertCircle, FileCode, X } from 'lucide-react';
import type { RobotState, Theme } from '@/types';
import type { Language } from '@/shared/i18n';
import { translations } from '@/shared/i18n';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { WORKSPACE_CANVAS_BACKGROUND } from '@/shared/components/3d';
import { useVisualizerController, VisualizerPanels, VisualizerScene } from '@/features/visualizer';
import { useURDFViewerController, URDFViewerPanels, URDFViewerScene } from '@/features/urdf-viewer';
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
  urdfContent: string;
  sourceFilePath?: string;
  jointAngleState?: Record<string, number>;
  onJointChange?: (jointName: string, angle: number) => void;
  selection?: { type: 'link' | 'joint' | null; id: string | null; subType?: 'visual' | 'collision'; objectIndex?: number };
  focusTarget?: string | null;
  isMeshPreview?: boolean;
  onTransformPendingChange?: (pending: boolean) => void;
  onCollisionTransformPreview?: (linkId: string, position: { x: number; y: number; z: number }, rotation: { r: number; p: number; y: number }, objectIndex?: number) => void;
  onCollisionTransform?: (linkId: string, position: { x: number; y: number; z: number }, rotation: { r: number; p: number; y: number }, objectIndex?: number) => void;
  filePreview?: FilePreviewState;
  onClosePreview?: () => void;
}

const emptySelection = { type: null as null, id: null as null };

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
  urdfContent,
  sourceFilePath,
  jointAngleState,
  onJointChange,
  selection,
  focusTarget,
  isMeshPreview = false,
  onTransformPendingChange,
  onCollisionTransformPreview,
  onCollisionTransform,
  filePreview,
  onClosePreview,
}: UnifiedViewerProps) => {
  const t = translations[lang];
  const activePreview = mode === 'skeleton' ? undefined : filePreview;
  const isPreviewing = !!activePreview;
  const isViewerMode = isPreviewing || mode === 'detail' || mode === 'hardware';
  const hoveredSelection = useSelectionStore((state) => state.hoveredSelection);
  const viewerOptionsVisibleRef = React.useRef(showOptionsPanel);
  const skeletonOptionsVisibleRef = React.useRef(showSkeletonOptionsPanel);
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

  const visualizerController = useVisualizerController({
    robot,
    onUpdate,
    mode,
    propShowVisual: showVisual,
    propSetShowVisual: setShowVisual,
  });
  const viewerController = useURDFViewerController({
    onJointChange,
    jointAngleState,
    onSelect,
    onMeshSelect,
    onHover,
    selection,
    showVisual,
    setShowVisual,
    onTransformPendingChange,
    active: isViewerMode,
  });

  const effectiveUrdfContent = activePreview ? activePreview.urdfContent : urdfContent;
  const effectiveSourceFilePath = activePreview ? activePreview.fileName : sourceFilePath;
  const effectiveSelection = activePreview ? emptySelection : selection;
  const effectiveHoveredSelection = activePreview ? undefined : hoveredSelection;
  const hoverSelectionEnabled = !activePreview;
  const effectiveFocusTarget = activePreview ? undefined : focusTarget;
  const effectiveIsMeshPreview = activePreview ? false : isMeshPreview;
  const controlLayerKey = isViewerMode ? 'viewer' : 'visualizer';

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
              visualizerController.panel.handleMouseUp(event);
              visualizerController.clearHover();
            }
      }
      environment={isViewerMode ? 'studio' : 'hdr'}
      environmentIntensity={0.36}
      cameraFollowPrimary={isViewerMode}
      controlLayerKey={controlLayerKey}
      orbitControlsProps={
        isViewerMode
          ? {
              minDistance: 0.5,
              maxDistance: 20,
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
      {isViewerMode ? (
        <URDFViewerScene
          controller={viewerController}
          urdfContent={effectiveUrdfContent}
          assets={assets}
          sourceFilePath={effectiveSourceFilePath}
          mode={activePreview ? 'detail' : (mode as 'detail' | 'hardware')}
          selection={effectiveSelection}
          hoveredSelection={effectiveHoveredSelection}
          hoverSelectionEnabled={hoverSelectionEnabled}
          onHover={activePreview ? undefined : onHover}
          onMeshSelect={activePreview ? undefined : onMeshSelect}
          robotLinks={activePreview ? undefined : robot.links}
          robotJoints={activePreview ? undefined : robot.joints}
          focusTarget={effectiveFocusTarget}
          onCollisionTransformPreview={activePreview ? undefined : onCollisionTransformPreview}
          onCollisionTransform={activePreview ? undefined : onCollisionTransform}
          isMeshPreview={effectiveIsMeshPreview}
          t={t}
        />
      ) : (
        <VisualizerScene
          robot={robot}
          onSelect={onSelect}
          onUpdate={onUpdate}
          mode={mode}
          assets={assets}
          lang={lang}
          controller={visualizerController}
        />
      )}
    </WorkspaceCanvas>
  );
});
