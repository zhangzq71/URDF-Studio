import React, { forwardRef, useCallback } from 'react';
import { Crosshair } from 'lucide-react';
import { Language, translations } from '@/shared/i18n';
import { useUIStore } from '@/store';
import {
  CheckboxOption,
  GroundPlaneControls,
  OptionsPanelContainer,
  OptionsPanelHeader,
  OptionsPanelContent,
  ToggleSliderOption
} from './OptionsPanel';

interface SkeletonOptionsPanelProps {
  lang: Language;
  showGeometry: boolean;
  setShowGeometry: (show: boolean) => void;
  showSkeletonOrigin: boolean;
  setShowSkeletonOrigin: (show: boolean) => void;
  frameSize: number;
  setFrameSize: (size: number) => void;
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
  labelScale: number;
  setLabelScale: (scale: number) => void;
  showJointAxes: boolean;
  setShowJointAxes: (show: boolean) => void;
  jointAxisSize: number;
  setJointAxisSize: (size: number) => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onResetPosition: () => void;
  onClose?: () => void;
  optionsPanelPos: { x: number; y: number } | null;
  onAutoFitGround?: () => void;
}

export const SkeletonOptionsPanel = forwardRef<HTMLDivElement, SkeletonOptionsPanelProps>(
  (
    {
      lang,
      showGeometry,
      setShowGeometry,
      showSkeletonOrigin,
      setShowSkeletonOrigin,
      frameSize,
      setFrameSize,
      showLabels,
      setShowLabels,
      labelScale,
      setLabelScale,
      showJointAxes,
      setShowJointAxes,
      jointAxisSize,
      setJointAxisSize,
      isCollapsed,
      toggleCollapsed,
      onMouseDown,
      onResetPosition,
      onClose,
      optionsPanelPos,
      onAutoFitGround,
    },
    ref
  ) => {
    const t = translations[lang];
    const isEnglish = lang === 'en';
    const englishCheckboxLabelClassName = isEnglish ? 'text-[10px]' : '';
    const englishSliderLabelClassName = isEnglish ? 'text-[9px]' : '';
    const groundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);
    const setGroundPlaneOffset = useUIStore((state) => state.setGroundPlaneOffset);

    const handleResetGround = useCallback(() => {
      setGroundPlaneOffset(0);
    }, [setGroundPlaneOffset]);

    return (
      <div
        ref={ref}
        className="absolute z-40 pointer-events-auto"
        style={
          optionsPanelPos
            ? { left: optionsPanelPos.x, top: optionsPanelPos.y, right: 'auto' }
            : { top: '16px', right: '16px' }
        }
      >
        <OptionsPanelContainer
          width="11rem"
          minWidth={168}
          isCollapsed={isCollapsed}
          resizeTitle={t.resize}
        >
          <OptionsPanelHeader
            title={t.skeletonOptions}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => {
              onResetPosition();
              toggleCollapsed();
            }}
            onClose={onClose}
            onMouseDown={onMouseDown}
          />

          <OptionsPanelContent isCollapsed={isCollapsed}>
            <div className="px-2 py-2 space-y-2">
              <CheckboxOption
                checked={showGeometry}
                onChange={setShowGeometry}
                label={t.showGeometry}
                labelClassName={englishCheckboxLabelClassName}
              />

              <ToggleSliderOption
                checked={showSkeletonOrigin}
                onChange={setShowSkeletonOrigin}
                label={t.showOrigin}
                className="mt-1"
                labelClassName={englishCheckboxLabelClassName}
                sliderConfig={{
                  label: t.frameSize,
                  value: frameSize,
                  onChange: setFrameSize,
                  min: 0.01,
                  max: 0.5,
                  step: 0.01,
                  compact: true,
                  indent: true,
                  labelClassName: englishSliderLabelClassName,
                }}
              />

              <ToggleSliderOption
                checked={showLabels}
                onChange={setShowLabels}
                label={t.showLabels}
                className="mt-1"
                labelClassName={englishCheckboxLabelClassName}
                sliderConfig={{
                  label: t.labelScale,
                  value: labelScale,
                  onChange: setLabelScale,
                  min: 0.1,
                  max: 2.0,
                  step: 0.1,
                  decimals: 1,
                  compact: true,
                  indent: true,
                  labelClassName: englishSliderLabelClassName,
                }}
              />

              <ToggleSliderOption
                checked={showJointAxes}
                onChange={setShowJointAxes}
                label={t.showJointAxes}
                className="mt-1"
                labelClassName={englishCheckboxLabelClassName}
                sliderConfig={{
                  label: t.jointAxisSize,
                  value: jointAxisSize,
                  onChange: setJointAxisSize,
                  min: 0.01,
                  max: 2.0,
                  step: 0.01,
                  compact: true,
                  indent: true,
                  labelClassName: englishSliderLabelClassName,
                }}
              />

              <GroundPlaneControls
                autoFitIcon={<Crosshair size={11} />}
                autoFitLabel={t.autoFitGround}
                offsetLabel={t.groundPlaneOffset}
                offsetValue={groundPlaneOffset}
                onAutoFit={onAutoFitGround}
                onOffsetChange={setGroundPlaneOffset}
                onReset={handleResetGround}
                resetLabel={t.reset}
                sliderIndent={true}
                sliderLabelClassName={englishSliderLabelClassName}
              />
            </div>

          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);


SkeletonOptionsPanel.displayName = 'SkeletonOptionsPanel';
