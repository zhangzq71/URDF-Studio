import React, { forwardRef } from 'react';
import { Language, translations } from '@/shared/i18n';
import { useUIStore } from '@/store';
import {
  CheckboxOption,
  OptionsPanelContainer,
  OptionsPanelHeader,
  OptionsPanelContent,
  SegmentedControl,
  CollapsibleSection
} from './OptionsPanel';

interface HardwareOptionsPanelProps {
  lang: Language;
  showHardwareOrigin: boolean;
  setShowHardwareOrigin: (show: boolean) => void;
  showHardwareLabels: boolean;
  setShowHardwareLabels: (show: boolean) => void;
  transformMode: 'translate' | 'rotate' | 'select';
  setTransformMode: (mode: 'translate' | 'rotate' | 'select') => void;
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
    const panelSections = useUIStore((state) => state.panelSections);
    const setPanelSection = useUIStore((state) => state.setPanelSection);

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

            <CollapsibleSection
              title={t.visuals}
              isCollapsed={panelSections['hardware_visuals'] ?? false}
              onToggle={() => setPanelSection('hardware_visuals', !(panelSections['hardware_visuals'] ?? false))}
            >
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
            </CollapsibleSection>
          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);


HardwareOptionsPanel.displayName = 'HardwareOptionsPanel';
