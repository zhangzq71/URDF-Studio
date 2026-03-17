import * as THREE from 'three';

export const MATERIAL_CONFIG = {
    roughness: 0.68,
    metalness: 0.02,
    envMapIntensity: 0.28,
    whiteColorMultiplier: 0.94,
} as const;

export interface CreateMaterialOptions {
    color: THREE.ColorRepresentation;
    opacity?: number;
    transparent?: boolean;
    side?: THREE.Side;
    map?: THREE.Texture | null;
    name?: string;
}

export function createMatteMaterial(options: CreateMaterialOptions): THREE.MeshStandardMaterial {
    const {
        color,
        opacity = 1.0,
        transparent = false,
        side = THREE.DoubleSide,
        map = null,
        name = '',
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
