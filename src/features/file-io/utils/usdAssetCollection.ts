import * as THREE from 'three';

import { resolveUsdAssetUrl, type UsdAssetRegistry } from './usdAssetRegistry.ts';
import {
  createUsdTextureRecord,
  type UsdSerializationContext,
} from './usdSerializationContext.ts';
import {
  advanceUsdProgress,
  createUsdProgressTracker,
  normalizeUsdProgressLabel,
  type UsdProgressEvent,
  type UsdProgressTracker,
  yieldPeriodically,
} from './usdProgress.ts';
import { type UsdMaterialMetadata } from './usdSceneNodeFactory.ts';

export type UsdAssetCollectionProgress = {
  phase: 'assets';
  completed: number;
  total: number;
  label?: string;
};

type UsdAssetCollectionProgressTracker = UsdProgressTracker<'assets'>;

type CollectUsdExportAssetFilesOptions = {
  sceneRoot: THREE.Object3D;
  context: UsdSerializationContext;
  registry: UsdAssetRegistry;
  onProgress?: (progress: UsdAssetCollectionProgress) => void;
  recordYieldInterval?: number;
};

const DEFAULT_RECORD_YIELD_INTERVAL = 4;

export const collectUsdExportAssetFiles = async ({
  sceneRoot,
  context,
  registry,
  onProgress,
  recordYieldInterval = DEFAULT_RECORD_YIELD_INTERVAL,
}: CollectUsdExportAssetFilesOptions): Promise<Map<string, Blob>> => {
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
  const textureEntries = Array.from(textureFiles.entries());
  const progressTracker = createUsdProgressTracker(
    'assets',
    textureEntries.length,
    onProgress as ((progress: UsdProgressEvent<'assets'>) => void) | undefined,
  );

  for (let index = 0; index < textureEntries.length; index += 1) {
    const [exportPath, sourcePath] = textureEntries[index];
    const label = normalizeUsdProgressLabel(exportPath, 'asset');
    const resolvedUrl = resolveUsdAssetUrl(sourcePath, registry);
    if (!resolvedUrl) {
      console.warn(`[USD export] Texture asset not found for: ${sourcePath}`);
      advanceUsdProgress(progressTracker, label);
      await yieldPeriodically(index + 1, recordYieldInterval);
      continue;
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

    advanceUsdProgress(progressTracker, label);
    await yieldPeriodically(index + 1, recordYieldInterval);
  }

  return archiveFiles;
};
