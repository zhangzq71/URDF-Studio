import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { UrdfVisual } from '@/types';
import {
  shouldNormalizeColladaRoot,
  type ColladaRootNormalizationHints,
} from '@/core/loaders/colladaRootNormalization.ts';
import { loadColladaScene } from '@/core/loaders/colladaParseWorkerBridge.ts';
import {
  createObjectFromSerializedObjData,
  loadSerializedObjModelData,
} from '@/core/loaders/objParseWorkerBridge.ts';
import { createGeometryFromSerializedStlData } from '@/core/loaders/stlGeometryData.ts';
import { loadSerializedStlGeometryData } from '@/core/loaders/stlParseWorkerBridge.ts';
import { ensureWorkerXmlDomApis } from '@/core/utils/ensureWorkerXmlDomApis.ts';

import {
  createUsdTextureLoadingManager,
  resolveUsdAssetUrl,
  type UsdAssetRegistry,
} from './usdAssetRegistry.ts';
import {
  createUsdBaseMaterial,
  expandUsdMultiMaterialMeshesForSerialization,
  isUsdMeshObject,
  normalizeUsdRenderableMaterials,
} from './usdMaterialNormalization.ts';
import { applyUsdMeshCompression } from './usdMeshCompression.ts';

export const USD_GEOMETRY_TYPES = {
  BOX: 'box',
  CYLINDER: 'cylinder',
  SPHERE: 'sphere',
  CAPSULE: 'capsule',
  MESH: 'mesh',
  NONE: 'none',
} as const;

export type UsdVisualRole = 'visual' | 'collision';

export type UsdMaterialMetadata = {
  color?: string;
  texture?: string;
};

export interface UsdMeshCompressionOptions {
  enabled: boolean;
  quality: number;
}

type CachedUsdGltfSceneAsset = {
  preserveSkeletons: boolean;
  scene: THREE.Object3D;
};

type SerializedPrimitiveType = 'Cube' | 'Sphere' | 'Cylinder' | 'Capsule';

type BuildUsdVisualSceneNodeOptions = {
  visual: UrdfVisual;
  role: UsdVisualRole;
  registry: UsdAssetRegistry;
  materialState?: UsdMaterialMetadata;
  meshCompression?: UsdMeshCompressionOptions;
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
};

const usdTextureLoadingManagerCache = new WeakMap<UsdAssetRegistry, THREE.LoadingManager>();
const usdGltfSceneAssetCache = new WeakMap<UsdAssetRegistry, Map<string, Promise<CachedUsdGltfSceneAsset>>>();

const getUsdTextureLoadingManager = (registry: UsdAssetRegistry): THREE.LoadingManager => {
  const cachedManager = usdTextureLoadingManagerCache.get(registry);
  if (cachedManager) {
    return cachedManager;
  }

  const manager = createUsdTextureLoadingManager(registry);
  usdTextureLoadingManagerCache.set(registry, manager);
  return manager;
};

const getUsdGltfSceneAssetCache = (
  registry: UsdAssetRegistry,
): Map<string, Promise<CachedUsdGltfSceneAsset>> => {
  const cached = usdGltfSceneAssetCache.get(registry);
  if (cached) {
    return cached;
  }

  const nextCache = new Map<string, Promise<CachedUsdGltfSceneAsset>>();
  usdGltfSceneAssetCache.set(registry, nextCache);
  return nextCache;
};

const cloneMaterialInstance = <TMaterial extends THREE.Material>(material: TMaterial): TMaterial => {
  const clonedMaterial = material.clone() as TMaterial;
  clonedMaterial.userData = {
    ...(material.userData ?? {}),
    ...(clonedMaterial.userData ?? {}),
  };
  return clonedMaterial;
};

const objectHasSkinnedMeshes = (root: THREE.Object3D): boolean => {
  let hasSkinnedMeshes = false;

  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      hasSkinnedMeshes = true;
    }
  });

  return hasSkinnedMeshes;
};

