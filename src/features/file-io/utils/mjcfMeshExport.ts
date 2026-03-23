import * as THREE from 'three';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

import { createLoadingManager, createMeshLoader, buildColladaRootNormalizationHints } from '@/core/loaders';
import { collectExplicitlyScaledMeshPaths } from '@/core/loaders/meshScaleHints';
import { normalizeMeshPathForExport } from '@/core/parsers/meshPathUtils';
import { GeometryType, type RobotState } from '@/types';
import { disposeObject3D } from '@/shared/utils/three/dispose';

export interface PrepareMjcfMeshExportAssetsOptions {
  robot: RobotState;
  assets: Record<string, string>;
  extraMeshFiles?: Map<string, Blob>;
}

export interface PreparedMjcfMeshExportAssets {
  meshPathOverrides: Map<string, string>;
  archiveFiles: Map<string, Blob>;
  convertedSourceMeshPaths: Set<string>;
  visualMeshVariants: Map<string, MjcfVisualMeshVariant[]>;
}

function isMjcfNativeMeshPath(meshPath: string): boolean {
  return /\.(?:obj|stl)$/i.test(meshPath);
}

function buildConvertedMeshExportPath(meshPath: string, usedPaths: Set<string>): string {
  const normalizedPath = normalizeMeshPathForExport(meshPath);
  if (!normalizedPath) {
    return '';
  }

  const extensionMatch = normalizedPath.match(/\.([^.]+)$/);
  const extensionSuffix = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';
  const basePath = extensionMatch
    ? normalizedPath.slice(0, -extensionMatch[0].length)
    : normalizedPath;

  let candidate = `${basePath}${extensionSuffix}.obj`;
  let counter = 2;
  while (usedPaths.has(candidate)) {
    candidate = `${basePath}${extensionSuffix}_${counter}.obj`;
    counter += 1;
  }

  usedPaths.add(candidate);
  return candidate;
}

export interface MjcfVisualMeshVariant {
  meshPath: string;
  color?: string;
  sourceMaterialName?: string;
}

interface ExtractedVisualMeshVariant extends MjcfVisualMeshVariant {
  blob: Blob;
}

