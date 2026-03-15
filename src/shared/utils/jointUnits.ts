import { JointType } from '@/types';

export type JointAngleUnit = 'rad' | 'deg';

export interface JointLimitDefaults {
  lower: number;
  upper: number;
  effort: number;
  velocity: number;
}

const ANGULAR_DEFAULT_LIMIT: JointLimitDefaults = {
  lower: -Math.PI,
  upper: Math.PI,
  effort: 100,
  velocity: 10,
};

const LINEAR_DEFAULT_LIMIT: JointLimitDefaults = {
  lower: -1,
  upper: 1,
  effort: 100,
  velocity: 1,
};

export const normalizeJointTypeValue = (jointType: string | JointType | undefined | null): string => (
  String(jointType ?? '').toLowerCase()
);

export const isAngularJointType = (jointType: string | JointType | undefined | null): boolean => {
  const normalized = normalizeJointTypeValue(jointType);
  return normalized === JointType.REVOLUTE || normalized === JointType.CONTINUOUS;
};

export const isLinearJointType = (jointType: string | JointType | undefined | null): boolean => (
  normalizeJointTypeValue(jointType) === JointType.PRISMATIC
);

export const supportsFiniteJointLimits = (jointType: string | JointType | undefined | null): boolean => {
  const normalized = normalizeJointTypeValue(jointType);
  return normalized === JointType.REVOLUTE || normalized === JointType.PRISMATIC;
};

export const getDefaultJointLimit = (jointType: string | JointType | undefined | null): JointLimitDefaults => (
  isLinearJointType(jointType)
    ? { ...LINEAR_DEFAULT_LIMIT }
    : { ...ANGULAR_DEFAULT_LIMIT }
);

export const toJointDisplayValue = (
  value: number,
  jointType: string | JointType | undefined | null,
  angleUnit: JointAngleUnit,
): number => {
  if (isAngularJointType(jointType) && angleUnit === 'deg') {
    return value * 180 / Math.PI;
  }
  return value;
};

export const fromJointDisplayValue = (
  value: number,
  jointType: string | JointType | undefined | null,
  angleUnit: JointAngleUnit,
): number => {
  if (isAngularJointType(jointType) && angleUnit === 'deg') {
    return value * Math.PI / 180;
  }
  return value;
};

export const getJointValueUnitLabel = (
  jointType: string | JointType | undefined | null,
  angleUnit: JointAngleUnit,
): string => {
  if (isLinearJointType(jointType)) {
    return 'm';
  }
  return angleUnit;
};

export const getJointVelocityUnitLabel = (jointType: string | JointType | undefined | null): string => (
  isLinearJointType(jointType) ? 'm/s' : 'rad/s'
);

export const getJointEffortUnitLabel = (jointType: string | JointType | undefined | null): string => (
  isLinearJointType(jointType) ? 'N' : 'N·m'
);

export const getJointSliderStep = (
  jointType: string | JointType | undefined | null,
  angleUnit: JointAngleUnit,
): number => {
  if (isLinearJointType(jointType)) {
    return 0.001;
  }
  return angleUnit === 'deg' ? 1 : 0.01;
};
