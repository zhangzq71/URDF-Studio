import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { JointQuaternion, RobotState, UrdfJoint, UrdfLink, UrdfVisual } from '../../../types/index.ts';
import { compressMesh } from '../../../core/stl-compressor/meshCompressor.ts';
import { calculateBoundingBox } from '../../../core/stl-compressor/stlParser.ts';
import type { STLMeshData } from '../../../core/stl-compressor/types.ts';
import {
  buildColladaRootNormalizationHints,
  shouldNormalizeColladaRoot,
  type ColladaRootNormalizationHints,
} from '../../../core/loaders/colladaRootNormalization.ts';
import { normalizeTexturePathForExport } from '../../../core/parsers/meshPathUtils.ts';
import { createMatteMaterial } from '../../../core/utils/materialFactory.ts';
import { parseThreeColorWithOpacity } from '../../../core/utils/color.ts';
import { disposeMaterial, disposeObject3D } from '../../../shared/utils/three/dispose.ts';
import { computeUsdInertiaProperties } from '../../../shared/utils/inertiaUsd.ts';

const GEOMETRY_TYPES = {
  BOX: 'box',
  CYLINDER: 'cylinder',
  SPHERE: 'sphere',
  CAPSULE: 'capsule',
  MESH: 'mesh',
  NONE: 'none',
} as const;

type DescriptorRole = 'visual' | 'collision';

type AssetRegistry = {
  direct: Map<string, string>;
  lowercase: Map<string, string>;
  filenameLower: Map<string, string>;
};

type SerializedPrimitiveType = 'Cube' | 'Sphere' | 'Cylinder' | 'Capsule';

type LinkPathMaps = {
  linkPaths: Map<string, string>;
  childIdsByParent: Map<string, string[]>;
};

type UsdMaterialMetadata = {
  color?: string;
  texture?: string;
};

type UsdTextureRecord = {
  sourcePath: string;
  exportPath: string;
};

type UsdRenderableAppearance = {
  color: THREE.Color;
  opacity: number;
  texture: UsdTextureRecord | null;
};

type UsdPreviewMaterialRecord = {
  name: string;
  path: string;
  appearance: UsdRenderableAppearance;
};

type UsdSerializationContext = {
  materialByObject: WeakMap<THREE.Object3D, UsdPreviewMaterialRecord>;
  materialRecords: UsdPreviewMaterialRecord[];
};

export interface UsdMeshCompressionOptions {
  enabled: boolean;
  quality: number;
}

export interface ExportRobotToUsdOptions {
  robot: RobotState;
  exportName: string;
  assets: Record<string, string>;
  extraMeshFiles?: Map<string, Blob>;
  meshCompression?: UsdMeshCompressionOptions;
  onProgress?: (progress: {
    processedLinks: number;
    totalLinks: number;
    currentLinkName: string;
  }) => void;
}

export interface ExportRobotToUsdPayload {
  content: string;
  downloadFileName: string;
  archiveFileName: string;
  rootLayerPath: string;
  archiveFiles: Map<string, Blob>;
}

function normalizeRelativePath(path: string): string {
  const segments = path.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.join('/');
}

function stripPackagePrefix(path: string): string {
  if (!path.startsWith('package://')) return path;
  const withoutScheme = path.slice('package://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  return slashIndex >= 0 ? withoutScheme.slice(slashIndex + 1) : withoutScheme;
}

function stripBlobPrefix(path: string): string {
  if (!path.startsWith('blob:')) return path;
  const slashIndex = path.indexOf('/', 5);
  return slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
}

function normalizeMeshPathForExport(meshPath: string): string {
  const raw = String(meshPath || '').trim();
  if (!raw) return '';

  let normalized = raw.replace(/\\/g, '/');
  normalized = stripBlobPrefix(normalized);
  normalized = stripPackagePrefix(normalized);
  normalized = normalized.replace(/^[A-Za-z]:\//, '');
  normalized = normalized.replace(/^\/+/, '');
  normalized = normalized.replace(/^(\.\/)+/, '');
  normalized = normalizeRelativePath(normalized);

  const lower = normalized.toLowerCase();
  const meshDirIndex = lower.indexOf('/meshes/');
  if (meshDirIndex >= 0) {
    normalized = normalized.slice(meshDirIndex + '/meshes/'.length);
  } else if (lower.startsWith('meshes/')) {
    normalized = normalized.slice('meshes/'.length);
  } else if (lower.startsWith('mesh/')) {
    normalized = normalized.slice('mesh/'.length);
  }

  normalized = normalizeRelativePath(normalized);

  if (!normalized) {
    return raw.split(/[\\/]/).pop() || '';
  }

  return normalized;
}

function buildLookupCandidates(path: string): string[] {
  const raw = String(path || '').trim();
  if (!raw) return [];

  const slashNormalized = raw.replace(/\\/g, '/');
  const strippedPackage = stripPackagePrefix(slashNormalized);
  const strippedBlob = stripBlobPrefix(slashNormalized);
  const strippedBoth = stripPackagePrefix(strippedBlob);
  const relative = normalizeRelativePath(
    strippedBoth.replace(/^\/+/, '').replace(/^(\.\/)+/, ''),
  );
  const exportRelative = normalizeMeshPathForExport(raw);
  const filename = (exportRelative || relative || strippedBoth).split('/').pop() || '';

  const values = [
    raw,
    slashNormalized,
    strippedPackage,
    strippedBlob,
    strippedBoth,
    relative,
    exportRelative,
    filename,
    exportRelative ? `meshes/${exportRelative}` : '',
    exportRelative ? `/meshes/${exportRelative}` : '',
    filename ? `meshes/${filename}` : '',
    filename ? `/meshes/${filename}` : '',
  ];

  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function createAssetRegistry(
  assets: Record<string, string>,
  extraMeshFiles?: Map<string, Blob>,
): { registry: AssetRegistry; tempObjectUrls: string[] } {
  const registry: AssetRegistry = {
    direct: new Map(),
    lowercase: new Map(),
    filenameLower: new Map(),
  };
  const tempObjectUrls: string[] = [];

  const register = (key: string, url: string) => {
    for (const candidate of buildLookupCandidates(key)) {
      registry.direct.set(candidate, url);
      registry.lowercase.set(candidate.toLowerCase(), url);

      const filename = candidate.split('/').pop();
      if (filename) {
        registry.filenameLower.set(filename.toLowerCase(), url);
      }
    }
  };

  Object.entries(assets).forEach(([key, url]) => register(key, url));

  extraMeshFiles?.forEach((blob, key) => {
    const objectUrl = URL.createObjectURL(blob);
    tempObjectUrls.push(objectUrl);
    register(key, objectUrl);
    register(normalizeMeshPathForExport(key), objectUrl);
  });

  return { registry, tempObjectUrls };
}

function resolveAssetUrl(path: string, registry: AssetRegistry): string | null {
  if (!path) return null;
  if (/^(?:blob:|data:|https?:\/\/)/i.test(path)) {
    return path;
  }

  for (const candidate of buildLookupCandidates(path)) {
    const directMatch = registry.direct.get(candidate);
    if (directMatch) return directMatch;

    const lowerMatch = registry.lowercase.get(candidate.toLowerCase());
    if (lowerMatch) return lowerMatch;
  }

  const lowerPath = path.toLowerCase();
  for (const [candidate, url] of registry.lowercase.entries()) {
    if (candidate.endsWith(lowerPath)) {
      return url;
    }
  }

  const filename = lowerPath.split('/').pop();
  if (filename) {
    const filenameMatch = registry.filenameLower.get(filename);
    if (filenameMatch) return filenameMatch;
  }

  return null;
}

function createTextureAwareLoadingManager(registry: AssetRegistry): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => resolveAssetUrl(url, registry) ?? url);
  return manager;
}

function createBaseMaterial(color: string | undefined): THREE.MeshStandardMaterial {
  return createMatteMaterial({
    color: color || '#808080',
    side: THREE.FrontSide,
    preserveExactColor: true,
  });
}

function isMeshObject(value: unknown): value is THREE.Mesh {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as THREE.Mesh).isMesh
    && 'geometry' in (value as Record<string, unknown>),
  );
}

function isMeshStandardMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return Boolean((material as THREE.MeshStandardMaterial).isMeshStandardMaterial);
}

function isThreeColor(value: unknown): value is THREE.Color {
  return Boolean(value && typeof value === 'object' && (value as THREE.Color).isColor);
}

function convertMaterialToStandard(
  material: THREE.Material,
  fallbackColor: string | undefined,
): THREE.MeshStandardMaterial {
  if (isMeshStandardMaterial(material)) {
    const cloned = material.clone();
    cloned.side = THREE.FrontSide;
    cloned.needsUpdate = true;
    return cloned;
  }

  const nextMaterial = createBaseMaterial(fallbackColor);
  const source = material as THREE.MeshStandardMaterial & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
  };

  if (source.color) {
    nextMaterial.color.copy(source.color);
  }

  if (source.map) {
    nextMaterial.map = source.map;
  }

  nextMaterial.transparent = material.transparent || material.opacity < 1;
  nextMaterial.opacity = material.opacity ?? 1;
  nextMaterial.name = material.name;
  nextMaterial.side = THREE.FrontSide;
  nextMaterial.needsUpdate = true;

  disposeMaterial(material, false);
  return nextMaterial;
}

function normalizeRenderableMaterials(object: THREE.Object3D, fallbackColor: string | undefined): void {
  object.traverse((child) => {
    if (!isMeshObject(child)) return;

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        convertMaterialToStandard(material, fallbackColor),
      );
      return;
    }

    if (!child.material) {
      child.material = createBaseMaterial(fallbackColor);
      return;
    }

    child.material = convertMaterialToStandard(child.material, fallbackColor);
  });
}

function createUsdMaterialVariantMesh(
  mesh: THREE.Mesh,
  material: THREE.Material,
  variantIndex: number,
  materialIndex: number,
): THREE.Mesh | null {
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
    return null;
  }

  const geometry = mesh.geometry.clone();
  const filteredGroups = geometry.groups.filter((group) => (group.materialIndex ?? 0) === materialIndex);
  if (filteredGroups.length === 0) {
    geometry.dispose();
    return null;
  }

  geometry.clearGroups();
  filteredGroups.forEach((group) => {
    geometry.addGroup(group.start, group.count, 0);
  });

  const variant = new THREE.Mesh(geometry, material.clone());
  variant.name = variantIndex === 0
    ? (mesh.name || 'mesh')
    : `${mesh.name || 'mesh'}_${materialIndex}`;
  variant.position.copy(mesh.position);
  variant.quaternion.copy(mesh.quaternion);
  variant.scale.copy(mesh.scale);
  variant.rotation.order = mesh.rotation.order;
  variant.castShadow = mesh.castShadow;
  variant.receiveShadow = mesh.receiveShadow;
  variant.frustumCulled = mesh.frustumCulled;
  variant.matrixAutoUpdate = mesh.matrixAutoUpdate;
  variant.matrix.copy(mesh.matrix);
  variant.visible = mesh.visible;
  variant.renderOrder = mesh.renderOrder;
  variant.userData = {
    ...mesh.userData,
    usdSerializeFilteredGroups: true,
  };

  return variant;
}

function expandMultiMaterialMeshesForUsd(root: THREE.Object3D): void {
  const replacements: Array<{
    mesh: THREE.Mesh;
    parent: THREE.Object3D;
    insertionIndex: number;
    variants: THREE.Mesh[];
  }> = [];

  root.traverse((child) => {
    if (!isMeshObject(child) || !Array.isArray(child.material) || !child.parent) {
      return;
    }

    if (!(child.geometry instanceof THREE.BufferGeometry) || child.material.length <= 1) {
      return;
    }

    const materialIndexes = Array.from(new Set(
      child.geometry.groups.map((group) => group.materialIndex ?? 0),
    )).filter((index) => Number.isInteger(index) && index >= 0);

    if (materialIndexes.length <= 1) {
      return;
    }

    const variants = materialIndexes
      .map((materialIndex, variantIndex) => {
        const material = child.material[materialIndex];
        if (!material) {
          return null;
        }
        return createUsdMaterialVariantMesh(child, material, variantIndex, materialIndex);
      })
      .filter((variant): variant is THREE.Mesh => Boolean(variant));

    if (variants.length <= 1) {
      variants.forEach((variant) => disposeObject3D(variant, true));
      return;
    }

    replacements.push({
      mesh: child,
      parent: child.parent,
      insertionIndex: child.parent.children.indexOf(child),
      variants,
    });
  });

  replacements.forEach(({ mesh, parent, insertionIndex, variants }) => {
    parent.remove(mesh);
    variants.forEach((variant) => parent.add(variant));

    const appendedVariants = parent.children.splice(parent.children.length - variants.length, variants.length);
    parent.children.splice(Math.max(0, insertionIndex), 0, ...appendedVariants);

    disposeObject3D(mesh, true);
  });
}

function resolveLinkMaterialEntry(robot: RobotState, link: UrdfLink): UsdMaterialMetadata {
  const entry = robot.materials?.[link.id]
    || robot.materials?.[link.name]
    || {};

  return {
    color: entry.color || (entry.texture ? '#ffffff' : link.visual.color || undefined),
    texture: entry.texture || undefined,
  };
}

async function loadMeshObject(
  visual: UrdfVisual,
  registry: AssetRegistry,
  colorOverride?: string,
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null,
): Promise<THREE.Object3D | null> {
  const meshPath = String(visual.meshPath || '').trim();
  if (!meshPath) {
    return null;
  }

  const resolvedUrl = resolveAssetUrl(meshPath, registry);
  if (!resolvedUrl) {
    console.warn(`[USD export] Mesh asset not found for: ${meshPath}`);
    return null;
  }

  const manager = createTextureAwareLoadingManager(registry);
  const lowerPath = meshPath.toLowerCase();

  if (lowerPath.endsWith('.stl')) {
    const loader = new STLLoader(manager);
    const geometry = await loader.loadAsync(resolvedUrl);
    return new THREE.Mesh(geometry, createBaseMaterial(colorOverride || visual.color));
  }

  if (lowerPath.endsWith('.obj')) {
    const loader = new OBJLoader(manager);
    const object = await loader.loadAsync(resolvedUrl);
    normalizeRenderableMaterials(object, colorOverride || visual.color);
    expandMultiMaterialMeshesForUsd(object);
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
      // Go2/go2w DAE assets already encode their authored pose in the URDF
      // hierarchy, so exporting ColladaLoader's Z-up correction would
      // double-rotate the mesh in the round-tripped USD stage.
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

    normalizeRenderableMaterials(collada.scene, colorOverride || visual.color);
    expandMultiMaterialMeshesForUsd(collada.scene);
    if (normalizeColladaRoot) {
      collada.scene.rotation.set(0, 0, 0);
      collada.scene.updateMatrix();
    }
    return collada.scene;
  }

  if (lowerPath.endsWith('.gltf') || lowerPath.endsWith('.glb')) {
    const loader = new GLTFLoader(manager);
    const gltf = await loader.loadAsync(resolvedUrl);
    normalizeRenderableMaterials(gltf.scene, colorOverride || visual.color);
    expandMultiMaterialMeshesForUsd(gltf.scene);
    return gltf.scene;
  }

  console.warn(`[USD export] Unsupported mesh format for: ${meshPath}`);
  return null;
}