function sanitizeVariantSegment(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildConvertedVisualVariantPath(
  meshPath: string,
  materialName: string | undefined,
  variantIndex: number,
  usedPaths: Set<string>,
): string {
  const normalizedPath = normalizeMeshPathForExport(meshPath);
  if (!normalizedPath) {
    return '';
  }

  const extensionMatch = normalizedPath.match(/\.([^.]+)$/);
  const extensionSuffix = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';
  const basePath = extensionMatch
    ? normalizedPath.slice(0, -extensionMatch[0].length)
    : normalizedPath;
  const materialSuffix = sanitizeVariantSegment(materialName) || `part_${variantIndex + 1}`;

  let candidate = `${basePath}.${materialSuffix}.obj`;
  let counter = 2;
  while (usedPaths.has(candidate)) {
    candidate = `${basePath}.${materialSuffix}_${counter}.obj`;
    counter += 1;
  }

  usedPaths.add(candidate);
  return candidate;
}

function colorToHex(color: THREE.Color | undefined): string | undefined {
  if (!color) {
    return undefined;
  }

  const toChannel = (value: number) => (
    Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0')
  );

  return `#${toChannel(color.r)}${toChannel(color.g)}${toChannel(color.b)}`;
}

function getMaterialColor(material: THREE.Material): THREE.Color | undefined {
  return 'color' in material && material.color instanceof THREE.Color
    ? material.color
    : undefined;
}

function cloneAttributeSubset(
  attribute: THREE.BufferAttribute,
  vertexIndexes: readonly number[],
): THREE.BufferAttribute {
  const itemSize = attribute.itemSize;
  const ArrayCtor = attribute.array.constructor as new (length: number) => ArrayLike<number>;
  const values = new ArrayCtor(vertexIndexes.length * itemSize) as THREE.TypedArray;

  vertexIndexes.forEach((vertexIndex, nextVertexIndex) => {
    const sourceOffset = vertexIndex * itemSize;
    const targetOffset = nextVertexIndex * itemSize;
    for (let componentIndex = 0; componentIndex < itemSize; componentIndex += 1) {
      values[targetOffset + componentIndex] = attribute.array[sourceOffset + componentIndex];
    }
  });

  const cloned = new THREE.BufferAttribute(values, itemSize, attribute.normalized);
  if (attribute.name) {
    cloned.name = attribute.name;
  }
  cloned.usage = attribute.usage;
  if (attribute.gpuType != null) {
    cloned.gpuType = attribute.gpuType;
  }
  return cloned;
}

function buildIndexedGeometrySubset(
  sourceGeometry: THREE.BufferGeometry,
  relevantGroups: readonly THREE.Group[],
): THREE.BufferGeometry | null {
  const sourceIndex = sourceGeometry.getIndex();
  if (!sourceIndex || relevantGroups.length === 0) {
    return null;
  }

  const indexRemap = new Map<number, number>();
  const sourceVertexIndexes: number[] = [];
  const nextIndexes: number[] = [];

  relevantGroups.forEach((group) => {
    const groupEnd = group.start + group.count;
    for (let indexOffset = group.start; indexOffset < groupEnd; indexOffset += 1) {
      const sourceVertexIndex = sourceIndex.getX(indexOffset);
      let nextVertexIndex = indexRemap.get(sourceVertexIndex);
      if (nextVertexIndex == null) {
        nextVertexIndex = sourceVertexIndexes.length;
        indexRemap.set(sourceVertexIndex, nextVertexIndex);
        sourceVertexIndexes.push(sourceVertexIndex);
      }
      nextIndexes.push(nextVertexIndex);
    }
  });

  if (nextIndexes.length === 0 || sourceVertexIndexes.length === 0) {
    return null;
  }

  const subsetGeometry = new THREE.BufferGeometry();
  Object.entries(sourceGeometry.attributes).forEach(([attributeName, attribute]) => {
    subsetGeometry.setAttribute(attributeName, cloneAttributeSubset(attribute, sourceVertexIndexes));
  });

  if (sourceGeometry.morphAttributes) {
    Object.entries(sourceGeometry.morphAttributes).forEach(([attributeName, morphAttributes]) => {
      subsetGeometry.morphAttributes[attributeName] = morphAttributes.map((attribute) => (
        cloneAttributeSubset(attribute, sourceVertexIndexes)
      ));
    });
  }
  subsetGeometry.morphTargetsRelative = sourceGeometry.morphTargetsRelative;

  subsetGeometry.setIndex(nextIndexes);
  return subsetGeometry;
}

function buildNonIndexedGeometrySubset(
  sourceGeometry: THREE.BufferGeometry,
  relevantGroups: readonly THREE.Group[],
): THREE.BufferGeometry | null {
  const positionAttribute = sourceGeometry.getAttribute('position');
  if (!positionAttribute || relevantGroups.length === 0) {
    return null;
  }

  const vertexIndexes: number[] = [];
  relevantGroups.forEach((group) => {
    const groupEnd = group.start + group.count;
    for (let vertexIndex = group.start; vertexIndex < groupEnd; vertexIndex += 1) {
      vertexIndexes.push(vertexIndex);
    }
  });

  if (vertexIndexes.length === 0) {
    return null;
  }

  const subsetGeometry = new THREE.BufferGeometry();
  Object.entries(sourceGeometry.attributes).forEach(([attributeName, attribute]) => {
    subsetGeometry.setAttribute(attributeName, cloneAttributeSubset(attribute, vertexIndexes));
  });

  if (sourceGeometry.morphAttributes) {
    Object.entries(sourceGeometry.morphAttributes).forEach(([attributeName, morphAttributes]) => {
      subsetGeometry.morphAttributes[attributeName] = morphAttributes.map((attribute) => (
        cloneAttributeSubset(attribute, vertexIndexes)
      ));
    });
  }
  subsetGeometry.morphTargetsRelative = sourceGeometry.morphTargetsRelative;

  return subsetGeometry;
}

function extractGeometryForMaterial(
  sourceGeometry: THREE.BufferGeometry,
  materialIndex: number,
): THREE.BufferGeometry | null {
  const relevantGroups = sourceGeometry.groups.filter((group) => (group.materialIndex ?? 0) === materialIndex);
  if (relevantGroups.length === 0) {
    return null;
  }

  if (sourceGeometry.getIndex()) {
    return buildIndexedGeometrySubset(sourceGeometry, relevantGroups);
  }

  return buildNonIndexedGeometrySubset(sourceGeometry, relevantGroups);
}

function createBakedVariantMesh(
  mesh: THREE.Mesh,
  material: THREE.Material,
  materialIndex?: number,
): THREE.Mesh | null {
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
    return null;
  }

  const geometry = mesh.geometry.clone();
  if (materialIndex != null && geometry.groups.length > 0) {
    const subsetGeometry = extractGeometryForMaterial(mesh.geometry, materialIndex);
    geometry.dispose();
    if (!subsetGeometry) {
      return null;
    }
    subsetGeometry.clearGroups();
    subsetGeometry.computeBoundingBox();
    subsetGeometry.computeBoundingSphere();
    const bakedMaterial = material.clone();
    bakedMaterial.name = material.name;

    subsetGeometry.applyMatrix4(mesh.matrixWorld);
    const bakedMesh = new THREE.Mesh(subsetGeometry, bakedMaterial);
    bakedMesh.name = mesh.name || material.name || 'mesh_variant';
    bakedMesh.updateMatrixWorld(true);
    return bakedMesh;
  }

  if (geometry.groups.length > 0) {
    geometry.clearGroups();
  }

  geometry.applyMatrix4(mesh.matrixWorld);

  const bakedMaterial = material.clone();
  bakedMaterial.name = material.name;

  const bakedMesh = new THREE.Mesh(geometry, bakedMaterial);
  bakedMesh.name = mesh.name || material.name || 'mesh_variant';
  bakedMesh.updateMatrixWorld(true);
  return bakedMesh;
}

