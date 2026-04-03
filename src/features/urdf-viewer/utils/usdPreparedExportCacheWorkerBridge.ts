import type { UsdSceneSnapshot } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData.ts';
import type {
  PreparedUsdExportCacheResult,
} from './usdExportBundle.ts';
import { hydratePreparedUsdExportCacheFromWorker } from './usdPreparedExportCacheWorkerTransfer.ts';
import type {
  PrepareUsdPreparedExportCacheWorkerRequest,
  UsdPreparedExportCacheWorkerRequest,
  UsdPreparedExportCacheWorkerResponse,
} from './usdPreparedExportCacheWorker.ts';

interface WorkerLike {
  addEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
  postMessage: (message: UsdPreparedExportCacheWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
}

interface PendingWorkerRequest {
  resolve: (value: PreparedUsdExportCacheResult | null) => void;
  reject: (error: unknown) => void;
}

interface CreateUsdPreparedExportCacheWorkerClientOptions {
  canUseWorker?: () => boolean;
  createWorker?: () => WorkerLike;
}

interface UsdPreparedExportCacheWorkerClient {
  dispose: (rejectPendingWith?: unknown) => void;
  prepare: (
    snapshot: UsdSceneSnapshot,
    resolution: ViewerRobotDataResolution,
  ) => Promise<PreparedUsdExportCacheResult | null>;
}

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
  if (event.error instanceof Error) {
    return event.error;
  }

  return new Error(event.message || 'USD prepared export cache worker failed');
}

export function createUsdPreparedExportCacheWorkerClient(
  {
    canUseWorker = () => typeof Worker !== 'undefined',
    createWorker = () => new Worker(
      new URL('../workers/usdPreparedExportCache.worker.ts', import.meta.url),
      { type: 'module' },
    ),
  }: CreateUsdPreparedExportCacheWorkerClientOptions = {},
): UsdPreparedExportCacheWorkerClient {
  const pendingRequests = new Map<number, PendingWorkerRequest>();
  let requestIdCounter = 0;
  let sharedWorker: WorkerLike | null = null;
  let workerUnavailable = false;

  const clearPendingRequest = (requestId: number): PendingWorkerRequest | null => {
    const pendingRequest = pendingRequests.get(requestId) ?? null;
    if (!pendingRequest) {
      return null;
    }

    pendingRequests.delete(requestId);
    return pendingRequest;
  };

  const disposeSharedWorker = (rejectPendingWith?: unknown): void => {
    if (sharedWorker) {
      sharedWorker.removeEventListener('message', handleSharedWorkerMessage as EventListener);
      sharedWorker.removeEventListener('error', handleSharedWorkerError as EventListener);
      sharedWorker.terminate();
      sharedWorker = null;
    }

    if (rejectPendingWith !== undefined) {
      pendingRequests.forEach((request, requestId) => {
        clearPendingRequest(requestId);
        request.reject(rejectPendingWith);
      });
    }
  };

  const handleSharedWorkerMessage = (event: MessageEvent<UsdPreparedExportCacheWorkerResponse>): void => {
    const message = event.data;
    if (!message) {
      return;
    }

    const pendingRequest = clearPendingRequest(message.requestId);
    if (!pendingRequest) {
      return;
    }

    if (message.type === 'prepare-usd-prepared-export-cache-error') {
      pendingRequest.reject(new Error(message.error || 'USD prepared export cache worker failed'));
      return;
    }

    pendingRequest.resolve(
      message.result
        ? hydratePreparedUsdExportCacheFromWorker(message.result)
        : null,
    );
  };

  const handleSharedWorkerError = (event: ErrorEvent): void => {
    workerUnavailable = true;
    disposeSharedWorker(createWorkerError(event));
  };

  const ensureSharedWorker = (): WorkerLike => {
    if (!sharedWorker) {
      sharedWorker = createWorker();
      sharedWorker.addEventListener('message', handleSharedWorkerMessage as EventListener);
      sharedWorker.addEventListener('error', handleSharedWorkerError as EventListener);
    }

    return sharedWorker;
  };

  const prepare = async (
    snapshot: UsdSceneSnapshot,
    resolution: ViewerRobotDataResolution,
  ): Promise<PreparedUsdExportCacheResult | null> => {
    if (workerUnavailable) {
      throw new Error('USD prepared export cache worker is unavailable');
    }

    if (!canUseWorker()) {
      throw new Error('Web Worker is not available in this environment');
    }

    return new Promise<PreparedUsdExportCacheResult | null>((resolveRequest, rejectRequest) => {
      const requestId = ++requestIdCounter;
      let worker: WorkerLike;

      try {
        worker = ensureSharedWorker();
      } catch (error) {
        workerUnavailable = true;
        rejectRequest(error);
        return;
      }

      const request: PrepareUsdPreparedExportCacheWorkerRequest = {
        type: 'prepare-usd-prepared-export-cache',
        requestId,
        snapshot,
        resolution,
      };

      pendingRequests.set(requestId, {
        resolve: resolveRequest,
        reject: rejectRequest,
      });

      try {
        worker.postMessage(request);
      } catch (error) {
        workerUnavailable = true;
        clearPendingRequest(requestId);
        disposeSharedWorker(error);
        rejectRequest(error);
      }
    });
  };

  return {
    dispose: disposeSharedWorker,
    prepare,
  };
}

const sharedUsdPreparedExportCacheWorkerClient = createUsdPreparedExportCacheWorkerClient();

export function prepareUsdPreparedExportCacheWithWorker(
  snapshot: UsdSceneSnapshot,
  resolution: ViewerRobotDataResolution,
): Promise<PreparedUsdExportCacheResult | null> {
  return sharedUsdPreparedExportCacheWorkerClient.prepare(snapshot, resolution);
}

export function disposeUsdPreparedExportCacheWorker(rejectPendingWith?: unknown): void {
  sharedUsdPreparedExportCacheWorkerClient.dispose(rejectPendingWith);
}
