import React, { forwardRef, useCallback } from 'react';
import { Crosshair } from 'lucide-react';
import { Language, translations } from '@/shared/i18n';
import { useUIStore } from '@/store';
import {
  CheckboxOption,
  SliderOption,
  OptionsPanelContainer,
  OptionsPanelHeader,
  OptionsPanelContent,
  SegmentedControl,
  CollapsibleSection
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
  transformMode: 'translate' | 'rotate' | 'select';
  setTransformMode: (mode: 'translate' | 'rotate' | 'select') => void;
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
      transformMode,
      setTransformMode,
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
    const panelSections = useUIStore((state) => state.panelSections);
    const setPanelSection = useUIStore((state) => state.setPanelSection);
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
        <OptionsPanelContainer isCollapsed={isCollapsed} resizeTitle={t.resize}>
          <OptionsPanelHeader
            title={t.skeletonOptions}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => {
              if (isCollapsed) {
                // expanding
              } else {
                // collapsing
              }
              onResetPosition(); 
              toggleCollapsed();
            }}
            onClose={onClose}
            onMouseDown={onMouseDown}
          />

          <OptionsPanelContent isCollapsed={isCollapsed}>
            {/* Main Transform Control - Always Visible */}
            <div className="p-2 pb-0">
               <SegmentedControl
                 options={[
                   { value: 'translate', label: t.move },
                   { value: 'rotate', label: t.rotate },
                 ]}
                 value={transformMode}
                 onChange={setTransformMode}
                 size="xs"
               />
            </div>
            
            {/* Visuals Group */}
            <CollapsibleSection
              title={t.visuals}
              isCollapsed={panelSections['skeleton_visuals'] ?? false}
              onToggle={() => setPanelSection('skeleton_visuals', !(panelSections['skeleton_visuals'] ?? false))}
            >
              <CheckboxOption
                checked={showGeometry}
                onChange={setShowGeometry}
                label={t.showGeometry}
                labelClassName={englishCheckboxLabelClassName}
              />

              <div className="mt-1">
                <CheckboxOption
                  checked={showSkeletonOrigin}
                  onChange={setShowSkeletonOrigin}
                  label={t.showOrigin}
                  labelClassName={englishCheckboxLabelClassName}
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
                    indent
                    labelClassName={englishSliderLabelClassName}
                  />
                )}
              </div>

              <div className="mt-1">
                <CheckboxOption
                  checked={showLabels}
                  onChange={setShowLabels}
                  label={t.showLabels}
                  labelClassName={englishCheckboxLabelClassName}
                />
                {showLabels && (
                  <SliderOption
                    label={t.labelScale}
                    value={labelScale}
                    onChange={setLabelScale}
                    min={0.1}
                    max={2.0}
                    step={0.1}
                    decimals={1}
                    compact
                    indent
                    labelClassName={englishSliderLabelClassName}
                  />
                )}
              </div>

              <div className="mt-1">
                <CheckboxOption
                  checked={showJointAxes}
                  onChange={setShowJointAxes}
                  label={t.showJointAxes}
                  labelClassName={englishCheckboxLabelClassName}
                />
                {showJointAxes && (
                  <SliderOption
                    label={t.jointAxisSize}
                    value={jointAxisSize}
                    onChange={setJointAxisSize}
                    min={0.01}
                    max={2.0}
                    step={0.01}
                    compact
                    indent
                    labelClassName={englishSliderLabelClassName}
                  />
                )}
              </div>
            </CollapsibleSection>

            {/* Ground Plane */}
            <CollapsibleSection
              title={t.groundPlane}
              isCollapsed={panelSections['skeleton_ground'] ?? true}
              onToggle={() => setPanelSection('skeleton_ground', !(panelSections['skeleton_ground'] ?? false))}
            >
              <SliderOption
                label={t.groundPlaneOffset}
                value={groundPlaneOffset}
                onChange={setGroundPlaneOffset}
                min={-2}
                max={2}
                step={0.01}
                compact
                indent
                labelClassName={englishSliderLabelClassName}
              />
              <div className="flex gap-1.5 px-3 pb-2">
                {onAutoFitGround && (
                  <button
                    onClick={onAutoFitGround}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium bg-system-blue/10 dark:bg-system-blue/20 text-system-blue rounded-md hover:bg-system-blue/15 dark:hover:bg-system-blue/25 transition-colors"
                  >
                    <Crosshair size={11} />
                    {t.autoFitGround}
                  </button>
                )}
                <button
                  onClick={handleResetGround}
                  className="flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium bg-element-bg text-text-secondary dark:text-text-secondary rounded-md hover:bg-element-hover transition-colors"
                >
                  {t.reset}
                </button>
              </div>
            </CollapsibleSection>

          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);


SkeletonOptionsPanel.displayName = 'SkeletonOptionsPanel';
