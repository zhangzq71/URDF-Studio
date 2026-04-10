import * as THREE from 'three';

import {
  canSerializeColladaInWorker,
  createSceneFromSerializedColladaData,
  type SerializedColladaSceneData,
} from './colladaWorkerSceneData';
import type {
  ColladaParseWorkerResponse,
  ParseColladaWorkerRequest,
} from './colladaParseWorkerProtocol';

interface WorkerLike {
  addEventListener: (
    type: 'message' | 'error',
    listener: EventListenerOrEventListenerObject,
  ) => void;
  removeEventListener: (
    type: 'message' | 'error',
    listener: EventListenerOrEventListenerObject,
  ) => void;
  postMessage: (message: ParseColladaWorkerRequest) => void;
  terminate: () => void;
}

interface WorkerPoolEntry {
  pendingCount: number;
  worker: WorkerLike;
}

interface PendingWorkerRequest {
  reject: (error: unknown) => void;
  resolve: (result: SerializedColladaSceneData) => void;
  workerEntry: WorkerPoolEntry;
}

interface CreateColladaParseWorkerPoolClientOptions {
  cacheLimit?: number;
  canUseWorker?: () => boolean;
  createWorker?: () => WorkerLike;
  getWorkerCount?: () => number;
}

interface ColladaParseWorkerPoolClient {
  clearCache: () => void;
  dispose: (rejectPendingWith?: unknown) => void;
  load: (assetUrl: string, manager: THREE.LoadingManager) => Promise<THREE.Object3D>;
}

const DEFAULT_CACHE_LIMIT = 24;

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
  if (event.error instanceof Error) {
    return event.error;
  }

  return new Error(event.message || 'Collada parse worker failed');
}

function resolveDefaultWorkerCount(): number {
  if (typeof navigator === 'undefined') {
    return 1;
  }

  const hardwareConcurrency = Number(navigator.hardwareConcurrency || 2);
  return Math.max(1, Math.min(10, Math.floor(hardwareConcurrency / 2)));
}

