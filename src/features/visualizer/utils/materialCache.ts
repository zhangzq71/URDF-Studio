import * as THREE from 'three';
import { createMatteMaterial } from '@/shared/utils/materialFactory';

/**
 * Material Cache - Prevents shader recompilation on every render
 * and bounds long-session GPU memory growth.
 */
const MAX_MATERIAL_CACHE_SIZE = 512;

interface MaterialOptions {
  isSkeleton: boolean;
  finalColor: string;
  matOpacity: number;
  matWireframe: boolean;
  isCollision: boolean;
  emissiveColor: string;
  emissiveIntensity: number;
}

interface MaterialCacheEntry {
  material: THREE.Material;
  refCount: number;
}

const materialCache = new Map<string, MaterialCacheEntry>();

export function buildMaterialCacheKey({
  isSkeleton,
  finalColor,
  matOpacity,
  matWireframe,
  isCollision,
  emissiveColor,
  emissiveIntensity,
}: MaterialOptions): string {
  return `${isSkeleton}-${finalColor}-${matOpacity}-${matWireframe}-${isCollision}-${emissiveColor}-${emissiveIntensity}`;
}

function touchMaterialCacheEntry(cacheKey: string, entry: MaterialCacheEntry): void {
  materialCache.delete(cacheKey);
  materialCache.set(cacheKey, entry);
}

function disposeUnusedCachedMaterials(): void {
  if (materialCache.size <= MAX_MATERIAL_CACHE_SIZE) {
    return;
  }

  for (const [cacheKey, entry] of materialCache) {
    if (materialCache.size <= MAX_MATERIAL_CACHE_SIZE) {
      break;
    }

    if (entry.refCount > 0) {
      continue;
    }

    entry.material.dispose();
    materialCache.delete(cacheKey);
  }
}

function createCachedMaterial({
  isSkeleton,
  finalColor,
  matOpacity,
  matWireframe,
  isCollision,
  emissiveColor,
  emissiveIntensity,
}: MaterialOptions): THREE.Material {
  if (isSkeleton) {
    return new THREE.MeshBasicMaterial({
      color: finalColor,
      transparent: true,
      opacity: matOpacity,
      wireframe: matWireframe,
      side: isCollision ? THREE.FrontSide : THREE.DoubleSide,
      polygonOffset: isCollision,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });
  }

  const matteMaterial = createMatteMaterial({
    color: finalColor,
    opacity: matOpacity,
    transparent: isCollision || matOpacity < 1,
    side: isCollision ? THREE.FrontSide : THREE.DoubleSide,
    preserveExactColor: true,
  });
  matteMaterial.wireframe = matWireframe;
  matteMaterial.emissive.set(emissiveColor);
  matteMaterial.emissiveIntensity = emissiveIntensity;
  matteMaterial.polygonOffset = isCollision;
  matteMaterial.polygonOffsetFactor = -1;
  matteMaterial.polygonOffsetUnits = -1;
  return matteMaterial;
}

/**
 * Get or create a cached material based on the provided properties.
 * This does not claim ownership; callers that keep the material mounted
 * should pair it with retain/release helpers.
 */
export function getCachedMaterial(options: MaterialOptions): THREE.Material {
  const cacheKey = buildMaterialCacheKey(options);
  const existingEntry = materialCache.get(cacheKey);
  if (existingEntry) {
    touchMaterialCacheEntry(cacheKey, existingEntry);
    return existingEntry.material;
  }

  const nextEntry: MaterialCacheEntry = {
    material: createCachedMaterial(options),
    refCount: 0,
  };
  materialCache.set(cacheKey, nextEntry);
  disposeUnusedCachedMaterials();
  return nextEntry.material;
}

export function retainCachedMaterial(cacheKey: string): void {
  const entry = materialCache.get(cacheKey);
  if (!entry) {
    return;
  }

  entry.refCount += 1;
  touchMaterialCacheEntry(cacheKey, entry);
}

export function releaseCachedMaterial(cacheKey: string): void {
  const entry = materialCache.get(cacheKey);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount === 0) {
    disposeUnusedCachedMaterials();
  }
}

export function clearMaterialCache(): void {
  materialCache.forEach((entry) => {
    entry.material.dispose();
  });
  materialCache.clear();
}
