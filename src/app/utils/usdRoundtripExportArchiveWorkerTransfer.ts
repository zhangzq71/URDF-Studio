import type { UsdRoundtripArchive } from './usdRoundtripExportArchive.ts';

export interface UsdRoundtripArchiveTransferFile {
  path: string;
  blob: Blob;
}

export interface UsdRoundtripArchiveWorkerPayload {
  archiveFileName: string;
  archiveFiles: UsdRoundtripArchiveTransferFile[];
}

interface SerializedUsdRoundtripArchivePayload<TPayload> {
  payload: TPayload;
  transferables: ArrayBuffer[];
}

export async function serializeUsdRoundtripArchiveForWorker(
  archive: UsdRoundtripArchive,
): Promise<SerializedUsdRoundtripArchivePayload<UsdRoundtripArchiveWorkerPayload>> {
  const archiveFiles = Array.from(archive.archiveFiles.entries()).map(([path, blob]) => ({
    path,
    blob,
  }));

  return {
    payload: {
      archiveFileName: archive.archiveFileName,
      archiveFiles,
    },
    transferables: await Promise.all(archiveFiles.map(async ({ blob }) => blob.arrayBuffer())),
  };
}

export function hydrateUsdRoundtripArchiveFromWorker(
  payload: UsdRoundtripArchiveWorkerPayload,
): UsdRoundtripArchive {
  return {
    archiveFileName: payload.archiveFileName,
    archiveFiles: new Map(payload.archiveFiles.map((file) => [file.path, file.blob])),
  };
}
