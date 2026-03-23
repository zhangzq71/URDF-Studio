import React, { forwardRef } from 'react';
import { Language, translations } from '@/shared/i18n';
import {
  CheckboxOption,
  OptionsPanelContainer,
  OptionsPanelHeader,
  OptionsPanelContent,
  SegmentedControl
} from './OptionsPanel';

interface HardwareOptionsPanelProps {
  lang: Language;
  showHardwareOrigin: boolean;
  setShowHardwareOrigin: (show: boolean) => void;
  showHardwareLabels: boolean;
  setShowHardwareLabels: (show: boolean) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onResetPosition: () => void;
  onClose?: () => void;
  optionsPanelPos: { x: number; y: number } | null;
}

export const HardwareOptionsPanel = forwardRef<HTMLDivElement, HardwareOptionsPanelProps>(
  (
    {
      lang,
      showHardwareOrigin,
      setShowHardwareOrigin,
      showHardwareLabels,
      setShowHardwareLabels,
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
        className="absolute z-40 pointer-events-auto"
        style={
          optionsPanelPos
            ? { left: optionsPanelPos.x, top: optionsPanelPos.y, right: 'auto' }
            : { top: '16px', right: '16px' }
        }
      >
        <OptionsPanelContainer isCollapsed={isCollapsed} resizeTitle={t.resize}>
          <OptionsPanelHeader
            title={t.hardwareOptions}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => {
              onResetPosition();
              toggleCollapsed();
            }}
            onClose={onClose}
            onMouseDown={onMouseDown}
          />

          <OptionsPanelContent isCollapsed={isCollapsed}>
            <div className="px-3 py-2.5 pb-1.5">
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

            <div className="px-3 pt-1.5 pb-2.5 space-y-2">
              <CheckboxOption
                checked={showHardwareOrigin}
                onChange={setShowHardwareOrigin}
                label={t.showOrigin}
              />
              <CheckboxOption
                checked={showHardwareLabels}
                onChange={setShowHardwareLabels}
                label={t.showLabels}
              />
            </div>
          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);


HardwareOptionsPanel.displayName = 'HardwareOptionsPanel';