function extractVisualMeshVariants(
  meshObject: THREE.Object3D,
  sourceMeshPath: string,
  usedArchivePaths: Set<string>,
  objExporter: OBJExporter,
): ExtractedVisualMeshVariant[] {
  const variantFiles: ExtractedVisualMeshVariant[] = [];
  meshObject.updateMatrixWorld(true);

  let variantIndex = 0;
  meshObject.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materialIndexes = Array.isArray(mesh.material) && mesh.geometry?.groups?.length
      ? Array.from(new Set(mesh.geometry.groups.map((group) => group.materialIndex ?? 0)))
      : [undefined];

    materialIndexes.forEach((materialIndex) => {
      const material = materialIndex == null
        ? materials[0]
        : materials[materialIndex];
      if (!material) {
        return;
      }

      const bakedMesh = createBakedVariantMesh(mesh, material, materialIndex);
      if (!bakedMesh) {
        return;
      }

      try {
        const exportPath = buildConvertedVisualVariantPath(
          sourceMeshPath,
          material.name,
          variantIndex,
          usedArchivePaths,
        );
        if (!exportPath) {
          return;
        }

        const exportedObj = objExporter.parse(bakedMesh);
        if (exportedObj.trim().length === 0) {
          return;
        }

        variantFiles.push({
          meshPath: exportPath,
          color: colorToHex(getMaterialColor(material)),
          sourceMaterialName: material.name || undefined,
          blob: new Blob([exportedObj], { type: 'text/plain' }),
        });
        variantIndex += 1;
      } finally {
        disposeObject3D(bakedMesh, true);
      }
    });
  });

  return variantFiles;
}

