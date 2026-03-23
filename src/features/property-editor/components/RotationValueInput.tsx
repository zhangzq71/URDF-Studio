import React, { useEffect, useMemo, useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui';
import type { Language } from '@/store';
import { useUIStore } from '@/store';
import { translations } from '@/shared/i18n';
import { AxisNumberGridInput, PROPERTY_EDITOR_SUBLABEL_CLASS } from './FormControls';
import {
  eulerDegreesToRadians,
  eulerRadiansToDegrees,
  eulerRadiansToQuaternion,
  normalizeQuaternionValue,
  quaternionToEulerRadians,
  type EulerRadiansValue,
  type QuaternionValue,
} from '../utils/rotationFormat';

const DEGREE_STEP = 1;
const DEGREE_PRECISION = 2;
const RADIAN_STEP = 0.1;
const RADIAN_PRECISION = 2;
const QUATERNION_STEP = 0.001;
const QUATERNION_PRECISION = 6;

interface RotationValueInputProps {
  value: EulerRadiansValue;
  onChange: (nextValue: EulerRadiansValue) => void;
  lang: Language;
  label?: string;
  showLabel?: boolean;
  showFrameHint?: boolean;
  compact?: boolean;
  axisLabelPlacement?: 'stacked' | 'inline';
  holdRepeatIntervalMs?: number;
}

export const RotationValueInput: React.FC<RotationValueInputProps> = ({
  value,
  onChange,
  lang,
  label,
  showLabel = true,
  showFrameHint = true,
  compact = false,
  axisLabelPlacement = 'inline',
  holdRepeatIntervalMs,
}) => {
  const t = translations[lang];
  const rotationDisplayMode = useUIStore((state) => state.rotationDisplayMode);
  const setRotationDisplayMode = useUIStore((state) => state.setRotationDisplayMode);
  const displayEulerRadians = useMemo(
    () => value,
    [value.p, value.r, value.y],
  );

  const eulerDegrees = useMemo(
    () => eulerRadiansToDegrees(displayEulerRadians),
    [displayEulerRadians.p, displayEulerRadians.r, displayEulerRadians.y],
  );

  const [quaternionValue, setQuaternionValue] = useState<QuaternionValue>(
    () => eulerRadiansToQuaternion(value),
  );
  const resolvedAxisLabelPlacement =
    rotationDisplayMode === 'quaternion' && axisLabelPlacement === 'inline'
      ? 'stacked'
      : axisLabelPlacement;

  useEffect(() => {
    setQuaternionValue(eulerRadiansToQuaternion(value));
  }, [value.p, value.r, value.y]);

  const handleDegreeChange = (nextValue: Partial<EulerRadiansValue>) => {
    onChange(eulerDegreesToRadians({
      r: nextValue.r ?? eulerDegrees.r,
      p: nextValue.p ?? eulerDegrees.p,
      y: nextValue.y ?? eulerDegrees.y,
    }));
  };

  const handleQuaternionChange = (nextValue: Partial<QuaternionValue>) => {
    const normalizedQuaternion = normalizeQuaternionValue({
      x: nextValue.x ?? quaternionValue.x,
      y: nextValue.y ?? quaternionValue.y,
      z: nextValue.z ?? quaternionValue.z,
      w: nextValue.w ?? quaternionValue.w,
    });

    setQuaternionValue(normalizedQuaternion);
    onChange(quaternionToEulerRadians(normalizedQuaternion));
  };

  return (
    <div className="space-y-1">
      {showLabel ? (
        <div className="flex items-center">
          <span className={PROPERTY_EDITOR_SUBLABEL_CLASS}>{label ?? t.rotation}</span>
        </div>
      ) : null}
      <SegmentedControl
        options={[
          { value: 'euler_deg', label: t.eulerDegrees },
          { value: 'euler_rad', label: t.eulerRadians },
          { value: 'quaternion', label: t.quaternion },
        ]}
        value={rotationDisplayMode}
        onChange={setRotationDisplayMode}
        size="xs"
        className="w-full [&>button]:min-h-6 [&>button]:flex-1 [&>button]:!gap-0.5 [&>button]:!px-1.5 [&>button]:!py-0 [&>button]:!text-[9px]"
      />
      {showFrameHint ? (
        <div className="text-[9px] leading-4 text-text-tertiary">{t.urdfFrame}</div>
      ) : null}

      {rotationDisplayMode === 'euler_deg' ? (
        <AxisNumberGridInput
          value={eulerDegrees}
          onChange={handleDegreeChange}
          labels={[t.roll, t.pitch, t.yaw]}
          keys={['r', 'p', 'y'] as const}
          compact={compact}
          labelPlacement={resolvedAxisLabelPlacement}
          step={DEGREE_STEP}
          precision={DEGREE_PRECISION}
          trimTrailingZeros={false}
          repeatIntervalMs={holdRepeatIntervalMs}
        />
      ) : rotationDisplayMode === 'euler_rad' ? (
        <AxisNumberGridInput
          value={displayEulerRadians}
          onChange={(nextValue) => onChange({
            r: nextValue.r ?? displayEulerRadians.r,
            p: nextValue.p ?? displayEulerRadians.p,
            y: nextValue.y ?? displayEulerRadians.y,
          })}
          labels={[t.roll, t.pitch, t.yaw]}
          keys={['r', 'p', 'y'] as const}
          compact={compact}
          labelPlacement={resolvedAxisLabelPlacement}
          step={RADIAN_STEP}
          precision={RADIAN_PRECISION}
          trimTrailingZeros={false}
          repeatIntervalMs={holdRepeatIntervalMs}
        />
      ) : (
        <AxisNumberGridInput
          value={quaternionValue}
          onChange={handleQuaternionChange}
          labels={['x', 'y', 'z', 'w']}
          keys={['x', 'y', 'z', 'w'] as const}
          compact={compact}
          labelPlacement={resolvedAxisLabelPlacement}
          step={QUATERNION_STEP}
          precision={QUATERNION_PRECISION}
          repeatIntervalMs={holdRepeatIntervalMs}
        />
      )}
    </div>
  );
};
