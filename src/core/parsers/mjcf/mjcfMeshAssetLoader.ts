import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { loadColladaScene } from '@/core/loaders/colladaParseWorkerBridge';
import {
  createObjectFromSerializedObjData,
  loadSerializedObjModelData,
} from '@/core/loaders/objParseWorkerBridge';
import { createGeometryFromSerializedStlData } from '@/core/loaders/stlGeometryData';
import { loadSerializedStlGeometryData } from '@/core/loaders/stlParseWorkerBridge';
import { prepareMeshSurfaceForSingleSidedRendering } from '@/core/loaders';
import { createMatteMaterial } from '@/core/utils/materialFactory';

type CachedMJCFMeshAsset = {
  createInstance: () => THREE.Object3D;
};

export type MJCFMeshCache = Map<string, CachedMJCFMeshAsset>;

const pendingMJCFMeshAssetLoads = new WeakMap<MJCFMeshCache, Map<string, Promise<CachedMJCFMeshAsset | null>>>();

function createDefaultMaterial(): THREE.MeshStandardMaterial {
  return createMatteMaterial({
    color: 0x888888,
    name: 'mjcf_default',
  });
}

const cloneMaterialInstance = <TMaterial extends THREE.Material>(material: TMaterial): TMaterial => {
  const clonedMaterial = material.clone() as TMaterial;
  clonedMaterial.userData = {
    ...(material.userData ?? {}),
    ...(clonedMaterial.userData ?? {}),
  };
  return clonedMaterial;
};

const cloneMaterialsInObject = <TObject extends THREE.Object3D>(root: TObject): TObject => {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }

    const mesh = child as THREE.Mesh;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => cloneMaterialInstance(material));
      return;
    }

    if (mesh.material) {
      mesh.material = cloneMaterialInstance(mesh.material);
    }
  });

  return root;
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

const cloneObject3DForReuse = (
  source: THREE.Object3D,
  options: { preserveSkeletons?: boolean } = {},
): THREE.Object3D => {
  const clonedRoot = options.preserveSkeletons
    ? cloneSkeleton(source)
    : source.clone(true);

  return cloneMaterialsInObject(clonedRoot);
};

const getPendingMeshAssetLoads = (meshCache: MJCFMeshCache): Map<string, Promise<CachedMJCFMeshAsset | null>> => {
  const cached = pendingMJCFMeshAssetLoads.get(meshCache);
  if (cached) {
    return cached;
  }

  const nextPendingLoads = new Map<string, Promise<CachedMJCFMeshAsset | null>>();
  pendingMJCFMeshAssetLoads.set(meshCache, nextPendingLoads);
  return nextPendingLoads;
};

const getMeshCacheKey = (assetUrl: string, filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  return `${extension}:${assetUrl}`;
};

const loadCachedMJCFMeshAsset = async (
  assetUrl: string,
  filePath: string,
): Promise<CachedMJCFMeshAsset | null> => {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';

  try {
    if (extension === 'stl') {
      const serializedGeometry = await loadSerializedStlGeometryData(assetUrl);
      const geometry = createGeometryFromSerializedStlData(serializedGeometry);
      return {
        createInstance: () => new THREE.Mesh(geometry, createDefaultMaterial()),
      };
    }

    if (extension === 'dae') {
      const scene = await loadColladaScene(assetUrl, new THREE.LoadingManager());
      return {
        createInstance: () => cloneObject3DForReuse(scene),
      };
    }

    if (extension === 'obj') {
      const serializedObject = await loadSerializedObjModelData(assetUrl);
      const object = createObjectFromSerializedObjData(serializedObject);
      prepareMeshSurfaceForSingleSidedRendering(object);
      return {
        createInstance: () => cloneObject3DForReuse(object),
      };
    }

    if (extension === 'gltf' || extension === 'glb') {
      const loader = new GLTFLoader();
      const result = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
        loader.load(assetUrl, resolve, undefined, reject);
      });
      const preserveSkeletons = objectHasSkinnedMeshes(result.scene);
      return {
        createInstance: () => cloneObject3DForReuse(result.scene, { preserveSkeletons }),
      };
    }

    console.error(`[MJCFLoader] Unsupported mesh format: ${extension}`);
    return null;
  } catch (error) {
    console.error(`[MJCFLoader] Failed to load mesh: ${filePath}`, error);
    return null;
  }
};

export async function loadMJCFMeshObject(
  assetUrl: string,
  filePath: string,
  meshCache: MJCFMeshCache,
): Promise<THREE.Object3D | null> {
  const cacheKey = getMeshCacheKey(assetUrl, filePath);
  const cachedAsset = meshCache.get(cacheKey);
  if (cachedAsset) {
    return cachedAsset.createInstance();
  }

  const pendingLoads = getPendingMeshAssetLoads(meshCache);
  const pendingLoad = pendingLoads.get(cacheKey);
  if (pendingLoad) {
    const resolvedAsset = await pendingLoad;
    return resolvedAsset?.createInstance() ?? null;
  }

  const nextPendingLoad = loadCachedMJCFMeshAsset(assetUrl, filePath);
  pendingLoads.set(cacheKey, nextPendingLoad);

  try {
    const resolvedAsset = await nextPendingLoad;
    if (resolvedAsset) {
      meshCache.set(cacheKey, resolvedAsset);
      return resolvedAsset.createInstance();
    }

    return null;
  } finally {
    pendingLoads.delete(cacheKey);
  }
}
