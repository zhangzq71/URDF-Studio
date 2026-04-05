import React from 'react';

import type { Language } from '@/shared/i18n';
import { type URDFViewerController, URDFViewerPanels } from '@/features/urdf-viewer';
import { VisualizerPanels } from '@/features/visualizer';

import { FilePreviewBanner, FilePreviewError } from './FilePreviewOverlay';
import { URDFViewerJointsPanel } from './URDFViewerJointsPanel';
import type { FilePreviewState } from './types';

interface UnifiedViewerOverlaysProps {
  activePreview?: FilePreviewState;
  activeScene: 'viewer' | 'visualizer';
  lang: Language;
  onClosePreview?: () => void;
  viewerController: URDFViewerController;
  visualizerController: ReturnType<typeof import('@/features/visualizer').useVisualizerController>;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  showToolbar?: boolean;
  setShowToolbar?: (show: boolean) => void;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
  showVisualizerOptionsPanel?: boolean;
  setShowVisualizerOptionsPanel?: (show: boolean) => void;
  showJointPanel?: boolean;
  setShowJointPanel?: (show: boolean) => void;
  isViewerMode: boolean;
}

export function UnifiedViewerOverlays({
  activePreview,
  activeScene,
  lang,
  onClosePreview,
  viewerController,
  visualizerController,
  onUpdate,
  showToolbar,
  setShowToolbar,
  showOptionsPanel,
  setShowOptionsPanel,
  showVisualizerOptionsPanel,
  setShowVisualizerOptionsPanel,
  showJointPanel,
  setShowJointPanel,
  isViewerMode,
}: UnifiedViewerOverlaysProps) {
  if (activePreview) {
    return (
      <>
        <FilePreviewBanner
          fileName={activePreview.fileName}
          onClose={() => onClosePreview?.()}
          lang={lang}
        />
        {!activePreview.urdfContent && <FilePreviewError lang={lang} />}
      </>
    );
  }

  if (activeScene === 'viewer') {
    return (
      <>
        <URDFViewerPanels
          lang={lang}
          controller={viewerController}
          onUpdate={onUpdate}
          showToolbar={showToolbar}
          setShowToolbar={setShowToolbar}
          showOptionsPanel={showOptionsPanel}
          setShowOptionsPanel={setShowOptionsPanel}
          showJointPanel={false}
        />
        {showJointPanel && (
          <URDFViewerJointsPanel
            controller={viewerController}
            showJointPanel={true}
            setShowJointPanel={setShowJointPanel}
            lang={lang}
          />
        )}
      </>
    );
  }

  return (
    <>
      <VisualizerPanels
        lang={lang}
        showOptionsPanel={showVisualizerOptionsPanel}
        setShowOptionsPanel={setShowVisualizerOptionsPanel}
        controller={visualizerController}
      />
      {showJointPanel && isViewerMode && (
        <URDFViewerJointsPanel
          controller={viewerController}
          showJointPanel={true}
          setShowJointPanel={setShowJointPanel}
          lang={lang}
        />
      )}
    </>
  );
}