export function createColladaParseWorkerPoolClient({
  cacheLimit = DEFAULT_CACHE_LIMIT,
  canUseWorker = () => typeof Worker !== 'undefined',
  createWorker = () =>
    new Worker(new URL('./workers/colladaParse.worker.ts', import.meta.url), { type: 'module' }),
  getWorkerCount = resolveDefaultWorkerCount,
}: CreateColladaParseWorkerPoolClientOptions = {}): ColladaParseWorkerPoolClient {
  const resolvedCache = new Map<string, SerializedColladaSceneData>();
  const pendingLoads = new Map<string, Promise<THREE.Object3D>>();
  const pendingRequests = new Map<number, PendingWorkerRequest>();
  const workerPool: WorkerPoolEntry[] = [];
  let requestIdCounter = 0;
  let workerUnavailable = false;

  const touchResolvedCache = (assetUrl: string, result: SerializedColladaSceneData): void => {
    if (resolvedCache.has(assetUrl)) {
      resolvedCache.delete(assetUrl);
    }
    resolvedCache.set(assetUrl, result);

    while (resolvedCache.size > cacheLimit) {
      const oldestEntry = resolvedCache.keys().next();
      if (oldestEntry.done) {
        return;
      }

      resolvedCache.delete(oldestEntry.value);
    }
  };

  const clearPendingWorkerRequest = (requestId: number): PendingWorkerRequest | null => {
    const pendingRequest = pendingRequests.get(requestId) ?? null;
    if (!pendingRequest) {
      return null;
    }

    pendingRequests.delete(requestId);
    pendingRequest.workerEntry.pendingCount = Math.max(
      0,
      pendingRequest.workerEntry.pendingCount - 1,
    );
    return pendingRequest;
  };

  const disposeWorkerPool = (rejectPendingWith?: unknown): void => {
    workerPool.forEach((entry) => {
      entry.worker.removeEventListener('message', handleWorkerMessage as EventListener);
      entry.worker.removeEventListener('error', handleWorkerError as EventListener);
      entry.worker.terminate();
    });
    workerPool.length = 0;

    if (rejectPendingWith !== undefined) {
      pendingRequests.forEach((request, requestId) => {
        clearPendingWorkerRequest(requestId);
        request.reject(rejectPendingWith);
      });
    }
  };

  const clearCache = (): void => {
    resolvedCache.clear();
  };

  const handleWorkerMessage = (event: MessageEvent<ColladaParseWorkerResponse>): void => {
    const message = event.data;
    if (!message) {
      return;
    }

    const pendingRequest = clearPendingWorkerRequest(message.requestId);
    if (!pendingRequest) {
      return;
    }

    if (message.type === 'parse-collada-error') {
      const workerError = new Error(message.error || 'Collada parse worker failed');
      console.error(
        '[ColladaParseWorkerBridge] Worker returned a Collada parse failure.',
        workerError,
      );
      pendingRequest.reject(workerError);
      return;
    }

    pendingRequest.resolve(message.result);
  };

  const handleWorkerError = (event: ErrorEvent): void => {
    const workerError = createWorkerError(event);
    console.error('[ColladaParseWorkerBridge] Collada parse worker crashed.', workerError);
    workerUnavailable = true;
    disposeWorkerPool(workerError);
  };

  const ensureWorkerPool = (): WorkerPoolEntry[] => {
    if (workerPool.length > 0) {
      return workerPool;
    }

    const workerCount = Math.max(1, getWorkerCount());
    for (let index = 0; index < workerCount; index += 1) {
      const worker = createWorker();
      worker.addEventListener('message', handleWorkerMessage as EventListener);
      worker.addEventListener('error', handleWorkerError as EventListener);
      workerPool.push({
        worker,
        pendingCount: 0,
      });
    }

    return workerPool;
  };

  const dispatchToWorkerPool = async (
    assetUrl: string,
    manager: THREE.LoadingManager,
  ): Promise<THREE.Object3D> => {
    if (workerUnavailable) {
      throw new Error('Collada parse worker is unavailable');
    }

    if (!canUseWorker()) {
      throw new Error('Collada parse worker is unavailable in this environment');
    }

    const cachedResult = resolvedCache.get(assetUrl);
    if (cachedResult) {
      touchResolvedCache(assetUrl, cachedResult);
      return createSceneFromSerializedColladaData(cachedResult, { manager });
    }

    const pool = ensureWorkerPool();
    const workerEntry = pool.reduce(
      (bestEntry, entry) => (entry.pendingCount < bestEntry.pendingCount ? entry : bestEntry),
      pool[0],
    );

    const workerResult = await new Promise<SerializedColladaSceneData>((resolve, reject) => {
      const requestId = ++requestIdCounter;
      pendingRequests.set(requestId, {
        resolve,
        reject,
        workerEntry,
      });
      workerEntry.pendingCount += 1;

      try {
        workerEntry.worker.postMessage({
          type: 'parse-collada',
          requestId,
          assetUrl,
        });
      } catch (error) {
        console.error(
          '[ColladaParseWorkerBridge] Failed to dispatch Collada parse request to worker.',
          {
            assetUrl,
            error,
          },
        );
        clearPendingWorkerRequest(requestId);
        workerUnavailable = true;
        disposeWorkerPool(error);
        reject(error);
      }
    });

    touchResolvedCache(assetUrl, workerResult);
    return createSceneFromSerializedColladaData(workerResult, { manager });
  };

  const load = async (assetUrl: string, manager: THREE.LoadingManager): Promise<THREE.Object3D> => {
    const pendingLoad = pendingLoads.get(assetUrl);
    if (pendingLoad) {
      return await pendingLoad;
    }

    const nextLoad = dispatchToWorkerPool(assetUrl, manager).finally(() => {
      pendingLoads.delete(assetUrl);
    });

    pendingLoads.set(assetUrl, nextLoad);
    return await nextLoad;
  };

  return {
    clearCache,
    dispose: disposeWorkerPool,
    load,
  };
}

const sharedColladaParseWorkerPoolClient = createColladaParseWorkerPoolClient();

export async function loadColladaScene(
  assetUrl: string,
  manager: THREE.LoadingManager,
): Promise<THREE.Object3D> {
  return await sharedColladaParseWorkerPoolClient.load(assetUrl, manager);
}

export function clearColladaParseWorkerPoolClientCache(): void {
  sharedColladaParseWorkerPoolClient.clearCache();
}

export function disposeColladaParseWorkerPoolClient(rejectPendingWith?: unknown): void {
  sharedColladaParseWorkerPoolClient.dispose(rejectPendingWith);
}

export { canSerializeColladaInWorker };
