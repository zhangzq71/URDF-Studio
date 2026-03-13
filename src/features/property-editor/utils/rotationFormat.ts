import * as THREE from 'three';
import { degToRad, radToDeg } from '@/core/robot/transforms';
import type { TransformReferenceFrame } from '@/store';

export interface EulerRadiansValue {
  r: number;
  p: number;
  y: number;
}

export interface QuaternionValue {
  x: number;
  y: number;
  z: number;
  w: number;
}

const getEulerOrder = (
  referenceFrame: TransformReferenceFrame = 'urdf',
): THREE.EulerOrder => (referenceFrame === 'local' ? 'XYZ' : 'ZYX');

export const DEFAULT_EULER_RADIANS: EulerRadiansValue = {
  r: 0,
  p: 0,
  y: 0,
};

export const DEFAULT_QUATERNION: QuaternionValue = {
  x: 0,
  y: 0,
  z: 0,
  w: 1,
};

export const eulerRadiansToDegrees = (
  value: EulerRadiansValue,
): EulerRadiansValue => ({
  r: radToDeg(value.r),
  p: radToDeg(value.p),
  y: radToDeg(value.y),
});

export const eulerDegreesToRadians = (
  value: EulerRadiansValue,
): EulerRadiansValue => ({
  r: degToRad(value.r),
  p: degToRad(value.p),
  y: degToRad(value.y),
});

export const normalizeQuaternionValue = (
  value: QuaternionValue,
): QuaternionValue => {
  const quaternion = new THREE.Quaternion(value.x, value.y, value.z, value.w);
  if (quaternion.lengthSq() === 0) {
    return DEFAULT_QUATERNION;
  }

  quaternion.normalize();
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
};

export const eulerRadiansToQuaternion = (
  value: EulerRadiansValue,
  referenceFrame: TransformReferenceFrame = 'urdf',
): QuaternionValue => {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(value.r, value.p, value.y, getEulerOrder(referenceFrame)),
  );

  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
};

export const quaternionToEulerRadians = (
  value: QuaternionValue,
  referenceFrame: TransformReferenceFrame = 'urdf',
): EulerRadiansValue => {
  const normalized = normalizeQuaternionValue(value);
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(normalized.x, normalized.y, normalized.z, normalized.w),
    getEulerOrder(referenceFrame),
  );

  return {
    r: euler.x,
    p: euler.y,
    y: euler.z,
  };
};

export const convertEulerReferenceFrame = (
  value: EulerRadiansValue,
  fromReferenceFrame: TransformReferenceFrame,
  toReferenceFrame: TransformReferenceFrame,
): EulerRadiansValue => {
  if (fromReferenceFrame === toReferenceFrame) {
    return value;
  }

  return quaternionToEulerRadians(
    eulerRadiansToQuaternion(value, fromReferenceFrame),
    toReferenceFrame,
  );
};
