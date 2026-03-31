import type {
  ExportRobotToUsdOptions,
  ExportRobotToUsdPayload,
} from './usdExportCoordinator.ts';
import { assertUsdExportWorkerSupport } from './usdExportWorkerSupport.ts';
import type {
  ExportRobotToUsdWorkerRequest,
  UsdExportWorkerRequest,
  UsdExportWorkerResponse,
} from './usdExportWorker.ts';
import {
  hydrateUsdExportResultFromWorker,
  serializeUsdExportRequestForWorker,
} from './usdExportWorkerTransfer.ts';

interface WorkerLike {
  addEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
  postMessage: (message: UsdExportWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
}

interface PendingWorkerRequest {
  resolve: (value: ExportRobotToUsdPayload) => void;
  reject: (error: unknown) => void;
  onProgress?: ExportRobotToUsdOptions['onProgress'];
}

interface CreateUsdExportWorkerClientOptions {
  canUseWorker?: () => boolean;
  createWorker?: () => WorkerLike;
}

interface UsdExportWorkerClient {
  dispose: (rejectPendingWith?: unknown) => void;
  export: (options: ExportRobotToUsdOptions) => Promise<ExportRobotToUsdPayload>;
}

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
  if (event.error instanceof Error) {
    return event.error;
  }

  return new Error(event.message || 'USD export worker failed');
}

export function createUsdExportWorkerClient(
  {
    canUseWorker = () => typeof Worker !== 'undefined',
    createWorker = () => new Worker(
      new URL('../workers/usdExport.worker.ts', import.meta.url),
      { type: 'module' },
    ),
  }: CreateUsdExportWorkerClientOptions = {},
): UsdExportWorkerClient {
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

  const handleSharedWorkerMessage = (event: MessageEvent<UsdExportWorkerResponse>): void => {
    const message = event.data;
    if (!message) {
      return;
    }

    const pendingRequest = pendingRequests.get(message.requestId) ?? null;
    if (!pendingRequest) {
      return;
    }

    if (message.type === 'export-robot-to-usd-progress') {
      pendingRequest.onProgress?.(message.progress);
      return;
    }

    clearPendingRequest(message.requestId);

    if (message.type === 'export-robot-to-usd-error') {
      pendingRequest.reject(new Error(message.error || 'USD export worker failed'));
      return;
    }

    pendingRequest.resolve(hydrateUsdExportResultFromWorker(message.result));
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

  const exportWithWorker = async (options: ExportRobotToUsdOptions): Promise<ExportRobotToUsdPayload> => {
    if (workerUnavailable) {
      throw new Error('USD export worker is unavailable');
    }

    if (!canUseWorker()) {
      throw new Error('Web Worker is not available in this environment');
    }

    assertUsdExportWorkerSupport(options.robot);

    const { onProgress, ...requestOptions } = options;
    const serialized = await serializeUsdExportRequestForWorker(requestOptions);

    return new Promise<ExportRobotToUsdPayload>((resolveRequest, rejectRequest) => {
      const requestId = ++requestIdCounter;
      let worker: WorkerLike;

      try {
        worker = ensureSharedWorker();
      } catch (error) {
        workerUnavailable = true;
        rejectRequest(error);
        return;
      }

      const request: ExportRobotToUsdWorkerRequest = {
        type: 'export-robot-to-usd',
        requestId,
        payload: serialized.payload,
      };

      pendingRequests.set(requestId, {
        resolve: resolveRequest,
        reject: rejectRequest,
        onProgress,
      });

      try {
        worker.postMessage(request, serialized.transferables);
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
    export: exportWithWorker,
  };
}

const sharedUsdExportWorkerClient = createUsdExportWorkerClient();

export function exportRobotToUsdWithWorker(
  options: ExportRobotToUsdOptions,
): Promise<ExportRobotToUsdPayload> {
  return sharedUsdExportWorkerClient.export(options);
}

export function disposeUsdExportWorker(rejectPendingWith?: unknown): void {
  sharedUsdExportWorkerClient.dispose(rejectPendingWith);
}
