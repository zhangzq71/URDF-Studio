import * as THREE from 'three';

import type { RobotState } from '../../../types/index.ts';
import { disposeObject3D } from '../../../shared/utils/three/dispose.ts';
import { createUsdAssetRegistry } from './usdAssetRegistry.ts';
import { type UsdMeshCompressionOptions } from './usdSceneNodeFactory.ts';
import { collectUsdSerializationContext } from './usdSerializationContext.ts';
import { buildUsdBaseLayerContent } from './usdSceneSerialization.ts';
import {
  buildUsdLinkPathMaps,
  buildUsdPhysicsLayerContent,
  buildUsdRootLayerContent,
  buildUsdSensorLayerContent,
  createUsdArchivePackage,
} from './usdPackageLayers.ts';
import { buildUsdLinkSceneRoot } from './usdLinkSceneBuilder.ts';
import { collectUsdExportAssetFiles } from './usdAssetCollection.ts';
import {
  advanceUsdProgress,
  createUsdProgressTracker,
  normalizeUsdProgressLabel,
  type UsdProgressEvent,
  type UsdProgressTracker,
  yieldToMainThread,
} from './usdProgress.ts';
import { sanitizeUsdIdentifier } from './usdTextFormatting.ts';

export type { UsdMeshCompressionOptions } from './usdSceneNodeFactory.ts';

const USD_EXPORT_RECORD_YIELD_INTERVAL = 4;

export type ExportRobotToUsdPhase = 'links' | 'geometry' | 'scene' | 'assets';

export interface ExportRobotToUsdProgress {
  phase: ExportRobotToUsdPhase;
  completed: number;
  total: number;
  label?: string;
}

type UsdExportProgressTracker<TPhase extends ExportRobotToUsdPhase = ExportRobotToUsdPhase> = UsdProgressTracker<TPhase>;

export interface ExportRobotToUsdOptions {
  robot: RobotState;
  exportName: string;
  assets: Record<string, string>;
  extraMeshFiles?: Map<string, Blob>;
  meshCompression?: UsdMeshCompressionOptions;
  onProgress?: (progress: ExportRobotToUsdProgress) => void;
}

export interface ExportRobotToUsdPayload {
  content: string;
  downloadFileName: string;
  archiveFileName: string;
  rootLayerPath: string;
  archiveFiles: Map<string, Blob>;
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
  const { registry, tempObjectUrls } = createUsdAssetRegistry(assets, extraMeshFiles);
  const pathMaps = buildUsdLinkPathMaps(robot, rootPrimName);
  const sceneRoot = new THREE.Group();
  sceneRoot.name = rootPrimName;
  const linkProgressTracker: UsdExportProgressTracker<'links'> = createUsdProgressTracker(
    'links',
    Math.max(1, Object.keys(robot.links).length),
    onProgress as ((progress: UsdProgressEvent<'links'>) => void) | undefined,
  );

  try {
    const linkRoot = await buildUsdLinkSceneRoot({
      robot,
      registry,
      meshCompression,
      onLinkVisit: async (link) => {
        advanceUsdProgress(
          linkProgressTracker,
          normalizeUsdProgressLabel(link.name || link.id, 'link'),
        );

        if (
          linkProgressTracker.completed < linkProgressTracker.total
          && linkProgressTracker.completed % 4 === 0
        ) {
          await yieldToMainThread();
        }
      },
    });
    sceneRoot.add(linkRoot);
    sceneRoot.updateMatrixWorld(true);

    const rootLayerContent = buildUsdRootLayerContent(rootPrimName, configStem);
    await yieldToMainThread();
    const usdContext = await collectUsdSerializationContext(sceneRoot, {
      rootPrimName,
      onProgress,
    });
    await yieldToMainThread();
    const baseLayerContent = await buildUsdBaseLayerContent(sceneRoot, usdContext, onProgress);
    await yieldToMainThread();
    const physicsLayerContent = buildUsdPhysicsLayerContent(robot, pathMaps, rootPrimName, configStem);
    await yieldToMainThread();
    const sensorLayerContent = buildUsdSensorLayerContent(rootPrimName);
    await yieldToMainThread();
    const usdAssetFiles = await collectUsdExportAssetFiles({
      sceneRoot,
      context: usdContext,
      registry,
      onProgress,
      recordYieldInterval: USD_EXPORT_RECORD_YIELD_INTERVAL,
    });

    const archive = createUsdArchivePackage(
      normalizedExportName,
      {
        rootLayerContent,
        baseLayerContent,
        physicsLayerContent,
        sensorLayerContent,
      },
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
