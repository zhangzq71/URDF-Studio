import * as THREE from 'three';

export interface ParsedThreeColor {
  color: THREE.Color;
  opacity: number | null;
}

export function createThreeColorFromSRGB(
  red: number,
  green: number,
  blue: number,
): THREE.Color {
  return new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
}

export function setThreeColorFromSRGB(
  target: THREE.Color,
  red: number,
  green: number,
  blue: number,
): THREE.Color {
  return target.setRGB(red, green, blue, THREE.SRGBColorSpace);
}

function expandShortHex(hex: string): string {
  return hex
    .split('')
    .map((char) => `${char}${char}`)
    .join('');
}

export function parseThreeColorWithOpacity(
  value: THREE.ColorRepresentation | null | undefined,
): ParsedThreeColor | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof THREE.Color) {
    return {
      color: value.clone(),
      opacity: null,
    };
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) {
      return null;
    }

    const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
    if (/^[0-9a-f]{3}$/i.test(normalized)) {
      return {
        color: new THREE.Color(`#${expandShortHex(normalized)}`),
        opacity: null,
      };
    }

    if (/^[0-9a-f]{4}$/i.test(normalized)) {
      const expanded = expandShortHex(normalized);
      return {
        color: new THREE.Color(`#${expanded.slice(0, 6)}`),
        opacity: parseInt(expanded.slice(6, 8), 16) / 255,
      };
    }

    if (/^[0-9a-f]{6}$/i.test(normalized)) {
      return {
        color: new THREE.Color(`#${normalized}`),
        opacity: null,
      };
    }

    if (/^[0-9a-f]{8}$/i.test(normalized)) {
      return {
        color: new THREE.Color(`#${normalized.slice(0, 6)}`),
        opacity: parseInt(normalized.slice(6, 8), 16) / 255,
      };
    }
  }

  try {
    return {
      color: new THREE.Color(value),
      opacity: null,
    };
  } catch {
    return null;
  }
}
