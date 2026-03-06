import * as THREE from 'three';

/**
 * Unified PBR material configuration.
 * Settings optimized for IBL (Image-Based Lighting) to provide
 * consistent appearance across URDF, MJCF, and USD renderers.
 */
export const MATERIAL_CONFIG = {
    roughness: 0.7,
    metalness: 0.1,
    envMapIntensity: 1.0,
    whiteColorMultiplier: 0.95,
} as const;

export interface CreateMaterialOptions {
    color: THREE.ColorRepresentation;
    opacity?: number;
    transparent?: boolean;
    side?: THREE.Side;
    map?: THREE.Texture | null;
    name?: string;
}

/**
 * Creates a unified MeshStandardMaterial for PBR rendering with IBL.
 * Shared across URDF / MJCF / USD pipelines for consistent matte finish.
 */
export function createMatteMaterial(options: CreateMaterialOptions): THREE.MeshStandardMaterial {
    const {
        color,
        opacity = 1.0,
        transparent = false,
        side = THREE.DoubleSide,
        map = null,
        name = ''
    } = options;

    let finalColor = new THREE.Color(color);

    if (finalColor.r > 0.95 && finalColor.g > 0.95 && finalColor.b > 0.95) {
        finalColor.multiplyScalar(MATERIAL_CONFIG.whiteColorMultiplier);
    }

    const material = new THREE.MeshStandardMaterial({
        color: finalColor,
        roughness: MATERIAL_CONFIG.roughness,
        metalness: MATERIAL_CONFIG.metalness,
        envMapIntensity: MATERIAL_CONFIG.envMapIntensity,
        side,
        transparent: transparent || opacity < 1.0,
        opacity,
        depthWrite: opacity >= 1.0,
        map,
    });

    if (name) material.name = name;

    material.userData.originalColor = finalColor.clone();
    material.userData.originalRoughness = MATERIAL_CONFIG.roughness;
    material.userData.originalMetalness = MATERIAL_CONFIG.metalness;
    material.userData.originalEnvMapIntensity = MATERIAL_CONFIG.envMapIntensity;

    return material;
}
