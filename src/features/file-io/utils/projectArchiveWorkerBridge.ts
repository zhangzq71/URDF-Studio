import type {
  BuildProjectArchiveWorkerRequest,
  ProjectArchiveWorkerRequest,
  ProjectArchiveWorkerResponse,
} from './projectArchiveWorker.ts';
import {
  hydrateProjectArchiveBlobFromWorker,
  serializeProjectArchiveEntriesForWorker,
  type ProjectArchiveEntryData,
} from './projectArchiveWorkerTransfer.ts';

interface WorkerLike {
  addEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
  postMessage: (message: ProjectArchiveWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
}

interface PendingWorkerRequest {
  resolve: (value: Blob) => void;
  reject: (error: unknown) => void;
  onProgress?: (progress: {
    completed: number;
    total: number;
    label?: string;
  }) => void;
}

interface CreateProjectArchiveWorkerClientOptions {
  canUseWorker?: () => boolean;
  createWorker?: () => WorkerLike;
}

interface BuildProjectArchiveWithWorkerOptions {
  compressionLevel?: number;
  onProgress?: (progress: {
    completed: number;
    total: number;
    label?: string;
  }) => void;
}

interface ProjectArchiveWorkerClient {
  dispose: (rejectPendingWith?: unknown) => void;
  build: (
    entries: Map<string, ProjectArchiveEntryData>,
    options?: BuildProjectArchiveWithWorkerOptions,
  ) => Promise<Blob>;
}

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
  if (event.error instanceof Error) {
    return event.error;
  }

  return new Error(event.message || 'Project archive worker failed');
}

export function createProjectArchiveWorkerClient(
  {
    canUseWorker = () => typeof Worker !== 'undefined',
    createWorker = () => new Worker(
      new URL('../workers/projectArchive.worker.ts', import.meta.url),
      { type: 'module' },
    ),
  }: CreateProjectArchiveWorkerClientOptions = {},
): ProjectArchiveWorkerClient {
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

  const handleSharedWorkerMessage = (event: MessageEvent<ProjectArchiveWorkerResponse>): void => {
    const message = event.data;
    if (!message) {
      return;
    }

    const pendingRequest = pendingRequests.get(message.requestId) ?? null;
    if (!pendingRequest) {
      return;
    }

    if (message.type === 'build-project-archive-progress') {
      pendingRequest.onProgress?.({
        completed: message.completed,
        total: message.total,
        label: message.label,
      });
      return;
    }

    clearPendingRequest(message.requestId);

    if (message.type === 'build-project-archive-error') {
      pendingRequest.reject(new Error(message.error || 'Project archive worker failed'));
      return;
    }

    pendingRequest.resolve(hydrateProjectArchiveBlobFromWorker(message.result));
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

  const build = async (
    entries: Map<string, ProjectArchiveEntryData>,
    options: BuildProjectArchiveWithWorkerOptions = {},
  ): Promise<Blob> => {
    if (workerUnavailable) {
      throw new Error('Project archive worker is unavailable');
    }

    if (!canUseWorker()) {
      throw new Error('Web Worker is not available in this environment');
    }

    const serialized = await serializeProjectArchiveEntriesForWorker(entries);

    return new Promise<Blob>((resolveRequest, rejectRequest) => {
      const requestId = ++requestIdCounter;
      let worker: WorkerLike;

      try {
        worker = ensureSharedWorker();
      } catch (error) {
        workerUnavailable = true;
        rejectRequest(error);
        return;
      }

      const request: BuildProjectArchiveWorkerRequest = {
        type: 'build-project-archive',
        requestId,
        payload: serialized.payload,
        compressionLevel: options.compressionLevel,
      };

      pendingRequests.set(requestId, {
        resolve: resolveRequest,
        reject: rejectRequest,
        onProgress: options.onProgress,
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
    build,
  };
}

const sharedProjectArchiveWorkerClient = createProjectArchiveWorkerClient();

export function buildProjectArchiveBlobWithWorker(
  entries: Map<string, ProjectArchiveEntryData>,
  options: BuildProjectArchiveWithWorkerOptions = {},
): Promise<Blob> {
  return sharedProjectArchiveWorkerClient.build(entries, options);
}

export function disposeProjectArchiveWorker(rejectPendingWith?: unknown): void {
  sharedProjectArchiveWorkerClient.dispose(rejectPendingWith);
}
