/**
 * JointProperties - Property editing panel for Joint elements.
 * Renders different content based on the current editor mode:
 * - Detail: Name only
 * - Skeleton: Type, Kinematics (origin, axis)
 * - Hardware: Motor config, Limits, Dynamics
 */
import React from 'react';
import {
  ExternalLink,
} from 'lucide-react';
import { JointType, type AppMode, type MotorSpec } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import {
  getDefaultJointLimit,
  getJointEffortUnitLabel,
  getJointValueUnitLabel,
  getJointVelocityUnitLabel,
} from '@/shared/utils/jointUnits';
import {
  MAX_TRANSFORM_DECIMALS,
  TRANSFORM_STEP,
} from '@/core/utils/numberPrecision';
import {
  InputGroup,
  InlineInputGroup,
  CollapsibleSection,
  NumberInput,
  Vec3Input,
  PROPERTY_EDITOR_INPUT_CLASS,
  PROPERTY_EDITOR_LINK_CLASS,
  PROPERTY_EDITOR_SELECT_CLASS,
  type Vec3Value,
} from './FormControls';
import { useMotorConfig } from '../hooks/useMotorConfig';
import { TransformFields } from './TransformFields';

const AXIS_BASED_TYPES = new Set<JointType>([
  JointType.REVOLUTE,
  JointType.CONTINUOUS,
  JointType.PRISMATIC,
  JointType.PLANAR,
]);

const LIMITED_TYPES = new Set<JointType>([
  JointType.REVOLUTE,
  JointType.PRISMATIC,
]);

const EFFORT_VELOCITY_ONLY_TYPES = new Set<JointType>([JointType.CONTINUOUS]);

const JOINT_TYPE_OPTIONS: JointType[] = [
  JointType.FIXED,
  JointType.REVOLUTE,
  JointType.CONTINUOUS,
  JointType.BALL,
  JointType.PRISMATIC,
  JointType.PLANAR,
  JointType.FLOATING,
];

const DEFAULT_AXIS = { x: 0, y: 0, z: 1 };
const DEFAULT_ORIGIN = {
  xyz: { x: 0, y: 0, z: 0 },
  rpy: { r: 0, p: 0, y: 0 },
};

const toXYZ = (value: Vec3Value, fallback = DEFAULT_AXIS) => ({
  x: value.x ?? fallback.x,
  y: value.y ?? fallback.y,
  z: value.z ?? fallback.z,
});

const toRPY = (value: Vec3Value, fallback = DEFAULT_ORIGIN.rpy) => ({
  r: value.r ?? fallback.r,
  p: value.p ?? fallback.p,
  y: value.y ?? fallback.y,
});

const getJointTypeLabel = (jointType: JointType, t: typeof translations['en']): string => {
  switch (jointType) {
    case JointType.FIXED:
      return t.jointTypeFixed;
    case JointType.REVOLUTE:
      return t.jointTypeRevolute;
    case JointType.CONTINUOUS:
      return t.jointTypeContinuous;
    case JointType.BALL:
      return 'Ball';
    case JointType.PRISMATIC:
      return t.jointTypePrismatic;
    case JointType.PLANAR:
      return t.jointTypePlanar;
    case JointType.FLOATING:
      return t.jointTypeFloating;
    default:
      return jointType;
  }
};

interface JointData {
  name?: string;
  type?: string;
  hardware?: { motorType?: string; armature?: number; motorId?: string; motorDirection?: number };
  limit?: { velocity?: number; effort?: number; lower?: number; upper?: number };
  dynamics?: { friction?: number; damping?: number };
  origin?: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } };
  axis?: { x: number; y: number; z: number };
}

interface JointPropertiesProps {
  data: JointData;
  mode: AppMode;
  selection: { id: string | null; type: string };
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  motorLibrary: Record<string, MotorSpec[]>;
  t: typeof translations['en'];
  lang: Language;
}

