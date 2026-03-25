import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { UrdfVisual } from '@/types';
import {
  shouldNormalizeColladaRoot,
  type ColladaRootNormalizationHints,
} from '@/core/loaders/colladaRootNormalization.ts';

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

type SerializedPrimitiveType = 'Cube' | 'Sphere' | 'Cylinder' | 'Capsule';

type BuildUsdVisualSceneNodeOptions = {
  visual: UrdfVisual;
  role: UsdVisualRole;
  registry: UsdAssetRegistry;
  materialState?: UsdMaterialMetadata;
  meshCompression?: UsdMeshCompressionOptions;
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
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
    console.warn(`[USD export] Mesh asset not found for: ${meshPath}`);
    return null;
  }

  const manager = createUsdTextureLoadingManager(registry);
  const lowerPath = meshPath.toLowerCase();

  if (lowerPath.endsWith('.stl')) {
    const loader = new STLLoader(manager);
    const geometry = await loader.loadAsync(resolvedUrl);
    return new THREE.Mesh(geometry, createUsdBaseMaterial(colorOverride || visual.color));
  }

  if (lowerPath.endsWith('.obj')) {
    const loader = new OBJLoader(manager);
    const object = await loader.loadAsync(resolvedUrl);
    normalizeUsdRenderableMaterials(object, colorOverride || visual.color);
    expandUsdMultiMaterialMeshesForSerialization(object);
    return object;
  }

  if (lowerPath.endsWith('.dae')) {
    const loader = new ColladaLoader(manager);
    const normalizeColladaRoot = shouldNormalizeColladaRoot(
      meshPath,
      colladaRootNormalizationHints,
    );
    let collada: Awaited<ReturnType<ColladaLoader['loadAsync']>>;

    if (normalizeColladaRoot && typeof DOMParser === 'function') {
      const fileLoader = new THREE.FileLoader(manager);
      const text = await new Promise<string>((resolve, reject) => {
        fileLoader.load(resolvedUrl, (data) => resolve(data as string), undefined, reject);
      });
      const patchedText = text.replace(/<up_axis>\s*Z_UP\s*<\/up_axis>/g, '<up_axis>Y_UP</up_axis>');
      const baseUrl = THREE.LoaderUtils.extractUrlBase(resolvedUrl);
      collada = loader.parse(patchedText, baseUrl);
    } else {
      collada = await loader.loadAsync(resolvedUrl);
    }

    normalizeUsdRenderableMaterials(collada.scene, colorOverride || visual.color);
    expandUsdMultiMaterialMeshesForSerialization(collada.scene);
    if (normalizeColladaRoot) {
      collada.scene.rotation.set(0, 0, 0);
      collada.scene.updateMatrix();
    }
    return collada.scene;
  }

  if (lowerPath.endsWith('.gltf') || lowerPath.endsWith('.glb')) {
    const loader = new GLTFLoader(manager);
    const gltf = await loader.loadAsync(resolvedUrl);
    normalizeUsdRenderableMaterials(gltf.scene, colorOverride || visual.color);
    expandUsdMultiMaterialMeshesForSerialization(gltf.scene);
    return gltf.scene;
  }

  console.warn(`[USD export] Unsupported mesh format for: ${meshPath}`);
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
