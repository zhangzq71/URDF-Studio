import * as THREE from 'three';
import { parseThreeColorWithOpacity } from './color.ts';

export const MATERIAL_CONFIG = {
    roughness: 0.68,
    metalness: 0.02,
    envMapIntensity: 0.3,
    whiteColorMultiplier: 0.95,
} as const;

export interface CreateMaterialOptions {
    color: THREE.ColorRepresentation;
    opacity?: number;
    transparent?: boolean;
    side?: THREE.Side;
    map?: THREE.Texture | null;
    name?: string;
    preserveExactColor?: boolean;
}

export function createMatteMaterial(options: CreateMaterialOptions): THREE.MeshStandardMaterial {
  const {
    color,
    side = THREE.DoubleSide,
    map = null,
    name = '',
    preserveExactColor = false,
  } = options;
  const parsedColor = parseThreeColorWithOpacity(color);
  let finalColor = parsedColor?.color ?? new THREE.Color('#ffffff');
  const effectiveOpacity = Number.isFinite(options.opacity)
    ? Number(options.opacity)
    : parsedColor?.opacity ?? 1.0;
  const effectiveTransparent = Boolean(options.transparent) || effectiveOpacity < 1.0;

  if (!preserveExactColor && finalColor.r > 0.95 && finalColor.g > 0.95 && finalColor.b > 0.95) {
    finalColor.multiplyScalar(MATERIAL_CONFIG.whiteColorMultiplier);
  }

  const material = new THREE.MeshStandardMaterial({
    color: finalColor,
    roughness: MATERIAL_CONFIG.roughness,
    metalness: MATERIAL_CONFIG.metalness,
    envMapIntensity: MATERIAL_CONFIG.envMapIntensity,
    side,
    transparent: effectiveTransparent,
    opacity: effectiveOpacity,
    depthWrite: effectiveOpacity >= 1.0,
    map,
  });

  // Preserve authored URDF/USD palette values without ACES shifting saturated
  // robot colors (for example Unitree's orange) toward yellow in the viewer.
  if (preserveExactColor) {
    material.toneMapped = false;
  }

  if (name) material.name = name;

  material.userData.originalColor = finalColor.clone();
  material.userData.originalRoughness = MATERIAL_CONFIG.roughness;
  material.userData.originalMetalness = MATERIAL_CONFIG.metalness;
  material.userData.originalEnvMapIntensity = MATERIAL_CONFIG.envMapIntensity;

  return material;
}
