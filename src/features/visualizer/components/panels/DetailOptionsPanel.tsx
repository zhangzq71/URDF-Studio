import React, { forwardRef } from 'react';
import { Language, translations } from '@/shared/i18n';
import {
  CheckboxOption,
  OptionsPanelContainer,
  OptionsPanelHeader,
  OptionsPanelContent,
  SegmentedControl
} from '@/shared/components/Panel/OptionsPanel';

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
            <SegmentedControl
              options={[
                { value: 'translate', label: t.move },
                { value: 'rotate', label: t.rotate },
              ]}
              value={transformMode}
              onChange={setTransformMode}
              size="sm"
            />

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
            <CheckboxOption checked={showVisual} onChange={setShowVisual} label={t.showVisual} />
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
          </OptionsPanelContent>
        </OptionsPanelContainer>
      </div>
    );
  }
);

DetailOptionsPanel.displayName = 'DetailOptionsPanel';
