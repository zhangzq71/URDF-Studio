import React from 'react';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import type { Vec3Value } from './FormControls';
import { Vec3InlineInput, PROPERTY_EDITOR_SUBLABEL_CLASS } from './FormControls';
import { RotationValueInput } from './RotationValueInput';
import {
  PROPERTY_EDITOR_POSITION_STEP,
  PROPERTY_EDITOR_TRANSFORM_STEPPER_REPEAT_INTERVAL_MS,
} from '../constants';
import { MAX_TRANSFORM_DECIMALS } from '@/core/utils/numberPrecision';
import type { EulerRadiansValue } from '../utils/rotationFormat';

interface TransformFieldsProps {
  lang: Language;
  positionValue: Vec3Value;
  rotationValue: EulerRadiansValue;
  onPositionChange: (value: Vec3Value) => void;
  onRotationChange: (value: EulerRadiansValue) => void;
  compact?: boolean;
}

export const TransformFields: React.FC<TransformFieldsProps> = ({
  lang,
  positionValue,
  rotationValue,
  onPositionChange,
  onRotationChange,
  compact = true,
}) => {
  const t = translations[lang];

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <span className={PROPERTY_EDITOR_SUBLABEL_CLASS}>{t.position}</span>
        <Vec3InlineInput
          value={positionValue}
          onChange={onPositionChange}
          labels={['X', 'Y', 'Z']}
          compact={compact}
          step={PROPERTY_EDITOR_POSITION_STEP}
          precision={MAX_TRANSFORM_DECIMALS}
          repeatIntervalMs={PROPERTY_EDITOR_TRANSFORM_STEPPER_REPEAT_INTERVAL_MS}
        />
      </div>
      <RotationValueInput
        value={rotationValue}
        onChange={onRotationChange}
        lang={lang}
        label={t.rotation}
        compact={compact}
        holdRepeatIntervalMs={PROPERTY_EDITOR_TRANSFORM_STEPPER_REPEAT_INTERVAL_MS}
      />
    </div>
  );
};
