import type {
  PreparedUsdPreloadFile,
  PreparedUsdStageOpenData,
} from './usdStageOpenPreparation.ts';

export interface PreparedUsdPreloadTransferFile {
  path: string;
  mimeType: string;
  bytes: ArrayBuffer | null;
  error?: string | null;
}

export interface PreparedUsdStageOpenWorkerPayload {
  stageSourcePath: string;
  criticalDependencyPaths: string[];
  preloadFiles: PreparedUsdPreloadTransferFile[];
}

interface SerializedPreparedUsdStageOpenData {
  payload: PreparedUsdStageOpenWorkerPayload;
  transferables: ArrayBuffer[];
}

function normalizePreparedUsdPreloadBytes(
  bytes: PreparedUsdPreloadFile['bytes'],
): ArrayBuffer | null {
  if (!bytes) {
    return null;
  }

  if (bytes instanceof ArrayBuffer) {
    return bytes.byteLength > 0 ? bytes : null;
  }

  if (!ArrayBuffer.isView(bytes) || bytes.byteLength <= 0) {
    return null;
  }

  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function serializePreparedUsdPreloadFile(
  preloadFile: PreparedUsdPreloadFile,
): Promise<PreparedUsdPreloadTransferFile> {
  const existingBytes = normalizePreparedUsdPreloadBytes(preloadFile.bytes);
  if (existingBytes) {
    return {
      path: preloadFile.path,
      mimeType: preloadFile.mimeType ?? preloadFile.blob?.type ?? '',
      bytes: existingBytes,
      error: preloadFile.error ?? null,
    };
  }

  if (!preloadFile.blob) {
    return {
      path: preloadFile.path,
      mimeType: '',
      bytes: null,
      error: preloadFile.error ?? null,
    };
  }

  return {
    path: preloadFile.path,
    mimeType: preloadFile.blob.type,
    bytes: await preloadFile.blob.arrayBuffer(),
    error: preloadFile.error ?? null,
  };
}

function hydratePreparedUsdPreloadFile(
  preloadFile: PreparedUsdPreloadTransferFile,
): PreparedUsdPreloadFile {
  return {
    path: preloadFile.path,
    blob: null,
    bytes: preloadFile.bytes,
    mimeType: preloadFile.mimeType || null,
    error: preloadFile.error ?? null,
  };
}

export async function serializePreparedUsdStageOpenDataForWorker(
  payload: PreparedUsdStageOpenData,
): Promise<SerializedPreparedUsdStageOpenData> {
  const preloadFiles = await Promise.all(
    payload.preloadFiles.map((preloadFile) => serializePreparedUsdPreloadFile(preloadFile)),
  );

  return {
    payload: {
      stageSourcePath: payload.stageSourcePath,
      criticalDependencyPaths: payload.criticalDependencyPaths,
      preloadFiles,
    },
    transferables: preloadFiles.flatMap((preloadFile) => (preloadFile.bytes ? [preloadFile.bytes] : [])),
  };
}

export function hydratePreparedUsdStageOpenDataFromWorker(
  payload: PreparedUsdStageOpenWorkerPayload,
): PreparedUsdStageOpenData {
  return {
    stageSourcePath: payload.stageSourcePath,
    criticalDependencyPaths: payload.criticalDependencyPaths,
    preloadFiles: payload.preloadFiles.map((preloadFile) => hydratePreparedUsdPreloadFile(preloadFile)),
  };
}
