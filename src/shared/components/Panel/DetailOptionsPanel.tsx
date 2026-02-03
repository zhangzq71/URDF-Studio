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

interface DetailOptionsPanelProps {
  lang: Language;
  showDetailOrigin: boolean;
  setShowDetailOrigin: (show: boolean) => void;
  showDetailLabels: boolean;
  setShowDetailLabels: (show: boolean) => void;
  showVisual: boolean;
  setShowVisual: (show: boolean) => void;
  showCollision: boolean;
  setShowCollision: (show: boolean) => void;
  showInertia: boolean;
  setShowInertia: (show: boolean) => void;
  showCenterOfMass: boolean;
  setShowCenterOfMass: (show: boolean) => void;
  transformMode: 'translate' | 'rotate' | 'select';
  setTransformMode: (mode: 'translate' | 'rotate' | 'select') => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onResetPosition: () => void;
  optionsPanelPos: { x: number; y: number } | null;
}

export const DetailOptionsPanel = forwardRef<HTMLDivElement, DetailOptionsPanelProps>(
  (
    {
      lang,
      showDetailOrigin,
      setShowDetailOrigin,
      showDetailLabels,
      setShowDetailLabels,
      showVisual,
      setShowVisual,
      showCollision,
      setShowCollision,
      showInertia,
      setShowInertia,
      showCenterOfMass,
      setShowCenterOfMass,
      transformMode,
      setTransformMode,
      isCollapsed,
      toggleCollapsed,
      onMouseDown,
      onResetPosition,
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
            title={t.detailOptions}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => {
              onResetPosition();
              toggleCollapsed();
            }}
            onMouseDown={onMouseDown}
          />

          <OptionsPanelContent isCollapsed={isCollapsed}>
            {/* Main Transform - Always Visible */}
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
              title={t.visuals} // Use existing or appropriate key
              isCollapsed={panelSections['detail_visuals'] ?? false}
              onToggle={() => setPanelSection('detail_visuals', !(panelSections['detail_visuals'] ?? false))}
            >
                 <CheckboxOption checked={showVisual} onChange={setShowVisual} label={t.showVisual} />
                 <CheckboxOption
                  checked={showDetailOrigin}
                  onChange={setShowDetailOrigin}
                  label={t.showOrigin}
                />
                <CheckboxOption
                  checked={showDetailLabels}
                  onChange={setShowDetailLabels}
                  label={t.showLabels}
                />
            </CollapsibleSection>

             {/* Physics Group */}
             <CollapsibleSection
              title={t.physics}
              isCollapsed={panelSections['detail_physics'] ?? true}
              onToggle={() => setPanelSection('detail_physics', !(panelSections['detail_physics'] ?? true))}
            >
              <CheckboxOption
                checked={showCollision}
                onChange={setShowCollision}
                label={t.showCollision}
              />
              <CheckboxOption checked={showInertia} onChange={setShowInertia} label={t.showInertia} />
              <CheckboxOption
                checked={showCenterOfMass}
                onChange={setShowCenterOfMass}
                label={t.showCenterOfMass}
              />
            </CollapsibleSection>

          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);


DetailOptionsPanel.displayName = 'DetailOptionsPanel';
