import type { ExternalImportHandoffRecord } from './externalImportHandoffStorage';
import {
  EXTERNAL_IMPORT_HANDOFF_QUERY_PARAM,
  stripExternalImportHandoffQueryParam,
} from './externalImportHandoffProtocol';
import { isExternalImportHandoffRecordExpired } from './externalImportHandoffStorage';

export type ExternalImportHandoffBootstrapResult =
  | 'idle'
  | 'missing'
  | 'expired'
  | 'imported'
  | 'failed';

export interface BootstrapExternalImportHandoffOptions {
  locationHref: string;
  now?: number;
  loadRecord: (id: string) => Promise<ExternalImportHandoffRecord | null>;
  deleteRecord: (id: string) => Promise<void>;
  pruneExpiredRecords?: (now?: number) => Promise<number>;
  importFiles: (files: readonly File[]) => Promise<boolean>;
  replaceLocation: (nextRelativeUrl: string) => void;
  onUnavailable: () => void;
  onExpired: () => void;
}

export function readExternalImportHandoffIdFromLocation(
  locationHref: string,
  queryParam = EXTERNAL_IMPORT_HANDOFF_QUERY_PARAM,
): string | null {
  const url = new URL(locationHref, 'https://urdf-studio.local');
  const handoffId = url.searchParams.get(queryParam)?.trim() ?? '';
  return handoffId.length > 0 ? handoffId : null;
}

export async function bootstrapExternalImportHandoff(
  options: BootstrapExternalImportHandoffOptions,
): Promise<ExternalImportHandoffBootstrapResult> {
  const {
    locationHref,
    now = Date.now(),
    loadRecord,
    deleteRecord,
    pruneExpiredRecords,
    importFiles,
    replaceLocation,
    onUnavailable,
    onExpired,
  } = options;

  const handoffId = readExternalImportHandoffIdFromLocation(locationHref);
  if (!handoffId) {
    return 'idle';
  }

  replaceLocation(stripExternalImportHandoffQueryParam(locationHref));
  await pruneExpiredRecords?.(now);

  const record = await loadRecord(handoffId);
  if (!record) {
    onUnavailable();
    return 'missing';
  }

  if (isExternalImportHandoffRecordExpired(record, now)) {
    await deleteRecord(record.id);
    onExpired();
    return 'expired';
  }

  const importFile = new File([record.zipBlob], record.fileName, {
    type: record.mimeType || 'application/zip',
    lastModified: record.createdAt,
  });
  const imported = await importFiles([importFile]);

  if (imported) {
    await deleteRecord(record.id);
    return 'imported';
  }

  return 'failed';
}
