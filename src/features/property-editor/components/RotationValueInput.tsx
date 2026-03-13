import React, { useEffect, useMemo, useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui';
import type { Language, TransformReferenceFrame } from '@/store';
import { useUIStore } from '@/store';
import { translations } from '@/shared/i18n';
import { AxisNumberGridInput, PROPERTY_EDITOR_SUBLABEL_CLASS } from './FormControls';
import {
  convertEulerReferenceFrame,
  eulerDegreesToRadians,
  eulerRadiansToDegrees,
  eulerRadiansToQuaternion,
  normalizeQuaternionValue,
  quaternionToEulerRadians,
  type EulerRadiansValue,
  type QuaternionValue,
} from '../utils/rotationFormat';
import { MAX_TRANSFORM_DECIMALS } from '@/core/utils/numberPrecision';

const DEGREE_STEP = 1;
const DEGREE_PRECISION = 4;
const RADIAN_STEP = 0.1;
const RADIAN_PRECISION = MAX_TRANSFORM_DECIMALS;
const QUATERNION_STEP = 0.001;
const QUATERNION_PRECISION = 6;

interface RotationValueInputProps {
  value: EulerRadiansValue;
  onChange: (nextValue: EulerRadiansValue) => void;
  lang: Language;
  label?: string;
  compact?: boolean;
  holdRepeatIntervalMs?: number;
  referenceFrameScope?: 'joint' | 'geometry';
}

export const RotationValueInput: React.FC<RotationValueInputProps> = ({
  value,
  onChange,
  lang,
  label,
  compact = false,
  holdRepeatIntervalMs,
  referenceFrameScope,
}) => {
  const t = translations[lang];
  const rotationDisplayMode = useUIStore((state) => state.rotationDisplayMode);
  const setRotationDisplayMode = useUIStore((state) => state.setRotationDisplayMode);
  const transformReferenceFrame = useUIStore((state) => state.transformReferenceFrame);
  const setTransformReferenceFrame = useUIStore((state) => state.setTransformReferenceFrame);

  const displayEulerRadians = useMemo(
    () => convertEulerReferenceFrame(value, 'urdf', transformReferenceFrame),
    [transformReferenceFrame, value.p, value.r, value.y],
  );

  const eulerDegrees = useMemo(
    () => eulerRadiansToDegrees(displayEulerRadians),
    [displayEulerRadians.p, displayEulerRadians.r, displayEulerRadians.y],
  );

  const [quaternionValue, setQuaternionValue] = useState<QuaternionValue>(
    () => eulerRadiansToQuaternion(value),
  );

  useEffect(() => {
    setQuaternionValue(eulerRadiansToQuaternion(value));
  }, [value.p, value.r, value.y]);

  const handleDegreeChange = (nextValue: Partial<EulerRadiansValue>) => {
    onChange(convertEulerReferenceFrame(
      eulerDegreesToRadians({
        r: nextValue.r ?? eulerDegrees.r,
        p: nextValue.p ?? eulerDegrees.p,
        y: nextValue.y ?? eulerDegrees.y,
      }),
      transformReferenceFrame,
      'urdf',
    ));
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

  const referenceFrameTooltip =
    transformReferenceFrame === 'local'
      ? t.transformReferenceFrameLocalHint
      : (referenceFrameScope === 'joint'
          ? t.transformReferenceFrameSkeletonHint
          : t.transformReferenceFrameDetailHint);

  const referenceFrameOptions: Array<{ value: TransformReferenceFrame; label: string }> =
    referenceFrameScope === 'joint'
      ? [
          { value: 'urdf', label: t.parentLinkFrame },
          { value: 'local', label: t.localFrame },
        ]
      : [
          { value: 'urdf', label: t.linkFrame },
          { value: 'local', label: t.localFrame },
        ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={PROPERTY_EDITOR_SUBLABEL_CLASS}>{label ?? t.rotation}</span>
        <span className="text-[10px] leading-4 text-text-tertiary">{t.rotationFormat}</span>
      </div>
      <SegmentedControl
        options={[
          { value: 'euler_deg', label: t.eulerDegrees },
          { value: 'euler_rad', label: t.eulerRadians },
          { value: 'quaternion', label: t.quaternion },
        ]}
        value={rotationDisplayMode}
        onChange={setRotationDisplayMode}
        size="xs"
        className="w-full"
      />

      {rotationDisplayMode === 'euler_deg' ? (
        <AxisNumberGridInput
          value={eulerDegrees}
          onChange={handleDegreeChange}
          labels={[
            `${t.roll} (°)`,
            `${t.pitch} (°)`,
            `${t.yaw} (°)`,
          ]}
          keys={['r', 'p', 'y'] as const}
          compact={compact}
          step={DEGREE_STEP}
          precision={DEGREE_PRECISION}
          repeatIntervalMs={holdRepeatIntervalMs}
        />
      ) : rotationDisplayMode === 'euler_rad' ? (
        <AxisNumberGridInput
          value={displayEulerRadians}
          onChange={(nextValue) => onChange(convertEulerReferenceFrame({
            r: nextValue.r ?? displayEulerRadians.r,
            p: nextValue.p ?? displayEulerRadians.p,
            y: nextValue.y ?? displayEulerRadians.y,
          }, transformReferenceFrame, 'urdf'))}
          labels={[
            `${t.roll} (rad)`,
            `${t.pitch} (rad)`,
            `${t.yaw} (rad)`,
          ]}
          keys={['r', 'p', 'y'] as const}
          compact={compact}
          step={RADIAN_STEP}
          precision={RADIAN_PRECISION}
          repeatIntervalMs={holdRepeatIntervalMs}
        />
      ) : (
        <AxisNumberGridInput
          value={quaternionValue}
          onChange={handleQuaternionChange}
          labels={['x', 'y', 'z', 'w']}
          keys={['x', 'y', 'z', 'w'] as const}
          compact={compact}
          step={QUATERNION_STEP}
          precision={QUATERNION_PRECISION}
          repeatIntervalMs={holdRepeatIntervalMs}
        />
      )}

      {referenceFrameScope && (
        <div className="pt-1" title={referenceFrameTooltip}>
          <SegmentedControl
            options={referenceFrameOptions}
            value={transformReferenceFrame}
            onChange={(value) => setTransformReferenceFrame(value as TransformReferenceFrame)}
            size="xs"
            className="w-full"
          />
        </div>
      )}
    </div>
  );
};
