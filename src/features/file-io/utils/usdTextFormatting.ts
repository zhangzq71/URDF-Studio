import * as THREE from 'three';

import type { JointQuaternion } from '@/types';

export const makeUsdIndent = (depth: number): string => {
  return '    '.repeat(depth);
};

const trimFixedUsdFloat = (value: string): string => {
  if (!value.includes('.')) {
    return value;
  }

  return value.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
};

const trimExponentialUsdFloat = (value: string): string => {
  return value
    .replace(/(\.\d*?[1-9])0+e/, '$1e')
    .replace(/\.0+e/, 'e')
    .replace(/e\+?/, 'e')
    .replace(/e(-?)0+(\d+)/, 'e$1$2');
};

export const formatUsdFloat = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const normalized = Object.is(value, -0) ? 0 : value;
  const absolute = Math.abs(normalized);

  if (absolute === 0) {
    return '0';
  }

  if (absolute >= 1e-6 && absolute < 1e9) {
    return trimFixedUsdFloat(normalized.toFixed(6));
  }

  return trimExponentialUsdFloat(normalized.toExponential(6));
};

export const formatUsdTuple = (values: number[]): string => {
  return `(${values.map((value) => formatUsdFloat(value)).join(', ')})`;
};

export const formatUsdTuple2 = (x: number, y: number): string => {
  return `(${formatUsdFloat(x)}, ${formatUsdFloat(y)})`;
};

export const formatUsdTuple3 = (x: number, y: number, z: number): string => {
  return `(${formatUsdFloat(x)}, ${formatUsdFloat(y)}, ${formatUsdFloat(z)})`;
};

export const sanitizeUsdIdentifier = (value: string, fallback = 'Node'): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeValue = normalized || fallback;
  return /^\d/.test(safeValue) ? `_${safeValue}` : safeValue;
};

export const escapeUsdString = (value: string): string => {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
};

export const quaternionToUsdTuple = (
  quaternion: THREE.Quaternion | JointQuaternion | null | undefined,
): string => {
  if (!quaternion) {
    return '(1, 0, 0, 0)';
  }

  const w = 'w' in quaternion ? quaternion.w : 1;
  const x = 'x' in quaternion ? quaternion.x : 0;
  const y = 'y' in quaternion ? quaternion.y : 0;
  const z = 'z' in quaternion ? quaternion.z : 0;
  return formatUsdTuple([w, x, y, z]);
};

export const serializeUsdPrimSpecWithMetadata = (
  lines: string[],
  depth: number,
  primSpec: string,
  metadata: string[] = [],
): void => {
  const indent = makeUsdIndent(depth);
  if (metadata.length === 0) {
    lines.push(`${indent}${primSpec}`);
    return;
  }

  lines.push(`${indent}${primSpec} (`);
  metadata.forEach((entry) => {
    lines.push(`${makeUsdIndent(depth + 1)}${entry}`);
  });
  lines.push(`${indent})`);
};
