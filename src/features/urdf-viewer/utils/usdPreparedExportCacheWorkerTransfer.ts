import type { RobotData } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData.ts';
import type { PreparedUsdExportCacheResult } from './usdExportBundle.ts';

export interface PreparedUsdExportCacheTransferFile {
  path: string;
  mimeType: string;
  bytes: ArrayBuffer | null;
}

export interface PreparedUsdExportCacheWorkerPayload {
  stageSourcePath?: string | null;
  robotData: RobotData;
  resolution: ViewerRobotDataResolution;
  meshFiles: PreparedUsdExportCacheTransferFile[];
}

interface SerializedPreparedUsdExportCache {
  payload: PreparedUsdExportCacheWorkerPayload;
  transferables: ArrayBuffer[];
}

async function serializePreparedUsdExportCacheFile(
  path: string,
  blob: Blob,
): Promise<PreparedUsdExportCacheTransferFile> {
  return {
    path,
    mimeType: blob.type,
    bytes: await blob.arrayBuffer(),
  };
}

export async function serializePreparedUsdExportCacheForWorker(
  payload: PreparedUsdExportCacheResult,
): Promise<SerializedPreparedUsdExportCache> {
  const meshFiles = await Promise.all(
    Object.entries(payload.meshFiles).map(([path, blob]) => serializePreparedUsdExportCacheFile(path, blob)),
  );

  return {
    payload: {
      stageSourcePath: payload.stageSourcePath ?? null,
      robotData: payload.robotData,
      resolution: payload.resolution,
      meshFiles,
    },
    transferables: meshFiles.flatMap((file) => (file.bytes ? [file.bytes] : [])),
  };
}

export function hydratePreparedUsdExportCacheFromWorker(
  payload: PreparedUsdExportCacheWorkerPayload,
): PreparedUsdExportCacheResult {
  return {
    stageSourcePath: payload.stageSourcePath ?? null,
    robotData: payload.robotData,
    resolution: payload.resolution,
    meshFiles: Object.fromEntries(
      payload.meshFiles.map((file) => [
        file.path,
        new Blob(file.bytes ? [file.bytes] : [], { type: file.mimeType || '' }),
      ]),
    ),
  };
}
