import { HANDOFF_DEFAULT_TTL_MS, type HandoffStoredZipRecord } from './protocol';

export interface HandoffStore {
  get(id: string): Promise<HandoffStoredZipRecord | null>;
  put(record: HandoffStoredZipRecord): Promise<void>;
  delete(id: string): Promise<void>;
  getAll(): Promise<HandoffStoredZipRecord[]>;
}

class MemoryHandoffStore implements HandoffStore {
  private readonly records = new Map<string, HandoffStoredZipRecord>();

  async get(id: string): Promise<HandoffStoredZipRecord | null> {
    return this.records.get(id) ?? null;
  }

  async put(record: HandoffStoredZipRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async getAll(): Promise<HandoffStoredZipRecord[]> {
    return Array.from(this.records.values());
  }
}

const HANDOFF_DATABASE_NAME = 'urdf-studio-handoff';
const HANDOFF_STORE_NAME = 'zip-records';
const HANDOFF_DATABASE_VERSION = 1;

class IndexedDbHandoffStore implements HandoffStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private async openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this browser context.');
    }

    if (this.databasePromise) {
      return this.databasePromise;
    }

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(HANDOFF_DATABASE_NAME, HANDOFF_DATABASE_VERSION);

      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(HANDOFF_STORE_NAME)) {
          database.createObjectStore(HANDOFF_STORE_NAME, { keyPath: 'id' });
        }
      });

      request.addEventListener('success', () => {
        resolve(request.result);
      });

      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to open the handoff database.'));
      });
    });

    return this.databasePromise;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    executor: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.openDatabase();
    const transaction = database.transaction(HANDOFF_STORE_NAME, mode);
    const store = transaction.objectStore(HANDOFF_STORE_NAME);

    return await new Promise<T>((resolve, reject) => {
      const request = executor(store);

      request.addEventListener('success', () => {
        resolve(request.result);
      });

      request.addEventListener('error', () => {
        reject(request.error ?? new Error('IndexedDB request failed.'));
      });

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
      });
    });
  }

  async get(id: string): Promise<HandoffStoredZipRecord | null> {
    const result = await this.withStore<HandoffStoredZipRecord | undefined>('readonly', (store) =>
      store.get(id),
    );
    return result ?? null;
  }

  async put(record: HandoffStoredZipRecord): Promise<void> {
    await this.withStore<IDBValidKey>('readwrite', (store) => store.put(record));
  }

  async delete(id: string): Promise<void> {
    await this.withStore<undefined>('readwrite', (store) => store.delete(id));
  }

  async getAll(): Promise<HandoffStoredZipRecord[]> {
    return await this.withStore<HandoffStoredZipRecord[]>('readonly', (store) => store.getAll());
  }
}

let sharedIndexedDbHandoffStore: HandoffStore | null = null;

export function createMemoryHandoffStore(): HandoffStore {
  return new MemoryHandoffStore();
}

export function getSharedHandoffStore(): HandoffStore {
  if (!sharedIndexedDbHandoffStore) {
    sharedIndexedDbHandoffStore = new IndexedDbHandoffStore();
  }

  return sharedIndexedDbHandoffStore;
}

export async function cleanupExpiredHandoffRecords(
  store: HandoffStore = getSharedHandoffStore(),
  now = Date.now(),
  ttlMs = HANDOFF_DEFAULT_TTL_MS,
): Promise<number> {
  const records = await store.getAll();
  const expiredIds = records
    .filter((record) => now - record.createdAt > ttlMs)
    .map((record) => record.id);

  await Promise.all(expiredIds.map((id) => store.delete(id)));
  return expiredIds.length;
}
