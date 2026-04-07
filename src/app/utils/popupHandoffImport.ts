import type { PopupHandoffArchiveRecord } from '../../shared/utils/popupHandoffProtocol.ts';
import { POPUP_HANDOFF_QUERY_PARAM } from '../../shared/utils/popupHandoffProtocol.ts';

export interface PopupHandoffImportStateSnapshot {
  availableFileCount: number;
  assetCount: number;
  selectedFileName: string | null;
}

export type PopupHandoffImportResolution =
  | {
      status: 'noop';
      handoffId: null;
    }
  | {
      status: 'missing' | 'unavailable';
      handoffId: string;
    }
  | {
      status: 'ready';
      handoffId: string;
      file: File;
      sourceOrigin: string;
    };

export function readPopupHandoffId(search: string): string | null {
  const params = new URLSearchParams(search);
  const handoffId = params.get(POPUP_HANDOFF_QUERY_PARAM)?.trim() ?? '';
  return handoffId || null;
}

export function buildPopupHandoffImportStateSnapshot(input: {
  availableFiles: ArrayLike<unknown>;
  assets: Record<string, unknown>;
  selectedFile: { name: string } | null;
}): PopupHandoffImportStateSnapshot {
  return {
    availableFileCount: input.availableFiles.length,
    assetCount: Object.keys(input.assets).length,
    selectedFileName: input.selectedFile?.name ?? null,
  };
}

export function didPopupHandoffImportChangeState(
  before: PopupHandoffImportStateSnapshot,
  after: PopupHandoffImportStateSnapshot,
): boolean {
  return (
    after.availableFileCount > before.availableFileCount ||
    after.assetCount > before.assetCount ||
    after.selectedFileName !== before.selectedFileName
  );
}

export function stripPopupHandoffQueryParam(urlLike: string): string {
  const url = new URL(urlLike, 'http://localhost');
  url.searchParams.delete(POPUP_HANDOFF_QUERY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function resolvePopupHandoffImport(
  search: string,
  options: {
    readArchive: (handoffId: string) => Promise<PopupHandoffArchiveRecord | null>;
    cleanupExpired: () => Promise<unknown>;
  },
): Promise<PopupHandoffImportResolution> {
  const handoffId = readPopupHandoffId(search);
  if (!handoffId) {
    return {
      status: 'noop',
      handoffId: null,
    };
  }

  await options.cleanupExpired();

  const archive = await options.readArchive(handoffId);
  if (!archive) {
    return {
      status: 'missing',
      handoffId,
    };
  }

  try {
    const file = new File([archive.zipBlob], archive.fileName, {
      type: archive.mimeType,
      lastModified: archive.createdAt,
    });

    return {
      status: 'ready',
      handoffId,
      file,
      sourceOrigin: archive.sourceOrigin,
    };
  } catch {
    return {
      status: 'unavailable',
      handoffId,
    };
  }
}
