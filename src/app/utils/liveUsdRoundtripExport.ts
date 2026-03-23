import type { RobotFile } from '@/types';
import { exportUsdStageSnapshot } from '@/features/urdf-viewer/utils/usdStageExport';

import {
  buildUsdRoundtripArchive,
  type UsdRoundtripArchive,
} from './usdRoundtripExportArchive';

type LiveUsdExportTargetWindow = Parameters<typeof exportUsdStageSnapshot>[0]['targetWindow'];

export interface BuildLiveUsdRoundtripArchiveOptions {
  sourceFile: Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
  availableFiles: Array<Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>>;
  assets: Record<string, string>;
  allFileContents?: Record<string, string>;
  targetWindow?: LiveUsdExportTargetWindow;
}

function getOriginalUsdFileName(path: string): string {
  const normalized = String(path || '').trim().replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || '';
  return fileName || 'export.usd';
}

export async function buildLiveUsdRoundtripArchive({
  sourceFile,
  availableFiles,
  assets,
  allFileContents = {},
  targetWindow,
}: BuildLiveUsdRoundtripArchiveOptions): Promise<UsdRoundtripArchive> {
  const originalFileName = getOriginalUsdFileName(sourceFile.name);
  const stageExportResult = await exportUsdStageSnapshot({
    stageSourcePath: sourceFile.name,
    persistToServer: false,
    targetWindow,
  });
  const stageExport = {
    ...stageExportResult,
    downloadFileName: originalFileName,
    outputVirtualPath: sourceFile.name,
  };

  return buildUsdRoundtripArchive({
    sourceFile,
    stageExport,
    availableFiles,
    assets,
    allFileContents,
  });
}
