import JSZip from 'jszip';

import { findAssetByPath } from '@/core/loaders';
import { normalizeMeshPathForExport, normalizeTexturePathForExport } from '@/core/parsers/meshPathUtils';
import { compressSTLBlob } from '@/core/stl-compressor';
import { GeometryType, type RobotState, type UrdfLink } from '@/types';

interface CompressOptions {
  compressSTL: boolean;
  stlQuality: number;
}

interface AddRobotAssetsToZipOptions {
  robot: RobotState;
  zip: JSZip;
  assets: Record<string, string>;
  compressOptions?: CompressOptions;
  extraMeshFiles?: Map<string, Blob>;
  skipMeshPaths?: ReadonlySet<string>;
  onProgress?: (progress: {
    completed: number;
    total: number;
    currentFile: string;
  }) => void;
}

function isExternalAssetPath(path: string): boolean {
  return /^(?:blob:|https?:\/\/|data:)/i.test(path);
}

export function collectRobotAssetReferences(robot: RobotState): {
  meshPaths: Set<string>;
  texturePaths: Set<string>;
} {
  const meshPaths = new Set<string>();
  const texturePaths = new Set<string>();

  Object.values(robot.links).forEach((link: UrdfLink) => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      meshPaths.add(link.visual.meshPath);
    }
    if (link.collision && link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      meshPaths.add(link.collision.meshPath);
    }
    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        meshPaths.add(body.meshPath);
      }
    });
  });

  Object.values(robot.materials || {}).forEach((material) => {
    if (material.texture) {
      texturePaths.add(material.texture);
    }
  });

  return {
    meshPaths,
    texturePaths,
  };
}

export async function addRobotAssetsToZip({
  robot,
  zip,
  assets,
  compressOptions,
  extraMeshFiles,
  skipMeshPaths,
  onProgress,
}: AddRobotAssetsToZipOptions): Promise<void> {
  const meshFolder = zip.folder('meshes');
  const textureFolder = zip.folder('textures');
  const { meshPaths, texturePaths } = collectRobotAssetReferences(robot);

  const tasks: Array<{ currentFile: string; run: () => Promise<void> }> = [];
  const exportedMeshPaths = new Set<string>();
  const exportedTexturePaths = new Set<string>();

  meshPaths.forEach((meshPath) => {
    const exportPath = normalizeMeshPathForExport(meshPath);
    if (skipMeshPaths?.has(meshPath) || (exportPath && skipMeshPaths?.has(exportPath))) {
      return;
    }

    if (!exportPath || exportedMeshPaths.has(exportPath)) {
      return;
    }
    exportedMeshPaths.add(exportPath);

    const inlineMeshBlob = extraMeshFiles?.get(meshPath);
    if (inlineMeshBlob) {
      tasks.push({
        currentFile: exportPath,
        run: async () => {
          if (compressOptions?.compressSTL && /\.stl$/i.test(exportPath)) {
            const filename = exportPath.split('/').pop() ?? exportPath;
            const result = await compressSTLBlob(inlineMeshBlob, filename, {
              quality: compressOptions.stlQuality,
            });
            meshFolder?.file(exportPath, await result.blob.arrayBuffer());
            return;
          }

          meshFolder?.file(exportPath, await inlineMeshBlob.arrayBuffer());
        },
      });
      return;
    }

    const assetUrl = findAssetByPath(meshPath, assets);
    if (!assetUrl) {
      console.warn(`[Export] Mesh asset not found for: ${meshPath}`);
      return;
    }

    tasks.push({
      currentFile: exportPath,
      run: async () => {
        await fetch(assetUrl)
          .then((response) => response.blob())
          .then(async (blob) => {
            if (compressOptions?.compressSTL && /\.stl$/i.test(exportPath)) {
              const filename = exportPath.split('/').pop() ?? exportPath;
              const result = await compressSTLBlob(blob, filename, {
                quality: compressOptions.stlQuality,
              });
              meshFolder?.file(exportPath, await result.blob.arrayBuffer());
              return;
            }

            meshFolder?.file(exportPath, await blob.arrayBuffer());
          })
          .catch((error: unknown) => {
            console.error(`Failed to load mesh ${meshPath}`, error);
          });
      },
    });
  });

  texturePaths.forEach((texturePath) => {
    const exportPath = normalizeTexturePathForExport(texturePath);
    if (!exportPath || isExternalAssetPath(exportPath) || exportedTexturePaths.has(exportPath)) {
      return;
    }
    exportedTexturePaths.add(exportPath);

    const assetUrl = findAssetByPath(texturePath, assets);
    if (!assetUrl) {
      console.warn(`[Export] Texture asset not found for: ${texturePath}`);
      return;
    }

    tasks.push({
      currentFile: exportPath,
      run: async () => {
        await fetch(assetUrl)
          .then((response) => response.blob())
          .then(async (blob) => {
            textureFolder?.file(exportPath, await blob.arrayBuffer());
          })
          .catch((error: unknown) => {
            console.error(`Failed to load texture ${texturePath}`, error);
          });
      },
    });
  });

  const total = tasks.length;
  if (total === 0) {
    return;
  }

  onProgress?.({
    completed: 0,
    total,
    currentFile: '',
  });

  let completed = 0;
  await Promise.all(tasks.map(async (task) => {
    await task.run();
    completed += 1;
    onProgress?.({
      completed,
      total,
      currentFile: task.currentFile,
    });
  }));
}
