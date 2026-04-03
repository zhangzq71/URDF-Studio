import type { RobotFile } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData.ts';
import { buildUsdStageOpenPreparationWorkerDispatch } from './usdStageOpenPreparationWorkerPayload.ts';
import type {
  UsdOffscreenViewerInitRequest,
  UsdOffscreenViewerWorkerRequest,
  UsdOffscreenViewerWorkerResponse,
} from './usdOffscreenViewerProtocol.ts';

type WorkerSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
type WorkerAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

interface WorkerLike {
  addEventListener: (
    type: 'message' | 'error' | 'messageerror',
    listener: EventListenerOrEventListenerObject,
  ) => void;
  removeEventListener: (
    type: 'message' | 'error' | 'messageerror',
    listener: EventListenerOrEventListenerObject,
  ) => void;
  postMessage: (message: UsdOffscreenViewerWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
}

interface PendingWorkerRequest {
  reject: (error: unknown) => void;
  teardown: () => void;
}

interface CreateUsdResolvedRobotDataWorkerClientOptions {
  canUseWorker?: () => boolean;
  createCanvas?: () => OffscreenCanvas;
  createWorker?: () => WorkerLike;
  onLoadDebugEntry?: (
    entry: Extract<UsdOffscreenViewerWorkerResponse, { type: 'load-debug' }>['entry'],
  ) => void;
}

interface UsdResolvedRobotDataWorkerClient {
  dispose: (rejectPendingWith?: unknown) => void;
  resolve: (
    sourceFile: WorkerSourceFile,
    availableFiles: WorkerAvailableFile[],
    assets: Record<string, string>,
  ) => Promise<ViewerRobotDataResolution>;
}

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
  if (event.error instanceof Error) {
    return event.error;
  }

  return new Error(event.message || 'USD resolved robot data worker failed');
}

export function supportsUsdResolvedRobotDataWorker(
  globalScope: typeof globalThis = globalThis,
): boolean {
  return Boolean(
    globalScope.Worker && globalScope.OffscreenCanvas && globalScope.crossOriginIsolated,
  );
}

export function createUsdResolvedRobotDataWorkerClient({
  canUseWorker = () => supportsUsdResolvedRobotDataWorker(),
  createCanvas = () => new OffscreenCanvas(1, 1),
  createWorker = () =>
    new Worker(new URL('../workers/usdOffscreenViewer.worker.ts', import.meta.url), {
      type: 'module',
    }),
  onLoadDebugEntry,
}: CreateUsdResolvedRobotDataWorkerClientOptions = {}): UsdResolvedRobotDataWorkerClient {
  const pendingRequests = new Set<PendingWorkerRequest>();

  const dispose = (rejectPendingWith?: unknown): void => {
    pendingRequests.forEach((pendingRequest) => {
      pendingRequest.teardown();
      if (rejectPendingWith !== undefined) {
        pendingRequest.reject(rejectPendingWith);
      }
    });
    pendingRequests.clear();
  };

  const resolve = async (
    sourceFile: WorkerSourceFile,
    availableFiles: WorkerAvailableFile[],
    assets: Record<string, string>,
  ): Promise<ViewerRobotDataResolution> => {
    if (!canUseWorker()) {
      throw new Error('USD resolved robot data worker is unavailable in this environment');
    }

    return await new Promise<ViewerRobotDataResolution>((resolveRequest, rejectRequest) => {
      let worker: WorkerLike | null = null;
      let canvas: OffscreenCanvas | null = null;

      const detachWorker = (): void => {
        if (!worker) {
          return;
        }

        worker.removeEventListener('message', handleWorkerMessage as EventListener);
        worker.removeEventListener('error', handleWorkerError as EventListener);
        worker.removeEventListener('messageerror', handleWorkerMessageError as EventListener);
      };

      const teardown = (): void => {
        pendingRequests.delete(pendingRequest);
        detachWorker();
        if (worker) {
          try {
            worker.postMessage({ type: 'dispose' });
          } catch {}
          worker.terminate();
        }
        worker = null;
        canvas = null;
      };

      const rejectWithError = (error: unknown): void => {
        teardown();
        rejectRequest(error);
      };

      const handleWorkerMessage = (event: MessageEvent<UsdOffscreenViewerWorkerResponse>): void => {
        const message = event.data;
        if (!message) {
          return;
        }

        switch (message.type) {
          case 'robot-data': {
            const resolution = message.resolution;
            teardown();
            resolveRequest(resolution);
            return;
          }
          case 'document-load': {
            if (message.event.status === 'error') {
              rejectWithError(
                new Error(message.event.error || 'USD resolved robot data worker failed'),
              );
            }
            return;
          }
          case 'fatal-error': {
            rejectWithError(new Error(message.error || 'USD resolved robot data worker failed'));
            return;
          }
          case 'load-debug': {
            onLoadDebugEntry?.(message.entry);
            return;
          }
          default: {
            return;
          }
        }
      };

      const handleWorkerError = (event: ErrorEvent): void => {
        rejectWithError(createWorkerError(event));
      };

      const handleWorkerMessageError = (): void => {
        rejectWithError(new Error('USD resolved robot data worker message deserialization failed'));
      };

      const pendingRequest: PendingWorkerRequest = {
        reject: rejectRequest,
        teardown,
      };

      try {
        worker = createWorker();
        canvas = createCanvas();
        worker.addEventListener('message', handleWorkerMessage as EventListener);
        worker.addEventListener('error', handleWorkerError as EventListener);
        worker.addEventListener('messageerror', handleWorkerMessageError as EventListener);
        pendingRequests.add(pendingRequest);
        const stageOpenDispatch = buildUsdStageOpenPreparationWorkerDispatch(
          sourceFile,
          availableFiles,
          assets,
        );

        const initRequest: UsdOffscreenViewerInitRequest = {
          type: 'init',
          canvas,
          width: 1,
          height: 1,
          devicePixelRatio: 1,
          active: false,
          groundPlaneOffset: 0,
          showVisual: true,
          showCollision: true,
          showCollisionAlwaysOnTop: false,
          sourceFile: stageOpenDispatch.sourceFile,
          stageOpenContextKey: stageOpenDispatch.contextCacheKey ?? undefined,
          stageOpenContext: stageOpenDispatch.contextSnapshot,
        };

        worker.postMessage(initRequest, [canvas]);
      } catch (error) {
        rejectWithError(error);
      }
    });
  };

  return {
    dispose,
    resolve,
  };
}
