// @ts-nocheck
import { Color, FrontSide, MeshPhysicalMaterial } from 'three';

export const HYDRA_DEFAULT_GRAY_HEX = 0x888888;
export const HYDRA_UNIFIED_MATERIAL_DEFAULTS = Object.freeze({
    roughness: 0.56,
    metalness: 0.035,
    envMapIntensity: 0.42,
});

export function applyUnifiedHydraMaterialDefaults(material) {
    if (!material)
        return material;
    material.roughness = HYDRA_UNIFIED_MATERIAL_DEFAULTS.roughness;
    material.metalness = HYDRA_UNIFIED_MATERIAL_DEFAULTS.metalness;
    material.envMapIntensity = HYDRA_UNIFIED_MATERIAL_DEFAULTS.envMapIntensity;
    // Keep USD-authored robot palettes consistent with the URDF/MJCF viewers.
    material.toneMapped = false;
    return material;
}

export function createUnifiedHydraPhysicalMaterial(options = {}) {
    const {
        color = HYDRA_DEFAULT_GRAY_HEX,
        side = FrontSide,
        name = '',
    } = options;
    const material = new MeshPhysicalMaterial({
        side,
        color: color instanceof Color ? color.clone() : new Color(color),
        roughness: HYDRA_UNIFIED_MATERIAL_DEFAULTS.roughness,
        metalness: HYDRA_UNIFIED_MATERIAL_DEFAULTS.metalness,
        envMapIntensity: HYDRA_UNIFIED_MATERIAL_DEFAULTS.envMapIntensity,
        toneMapped: false,
        name,
    });
    return material;
}
