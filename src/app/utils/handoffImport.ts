import { useAssetsStore } from '@/store';
import type { PopupHandoffArchiveRecord } from '@/shared/utils/popupHandoffProtocol';
import { POPUP_HANDOFF_QUERY_PARAM } from '@/shared/utils/popupHandoffProtocol';

export interface HandoffImportSnapshot {
  availableFileCount: number;
  assetCount: number;
  allFileContentCount: number;
  selectedFileName: string | null;
  originalUrdfContentLength: number;
}

export function readHandoffIdFromUrl(url: string): string | null {
  const resolvedUrl = new URL(url, 'http://localhost');
  const handoffId = resolvedUrl.searchParams.get(POPUP_HANDOFF_QUERY_PARAM)?.trim() ?? '';
  return handoffId.length > 0 ? handoffId : null;
}

export function removeHandoffIdFromUrl(url: string): string {
  const resolvedUrl = new URL(url, 'http://localhost');
  resolvedUrl.searchParams.delete(POPUP_HANDOFF_QUERY_PARAM);
  const query = resolvedUrl.searchParams.toString();
  return `${resolvedUrl.pathname}${query ? `?${query}` : ''}${resolvedUrl.hash}`;
}

export function captureHandoffImportSnapshot(): HandoffImportSnapshot {
  const assetsState = useAssetsStore.getState();
  return {
    availableFileCount: assetsState.availableFiles.length,
    assetCount: Object.keys(assetsState.assets).length,
    allFileContentCount: Object.keys(assetsState.allFileContents).length,
    selectedFileName: assetsState.selectedFile?.name ?? null,
    originalUrdfContentLength: assetsState.originalUrdfContent.length,
  };
}

export function didHandoffImportLikelySucceed(
  before: HandoffImportSnapshot,
  after: HandoffImportSnapshot,
): boolean {
  return (
    after.availableFileCount > before.availableFileCount ||
    after.assetCount > before.assetCount ||
    after.allFileContentCount > before.allFileContentCount ||
    after.selectedFileName !== before.selectedFileName ||
    after.originalUrdfContentLength > before.originalUrdfContentLength
  );
}

export function buildFileFromHandoffRecord(record: PopupHandoffArchiveRecord): File {
  return new File([record.zipBlob], record.fileName, {
    type: record.mimeType || 'application/zip',
    lastModified: record.createdAt,
  });
}
