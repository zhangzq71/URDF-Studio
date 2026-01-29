import * as THREE from 'three';

/**
 * Material Cache - Prevents shader recompilation on every render
 * Caches materials based on their properties to improve performance
 */
const materialCache = new Map<string, THREE.Material>();

interface MaterialOptions {
  key: string;
  isSkeleton: boolean;
  finalColor: string;
  matOpacity: number;
  matWireframe: boolean;
  isCollision: boolean;
  emissiveColor: string;
  emissiveIntensity: number;
}

/**
 * Get or create a cached material based on the provided properties
 * @returns A cached or newly created THREE.Material
 */
export function getCachedMaterial({
  key,
  isSkeleton,
  finalColor,
  matOpacity,
  matWireframe,
  isCollision,
  emissiveColor,
  emissiveIntensity,
}: MaterialOptions): THREE.Material {
  // Generate a unique cache key based on all material properties
  const cacheKey = `${key}-${isSkeleton}-${finalColor}-${matOpacity}-${matWireframe}-${isCollision}-${emissiveColor}-${emissiveIntensity}`;

  let material = materialCache.get(cacheKey);
  if (!material) {
    if (isSkeleton) {
      material = new THREE.MeshBasicMaterial({
        color: finalColor,
        transparent: true,
        opacity: matOpacity,
        wireframe: matWireframe,
        side: isCollision ? THREE.FrontSide : THREE.DoubleSide,
        polygonOffset: isCollision,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    } else {
      material = new THREE.MeshPhysicalMaterial({
        color: finalColor,
        roughness: 0.15,
        metalness: 0.3,
        clearcoat: 0.3,
        clearcoatRoughness: 0.1,
        reflectivity: 0.8,
        emissive: emissiveColor,
        emissiveIntensity: emissiveIntensity,
        transparent: isCollision,
        opacity: matOpacity,
        wireframe: matWireframe,
        side: isCollision ? THREE.FrontSide : THREE.DoubleSide,
        polygonOffset: isCollision,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    }
    materialCache.set(cacheKey, material);
  }
  return material;
}

/**
 * Clear the material cache (useful for cleanup or testing)
 */
export function clearMaterialCache(): void {
  materialCache.forEach((material) => material.dispose());
  materialCache.clear();
}
