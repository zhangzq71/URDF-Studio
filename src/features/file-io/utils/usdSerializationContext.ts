import * as THREE from 'three';

import { normalizeTexturePathForExport } from '@/core/parsers/meshPathUtils.ts';
import { parseThreeColorWithOpacity } from '@/core/utils/color.ts';

import { type UsdMaterialMetadata } from './usdSceneNodeFactory.ts';
import { isUsdMeshObject } from './usdMaterialNormalization.ts';
import {
  normalizeUsdProgressLabel,
  yieldPeriodically,
} from './usdProgress.ts';

export type UsdTextureRecord = {
  sourcePath: string;
  exportPath: string;
};

export type UsdRenderableAppearance = {
  color: THREE.Color;
  opacity: number;
  texture: UsdTextureRecord | null;
};

export type UsdPreviewMaterialRecord = {
  name: string;
  path: string;
  appearance: UsdRenderableAppearance;
};

export type UsdNumericAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export type UsdMeshGeometryData = {
  triangleCount: number;
  faceVertexIndices: number[];
  positions: UsdNumericAttribute;
  uvAttribute: UsdNumericAttribute | null;
  signature: string;
};

export type UsdMeshGeometryRecord = {
  name: string;
  path: string;
  data: UsdMeshGeometryData;
};

export type UsdSerializationContext = {
  materialByObject: WeakMap<THREE.Object3D, UsdPreviewMaterialRecord>;
  materialRecords: UsdPreviewMaterialRecord[];
  geometryByObject: WeakMap<THREE.Object3D, UsdMeshGeometryRecord>;
  geometryRecords: UsdMeshGeometryRecord[];
};

export type UsdSerializationContextProgress = {
  phase: 'geometry';
  completed: number;
  total: number;
  label?: string;
};

type CollectUsdSerializationContextOptions = {
  onProgress?: (progress: UsdSerializationContextProgress) => void;
  rootPrimName?: string;
  objectYieldInterval?: number;
  vertexYieldInterval?: number;
};

const DEFAULT_OBJECT_YIELD_INTERVAL = 8;
const DEFAULT_VERTEX_YIELD_INTERVAL = 4096;

const isExternalAssetPath = (path: string): boolean => {
  return /^(?:blob:|https?:\/\/|data:)/i.test(path);
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const hashGeometryNumber = (hash: number, value: number): number => {
  const normalized = Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
  hash ^= normalized >>> 0;
  return Math.imul(hash, 16777619) >>> 0;
};

const inferTextureExtension = (texturePath: string): string => {
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
};

export const createUsdTextureRecord = (texturePath: string | null | undefined): UsdTextureRecord | null => {
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
};

const parseDisplayColor = (value: string | null | undefined): { color: THREE.Color; opacity: number } | null => {
  const parsed = parseThreeColorWithOpacity(value);
  if (!parsed) {
    return null;
  }

  return {
    color: parsed.color,
    opacity: parsed.opacity ?? 1,
  };
};

const getRenderableTextureRecord = (object: THREE.Object3D): UsdTextureRecord | null => {
  if (!isUsdMeshObject(object) || !object.geometry.getAttribute('uv')) {
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
};

export const getUsdRenderableAppearance = (object: THREE.Object3D): UsdRenderableAppearance | null => {
  const texture = getRenderableTextureRecord(object);
  const explicitColor = parseDisplayColor(object.userData?.usdDisplayColor);
  if (explicitColor) {
    return {
      color: explicitColor.color,
      opacity: explicitColor.opacity,
      texture,
    };
  }

  if (!isUsdMeshObject(object)) {
    return null;
  }

  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  if (material && 'color' in material && material.color instanceof THREE.Color) {
    return {
      color: material.color,
      opacity: Number.isFinite(material.opacity) ? Math.max(0, Math.min(1, material.opacity)) : 1,
      texture,
    };
  }

  return null;
};

export const getUsdDisplayColor = (object: THREE.Object3D): THREE.Color | null => {
  return getUsdRenderableAppearance(object)?.color || null;
};

const collectUsdFaceVertexIndices = (
  mesh: THREE.Mesh,
  geometry: THREE.BufferGeometry,
  positionCount: number,
): number[] => {
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
};

export const extractUsdMeshGeometryData = async (
  mesh: THREE.Mesh,
  vertexYieldInterval = DEFAULT_VERTEX_YIELD_INTERVAL,
): Promise<UsdMeshGeometryData | null> => {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) {
    return null;
  }

  let signatureHash = 2166136261;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    signatureHash = hashGeometryNumber(signatureHash, x);
    signatureHash = hashGeometryNumber(signatureHash, y);
    signatureHash = hashGeometryNumber(signatureHash, z);
    await yieldPeriodically(index + 1, vertexYieldInterval);
  }

  const indexValues = collectUsdFaceVertexIndices(mesh, geometry, position.count);
  const faceVertexIndices: number[] = [];
  for (let index = 0; index < indexValues.length; index += 3) {
    if (index + 2 >= indexValues.length) break;
    faceVertexIndices.push(indexValues[index], indexValues[index + 1], indexValues[index + 2]);
    signatureHash = hashGeometryNumber(signatureHash, 3);
    signatureHash = hashGeometryNumber(signatureHash, indexValues[index]);
    signatureHash = hashGeometryNumber(signatureHash, indexValues[index + 1]);
    signatureHash = hashGeometryNumber(signatureHash, indexValues[index + 2]);
  }
  const triangleCount = faceVertexIndices.length / 3;

  const uv = geometry.getAttribute('uv');
  let uvAttribute: UsdNumericAttribute | null = null;
  if (uv && uv.count > 0 && faceVertexIndices.length > 0) {
    let uvSignatureHash = signatureHash;
    let hasCompleteUvCoverage = true;
    for (let index = 0; index < faceVertexIndices.length; index += 1) {
      const faceVertexIndex = faceVertexIndices[index];
      if (faceVertexIndex < 0 || faceVertexIndex >= uv.count) {
        hasCompleteUvCoverage = false;
        break;
      }

      uvSignatureHash = hashGeometryNumber(uvSignatureHash, uv.getX(faceVertexIndex));
      uvSignatureHash = hashGeometryNumber(uvSignatureHash, uv.getY(faceVertexIndex));
      await yieldPeriodically(index + 1, vertexYieldInterval);
    }

    if (hasCompleteUvCoverage) {
      uvAttribute = uv;
      signatureHash = uvSignatureHash;
    }
  }

  return {
    triangleCount,
    faceVertexIndices,
    positions: position,
    uvAttribute,
    signature: (signatureHash >>> 0).toString(16).padStart(8, '0'),
  };
};

