import React from 'react';
import { JointsPanel } from '@/shared/components/Panel/JointsPanel';
import { MeasurePanel } from './MeasurePanel';
import { ViewerOptionsPanel } from './ViewerOptionsPanel';
import { ViewerToolbar } from './ViewerToolbar';
import { translations, type Language } from '@/shared/i18n';
import type { URDFViewerController } from '../hooks/useURDFViewerController';
import { useResponsivePanelLayout } from '../hooks/useResponsivePanelLayout';

interface URDFViewerPanelsProps {
  lang: Language;
  mode: 'detail' | 'hardware';
  controller: URDFViewerController;
  showToolbar?: boolean;
  setShowToolbar?: (show: boolean) => void;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
  showJointPanel?: boolean;
  setShowJointPanel?: (show: boolean) => void;
}

export const URDFViewerPanels = ({
  lang,
  mode,
  controller,
  showToolbar = true,
  setShowToolbar,
  showOptionsPanel = true,
  setShowOptionsPanel,
  showJointPanel = true,
  setShowJointPanel,
}: URDFViewerPanelsProps) => {
  const t = translations[lang];
  const { optionsDefaultPosition, jointsDefaultPosition, jointsPanelMaxHeight } = useResponsivePanelLayout({
    containerRef: controller.containerRef,
    optionsPanelRef: controller.optionsPanelRef,
    jointPanelRef: controller.jointPanelRef,
    showOptionsPanel,
    showJointPanel,
    showJointControls: controller.showJointControls,
    showToolbar,
  });

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 z-20 select-none">
        <div className="rounded border border-slate-200 bg-white/50 px-2 py-1 text-xs text-slate-500 backdrop-blur dark:border-google-dark-border dark:bg-google-dark-surface/50 dark:text-slate-400">
          {mode === 'hardware' ? t.hardware : t.detail} {t.modeLabel}
        </div>
      </div>

      <ViewerOptionsPanel
        showOptionsPanel={showOptionsPanel}
        optionsPanelRef={controller.optionsPanelRef}
        optionsPanelPos={controller.optionsPanelPos}
        defaultPosition={optionsDefaultPosition}
        onMouseDown={(event) => controller.handleMouseDown('options', event)}
        mode={mode}
        t={t}
        isOptionsCollapsed={controller.isOptionsCollapsed}
        toggleOptionsCollapsed={controller.toggleOptionsCollapsed}
        setShowOptionsPanel={setShowOptionsPanel}
        lang={lang}
        highlightMode={controller.highlightMode}
        setHighlightMode={controller.setHighlightMode}
        showJointControls={controller.showJointControls}
        setShowJointControls={controller.setShowJointControls}
        showVisual={controller.showVisual}
        setShowVisual={controller.setShowVisual}
        showCollision={controller.showCollision}
        setShowCollision={controller.setShowCollision}
        modelOpacity={controller.modelOpacity}
        setModelOpacity={controller.setModelOpacity}
        showOrigins={controller.showOrigins}
        setShowOrigins={controller.setShowOrigins}
        showOriginsOverlay={controller.showOriginsOverlay}
        setShowOriginsOverlay={controller.setShowOriginsOverlay}
        originSize={controller.originSize}
        setOriginSize={controller.setOriginSize}
        showJointAxes={controller.showJointAxes}
        setShowJointAxes={controller.setShowJointAxes}
        showJointAxesOverlay={controller.showJointAxesOverlay}
        setShowJointAxesOverlay={controller.setShowJointAxesOverlay}
        jointAxisSize={controller.jointAxisSize}
        setJointAxisSize={controller.setJointAxisSize}
        showCenterOfMass={controller.showCenterOfMass}
        setShowCenterOfMass={controller.setShowCenterOfMass}
        showCoMOverlay={controller.showCoMOverlay}
        setShowCoMOverlay={controller.setShowCoMOverlay}
        centerOfMassSize={controller.centerOfMassSize}
        setCenterOfMassSize={controller.setCenterOfMassSize}
        showInertia={controller.showInertia}
        setShowInertia={controller.setShowInertia}
        showInertiaOverlay={controller.showInertiaOverlay}
        setShowInertiaOverlay={controller.setShowInertiaOverlay}
        onAutoFitGround={controller.handleAutoFitGround}
      />

      <JointsPanel
        showJointControls={controller.showJointControls}
        showJointPanel={showJointPanel}
        robot={controller.robot}
        jointPanelRef={controller.jointPanelRef}
        jointPanelPos={controller.jointPanelPos}
        defaultPosition={jointsDefaultPosition}
        maxHeight={jointsPanelMaxHeight}
        onMouseDown={(event) => controller.handleMouseDown('joints', event)}
        t={t}
        handleResetJoints={controller.handleResetJoints}
        angleUnit={controller.angleUnit}
        setAngleUnit={controller.setAngleUnit}
        isJointsCollapsed={controller.isJointsCollapsed}
        toggleJointsCollapsed={controller.toggleJointsCollapsed}
        setShowJointPanel={setShowJointPanel}
        jointAngles={controller.jointAngles}
        activeJoint={controller.activeJoint}
        setActiveJoint={controller.setActiveJoint}
        handleJointAngleChange={controller.handleJointAngleChange}
        handleJointChangeCommit={controller.handleJointChangeCommit}
        onSelect={controller.handleSelectWrapper}
        onHover={controller.handleHoverWrapper}
      />

      {showToolbar && (
        <ViewerToolbar
          activeMode={controller.toolMode}
          setMode={controller.handleToolModeChange}
          onClose={setShowToolbar ? () => setShowToolbar(false) : undefined}
          lang={lang}
        />
      )}

      <MeasurePanel
        toolMode={controller.toolMode}
        measurePanelRef={controller.measurePanelRef}
        measurePanelPos={controller.measurePanelPos}
        onMouseDown={(event) => controller.handleMouseDown('measure', event)}
        onClose={controller.handleCloseMeasureTool}
        measureState={controller.measureState}
        setMeasureState={controller.setMeasureState}
        lang={lang}
      />
    </>
  );
};
