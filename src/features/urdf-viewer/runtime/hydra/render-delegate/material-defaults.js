// @ts-nocheck
import { Color, DoubleSide, MeshPhysicalMaterial } from 'three';

export const HYDRA_DEFAULT_GRAY_HEX = 0x888888;
export const HYDRA_UNIFIED_MATERIAL_DEFAULTS = Object.freeze({
    roughness: 0.68,
    metalness: 0.02,
    envMapIntensity: 0.3,
});

export function applyUnifiedHydraMaterialDefaults(material) {
    if (!material)
        return material;
    material.roughness = HYDRA_UNIFIED_MATERIAL_DEFAULTS.roughness;
    material.metalness = HYDRA_UNIFIED_MATERIAL_DEFAULTS.metalness;
    material.envMapIntensity = HYDRA_UNIFIED_MATERIAL_DEFAULTS.envMapIntensity;
    return material;
}

export function createUnifiedHydraPhysicalMaterial(options = {}) {
    const {
        color = HYDRA_DEFAULT_GRAY_HEX,
        side = DoubleSide,
        name = '',
    } = options;
    const material = new MeshPhysicalMaterial({
        side,
        color: color instanceof Color ? color.clone() : new Color(color),
        roughness: HYDRA_UNIFIED_MATERIAL_DEFAULTS.roughness,
        metalness: HYDRA_UNIFIED_MATERIAL_DEFAULTS.metalness,
        envMapIntensity: HYDRA_UNIFIED_MATERIAL_DEFAULTS.envMapIntensity,
        name,
    });
    return material;
}
