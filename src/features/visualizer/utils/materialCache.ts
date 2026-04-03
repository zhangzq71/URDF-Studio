import * as THREE from 'three';
import { createMatteMaterial } from '@/shared/utils/materialFactory';
import { parseThreeColorWithOpacity } from '@/core/utils/color';

/**
 * Material Cache - Prevents shader recompilation on every render
 * and bounds long-session GPU memory growth.
 */
const MAX_MATERIAL_CACHE_SIZE = 512;

interface MaterialOptions {
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
  finalColor,
  matOpacity,
  matWireframe,
  isCollision,
  emissiveColor,
  emissiveIntensity,
}: MaterialOptions): string {
  return `${finalColor}-${matOpacity}-${matWireframe}-${isCollision}-${emissiveColor}-${emissiveIntensity}`;
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
  finalColor,
  matOpacity,
  matWireframe,
  isCollision,
  emissiveColor,
  emissiveIntensity,
}: MaterialOptions): THREE.Material {
  const parsedColor = parseThreeColorWithOpacity(finalColor);
  const resolvedColor = parsedColor?.color ?? new THREE.Color(finalColor);
  const authoredOpacity = parsedColor?.opacity ?? 1;
  const resolvedOpacity = Math.max(0, Math.min(1, authoredOpacity * matOpacity));

  const matteMaterial = createMatteMaterial({
    color: resolvedColor,
    opacity: resolvedOpacity,
    transparent: isCollision || resolvedOpacity < 1,
    // Collision overlays must stay raycastable even when imported mesh winding is
    // inconsistent, which is common in ROS/STL assets such as Unitree G1.
    side: THREE.DoubleSide,
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