const cloneUsdGltfSceneAsset = (asset: CachedUsdGltfSceneAsset): THREE.Object3D => {
  const clonedRoot = asset.preserveSkeletons
    ? cloneSkeleton(asset.scene)
    : asset.scene.clone(true);

  clonedRoot.traverse((child) => {
    const meshLike = child as THREE.Mesh;

    if (meshLike.geometry?.isBufferGeometry) {
      meshLike.geometry = meshLike.geometry.clone();
    }

    if (!meshLike.isMesh) {
      return;
    }

    if (Array.isArray(meshLike.material)) {
      meshLike.material = meshLike.material.map((material) => cloneMaterialInstance(material));
      return;
    }

    if (meshLike.material) {
      meshLike.material = cloneMaterialInstance(meshLike.material);
    }
  });

  return clonedRoot;
};

const loadUsdGltfSceneAsset = async (
  assetUrl: string,
  registry: UsdAssetRegistry,
): Promise<CachedUsdGltfSceneAsset> => {
  ensureWorkerXmlDomApis();
  const cache = getUsdGltfSceneAssetCache(registry);
  const cached = cache.get(assetUrl);
  if (cached) {
    return await cached;
  }

  const pendingLoad = (async (): Promise<CachedUsdGltfSceneAsset> => {
    const loader = new GLTFLoader(getUsdTextureLoadingManager(registry));
    const gltf = await loader.loadAsync(assetUrl);
    return {
      scene: gltf.scene,
      preserveSkeletons: objectHasSkinnedMeshes(gltf.scene),
    };
  })();

  cache.set(assetUrl, pendingLoad);

  try {
    return await pendingLoad;
  } catch (error) {
    cache.delete(assetUrl);
    throw error;
  }
};

export const getUsdGeometryType = (value: string | null | undefined): string => {
  return String(value || '').trim().toLowerCase();
};

const getUsdVisualScale = (visual: UrdfVisual): THREE.Vector3 => {
  const type = getUsdGeometryType(visual.type);
  if (type === USD_GEOMETRY_TYPES.BOX) {
    return new THREE.Vector3(
      visual.dimensions.x || 1,
      visual.dimensions.y || 1,
      visual.dimensions.z || 1,
    );
  }

  if (type === USD_GEOMETRY_TYPES.SPHERE) {
    const diameter = (visual.dimensions.x || 0.5) * 2;
    return new THREE.Vector3(diameter, diameter, diameter);
  }

  if (type === USD_GEOMETRY_TYPES.CYLINDER || type === USD_GEOMETRY_TYPES.CAPSULE) {
    const diameter = (visual.dimensions.x || 0.5) * 2;
    return new THREE.Vector3(
      diameter,
      diameter,
      visual.dimensions.y || 1,
    );
  }

  return new THREE.Vector3(
    visual.dimensions.x || 1,
    visual.dimensions.y || 1,
    visual.dimensions.z || 1,
  );
};

const applyUsdVisualOrigin = (object: THREE.Object3D, visual: UrdfVisual): void => {
  object.position.set(
    visual.origin?.xyz?.x ?? 0,
    visual.origin?.xyz?.y ?? 0,
    visual.origin?.xyz?.z ?? 0,
  );
  object.quaternion.copy(new THREE.Quaternion().setFromEuler(new THREE.Euler(
    visual.origin?.rpy?.r ?? 0,
    visual.origin?.rpy?.p ?? 0,
    visual.origin?.rpy?.y ?? 0,
    'ZYX',
  )));
};

const createUsdPrimitiveSceneNode = (
  visual: UrdfVisual,
  role: UsdVisualRole,
  materialState?: UsdMaterialMetadata,
): THREE.Object3D | null => {
  const type = getUsdGeometryType(visual.type);
  const primitiveType: SerializedPrimitiveType | null = type === USD_GEOMETRY_TYPES.BOX
    ? 'Cube'
    : type === USD_GEOMETRY_TYPES.SPHERE
      ? 'Sphere'
      : type === USD_GEOMETRY_TYPES.CYLINDER
        ? 'Cylinder'
        : type === USD_GEOMETRY_TYPES.CAPSULE
          ? 'Capsule'
          : null;

  if (!primitiveType) {
    return null;
  }

  const anchor = new THREE.Group();
  applyUsdVisualOrigin(anchor, visual);
  anchor.scale.copy(getUsdVisualScale(visual));
  anchor.name = role;
  if (role === 'collision') {
    anchor.userData.usdPurpose = 'guide';
    anchor.userData.usdCollision = true;
  }

  const primitive = new THREE.Object3D();
  primitive.name = type || primitiveType.toLowerCase();
  primitive.userData.usdGeomType = primitiveType;
  primitive.userData.usdDisplayColor = materialState?.color || visual.color || null;
  if (role === 'collision') {
    primitive.userData.usdPurpose = 'guide';
    primitive.userData.usdCollision = true;
  }
  anchor.add(primitive);

  return anchor;
};

