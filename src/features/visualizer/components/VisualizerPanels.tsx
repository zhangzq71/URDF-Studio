import React from 'react';
import { SkeletonOptionsPanel, DetailOptionsPanel, HardwareOptionsPanel } from '@/shared/components/Panel';
import type { Language } from '@/shared/i18n';
import type { VisualizerController } from '../hooks/useVisualizerController';

interface VisualizerPanelsProps {
  mode: 'skeleton' | 'detail' | 'hardware';
  lang: Language;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
  controller: VisualizerController;
}

export const VisualizerPanels = ({
  mode,
  lang,
  showOptionsPanel = true,
  setShowOptionsPanel,
  controller,
}: VisualizerPanelsProps) => {
  const { panel, state, handleAutoFitGround } = controller;

  if (!showOptionsPanel) {
    return null;
  }

  return (
    <div className="absolute top-0 right-0 z-50">
      {mode === 'skeleton' && (
        <SkeletonOptionsPanel
          key="skeleton"
          ref={panel.optionsPanelRef}
          lang={lang}
          showGeometry={state.showGeometry}
          setShowGeometry={state.setShowGeometry}
          showLabels={state.showLabels}
          setShowLabels={state.setShowLabels}
          showJointAxes={state.showJointAxes}
          setShowJointAxes={state.setShowJointAxes}
          jointAxisSize={state.jointAxisSize}
          setJointAxisSize={state.setJointAxisSize}
          showSkeletonOrigin={state.showSkeletonOrigin}
          setShowSkeletonOrigin={state.setShowSkeletonOrigin}
          frameSize={state.frameSize}
          setFrameSize={state.setFrameSize}
          labelScale={state.labelScale}
          setLabelScale={state.setLabelScale}
          transformMode={state.transformMode}
          setTransformMode={state.setTransformMode}
          isCollapsed={panel.isOptionsCollapsed}
          toggleCollapsed={panel.toggleOptionsCollapsed}
          onMouseDown={panel.handleMouseDown}
          onResetPosition={() => panel.setOptionsPanelPos(null)}
          onClose={setShowOptionsPanel ? () => setShowOptionsPanel(false) : undefined}
          optionsPanelPos={panel.optionsPanelPos}
          onAutoFitGround={handleAutoFitGround}
        />
      )}
      {mode === 'detail' && (
        <DetailOptionsPanel
          key="detail"
          ref={panel.optionsPanelRef}
          lang={lang}
          showDetailOrigin={state.showDetailOrigin}
          setShowDetailOrigin={state.setShowDetailOrigin}
          showDetailLabels={state.showDetailLabels}
          setShowDetailLabels={state.setShowDetailLabels}
          showVisual={state.showVisual}
          setShowVisual={state.setShowVisual}
          showCollision={state.showCollision}
          setShowCollision={state.setShowCollision}
          showInertia={state.showInertia}
          setShowInertia={state.setShowInertia}
          showCenterOfMass={state.showCenterOfMass}
          setShowCenterOfMass={state.setShowCenterOfMass}
          transformMode={state.transformMode}
          setTransformMode={state.setTransformMode}
          isCollapsed={panel.isOptionsCollapsed}
          toggleCollapsed={panel.toggleOptionsCollapsed}
          onMouseDown={panel.handleMouseDown}
          onResetPosition={() => panel.setOptionsPanelPos(null)}
          optionsPanelPos={panel.optionsPanelPos}
        />
      )}
      {mode === 'hardware' && (
        <HardwareOptionsPanel
          key="hardware"
          ref={panel.optionsPanelRef}
          lang={lang}
          showHardwareOrigin={state.showHardwareOrigin}
          setShowHardwareOrigin={state.setShowHardwareOrigin}
          showHardwareLabels={state.showHardwareLabels}
          setShowHardwareLabels={state.setShowHardwareLabels}
          transformMode={state.transformMode}
          setTransformMode={state.setTransformMode}
          isCollapsed={panel.isOptionsCollapsed}
          toggleCollapsed={panel.toggleOptionsCollapsed}
          onMouseDown={panel.handleMouseDown}
          onResetPosition={() => panel.setOptionsPanelPos(null)}
          onClose={setShowOptionsPanel ? () => setShowOptionsPanel(false) : undefined}
          optionsPanelPos={panel.optionsPanelPos}
        />
      )}
    </div>
  );
};