function registerInlineMeshBlobUrls(
  sourceAssets: Record<string, string>,
  extraMeshFiles?: Map<string, Blob>,
): { resolvedAssets: Record<string, string>; tempObjectUrls: string[] } {
  const resolvedAssets = { ...sourceAssets };
  const tempObjectUrls: string[] = [];

  extraMeshFiles?.forEach((blob, sourcePath) => {
    const objectUrl = URL.createObjectURL(blob);
    tempObjectUrls.push(objectUrl);

    resolvedAssets[sourcePath] = objectUrl;

    const normalizedSourcePath = normalizeMeshPathForExport(sourcePath);
    if (normalizedSourcePath) {
      resolvedAssets[normalizedSourcePath] = objectUrl;

      const fileName = normalizedSourcePath.split('/').pop();
      if (fileName) {
        resolvedAssets[fileName] = objectUrl;
      }
    }
  });

  return { resolvedAssets, tempObjectUrls };
}

function collectReferencedMeshPaths(robot: RobotState): Set<string> {
  const meshPaths = new Set<string>();

  Object.values(robot.links).forEach((link) => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      meshPaths.add(link.visual.meshPath);
    }

    if (link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      meshPaths.add(link.collision.meshPath);
    }

    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        meshPaths.add(body.meshPath);
      }
    });
  });

  return meshPaths;
}

interface ReferencedMeshUsage {
  hasVisualUsage: boolean;
  hasVisualMultiMaterialUsage: boolean;
  hasNonVisualUsage: boolean;
}

function collectReferencedMeshUsage(robot: RobotState): Map<string, ReferencedMeshUsage> {
  const usageByPath = new Map<string, ReferencedMeshUsage>();

  const markUsage = (meshPath: string | undefined, usageType: 'visual' | 'non-visual') => {
    if (!meshPath) {
      return;
    }

    const candidatePaths = new Set<string>([meshPath]);
    const normalizedPath = normalizeMeshPathForExport(meshPath);
    if (normalizedPath) {
      candidatePaths.add(normalizedPath);
    }

    candidatePaths.forEach((candidatePath) => {
      const usage = usageByPath.get(candidatePath) ?? {
        hasVisualUsage: false,
        hasVisualMultiMaterialUsage: false,
        hasNonVisualUsage: false,
      };

      if (usageType === 'visual') {
        usage.hasVisualUsage = true;
      } else {
        usage.hasNonVisualUsage = true;
      }

      usageByPath.set(candidatePath, usage);
    });
  };

  Object.values(robot.links).forEach((link) => {
    if (link.visual.type === GeometryType.MESH) {
      markUsage(link.visual.meshPath, 'visual');
      const normalizedPath = normalizeMeshPathForExport(link.visual.meshPath);
      if ((link.visual.authoredMaterials?.length || 0) > 1) {
        const candidatePaths = new Set<string>([link.visual.meshPath || '']);
        if (normalizedPath) {
          candidatePaths.add(normalizedPath);
        }

        candidatePaths.forEach((candidatePath) => {
          if (!candidatePath) {
            return;
          }
          const usage = usageByPath.get(candidatePath) ?? {
            hasVisualUsage: false,
            hasVisualMultiMaterialUsage: false,
            hasNonVisualUsage: false,
          };
          usage.hasVisualUsage = true;
          usage.hasVisualMultiMaterialUsage = true;
          usageByPath.set(candidatePath, usage);
        });
      }
    }

    if (link.collision.type === GeometryType.MESH) {
      markUsage(link.collision.meshPath, 'non-visual');
    }

    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH) {
        markUsage(body.meshPath, 'non-visual');
      }
    });
  });

  return usageByPath;
}

function containsPlaceholderMesh(object: any): boolean {
  let hasPlaceholder = Boolean(object?.userData?.isPlaceholder);

  object?.traverse?.((child: any) => {
    if (child?.userData?.isPlaceholder) {
      hasPlaceholder = true;
    }
  });

  return hasPlaceholder;
}