const applyExplicitMeshDisplayColor = (root: THREE.Object3D, color: string | undefined): void => {
  if (!color) {
    return;
  }

  root.traverse((child) => {
    if (!isUsdMeshObject(child)) {
      return;
    }

    child.userData.usdDisplayColor = color;
  });
};

const loadUsdMeshObject = async (
  visual: UrdfVisual,
  registry: UsdAssetRegistry,
  colorOverride?: string,
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null,
): Promise<THREE.Object3D | null> => {
  const meshPath = String(visual.meshPath || '').trim();
  if (!meshPath) {
    return null;
  }

  const resolvedUrl = resolveUsdAssetUrl(meshPath, registry);
  if (!resolvedUrl) {
    console.error(`[USD export] Mesh asset not found for: ${meshPath}`);
    return null;
  }

  const lowerPath = meshPath.toLowerCase();

  if (lowerPath.endsWith('.stl')) {
    const serializedGeometry = await loadSerializedStlGeometryData(resolvedUrl);
    const geometry = createGeometryFromSerializedStlData(serializedGeometry);
    return new THREE.Mesh(geometry, createUsdBaseMaterial(colorOverride || visual.color));
  }

  if (lowerPath.endsWith('.obj')) {
    const serializedObject = await loadSerializedObjModelData(resolvedUrl);
    const object = createObjectFromSerializedObjData(serializedObject);
    normalizeUsdRenderableMaterials(object, colorOverride || visual.color);
    expandUsdMultiMaterialMeshesForSerialization(object);
    return object;
  }

  if (lowerPath.endsWith('.dae')) {
    const object = await loadColladaScene(resolvedUrl, getUsdTextureLoadingManager(registry));
    normalizeUsdRenderableMaterials(object, colorOverride || visual.color);
    expandUsdMultiMaterialMeshesForSerialization(object);
    if (shouldNormalizeColladaRoot(meshPath, colladaRootNormalizationHints)) {
      object.rotation.set(0, 0, 0);
      object.updateMatrix();
    }
    return object;
  }

  if (lowerPath.endsWith('.gltf') || lowerPath.endsWith('.glb')) {
    const object = cloneUsdGltfSceneAsset(await loadUsdGltfSceneAsset(resolvedUrl, registry));
    normalizeUsdRenderableMaterials(object, colorOverride || visual.color);
    expandUsdMultiMaterialMeshesForSerialization(object);
    return object;
  }

  console.error(`[USD export] Unsupported mesh format for: ${meshPath}`);
  return null;
};

export const buildUsdVisualSceneNode = async ({
  visual,
  role,
  registry,
  materialState,
  meshCompression,
  colladaRootNormalizationHints,
}: BuildUsdVisualSceneNodeOptions): Promise<THREE.Object3D | null> => {
  const type = getUsdGeometryType(visual.type);
  if (type === USD_GEOMETRY_TYPES.NONE) {
    return null;
  }

  if (type !== USD_GEOMETRY_TYPES.MESH) {
    return createUsdPrimitiveSceneNode(visual, role, materialState);
  }

  const object = await loadUsdMeshObject(
    visual,
    registry,
    materialState?.color,
    colladaRootNormalizationHints,
  );
  if (!object) {
    return null;
  }

  if (meshCompression?.enabled && meshCompression.quality < 100) {
    applyUsdMeshCompression(object, meshCompression.quality);
  }

  const anchor = new THREE.Group();
  anchor.name = role;
  applyUsdVisualOrigin(anchor, visual);
  anchor.scale.copy(getUsdVisualScale(visual));
  if (role === 'collision') {
    anchor.userData.usdPurpose = 'guide';
    anchor.userData.usdCollision = true;
    anchor.userData.usdMeshCollision = true;
    object.traverse((child) => {
      child.userData.usdPurpose = 'guide';
      child.userData.usdCollision = true;
      child.userData.usdMeshCollision = isUsdMeshObject(child);
    });
  }

  applyExplicitMeshDisplayColor(object, materialState?.color);
  anchor.add(object);
  return anchor;
};
