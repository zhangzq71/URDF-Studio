import { EXTERNAL_IMPORT_HANDOFF_MAX_BYTES } from './externalImportHandoffProtocol';

const EXTERNAL_IMPORT_HANDOFF_DB_NAME = 'urdf-studio-external-import-handoff';
const EXTERNAL_IMPORT_HANDOFF_STORE_NAME = 'records';
const EXTERNAL_IMPORT_HANDOFF_DB_VERSION = 1;

export const EXTERNAL_IMPORT_HANDOFF_TTL_MS = 15 * 60 * 1000;

export interface ExternalImportHandoffRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceOrigin: string;
  createdAt: number;
  zipBlob: Blob;
}

let openDatabasePromise: Promise<IDBDatabase> | null = null;

function createIndexedDbUnavailableError(): Error {
  return new Error(
    'IndexedDB is unavailable. URDF Studio cannot receive shared ZIP handoffs in this browser.',
  );
}

function ensureIndexedDb(): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    throw createIndexedDbUnavailableError();
  }

  return indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  if (openDatabasePromise) {
    return openDatabasePromise;
  }

  const indexedDb = ensureIndexedDb();
  openDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDb.open(
      EXTERNAL_IMPORT_HANDOFF_DB_NAME,
      EXTERNAL_IMPORT_HANDOFF_DB_VERSION,
    );

    request.onerror = () => {
      reject(request.error ?? createIndexedDbUnavailableError());
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EXTERNAL_IMPORT_HANDOFF_STORE_NAME)) {
        database.createObjectStore(EXTERNAL_IMPORT_HANDOFF_STORE_NAME, {
          keyPath: 'id',
        });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onclose = () => {
        openDatabasePromise = null;
      };
      resolve(database);
    };
  });

  return openDatabasePromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(EXTERNAL_IMPORT_HANDOFF_STORE_NAME, mode);
        const store = transaction.objectStore(EXTERNAL_IMPORT_HANDOFF_STORE_NAME);

        transaction.onerror = () => {
          reject(transaction.error ?? new Error('External import handoff transaction failed.'));
        };

        Promise.resolve(run(store, transaction)).then(resolve, reject);
      }),
  );
}

export function createExternalImportHandoffId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `handoff_${Date.now().toString(36)}_${randomSuffix}`;
}

export async function storeExternalImportHandoffRecord(
  record: ExternalImportHandoffRecord,
): Promise<void> {
  if (record.sizeBytes > EXTERNAL_IMPORT_HANDOFF_MAX_BYTES) {
    throw new Error(
      `Shared ZIP exceeds the maximum supported size of ${EXTERNAL_IMPORT_HANDOFF_MAX_BYTES} bytes.`,
    );
  }

  await withStore('readwrite', (store) => {
    const request = store.put(record);
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to store shared ZIP.'));
    });
  });
}

export async function readExternalImportHandoffRecord(
  id: string,
): Promise<ExternalImportHandoffRecord | null> {
  return await withStore('readonly', (store) => {
    const request = store.get(id);
    return new Promise<ExternalImportHandoffRecord | null>((resolve, reject) => {
      request.onsuccess = () => {
        resolve((request.result as ExternalImportHandoffRecord | undefined) ?? null);
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to read shared ZIP.'));
    });
  });
}

export async function deleteExternalImportHandoffRecord(id: string): Promise<void> {
  await withStore('readwrite', (store) => {
    const request = store.delete(id);
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to delete shared ZIP.'));
    });
  });
}

export function isExternalImportHandoffRecordExpired(
  record: Pick<ExternalImportHandoffRecord, 'createdAt'>,
  now = Date.now(),
): boolean {
  return now - record.createdAt > EXTERNAL_IMPORT_HANDOFF_TTL_MS;
}

export async function pruneExpiredExternalImportHandoffRecords(now = Date.now()): Promise<number> {
  return await withStore('readwrite', (store) => {
    const request = store.openCursor();

    return new Promise<number>((resolve, reject) => {
      let deletedCount = 0;

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to prune shared ZIP handoffs.'));
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(deletedCount);
          return;
        }

        const record = cursor.value as ExternalImportHandoffRecord;
        if (isExternalImportHandoffRecordExpired(record, now)) {
          const deleteRequest = cursor.delete();
          deleteRequest.onerror = () => {
            reject(deleteRequest.error ?? new Error('Failed to delete expired shared ZIP.'));
          };
          deleteRequest.onsuccess = () => {
            deletedCount += 1;
            cursor.continue();
          };
          return;
        }

        cursor.continue();
      };
    });
  });
}