export async function prepareMjcfMeshExportAssets(
  options: PrepareMjcfMeshExportAssetsOptions,
): Promise<PreparedMjcfMeshExportAssets> {
  const { robot, assets, extraMeshFiles } = options;
  const meshPathOverrides = new Map<string, string>();
  const archiveFiles = new Map<string, Blob>();
  const convertedSourceMeshPaths = new Set<string>();
  const visualMeshVariants = new Map<string, MjcfVisualMeshVariant[]>();
  const usedArchivePaths = new Set<string>();
  const referencedMeshPaths = collectReferencedMeshPaths(robot);
  const referencedMeshUsage = collectReferencedMeshUsage(robot);
  const { resolvedAssets, tempObjectUrls } = registerInlineMeshBlobUrls(assets, extraMeshFiles);
  const colladaRootNormalizationHints = buildColladaRootNormalizationHints(robot.links);
  const explicitScaleMeshPaths = collectExplicitlyScaledMeshPaths(robot);
  const loadingManager = createLoadingManager(resolvedAssets);
  const loadMesh = createMeshLoader(
    resolvedAssets,
    loadingManager,
    '',
    {
      colladaRootNormalizationHints,
      explicitScaleMeshPaths,
    },
  );
  const objExporter = new OBJExporter();

  try {
    for (const meshPath of referencedMeshPaths) {
      if (isMjcfNativeMeshPath(meshPath)) {
        continue;
      }

      try {
        const meshObject = await new Promise<any>((resolve, reject) => {
          loadMesh(meshPath, loadingManager, (result, err) => {
            if (err) {
              reject(err);
              return;
            }

            resolve(result);
          });
        });

        if (containsPlaceholderMesh(meshObject)) {
          console.warn(`[MJCF export] Skipping mesh override for "${meshPath}" because the source asset resolved to a placeholder.`);
          disposeObject3D(meshObject, true);
          continue;
        }

        const extractedVariantFiles = extractVisualMeshVariants(
          meshObject,
          meshPath,
          usedArchivePaths,
          objExporter,
        );
        const normalizedSourcePath = normalizeMeshPathForExport(meshPath);
        const sourceUsage = referencedMeshUsage.get(meshPath)
          || (normalizedSourcePath ? referencedMeshUsage.get(normalizedSourcePath) : undefined);
        const hasSplitVisualVariants = extractedVariantFiles.length > 1;
        const shouldPreferVisualVariants = hasSplitVisualVariants
          && Boolean(sourceUsage?.hasVisualMultiMaterialUsage)
          && !sourceUsage?.hasNonVisualUsage;
        const needsFullMeshExport = !shouldPreferVisualVariants;

        if (needsFullMeshExport) {
          const exportPath = buildConvertedMeshExportPath(meshPath, usedArchivePaths);
          if (!exportPath) {
            disposeObject3D(meshObject, true);
            continue;
          }

          const exportedObj = objExporter.parse(meshObject);
          archiveFiles.set(exportPath, new Blob([exportedObj], { type: 'text/plain' }));
          meshPathOverrides.set(meshPath, exportPath);
          convertedSourceMeshPaths.add(meshPath);

          if (normalizedSourcePath && normalizedSourcePath !== meshPath) {
            meshPathOverrides.set(normalizedSourcePath, exportPath);
            convertedSourceMeshPaths.add(normalizedSourcePath);
          }
        } else {
          convertedSourceMeshPaths.add(meshPath);
          if (normalizedSourcePath && normalizedSourcePath !== meshPath) {
            convertedSourceMeshPaths.add(normalizedSourcePath);
          }
        }

        if (extractedVariantFiles.length > 1) {
          const variants = extractedVariantFiles.map(({ blob, ...variant }) => {
            archiveFiles.set(variant.meshPath, blob);
            return variant;
          });

          visualMeshVariants.set(meshPath, variants);
          if (normalizedSourcePath && normalizedSourcePath !== meshPath) {
            visualMeshVariants.set(normalizedSourcePath, variants);
          }
        }

        disposeObject3D(meshObject, true);
      } catch (error) {
        console.warn(`[MJCF export] Failed to convert mesh "${meshPath}" to OBJ. Keeping original path.`, error);
      }
    }
  } finally {
    tempObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  }

  return {
    meshPathOverrides,
    archiveFiles,
    convertedSourceMeshPaths,
    visualMeshVariants,
  };
}