export const JointProperties: React.FC<JointPropertiesProps> = ({
  data, mode, selection, onUpdate, motorLibrary, t, lang
}) => {
  const jointType = (data.type as JointType | undefined) || JointType.REVOLUTE;
  const origin = data.origin ?? DEFAULT_ORIGIN;
  const supportsAxis = AXIS_BASED_TYPES.has(jointType);
  const supportsFullLimit = LIMITED_TYPES.has(jointType);
  const supportsEffortVelocityLimit = EFFORT_VELOCITY_ONLY_TYPES.has(jointType);
  const supportsMotorSection = jointType !== JointType.FIXED
    && jointType !== JointType.FLOATING
    && jointType !== JointType.PLANAR
    && jointType !== JointType.BALL;
  const defaultLimit = getDefaultJointLimit(jointType);
  const limitUnit = getJointValueUnitLabel(jointType, 'rad');
  const velocityUnit = getJointVelocityUnitLabel(jointType);
  const effortUnit = getJointEffortUnitLabel(jointType);

  const updateJoint = (updates: Partial<JointData>) => {
    onUpdate('joint', selection.id!, { ...data, ...updates });
  };

  const handleJointTypeChange = (nextType: JointType) => {
    const nextData: JointData = { ...data, type: nextType };
    if (AXIS_BASED_TYPES.has(nextType)) {
      const axis = data.axis;
      const axisLen = axis ? Math.hypot(axis.x, axis.y, axis.z) : 0;
      nextData.axis = axisLen > 0 ? axis : DEFAULT_AXIS;
    }
    if (LIMITED_TYPES.has(nextType) && !nextData.limit) {
      nextData.limit = getDefaultJointLimit(nextType);
    }
    if (EFFORT_VELOCITY_ONLY_TYPES.has(nextType)) {
      nextData.limit = {
        ...getDefaultJointLimit(nextType),
        ...nextData.limit,
      };
    }
    onUpdate('joint', selection.id!, nextData);
  };

  const {
    motorBrand,
    motorSource,
    currentMotorType,
    currentLibMotor,
    handleSourceChange,
    handleBrandChange,
    handleLibraryMotorChange
  } = useMotorConfig({
    motorLibrary,
    data,
    selectionId: selection.id,
    onUpdate
  });

  const renderJointTypeField = () => (
    <InlineInputGroup label={t.type} labelWidthClassName="w-11">
      <select
        value={jointType}
        onChange={(event) => handleJointTypeChange(event.target.value as JointType)}
        className={PROPERTY_EDITOR_SELECT_CLASS}
        aria-label={t.type}
      >
        {JOINT_TYPE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {getJointTypeLabel(option, t)}
          </option>
        ))}
      </select>
    </InlineInputGroup>
  );

  return (
    <>
      {/* Detail Mode: Name Only */}
      {mode === 'detail' && (
        <>
          <InlineInputGroup label={t.name} labelWidthClassName="w-11">
            <input
              type="text"
              value={data.name}
              onChange={(e) => onUpdate('joint', selection.id!, { ...data, name: e.target.value })}
              className={PROPERTY_EDITOR_INPUT_CLASS}
            />
          </InlineInputGroup>
          {renderJointTypeField()}
        </>
      )}

      {/* Skeleton Mode: Kinematics Only */}
      {mode === 'skeleton' && (
        <>
          {renderJointTypeField()}

          <CollapsibleSection title={t.kinematics} storageKey="kinematics">
            <InputGroup label={t.originRelativeParent}>
              <TransformFields
                lang={lang}
                positionValue={origin.xyz}
                rotationValue={origin.rpy}
                onPositionChange={(v) => updateJoint({
                  origin: { ...origin, xyz: toXYZ(v, origin.xyz) },
                })}
                onRotationChange={(rpy) => updateJoint({
                  origin: { ...origin, rpy: toRPY(rpy, origin.rpy) },
                })}
              />
            </InputGroup>

            {supportsAxis && (
              <InputGroup label={t.axisRotation}>
                <Vec3Input
                  value={data.axis || DEFAULT_AXIS}
                  onChange={(v) => updateJoint({ axis: toXYZ(v, data.axis || DEFAULT_AXIS) })}
                  labels={['X', 'Y', 'Z']}
                  step={TRANSFORM_STEP}
                  precision={MAX_TRANSFORM_DECIMALS}
                />
              </InputGroup>
            )}
          </CollapsibleSection>
        </>
      )}

      {/* Hardware Mode: Limits, Dynamics, Motor */}
      {mode === 'hardware' && (
        <div className="space-y-2.5">
          {renderJointTypeField()}

          {/* 1. Hardware Section */}
          {supportsMotorSection && (
            <CollapsibleSection title={t.hardwareConfig} storageKey="hardware_config">
              <InputGroup label={t.motorSource}>
                <select
                  value={motorSource}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  className={PROPERTY_EDITOR_SELECT_CLASS}
                >
                  <option value="None">{t.none}</option>
                  <option value="Library">{t.library}</option>
                  <option value="Custom">{t.custom}</option>
                </select>
              </InputGroup>

              {motorSource === 'Library' && (
                <div className="space-y-2.5 pl-2 border-l-2 border-border-black mb-2.5">
                  <InputGroup label={t.brand}>
                    <select
                      value={motorBrand}
                      onChange={(e) => handleBrandChange(e.target.value)}
                      className={PROPERTY_EDITOR_SELECT_CLASS}
                    >
                      {Object.keys(motorLibrary).map(brand => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                  </InputGroup>
                  <InputGroup label={t.model}>
                    <select
                      value={currentMotorType}
                      onChange={(e) => handleLibraryMotorChange(e.target.value)}
                      className={PROPERTY_EDITOR_SELECT_CLASS}
                    >
                      {motorLibrary[motorBrand]?.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </InputGroup>

                  {currentLibMotor && currentLibMotor.url && (
                    <div className="mt-2">
                      <a
                        href={currentLibMotor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={PROPERTY_EDITOR_LINK_CLASS}
                      >
                        {t.viewMotor}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {motorSource === 'Custom' && (
                <InputGroup label={t.customType}>
                  <input
                    type="text"
                    placeholder={t.enterMotorType}
                    value={currentMotorType}
                    onChange={(e) => updateJoint({
                      hardware: { ...data.hardware, motorType: e.target.value }
                    })}
                    className={PROPERTY_EDITOR_INPUT_CLASS}
                  />
                </InputGroup>
              )}

              {motorSource !== 'None' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <InputGroup label={t.motorId}>
                      <input
                        type="text"
                        value={data.hardware?.motorId || ''}
                        onChange={(e) => updateJoint({
                          hardware: { ...data.hardware, motorId: e.target.value }
                        })}
                        className={PROPERTY_EDITOR_INPUT_CLASS}
                      />
                    </InputGroup>
                    <InputGroup label={t.direction}>
                      <select
                        value={data.hardware?.motorDirection || 1}
                        onChange={(e) => updateJoint({
                          hardware: { ...data.hardware, motorDirection: parseInt(e.target.value, 10) }
                        })}
                        className={PROPERTY_EDITOR_SELECT_CLASS}
                      >
                        <option value={1}>1 ({t.normal})</option>
                        <option value={-1}>-1 ({t.inverted})</option>
                      </select>
                    </InputGroup>
                  </div>

                  <InputGroup label={t.armature}>
                    <NumberInput
                      value={data.hardware?.armature || 0}
                      min={0}
                      onChange={(v: number) => updateJoint({
                        hardware: { ...data.hardware, armature: v }
                      })}
                    />
                  </InputGroup>
                </>
              )}
            </CollapsibleSection>
          )}

          {/* 2. Limits */}
          {(supportsFullLimit || supportsEffortVelocityLimit) && (
            <CollapsibleSection title={t.limits} storageKey="limits">
              <div className="grid grid-cols-2 gap-2">
                {supportsFullLimit && (
                  <>
                    <InputGroup label={t.lower}>
                      <NumberInput
                        value={data.limit?.lower ?? defaultLimit.lower}
                        onChange={(v: number) => updateJoint({
                          limit: { ...defaultLimit, ...data.limit, lower: v }
                        })}
                        suffix={limitUnit}
                      />
                    </InputGroup>
                    <InputGroup label={t.upper}>
                      <NumberInput
                        value={data.limit?.upper ?? defaultLimit.upper}
                        onChange={(v: number) => updateJoint({
                          limit: { ...defaultLimit, ...data.limit, upper: v }
                        })}
                        suffix={limitUnit}
                      />
                    </InputGroup>
                  </>
                )}
                <InputGroup label={t.velocity}>
                  <NumberInput
                    value={data.limit?.velocity ?? defaultLimit.velocity}
                    min={0}
                    onChange={(v: number) => updateJoint({
                      limit: { ...defaultLimit, ...data.limit, velocity: v }
                    })}
                    suffix={velocityUnit}
                  />
                </InputGroup>
                <InputGroup label={t.effort}>
                  <NumberInput
                    value={data.limit?.effort ?? defaultLimit.effort}
                    min={0}
                    onChange={(v: number) => updateJoint({
                      limit: { ...defaultLimit, ...data.limit, effort: v }
                    })}
                    suffix={effortUnit}
                  />
                </InputGroup>
              </div>
            </CollapsibleSection>
          )}

          {/* 3. Dynamics */}
          {supportsMotorSection && (
            <CollapsibleSection title={t.dynamics} defaultOpen={false} storageKey="dynamics">
              <div className="grid grid-cols-2 gap-2">
                <InputGroup label={t.friction}>
                  <NumberInput
                    value={data.dynamics?.friction || 0}
                    min={0}
                    onChange={(v: number) => updateJoint({
                      dynamics: { ...data.dynamics, friction: v }
                    })}
                  />
                </InputGroup>
                <InputGroup label={t.damping}>
                  <NumberInput
                    value={data.dynamics?.damping || 0}
                    min={0}
                    onChange={(v: number) => updateJoint({
                      dynamics: { ...data.dynamics, damping: v }
                    })}
                  />
                </InputGroup>
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}
    </>
  );
};
