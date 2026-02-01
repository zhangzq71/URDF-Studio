import React, { forwardRef } from 'react';
import { Language, translations } from '@/shared/i18n';
import {
  CheckboxOption,
  SliderOption,
  OptionsPanelContainer,
  OptionsPanelHeader,
  OptionsPanelContent,
  SegmentedControl
} from '@/shared/components/Panel/OptionsPanel';

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
  transformMode: 'translate' | 'rotate' | 'select';
  setTransformMode: (mode: 'translate' | 'rotate' | 'select') => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onResetPosition: () => void;
  onClose?: () => void;
  optionsPanelPos: { x: number; y: number } | null;
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
      transformMode,
      setTransformMode,
      isCollapsed,
      toggleCollapsed,
      onMouseDown,
      onResetPosition,
      onClose,
      optionsPanelPos,
    },
    ref
  ) => {
    const t = translations[lang];

    return (
      <div
        ref={ref}
        className="absolute z-10 pointer-events-auto"
        style={
          optionsPanelPos
            ? { left: optionsPanelPos.x, top: optionsPanelPos.y, right: 'auto' }
            : { top: '16px', right: '16px' }
        }
      >
        <OptionsPanelContainer>
          <OptionsPanelHeader
            title={t.skeletonOptions}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => {
              if (isCollapsed) {
                // expanding
              } else {
                // collapsing
              }
              onResetPosition(); // Keep existing behavior if needed, or check if this was intended for just reset button
              toggleCollapsed();
            }}
            onClose={onClose}
            onMouseDown={onMouseDown}
          />

          <OptionsPanelContent isCollapsed={isCollapsed}>
            <SegmentedControl
              options={[
                { value: 'translate', label: t.move },
                { value: 'rotate', label: t.rotate },
              ]}
              value={transformMode}
              onChange={setTransformMode}
              size="sm"
            />

            <CheckboxOption checked={showGeometry} onChange={setShowGeometry} label={t.showGeometry} />

            <CheckboxOption
              checked={showSkeletonOrigin}
              onChange={setShowSkeletonOrigin}
              label={t.showOrigin}
            />
            {showSkeletonOrigin && (
              <SliderOption
                label={t.frameSize}
                value={frameSize}
                onChange={setFrameSize}
                min={0.01}
                max={0.5}
                step={0.01}
                compact
              />
            )}

            <CheckboxOption checked={showLabels} onChange={setShowLabels} label={t.showLabels} />
            {showLabels && (
              <SliderOption
                label={t.labelScale}
                value={labelScale}
                onChange={setLabelScale}
                min={0.1}
                max={2.0}
                step={0.1}
                decimals={1}
              />
            )}

            <CheckboxOption
              checked={showJointAxes}
              onChange={setShowJointAxes}
              label={t.showJointAxes}
            />
            {showJointAxes && (
              <SliderOption
                label={t.jointAxisSize}
                value={jointAxisSize}
                onChange={setJointAxisSize}
                min={0.01}
                max={2.0}
                step={0.01}
              />
            )}
          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);

SkeletonOptionsPanel.displayName = 'SkeletonOptionsPanel';