const createUsdMaterialSignature = (appearance: UsdRenderableAppearance): string => {
  return [
    appearance.color.r.toFixed(6),
    appearance.color.g.toFixed(6),
    appearance.color.b.toFixed(6),
    appearance.opacity.toFixed(6),
    appearance.texture?.exportPath || '',
  ].join(':');
};

const createUsdGeometrySignature = (data: UsdMeshGeometryData): string => {
  return data.signature;
};

export const collectUsdSerializationContext = async (
  sceneRoot: THREE.Object3D,
  {
    onProgress,
    rootPrimName,
    objectYieldInterval = DEFAULT_OBJECT_YIELD_INTERVAL,
    vertexYieldInterval = DEFAULT_VERTEX_YIELD_INTERVAL,
  }: CollectUsdSerializationContextOptions = {},
): Promise<UsdSerializationContext> => {
  const effectiveRootPrimName = String(rootPrimName || sceneRoot.name || 'Robot').trim() || 'Robot';
  const materialByObject = new WeakMap<THREE.Object3D, UsdPreviewMaterialRecord>();
  const materialBySignature = new Map<string, UsdPreviewMaterialRecord>();
  const materialRecords: UsdPreviewMaterialRecord[] = [];
  const geometryByObject = new WeakMap<THREE.Object3D, UsdMeshGeometryRecord>();
  const geometryBySignature = new Map<string, UsdMeshGeometryRecord>();
  const geometryByBuffer = new WeakMap<THREE.BufferGeometry, UsdMeshGeometryRecord>();
  const geometryRecords: UsdMeshGeometryRecord[] = [];
  const objects: THREE.Object3D[] = [];

  sceneRoot.traverse((object) => {
    if (object.userData.usdGeomType || isUsdMeshObject(object)) {
      objects.push(object);
    }
  });

  if (onProgress && objects.length > 0) {
    onProgress({
      phase: 'geometry',
      completed: 0,
      total: objects.length,
    });
  }

  let completed = 0;
  for (let objectIndex = 0; objectIndex < objects.length; objectIndex += 1) {
    const object = objects[objectIndex];
    const label = normalizeUsdProgressLabel(
      object.name || object.userData.usdGeomType,
      'object',
    );

    const appearance = getUsdRenderableAppearance(object);
    if (appearance) {
      const signature = createUsdMaterialSignature(appearance);
      let record = materialBySignature.get(signature);
      if (!record) {
        const name = `Material_${materialRecords.length}`;
        record = {
          name,
          path: `/${effectiveRootPrimName}/Looks/${name}`,
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
    }

    if (isUsdMeshObject(object)) {
      const cachedGeometryRecord = geometryByBuffer.get(object.geometry);
      if (cachedGeometryRecord) {
        geometryByObject.set(object, cachedGeometryRecord);
      } else {
        const geometryData = await extractUsdMeshGeometryData(object, vertexYieldInterval);
        if (geometryData) {
          const geometrySignature = createUsdGeometrySignature(geometryData);
          let geometryRecord = geometryBySignature.get(geometrySignature);
          if (!geometryRecord) {
            const name = `Geometry_${geometryRecords.length}`;
            geometryRecord = {
              name,
              path: `/${effectiveRootPrimName}/__MeshLibrary/${name}`,
              data: geometryData,
            };
            geometryBySignature.set(geometrySignature, geometryRecord);
            geometryRecords.push(geometryRecord);
          }

          geometryByBuffer.set(object.geometry, geometryRecord);
          geometryByObject.set(object, geometryRecord);
        }
      }
    }

    completed = Math.min(objects.length, completed + 1);
    onProgress?.({
      phase: 'geometry',
      completed,
      total: objects.length,
      label,
    });
    await yieldPeriodically(objectIndex + 1, objectYieldInterval);
  }

  return {
    materialByObject,
    materialRecords,
    geometryByObject,
    geometryRecords,
  };
};
