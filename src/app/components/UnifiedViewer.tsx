import React, { useEffect } from 'react';
import { AlertCircle, FileCode, X } from 'lucide-react';
import type { RobotState, Theme } from '@/types';
import type { Language } from '@/shared/i18n';
import { translations } from '@/shared/i18n';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { WORKSPACE_CANVAS_BACKGROUND } from '@/shared/components/3d';
import { useVisualizerController } from '@/features/visualizer/hooks';
import { VisualizerPanels } from '@/features/visualizer/components/VisualizerPanels';
import { VisualizerScene } from '@/features/visualizer/components/VisualizerScene';
import { useURDFViewerController } from '@/features/urdf-viewer/hooks';
import { URDFViewerPanels } from '@/features/urdf-viewer/components/URDFViewerPanels';
import { URDFViewerScene } from '@/features/urdf-viewer/components/URDFViewerScene';

interface FilePreviewState {
  urdfContent: string;
  fileName: string;
}

interface UnifiedViewerProps {
  robot: RobotState;
  mode: 'skeleton' | 'detail' | 'hardware';
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
  onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  assets: Record<string, string>;
  lang: Language;
  theme: Theme;
  showVisual?: boolean;
  setShowVisual?: (show: boolean) => void;
  snapshotAction?: React.MutableRefObject<(() => void) | null>;
  showToolbar?: boolean;
  setShowToolbar?: (show: boolean) => void;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
  showSkeletonOptionsPanel?: boolean;
  setShowSkeletonOptionsPanel?: (show: boolean) => void;
  showJointPanel?: boolean;
  setShowJointPanel?: (show: boolean) => void;
  urdfContent: string;
  jointAngleState?: Record<string, number>;
  onJointChange?: (jointName: string, angle: number) => void;
  selection?: { type: 'link' | 'joint' | null; id: string | null; subType?: 'visual' | 'collision'; objectIndex?: number };
  hoveredSelection?: { type: 'link' | 'joint' | null; id: string | null; subType?: 'visual' | 'collision'; objectIndex?: number };
  focusTarget?: string | null;
  isMeshPreview?: boolean;
  onTransformPendingChange?: (pending: boolean) => void;
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
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg bg-white/90 dark:bg-elevated-bg/90 border border-slate-200 dark:border-border-black px-3 py-2 shadow-lg backdrop-blur-sm">
      <FileCode className="w-4 h-4 shrink-0 text-blue-500" />
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[320px]" title={fileName}>
        {t.filePreview}: {displayName}
      </span>
      <button
        onClick={onClose}
        className="ml-1 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-colors"
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
  jointAngleState,
  onJointChange,
  selection,
  hoveredSelection,
  focusTarget,
  isMeshPreview = false,
  onTransformPendingChange,
  onCollisionTransform,
  filePreview,
  onClosePreview,
}: UnifiedViewerProps) => {
  const t = translations[lang];
  const activePreview = mode === 'skeleton' ? undefined : filePreview;
  const isPreviewing = !!activePreview;
  const isViewerMode = isPreviewing || mode === 'detail' || mode === 'hardware';

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
  const effectiveSelection = activePreview ? emptySelection : selection;
  const effectiveHoveredSelection = activePreview ? undefined : hoveredSelection;
  const effectiveFocusTarget = activePreview ? undefined : focusTarget;
  const effectiveIsMeshPreview = activePreview ? false : isMeshPreview;

  return (
    <WorkspaceCanvas
      theme={theme}
      lang={lang}
      robotName={activePreview ? activePreview.fileName : (robot.name || 'robot')}
      containerRef={isViewerMode ? viewerController.containerRef : visualizerController.panel.containerRef}
      sceneRef={isViewerMode ? undefined : visualizerController.sceneRef}
      snapshotAction={snapshotAction}
      onPointerMissed={isViewerMode ? viewerController.handlePointerMissed : visualizerController.clearSelection}
      onMouseMove={isViewerMode ? viewerController.handleMouseMove : visualizerController.panel.handleMouseMove}
      onMouseUp={isViewerMode ? viewerController.handleMouseUp : visualizerController.panel.handleMouseUp}
      onMouseLeave={isViewerMode ? viewerController.handleMouseUp : visualizerController.panel.handleMouseUp}
      environment={isViewerMode ? 'studio' : 'hdr'}
      environmentIntensity={0.36}
      cameraFollowPrimary={isViewerMode}
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
          mode={activePreview ? 'detail' : (mode as 'detail' | 'hardware')}
          selection={effectiveSelection}
          hoveredSelection={effectiveHoveredSelection}
          onMeshSelect={activePreview ? undefined : onMeshSelect}
          robotLinks={activePreview ? undefined : robot.links}
          focusTarget={effectiveFocusTarget}
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
          confirmTitle={t.confirmEnter}
          cancelTitle={t.cancelEsc}
        />
      )}
    </WorkspaceCanvas>
  );
});