function getGeometryType(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function getVisualScale(visual: UrdfVisual): THREE.Vector3 {
  const type = getGeometryType(visual.type);
  if (type === GEOMETRY_TYPES.BOX) {
    return new THREE.Vector3(
      visual.dimensions.x || 1,
      visual.dimensions.y || 1,
      visual.dimensions.z || 1,
    );
  }

  if (type === GEOMETRY_TYPES.SPHERE) {
    const diameter = (visual.dimensions.x || 0.5) * 2;
    return new THREE.Vector3(diameter, diameter, diameter);
  }

  if (type === GEOMETRY_TYPES.CYLINDER || type === GEOMETRY_TYPES.CAPSULE) {
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
}

function applyVisualOrigin(object: THREE.Object3D, visual: UrdfVisual): void {
  object.position.set(
    visual.origin?.xyz?.x ?? 0,
    visual.origin?.xyz?.y ?? 0,
    visual.origin?.xyz?.z ?? 0,
  );
  object.rotation.set(
    visual.origin?.rpy?.r ?? 0,
    visual.origin?.rpy?.p ?? 0,
    visual.origin?.rpy?.y ?? 0,
    'XYZ',
  );
}

function createPrimitiveSceneNode(
  visual: UrdfVisual,
  role: DescriptorRole,
  materialState?: UsdMaterialMetadata,
): THREE.Object3D | null {
  const type = getGeometryType(visual.type);
  const primitiveType: SerializedPrimitiveType | null = type === GEOMETRY_TYPES.BOX
    ? 'Cube'
    : type === GEOMETRY_TYPES.SPHERE
      ? 'Sphere'
      : type === GEOMETRY_TYPES.CYLINDER
        ? 'Cylinder'
        : type === GEOMETRY_TYPES.CAPSULE
          ? 'Capsule'
          : null;

  if (!primitiveType) {
    return null;
  }

  const anchor = new THREE.Group();
  applyVisualOrigin(anchor, visual);
  anchor.scale.copy(getVisualScale(visual));
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
}

function applyExplicitMeshDisplayColor(root: THREE.Object3D, color: string | undefined): void {
  if (!color) {
    return;
  }

  root.traverse((child) => {
    if (!isMeshObject(child)) {
      return;
    }

    child.userData.usdDisplayColor = color;
  });
}

async function createMeshSceneNode(
  visual: UrdfVisual,
  role: DescriptorRole,
  registry: AssetRegistry,
  materialState?: UsdMaterialMetadata,
  meshCompression?: UsdMeshCompressionOptions,
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null,
): Promise<THREE.Object3D | null> {
  const object = await loadMeshObject(
    visual,
    registry,
    materialState?.color,
    colladaRootNormalizationHints,
  );
  if (!object) {
    return null;
  }

  if (meshCompression?.enabled && meshCompression.quality < 100) {
    applyMeshCompression(object, meshCompression.quality);
  }

  const anchor = new THREE.Group();
  anchor.name = role;
  applyVisualOrigin(anchor, visual);
  anchor.scale.copy(getVisualScale(visual));
  if (role === 'collision') {
    anchor.userData.usdPurpose = 'guide';
    anchor.userData.usdCollision = true;
    anchor.userData.usdMeshCollision = true;
  }

  if (role === 'collision') {
    object.traverse((child) => {
      child.userData.usdPurpose = 'guide';
      child.userData.usdCollision = true;
      child.userData.usdMeshCollision = isMeshObject(child);
    });
  }

  applyExplicitMeshDisplayColor(object, materialState?.color);

  anchor.add(object);
  return anchor;
}

async function buildVisualSceneNode(
  visual: UrdfVisual,
  role: DescriptorRole,
  registry: AssetRegistry,
  materialState?: UsdMaterialMetadata,
  meshCompression?: UsdMeshCompressionOptions,
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null,
): Promise<THREE.Object3D | null> {
  const type = getGeometryType(visual.type);
  if (type === GEOMETRY_TYPES.NONE) {
    return null;
  }

  if (type === GEOMETRY_TYPES.MESH) {
    return createMeshSceneNode(
      visual,
      role,
      registry,
      materialState,
      meshCompression,
      colladaRootNormalizationHints,
    );
  }

  return createPrimitiveSceneNode(visual, role, materialState);
}

function createGeometryCompressionMeshData(
  geometry: THREE.BufferGeometry,
): { meshData: STLMeshData; workingGeometry: THREE.BufferGeometry } | null {
  const workingGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = workingGeometry.getAttribute('position');
  if (!position || position.count < 3 || position.count % 3 !== 0) {
    workingGeometry.dispose();
    return null;
  }

  if (!workingGeometry.getAttribute('normal')) {
    workingGeometry.computeVertexNormals();
  }

  const normal = workingGeometry.getAttribute('normal');
  if (!normal || normal.count !== position.count) {
    workingGeometry.dispose();
    return null;
  }

  const vertices = new Float32Array(position.count * 3);
  const normals = new Float32Array(normal.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    vertices[offset] = position.getX(index);
    vertices[offset + 1] = position.getY(index);
    vertices[offset + 2] = position.getZ(index);
    normals[offset] = normal.getX(index);
    normals[offset + 1] = normal.getY(index);
    normals[offset + 2] = normal.getZ(index);
  }

  const triangleCount = position.count / 3;
  const fileSize = 84 + triangleCount * 50;

  return {
    meshData: {
      filename: 'usd-export-mesh.stl',
      fileSize,
      triangleCount,
      vertices,
      normals,
      boundingBox: calculateBoundingBox(vertices),
      isCompressed: false,
      originalTriangleCount: triangleCount,
      originalFileSize: fileSize,
    },
    workingGeometry,
  };
}

function simplifyGeometryForUsd(
  geometry: THREE.BufferGeometry,
  quality: number,
): THREE.BufferGeometry | null {
  const compressionInput = createGeometryCompressionMeshData(geometry);
  if (!compressionInput) {
    return null;
  }

  const { meshData, workingGeometry } = compressionInput;

  try {
    const compressed = compressMesh(meshData, quality);
    if (compressed.triangleCount >= meshData.triangleCount || compressed.vertices.length === 0) {
      return null;
    }

    const simplified = new THREE.BufferGeometry();
    simplified.setAttribute('position', new THREE.BufferAttribute(compressed.vertices.slice(), 3));
    simplified.setAttribute('normal', new THREE.BufferAttribute(compressed.normals.slice(), 3));
    simplified.computeBoundingBox();
    simplified.computeBoundingSphere();
    return simplified;
  } finally {
    workingGeometry.dispose();
  }
}

function applyMeshCompression(object: THREE.Object3D, quality: number): void {
  if (!(quality > 0 && quality < 100)) {
    return;
  }

  const simplifiedGeometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry | null>();

  object.traverse((child) => {
    if (!isMeshObject(child)) {
      return;
    }

    const originalGeometry = child.geometry;
    if (!simplifiedGeometries.has(originalGeometry)) {
      const simplified = simplifyGeometryForUsd(originalGeometry, quality);
      simplifiedGeometries.set(originalGeometry, simplified);
      if (simplified) {
        originalGeometry.dispose();
      }
    }

    const simplifiedGeometry = simplifiedGeometries.get(originalGeometry);
    if (simplifiedGeometry) {
      child.geometry = simplifiedGeometry;
    }
  });
}

function makeIndent(depth: number): string {
  return '    '.repeat(depth);
}

function formatFloat(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  const fixed = Number(normalized.toFixed(6));
  return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

function formatTuple(values: number[]): string {
  return `(${values.map((value) => formatFloat(value)).join(', ')})`;
}

function isExternalAssetPath(path: string): boolean {
  return /^(?:blob:|https?:\/\/|data:)/i.test(path);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function inferTextureExtension(texturePath: string): string {
  const dataUrlMatch = texturePath.match(/^data:image\/([a-z0-9.+-]+);/i);
  if (dataUrlMatch?.[1]) {
    const mimeSubtype = dataUrlMatch[1].toLowerCase();
    if (mimeSubtype === 'jpeg') return 'jpg';
    if (mimeSubtype.includes('svg')) return 'svg';
    if (mimeSubtype.includes('png')) return 'png';
    if (mimeSubtype.includes('webp')) return 'webp';
    if (mimeSubtype.includes('gif')) return 'gif';
    return mimeSubtype.replace(/[^a-z0-9]/g, '') || 'png';
  }

  const pathname = texturePath.split('?')[0]?.split('#')[0] ?? texturePath;
  const extension = pathname.split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : 'png';
}

function createUsdTextureRecord(texturePath: string | null | undefined): UsdTextureRecord | null {
  const sourcePath = String(texturePath || '').trim();
  if (!sourcePath) return null;

  if (!isExternalAssetPath(sourcePath)) {
    const exportPath = normalizeTexturePathForExport(sourcePath);
    return exportPath
      ? {
        sourcePath,
        exportPath,
      }
      : null;
  }

  return {
    sourcePath,
    exportPath: `external_${hashString(sourcePath)}.${inferTextureExtension(sourcePath)}`,
  };
}

function sanitizeUsdIdentifier(value: string, fallback = 'Node'): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeValue = normalized || fallback;
  return /^\d/.test(safeValue) ? `_${safeValue}` : safeValue;
}

function escapeUsdString(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function quaternionToUsdTuple(quaternion: THREE.Quaternion | JointQuaternion | null | undefined): string {
  if (!quaternion) {
    return '(1, 0, 0, 0)';
  }

  const w = 'w' in quaternion ? quaternion.w : 1;
  const x = 'x' in quaternion ? quaternion.x : 0;
  const y = 'y' in quaternion ? quaternion.y : 0;
  const z = 'z' in quaternion ? quaternion.z : 0;
  return formatTuple([w, x, y, z]);
}

function rpyToQuaternion(r: number, p: number, y: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(r, p, y, 'ZYX'));
}

function serializeTransformOps(lines: string[], depth: number, object: THREE.Object3D): void {
  const indent = makeIndent(depth);
  const opOrder: string[] = [];

  const hasTranslate = object.position.lengthSq() > 1e-12;
  if (hasTranslate) {
    lines.push(`${indent}double3 xformOp:translate = ${formatTuple([
      object.position.x,
      object.position.y,
      object.position.z,
    ])}`);
    opOrder.push('xformOp:translate');
  }

  const hasOrient = Math.abs(object.quaternion.x) > 1e-9
    || Math.abs(object.quaternion.y) > 1e-9
    || Math.abs(object.quaternion.z) > 1e-9
    || Math.abs(object.quaternion.w - 1) > 1e-9;
  if (hasOrient) {
    lines.push(`${indent}quatf xformOp:orient = ${quaternionToUsdTuple(object.quaternion)}`);
    opOrder.push('xformOp:orient');
  }

  const hasScale = Math.abs(object.scale.x - 1) > 1e-9
    || Math.abs(object.scale.y - 1) > 1e-9
    || Math.abs(object.scale.z - 1) > 1e-9;
  if (hasScale) {
    lines.push(`${indent}double3 xformOp:scale = ${formatTuple([
      object.scale.x,
      object.scale.y,
      object.scale.z,
    ])}`);
    opOrder.push('xformOp:scale');
  }

  if (opOrder.length > 0) {
    lines.push(`${indent}uniform token[] xformOpOrder = [${opOrder.map((entry) => `"${entry}"`).join(', ')}]`);
  }
}

function parseDisplayColor(value: string | null | undefined): { color: THREE.Color; opacity: number } | null {
  const parsed = parseThreeColorWithOpacity(value);
  if (!parsed) {
    return null;
  }

  return {
    color: parsed.color,
    opacity: parsed.opacity ?? 1,
  };
}

function getRenderableTextureRecord(object: THREE.Object3D): UsdTextureRecord | null {
  if (!isMeshObject(object) || !object.geometry.getAttribute('uv')) {
    return null;
  }

  const materialMetadata = object.userData?.usdMaterial as UsdMaterialMetadata | undefined;
  if (materialMetadata?.texture) {
    return createUsdTextureRecord(materialMetadata.texture);
  }

  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  if (!material || !('map' in material)) {
    return null;
  }

  const texture = material.map;
  if (!texture) {
    return null;
  }

  const candidatePath = String(
    texture.userData?.usdSourcePath
    || texture.name
    || '',
  ).trim();

  return createUsdTextureRecord(candidatePath);
}

function getRenderableAppearance(object: THREE.Object3D): UsdRenderableAppearance | null {
  const texture = getRenderableTextureRecord(object);
  const explicitColor = parseDisplayColor(object.userData?.usdDisplayColor);
  if (explicitColor) {
    return {
      color: explicitColor.color,
      opacity: explicitColor.opacity,
      texture,
    };
  }

  if (!isMeshObject(object)) {
    return null;
  }

  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  if (material && 'color' in material && isThreeColor(material.color)) {
    return {
      color: material.color,
      opacity: Number.isFinite(material.opacity) ? Math.max(0, Math.min(1, material.opacity)) : 1,
      texture,
    };
  }

  return null;
}

function getDisplayColor(object: THREE.Object3D): THREE.Color | null {
  return getRenderableAppearance(object)?.color || null;
}

function serializeDisplayColor(lines: string[], depth: number, object: THREE.Object3D): void {
  const color = getDisplayColor(object);
  if (!color) return;

  const indent = makeIndent(depth);
  lines.push(
    `${indent}color3f[] primvars:displayColor = [${formatTuple([color.r, color.g, color.b])}]`,
  );
}

function serializePrimitiveAttributes(lines: string[], depth: number, primitiveType: SerializedPrimitiveType): void {
  const indent = makeIndent(depth);

  if (primitiveType === 'Cube') {
    lines.push(`${indent}double size = 1`);
    return;
  }

  if (primitiveType === 'Sphere') {
    lines.push(`${indent}double radius = 0.5`);
    return;
  }

  if (primitiveType === 'Cylinder' || primitiveType === 'Capsule') {
    lines.push(`${indent}double radius = 0.5`);
    lines.push(`${indent}double height = 1`);
    lines.push(`${indent}uniform token axis = "Z"`);
  }
}

function collectUsdFaceVertexIndices(
  mesh: THREE.Mesh,
  geometry: THREE.BufferGeometry,
  positionCount: number,
): number[] {
  const shouldRespectGroups = Boolean(mesh.userData?.usdSerializeFilteredGroups);
  const filteredGroups = shouldRespectGroups
    ? geometry.groups.filter((group) => Number.isFinite(group.start) && Number.isFinite(group.count) && group.count > 0)
    : [];

  if (geometry.index) {
    const indexValues = Array.from(geometry.index.array, (value) => Number(value));
    if (filteredGroups.length === 0) {
      return indexValues;
    }

    const groupedIndices: number[] = [];
    filteredGroups.forEach((group) => {
      const start = Math.max(0, Math.floor(group.start));
      const end = Math.min(indexValues.length, start + Math.max(0, Math.floor(group.count)));
      for (let index = start; index < end; index += 1) {
        groupedIndices.push(indexValues[index]);
      }
    });
    return groupedIndices;
  }

  if (filteredGroups.length === 0) {
    return Array.from({ length: positionCount }, (_, value) => value);
  }

  const groupedIndices: number[] = [];
  filteredGroups.forEach((group) => {
    const start = Math.max(0, Math.floor(group.start));
    const end = Math.min(positionCount, start + Math.max(0, Math.floor(group.count)));
    for (let index = start; index < end; index += 1) {
      groupedIndices.push(index);
    }
  });
  return groupedIndices;
}

function serializeMeshGeometry(
  mesh: THREE.Mesh,
  lines: string[],
  depth: number,
): void {
  const indent = makeIndent(depth);
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) {
    return;
  }

  const points: string[] = [];
  for (let index = 0; index < position.count; index += 1) {
    points.push(
      formatTuple([
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ]),
    );
  }

  const indexValues = collectUsdFaceVertexIndices(mesh, geometry, position.count);

  const faceVertexCounts: number[] = [];
  const faceVertexIndices: number[] = [];
  for (let index = 0; index < indexValues.length; index += 3) {
    if (index + 2 >= indexValues.length) break;
    faceVertexCounts.push(3);
    faceVertexIndices.push(indexValues[index], indexValues[index + 1], indexValues[index + 2]);
  }

  lines.push(`${indent}int[] faceVertexCounts = [${faceVertexCounts.join(', ')}]`);
  lines.push(`${indent}int[] faceVertexIndices = [${faceVertexIndices.join(', ')}]`);
  lines.push(`${indent}point3f[] points = [${points.join(', ')}]`);

  const uv = geometry.getAttribute('uv');
  if (uv && uv.count > 0) {
    const stValues = faceVertexIndices
      .filter((index) => index >= 0 && index < uv.count)
      .map((index) => formatTuple([
        uv.getX(index),
        uv.getY(index),
      ]));

    if (stValues.length === faceVertexIndices.length && stValues.length > 0) {
      lines.push(`${indent}texCoord2f[] primvars:st = [${stValues.join(', ')}]`);
      lines.push(`${indent}uniform token primvars:st:interpolation = "faceVarying"`);
    }
  }

  lines.push(`${indent}uniform token subdivisionScheme = "none"`);
}

function applyUsdMaterialMetadata(
  node: THREE.Object3D,
  materialState: UsdMaterialMetadata,
): void {
  node.userData.usdMaterial = materialState;

  node.traverse((child) => {
    if (child === node) return;
    if (!(child.userData.usdGeomType || isMeshObject(child))) {
      return;
    }

    child.userData.usdMaterial = materialState;
  });
}

function serializeCustomMetadata(lines: string[], depth: number, object: THREE.Object3D): void {
  const indent = makeIndent(depth);
  const linkMetadata = object.userData.usdLink as { id: string; name: string } | undefined;
  if (linkMetadata) {
    lines.push(`${indent}custom string urdf:linkId = "${escapeUsdString(linkMetadata.id)}"`);
    lines.push(`${indent}custom string urdf:linkName = "${escapeUsdString(linkMetadata.name)}"`);
  }

  const materialMetadata = object.userData.usdMaterial as UsdMaterialMetadata | undefined;
  if (materialMetadata?.color) {
    lines.push(`${indent}custom string urdf:materialColor = "${escapeUsdString(materialMetadata.color)}"`);
  }
  if (materialMetadata?.texture) {
    lines.push(`${indent}custom string urdf:materialTexture = "${escapeUsdString(materialMetadata.texture)}"`);
  }
}

function createUsdMaterialSignature(appearance: UsdRenderableAppearance): string {
  return [
    appearance.color.r.toFixed(6),
    appearance.color.g.toFixed(6),
    appearance.color.b.toFixed(6),
    appearance.opacity.toFixed(6),
    appearance.texture?.exportPath || '',
  ].join(':');
}

function collectUsdPreviewMaterials(sceneRoot: THREE.Object3D): UsdSerializationContext {
  const rootPrimName = sanitizeUsdIdentifier(sceneRoot.name || 'Robot');
  const materialByObject = new WeakMap<THREE.Object3D, UsdPreviewMaterialRecord>();
  const materialBySignature = new Map<string, UsdPreviewMaterialRecord>();
  const materialRecords: UsdPreviewMaterialRecord[] = [];

  sceneRoot.traverse((object) => {
    if (!(object.userData.usdGeomType || isMeshObject(object))) {
      return;
    }

    const appearance = getRenderableAppearance(object);
    if (!appearance) {
      return;
    }

    const signature = createUsdMaterialSignature(appearance);
    let record = materialBySignature.get(signature);
    if (!record) {
      const name = `Material_${materialRecords.length}`;
      record = {
        name,
        path: `/${rootPrimName}/Looks/${name}`,
        appearance: {
          color: appearance.color.clone(),
          opacity: appearance.opacity,
          texture: appearance.texture
            ? {
              sourcePath: appearance.texture.sourcePath,
              exportPath: appearance.texture.exportPath,
            }
            : null,
        },
      };
      materialBySignature.set(signature, record);
      materialRecords.push(record);
    }

    materialByObject.set(object, record);
  });

  return {
    materialByObject,
    materialRecords,
  };
}

function serializeUsdPreviewMaterials(
  lines: string[],
  depth: number,
  context: UsdSerializationContext,
): void {
  if (context.materialRecords.length === 0) {
    return;
  }

  const indent = makeIndent(depth);
  const childIndent = makeIndent(depth + 1);
  const grandchildIndent = makeIndent(depth + 2);

  lines.push(`${indent}def Scope "Looks"`);
  lines.push(`${indent}{`);

  context.materialRecords.forEach((record) => {
    lines.push(`${childIndent}def Material "${record.name}"`);
    lines.push(`${childIndent}{`);
    lines.push(`${grandchildIndent}token outputs:surface.connect = <${record.path}/PreviewSurface.outputs:surface>`);
    lines.push(`${grandchildIndent}def Shader "PreviewSurface"`);
    lines.push(`${grandchildIndent}{`);
    lines.push(`${makeIndent(depth + 3)}uniform token info:id = "UsdPreviewSurface"`);
    if (record.appearance.texture) {
      lines.push(
        `${makeIndent(depth + 3)}color3f inputs:diffuseColor.connect = <${record.path}/DiffuseTexture.outputs:rgb>`,
      );
    } else {
      lines.push(
        `${makeIndent(depth + 3)}color3f inputs:diffuseColor = ${formatTuple([
          record.appearance.color.r,
          record.appearance.color.g,
          record.appearance.color.b,
        ])}`,
      );
    }
    lines.push(`${makeIndent(depth + 3)}float inputs:metallic = 0`);
    lines.push(`${makeIndent(depth + 3)}float inputs:roughness = 1`);
    lines.push(`${makeIndent(depth + 3)}float inputs:opacity = ${formatFloat(record.appearance.opacity)}`);
    lines.push(`${makeIndent(depth + 3)}token outputs:surface`);
    lines.push(`${grandchildIndent}}`);

    if (record.appearance.texture) {
      lines.push(`${grandchildIndent}def Shader "PrimvarReader_st"`);
      lines.push(`${grandchildIndent}{`);
      lines.push(`${makeIndent(depth + 3)}uniform token info:id = "UsdPrimvarReader_float2"`);
      lines.push(`${makeIndent(depth + 3)}token inputs:varname = "st"`);
      lines.push(`${makeIndent(depth + 3)}float2 outputs:result`);
      lines.push(`${grandchildIndent}}`);

      lines.push(`${grandchildIndent}def Shader "DiffuseTexture"`);
      lines.push(`${grandchildIndent}{`);
      lines.push(`${makeIndent(depth + 3)}uniform token info:id = "UsdUVTexture"`);
      lines.push(`${makeIndent(depth + 3)}asset inputs:file = @../assets/${record.appearance.texture.exportPath}@`);
      lines.push(
        `${makeIndent(depth + 3)}float2 inputs:st.connect = <${record.path}/PrimvarReader_st.outputs:result>`,
      );
      lines.push(
        `${makeIndent(depth + 3)}float4 inputs:fallback = ${formatTuple([
          record.appearance.color.r,
          record.appearance.color.g,
          record.appearance.color.b,
          record.appearance.opacity,
        ])}`,
      );
      lines.push(`${makeIndent(depth + 3)}token inputs:sourceColorSpace = "sRGB"`);
      lines.push(`${makeIndent(depth + 3)}float3 outputs:rgb`);
      lines.push(`${grandchildIndent}}`);
    }

    lines.push(`${childIndent}}`);
  });

  lines.push(`${indent}}`);
}

function serializeMaterialBinding(
  lines: string[],
  depth: number,
  object: THREE.Object3D,
  context: UsdSerializationContext,
): void {
  const materialRecord = context.materialByObject.get(object);
  if (!materialRecord) {
    return;
  }

  lines.push(`${makeIndent(depth)}rel material:binding = <${materialRecord.path}>`);
}

function serializeSceneNode(
  object: THREE.Object3D,
  depth: number,
  lines: string[],
  context: UsdSerializationContext,
  forcedName?: string,
): void {
  const indent = makeIndent(depth);
  const childIndent = makeIndent(depth + 1);
  const primitiveType = object.userData.usdGeomType as SerializedPrimitiveType | undefined;
  const name = sanitizeUsdIdentifier(forcedName || object.name || primitiveType || 'Node');
  const typeName = primitiveType || (isMeshObject(object) ? 'Mesh' : 'Xform');
  const materialRecord = context.materialByObject.get(object);

  if (materialRecord) {
    lines.push(`${indent}def ${typeName} "${name}" (`);
    lines.push(`${childIndent}prepend apiSchemas = ["MaterialBindingAPI"]`);
    lines.push(`${indent})`);
  } else {
    lines.push(`${indent}def ${typeName} "${name}"`);
  }
  lines.push(`${indent}{`);

  const childDepth = depth + 1;

  serializeTransformOps(lines, childDepth, object);
  serializeCustomMetadata(lines, childDepth, object);

  if (object.userData?.usdPurpose === 'guide') {
    lines.push(`${childIndent}uniform token purpose = "guide"`);
  }

  if (primitiveType) {
    serializePrimitiveAttributes(lines, childDepth, primitiveType);
    serializeDisplayColor(lines, childDepth, object);
    serializeMaterialBinding(lines, childDepth, object, context);
  } else if (isMeshObject(object)) {
    serializeMeshGeometry(object, lines, childDepth);
    serializeDisplayColor(lines, childDepth, object);
    serializeMaterialBinding(lines, childDepth, object, context);
  }

  if (depth === 0) {
    serializeUsdPreviewMaterials(lines, childDepth, context);
  }

  const usedNames = new Set<string>();
  if (depth === 0 && context.materialRecords.length > 0) {
    usedNames.add('Looks');
  }
  object.children.forEach((child, index) => {
    const baseChildName = sanitizeUsdIdentifier(child.name || `child_${index}`);
    let childName = baseChildName;
    let duplicateCount = 1;
    while (usedNames.has(childName)) {
      childName = `${baseChildName}_${duplicateCount}`;
      duplicateCount += 1;
    }
    usedNames.add(childName);
    serializeSceneNode(child, childDepth, lines, context, childName);
  });

  lines.push(`${indent}}`);
}

function createIdentityBlob(content: string): Blob {
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}

function getAxisToken(axis: THREE.Vector3 | UrdfJoint['axis'] | undefined): 'X' | 'Y' | 'Z' {
  const vector = axis
    ? new THREE.Vector3(axis.x ?? 0, axis.y ?? 0, axis.z ?? 0)
    : new THREE.Vector3(1, 0, 0);

  if (vector.lengthSq() <= 1e-12) {
    return 'X';
  }

  const abs = {
    x: Math.abs(vector.x),
    y: Math.abs(vector.y),
    z: Math.abs(vector.z),
  };

  if (abs.y >= abs.x && abs.y >= abs.z) return 'Y';
  if (abs.z >= abs.x && abs.z >= abs.y) return 'Z';
  return 'X';
}

function jointTypeToUsdType(joint: UrdfJoint): 'PhysicsFixedJoint' | 'PhysicsRevoluteJoint' | 'PhysicsPrismaticJoint' {
  const type = String(joint.type || '').toLowerCase();
  if (type === 'revolute' || type === 'continuous') {
    return 'PhysicsRevoluteJoint';
  }
  if (type === 'prismatic') {
    return 'PhysicsPrismaticJoint';
  }
  return 'PhysicsFixedJoint';
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function serializePrimSpecWithMetadata(
  lines: string[],
  depth: number,
  primSpec: string,
  metadata: string[] = [],
): void {
  const indent = makeIndent(depth);
  if (metadata.length === 0) {
    lines.push(`${indent}${primSpec}`);
    return;
  }

  lines.push(`${indent}${primSpec} (`);
  metadata.forEach((entry) => {
    lines.push(`${makeIndent(depth + 1)}${entry}`);
  });
  lines.push(`${indent})`);
}

function serializeJointDefinition(
  joint: UrdfJoint,
  linkPaths: Map<string, string>,
  lines: string[],
  depth: number,
): void {
  const indent = makeIndent(depth);
  const childIndent = makeIndent(depth + 1);
  const typeName = jointTypeToUsdType(joint);
  const parentPath = linkPaths.get(joint.parentLinkId);
  const childPath = linkPaths.get(joint.childLinkId);

  if (!parentPath || !childPath) {
    return;
  }

  serializePrimSpecWithMetadata(
    lines,
    depth,
    `def ${typeName} "${sanitizeUsdIdentifier(joint.id || joint.name || 'joint')}"`,
  );
  lines.push(`${indent}{`);
  lines.push(`${childIndent}rel physics:body0 = <${parentPath}>`);
  lines.push(`${childIndent}rel physics:body1 = <${childPath}>`);

  if (typeName !== 'PhysicsFixedJoint') {
    lines.push(`${childIndent}uniform token physics:axis = "${getAxisToken(joint.axis)}"`);
  }
  lines.push(`${childIndent}custom float3 urdf:axisLocal = ${formatTuple([
    joint.axis?.x ?? 1,
    joint.axis?.y ?? 0,
    joint.axis?.z ?? 0,
  ])}`);

  if (typeName === 'PhysicsRevoluteJoint' && String(joint.type || '').toLowerCase() !== 'continuous' && joint.limit) {
    lines.push(`${childIndent}float physics:lowerLimit = ${formatFloat(radiansToDegrees(joint.limit.lower))}`);
    lines.push(`${childIndent}float physics:upperLimit = ${formatFloat(radiansToDegrees(joint.limit.upper))}`);
  } else if (typeName === 'PhysicsPrismaticJoint' && joint.limit) {
    lines.push(`${childIndent}float physics:lowerLimit = ${formatFloat(joint.limit.lower)}`);
    lines.push(`${childIndent}float physics:upperLimit = ${formatFloat(joint.limit.upper)}`);
  }

  lines.push(`${childIndent}point3f physics:localPos0 = ${formatTuple([
    joint.origin?.xyz?.x ?? 0,
    joint.origin?.xyz?.y ?? 0,
    joint.origin?.xyz?.z ?? 0,
  ])}`);
  const originQuaternion = rpyToQuaternion(
    joint.origin?.rpy?.r ?? 0,
    joint.origin?.rpy?.p ?? 0,
    joint.origin?.rpy?.y ?? 0,
  );
  lines.push(`${childIndent}custom point3f urdf:originXyz = ${formatTuple([
    joint.origin?.xyz?.x ?? 0,
    joint.origin?.xyz?.y ?? 0,
    joint.origin?.xyz?.z ?? 0,
  ])}`);
  lines.push(`${childIndent}custom quatf urdf:originQuatWxyz = ${quaternionToUsdTuple(originQuaternion)}`);
  lines.push(`${childIndent}quatf physics:localRot0 = ${quaternionToUsdTuple(originQuaternion)}`);
  lines.push(`${childIndent}point3f physics:localPos1 = (0, 0, 0)`);
  lines.push(`${childIndent}quatf physics:localRot1 = (1, 0, 0, 0)`);
  lines.push(`${indent}}`);
}

function serializeCollisionOverrides(
  link: UrdfLink,
  lines: string[],
  depth: number,
): void {
  const collisionVisuals = [
    ...(getGeometryType(link.collision?.type) !== GEOMETRY_TYPES.NONE ? [link.collision] : []),
    ...((link.collisionBodies || []).filter((body) => getGeometryType(body.type) !== GEOMETRY_TYPES.NONE)),
  ];

  if (collisionVisuals.length === 0) {
    return;
  }

  const indent = makeIndent(depth);
  lines.push(`${indent}over "collisions"`);
  lines.push(`${indent}{`);

  collisionVisuals.forEach((visual, index) => {
    const childIndent = makeIndent(depth + 1);
    const apiSchemas = getGeometryType(visual.type) === GEOMETRY_TYPES.MESH
      ? '"PhysicsCollisionAPI", "PhysicsMeshCollisionAPI"'
      : '"PhysicsCollisionAPI"';

    serializePrimSpecWithMetadata(
      lines,
      depth + 1,
      `over "collision_${index}"`,
      [`prepend apiSchemas = [${apiSchemas}]`],
    );
    lines.push(`${childIndent}{`);
    lines.push(`${makeIndent(depth + 2)}bool physics:collisionEnabled = true`);
    if (getGeometryType(visual.type) === GEOMETRY_TYPES.MESH) {
      lines.push(`${makeIndent(depth + 2)}uniform token physics:approximation = "convexHull"`);
    }
    lines.push(`${childIndent}}`);
  });

  lines.push(`${indent}}`);
}

function serializeLinkPhysicsOverrides(
  robot: RobotState,
  linkId: string,
  childIdsByParent: Map<string, string[]>,
  lines: string[],
  depth: number,
): void {
  const link = robot.links[linkId];
  if (!link) return;

  const indent = makeIndent(depth);
  const childIndent = makeIndent(depth + 1);
  const apiSchemas = link.inertial
    ? '"PhysicsRigidBodyAPI", "PhysicsMassAPI"'
    : '"PhysicsRigidBodyAPI"';

  serializePrimSpecWithMetadata(
    lines,
    depth,
    `over "${sanitizeUsdIdentifier(linkId)}"`,
    [`prepend apiSchemas = [${apiSchemas}]`],
  );
  lines.push(`${indent}{`);

  if (link.inertial) {
    const usdInertia = computeUsdInertiaProperties(link.inertial);
    lines.push(`${childIndent}float physics:mass = ${formatFloat(link.inertial.mass)}`);
    lines.push(`${childIndent}float3 physics:centerOfMass = ${formatTuple([
      link.inertial.origin?.xyz?.x ?? 0,
      link.inertial.origin?.xyz?.y ?? 0,
      link.inertial.origin?.xyz?.z ?? 0,
    ])}`);
    lines.push(`${childIndent}float3 physics:diagonalInertia = ${formatTuple([
      usdInertia?.diagonalInertia[0] ?? 0,
      usdInertia?.diagonalInertia[1] ?? 0,
      usdInertia?.diagonalInertia[2] ?? 0,
    ])}`);
    lines.push(`${childIndent}quatf physics:principalAxes = ${quaternionToUsdTuple(usdInertia?.principalAxesLocal)}`);
  }

  serializeCollisionOverrides(link, lines, depth + 1);

  (childIdsByParent.get(linkId) || []).forEach((childLinkId) => {
    serializeLinkPhysicsOverrides(robot, childLinkId, childIdsByParent, lines, depth + 1);
  });

  lines.push(`${indent}}`);
}

function buildLinkPathMaps(robot: RobotState, rootPrimName: string): LinkPathMaps {
  const childIdsByParent = new Map<string, string[]>();
  Object.values(robot.joints).forEach((joint) => {
    const children = childIdsByParent.get(joint.parentLinkId) || [];
    children.push(joint.childLinkId);
    childIdsByParent.set(joint.parentLinkId, children);
  });

  const linkPaths = new Map<string, string>();
  const visit = (linkId: string, parentPath: string) => {
    const path = `${parentPath}/${sanitizeUsdIdentifier(linkId)}`;
    linkPaths.set(linkId, path);
    (childIdsByParent.get(linkId) || []).forEach((childLinkId) => visit(childLinkId, path));
  };

  visit(robot.rootLinkId, `/${rootPrimName}`);

  return { linkPaths, childIdsByParent };
}

function createJointLocalMatrix(joint: UrdfJoint): THREE.Matrix4 {
  const originPosition = new THREE.Vector3(
    joint.origin?.xyz?.x ?? 0,
    joint.origin?.xyz?.y ?? 0,
    joint.origin?.xyz?.z ?? 0,
  );
  const originQuaternion = rpyToQuaternion(
    joint.origin?.rpy?.r ?? 0,
    joint.origin?.rpy?.p ?? 0,
    joint.origin?.rpy?.y ?? 0,
  );

  const originMatrix = new THREE.Matrix4().compose(
    originPosition,
    originQuaternion,
    new THREE.Vector3(1, 1, 1),
  );

  const motionMatrix = new THREE.Matrix4();
  const axis = new THREE.Vector3(
    joint.axis?.x ?? 1,
    joint.axis?.y ?? 0,
    joint.axis?.z ?? 0,
  );
  if (axis.lengthSq() <= 1e-12) {
    axis.set(1, 0, 0);
  } else {
    axis.normalize();
  }

  const jointType = String(joint.type || '').toLowerCase();
  if (jointType === 'revolute' || jointType === 'continuous') {
    motionMatrix.makeRotationAxis(axis, typeof joint.angle === 'number' ? joint.angle : 0);
  } else if (jointType === 'prismatic') {
    motionMatrix.makeTranslation(
      axis.x * (typeof joint.angle === 'number' ? joint.angle : 0),
      axis.y * (typeof joint.angle === 'number' ? joint.angle : 0),
      axis.z * (typeof joint.angle === 'number' ? joint.angle : 0),
    );
  } else if ((jointType === 'ball' || jointType === 'floating') && joint.quaternion) {
    motionMatrix.makeRotationFromQuaternion(new THREE.Quaternion(
      joint.quaternion.x,
      joint.quaternion.y,
      joint.quaternion.z,
      joint.quaternion.w,
    ));
  } else {
    motionMatrix.identity();
  }

  return originMatrix.multiply(motionMatrix);
}

function getPrimaryVisuals(link: UrdfLink): UrdfVisual[] {
  return getGeometryType(link.visual?.type) === GEOMETRY_TYPES.NONE ? [] : [link.visual];
}

function getCollisionVisuals(link: UrdfLink): UrdfVisual[] {
  return [
    ...(getGeometryType(link.collision?.type) === GEOMETRY_TYPES.NONE ? [] : [link.collision]),
    ...((link.collisionBodies || []).filter((body) => getGeometryType(body.type) !== GEOMETRY_TYPES.NONE)),
  ];
}

async function buildLinkSceneNode(
  robot: RobotState,
  linkId: string,
  childIdsByParent: Map<string, string[]>,
  jointsByChild: Map<string, UrdfJoint>,
  registry: AssetRegistry,
  meshCompression?: UsdMeshCompressionOptions,
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null,
  onLinkVisit?: (link: UrdfLink) => void,
): Promise<THREE.Group> {
  const link = robot.links[linkId];
  const group = new THREE.Group();
  group.name = sanitizeUsdIdentifier(linkId);

  if (!link) {
    return group;
  }

  group.userData.usdLink = {
    id: link.id,
    name: link.name,
  };
  onLinkVisit?.(link);

  const visuals = getPrimaryVisuals(link);
  if (visuals.length > 0) {
    const visualsScope = new THREE.Group();
    visualsScope.name = 'visuals';
    const materialState = resolveLinkMaterialEntry(robot, link);

    for (const [index, visual] of visuals.entries()) {
      const visualNode = await buildVisualSceneNode(
        visual,
        'visual',
        registry,
        materialState,
        meshCompression,
        colladaRootNormalizationHints,
      );
      if (!visualNode) continue;
      visualNode.name = `visual_${index}`;
      if (materialState.color || materialState.texture) {
        applyUsdMaterialMetadata(visualNode, materialState);
      }
      visualsScope.add(visualNode);
    }

    if (visualsScope.children.length > 0) {
      group.add(visualsScope);
    }
  }

  const collisions = getCollisionVisuals(link);
  if (collisions.length > 0) {
    const collidersScope = new THREE.Group();
    collidersScope.name = 'collisions';

    for (const [index, collision] of collisions.entries()) {
      const collisionNode = await buildVisualSceneNode(
        collision,
        'collision',
        registry,
        undefined,
        meshCompression,
        colladaRootNormalizationHints,
      );
      if (!collisionNode) continue;
      collisionNode.name = `collision_${index}`;
      collisionNode.userData.usdPurpose = 'guide';
      collisionNode.userData.usdCollision = true;
      if (getGeometryType(collision.type) === GEOMETRY_TYPES.MESH) {
        collisionNode.userData.usdMeshCollision = true;
      }
      collidersScope.add(collisionNode);
    }

    if (collidersScope.children.length > 0) {
      group.add(collidersScope);
    }
  }

  for (const childLinkId of childIdsByParent.get(linkId) || []) {
    const childNode = await buildLinkSceneNode(
      robot,
      childLinkId,
      childIdsByParent,
      jointsByChild,
      registry,
      meshCompression,
      colladaRootNormalizationHints,
      onLinkVisit,
    );

    const joint = jointsByChild.get(childLinkId);
    if (joint) {
      const jointMatrix = createJointLocalMatrix(joint);
      jointMatrix.decompose(childNode.position, childNode.quaternion, childNode.scale);
    }

    group.add(childNode);
  }

  return group;
}

function buildBaseLayerContent(sceneRoot: THREE.Object3D): string {
  const rootPrimName = sanitizeUsdIdentifier(sceneRoot.name || 'Robot');
  const serializationContext = collectUsdPreviewMaterials(sceneRoot);
  const lines = [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    upAxis = "Z"',
    '    metersPerUnit = 1',
    ')',
    '',
  ];

  serializeSceneNode(sceneRoot, 0, lines, serializationContext);
  return `${lines.join('\n')}\n`;
}

function buildPhysicsLayerContent(
  robot: RobotState,
  pathMaps: LinkPathMaps,
  rootPrimName: string,
  configStem: string,
): string {
  const lines = [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    metersPerUnit = 1',
    '    subLayers = [',
    `        @${configStem}_base.usd@`,
    '    ]',
    '    upAxis = "Z"',
    ')',
    '',
  ];

  lines.push('def PhysicsScene "physicsScene"');
  lines.push('{');
  lines.push('    vector3f physics:gravityDirection = (0, 0, -1)');
  lines.push('    float physics:gravityMagnitude = 9.81');
  lines.push('}');
  lines.push('');

  serializePrimSpecWithMetadata(
    lines,
    0,
    `over "${rootPrimName}"`,
    ['prepend apiSchemas = ["PhysicsArticulationRootAPI"]'],
  );
  lines.push('{');

  serializeLinkPhysicsOverrides(robot, robot.rootLinkId, pathMaps.childIdsByParent, lines, 1);

  lines.push('');
  lines.push('    over "joints"');
  lines.push('    {');

  Object.values(robot.joints).forEach((joint) => {
    serializeJointDefinition(joint, pathMaps.linkPaths, lines, 2);
  });

  lines.push('    }');
  lines.push('}');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildSensorLayerContent(rootPrimName: string): string {
  return [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    metersPerUnit = 1',
    '    upAxis = "Z"',
    ')',
    '',
    `def Xform "${rootPrimName}"`,
    '{',
    '}',
    '',
  ].join('\n');
}

function buildRootLayerContent(rootPrimName: string, configStem: string): string {
  return [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    upAxis = "Z"',
    '    metersPerUnit = 1',
    ')',
    '',
    `def Xform "${rootPrimName}" (`,
    '    variants = {',
    '        string Physics = "PhysX"',
    '        string Sensor = "Sensors"',
    '    }',
    '    prepend variantSets = ["Physics", "Sensor"]',
    ')',
    '{',
    '    quatd xformOp:orient = (1, 0, 0, 0)',
    '    double3 xformOp:scale = (1, 1, 1)',
    '    double3 xformOp:translate = (0, 0, 0)',
    '    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]',
    '    variantSet "Physics" = {',
    '        "None" (',
    `            prepend references = @configuration/${configStem}_base.usd@`,
    '        ) {',
    '            over "joints" (',
    '                active = false',
    '            )',
    '            {',
    '            }',
    '',
    '        }',
    '        "PhysX" (',
    `            prepend payload = @configuration/${configStem}_physics.usd@`,
    '        ) {',
    '',
    '        }',
    '    }',
    '    variantSet "Sensor" = {',
    '        "None" {',
    '',
    '        }',
    '        "Sensors" (',
    `            prepend payload = @configuration/${configStem}_sensor.usd@`,
    '        ) {',
    '',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}

function createArchiveFiles(
  exportName: string,
  rootLayerContent: string,
  baseLayerContent: string,
  physicsLayerContent: string,
  sensorLayerContent: string,
  assetFiles: Map<string, Blob> = new Map(),
): {
  archiveFileName: string;
  rootLayerPath: string;
  archiveFiles: Map<string, Blob>;
} {
  const packageRoot = sanitizeUsdIdentifier(exportName || 'robot');
  const configStemBase = `${packageRoot}${packageRoot.includes('description') ? '' : '_description'}`;
  const usdRoot = `${packageRoot}/usd`;
  const configurationRoot = `${usdRoot}/configuration`;
  const rootLayerPath = `${usdRoot}/${packageRoot}.usd`;

  return {
    archiveFileName: `${packageRoot}_usd.zip`,
    rootLayerPath,
    archiveFiles: new Map<string, Blob>([
      [rootLayerPath, createIdentityBlob(rootLayerContent)],
      [`${configurationRoot}/${configStemBase}_base.usd`, createIdentityBlob(baseLayerContent)],
      [`${configurationRoot}/${configStemBase}_physics.usd`, createIdentityBlob(physicsLayerContent)],
      [`${configurationRoot}/${configStemBase}_sensor.usd`, createIdentityBlob(sensorLayerContent)],
      ...Array.from(assetFiles.entries()).map(([relativePath, blob]) => [`${usdRoot}/${relativePath}`, blob] as const),
    ]),
  };
}

async function collectUsdAssetFiles(
  sceneRoot: THREE.Object3D,
  context: UsdSerializationContext,
  registry: AssetRegistry,
): Promise<Map<string, Blob>> {
  const textureFiles = new Map<string, string>();

  context.materialRecords.forEach((record) => {
    const texture = record.appearance.texture;
    if (!texture) return;
    textureFiles.set(texture.exportPath, texture.sourcePath);
  });

  sceneRoot.traverse((object) => {
    const materialMetadata = object.userData?.usdMaterial as UsdMaterialMetadata | undefined;
    if (!materialMetadata?.texture) {
      return;
    }

    const texture = createUsdTextureRecord(materialMetadata.texture);
    if (!texture) {
      return;
    }

    textureFiles.set(texture.exportPath, texture.sourcePath);
  });

  const archiveFiles = new Map<string, Blob>();

  await Promise.all(Array.from(textureFiles.entries()).map(async ([exportPath, sourcePath]) => {
    const resolvedUrl = resolveAssetUrl(sourcePath, registry);
    if (!resolvedUrl) {
      console.warn(`[USD export] Texture asset not found for: ${sourcePath}`);
      return;
    }

    try {
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      archiveFiles.set(`assets/${exportPath}`, await response.blob());
    } catch (error) {
      console.error(`[USD export] Failed to load texture ${sourcePath}`, error);
    }
  }));

  return archiveFiles;
}

export async function exportRobotToUsd({
  robot,
  exportName,
  assets,
  extraMeshFiles,
  meshCompression,
  onProgress,
}: ExportRobotToUsdOptions): Promise<ExportRobotToUsdPayload> {
  const normalizedExportName = sanitizeUsdIdentifier(exportName || robot.name || 'robot');
  const configStem = `${normalizedExportName}${normalizedExportName.includes('description') ? '' : '_description'}`;
  const rootPrimName = configStem;
  const { registry, tempObjectUrls } = createAssetRegistry(assets, extraMeshFiles);
  const colladaRootNormalizationHints = buildColladaRootNormalizationHints(robot.links);

  const jointsByChild = new Map<string, UrdfJoint>();
  Object.values(robot.joints).forEach((joint) => {
    jointsByChild.set(joint.childLinkId, joint);
  });

  const pathMaps = buildLinkPathMaps(robot, rootPrimName);

  const sceneRoot = new THREE.Group();
  sceneRoot.name = rootPrimName;
  const totalLinks = Math.max(1, Object.keys(robot.links).length);
  let processedLinks = 0;

  try {
    const linkRoot = await buildLinkSceneNode(
      robot,
      robot.rootLinkId,
      pathMaps.childIdsByParent,
      jointsByChild,
      registry,
      meshCompression,
      colladaRootNormalizationHints,
      (link) => {
        processedLinks += 1;
        onProgress?.({
          processedLinks,
          totalLinks,
          currentLinkName: String(link.name || link.id || '').trim() || 'link',
        });
      },
    );
    sceneRoot.add(linkRoot);
    sceneRoot.updateMatrixWorld(true);

    const rootLayerContent = buildRootLayerContent(rootPrimName, configStem);
    const baseLayerContent = buildBaseLayerContent(sceneRoot);
    const physicsLayerContent = buildPhysicsLayerContent(robot, pathMaps, rootPrimName, configStem);
    const sensorLayerContent = buildSensorLayerContent(rootPrimName);
    const usdContext = collectUsdPreviewMaterials(sceneRoot);
    const usdAssetFiles = await collectUsdAssetFiles(sceneRoot, usdContext, registry);

    const archive = createArchiveFiles(
      normalizedExportName,
      rootLayerContent,
      baseLayerContent,
      physicsLayerContent,
      sensorLayerContent,
      usdAssetFiles,
    );

    return {
      content: rootLayerContent,
      downloadFileName: `${normalizedExportName}.usd`,
      archiveFileName: archive.archiveFileName,
      rootLayerPath: archive.rootLayerPath,
      archiveFiles: archive.archiveFiles,
    };
  } finally {
    disposeObject3D(sceneRoot);
    tempObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
