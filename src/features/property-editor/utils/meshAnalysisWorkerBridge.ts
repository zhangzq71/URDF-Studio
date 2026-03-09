import {
  computeMeshAnalysisFromAssets,
  type MeshAnalysis,
  type MeshAnalysisOptions,
} from './geometryConversion';

interface MeshAnalysisBatchTask {
  targetId: string;
  cacheKey: string;
  meshPath: string;
  dimensions?: { x: number; y: number; z: number };
}

interface AnalyzeMeshBatchArgs {
  assets: Record<string, string>;
  tasks: MeshAnalysisBatchTask[];
  options?: MeshAnalysisOptions;
  signal?: AbortSignal;
}

interface MeshAnalysisWorkerResult {
  targetId: string;
  cacheKey: string;
  analysis: MeshAnalysis | null;
}

interface MeshAnalysisWorkerResponse {
  type: 'batch-result' | 'batch-error';
  requestId: number;
  results?: MeshAnalysisWorkerResult[];
  error?: string;
}

interface PendingWorkerRequest {
  results: Record<string, MeshAnalysis | null>;
  resolve: (value: Record<string, MeshAnalysis | null>) => void;
  reject: (error: unknown) => void;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

const meshAnalysisCache = new Map<string, MeshAnalysis | null>();
const pendingWorkerRequests = new Map<number, PendingWorkerRequest>();
let requestIdCounter = 0;
let sharedWorker: Worker | null = null;

function createOptionsCacheKey(options?: MeshAnalysisOptions): string {
  return JSON.stringify({
    includePrimitiveFits: options?.includePrimitiveFits ?? 'default',
    includeSurfacePoints: options?.includeSurfacePoints ?? 'default',
    pointCollectionLimit: options?.pointCollectionLimit ?? 'default',
    surfacePointLimit: options?.surfacePointLimit ?? 'default',
  });
}

function createRequestCacheKey(cacheKey: string, options?: MeshAnalysisOptions): string {
  return `${cacheKey}::${createOptionsCacheKey(options)}`;
}

function createAbortError(): DOMException {
  return new DOMException('Mesh analysis aborted', 'AbortError');
}

function clearPendingWorkerRequest(requestId: number): PendingWorkerRequest | null {
  const pendingRequest = pendingWorkerRequests.get(requestId) ?? null;
  if (!pendingRequest) {
    return null;
  }

  pendingWorkerRequests.delete(requestId);
  if (pendingRequest.abortHandler) {
    pendingRequest.signal?.removeEventListener('abort', pendingRequest.abortHandler);
  }

  return pendingRequest;
}

function disposeSharedWorker(rejectPendingWith?: unknown): void {
  if (sharedWorker) {
    sharedWorker.removeEventListener('message', handleSharedWorkerMessage);
    sharedWorker.removeEventListener('error', handleSharedWorkerError);
    sharedWorker.terminate();
    sharedWorker = null;
  }

  if (rejectPendingWith !== undefined) {
    pendingWorkerRequests.forEach((request, requestId) => {
      clearPendingWorkerRequest(requestId);
      request.reject(rejectPendingWith);
    });
  }
}

function handleSharedWorkerMessage(event: MessageEvent<MeshAnalysisWorkerResponse>): void {
  const message = event.data;
  if (!message) {
    return;
  }

  const pendingRequest = clearPendingWorkerRequest(message.requestId);
  if (!pendingRequest) {
    return;
  }

  if (message.type === 'batch-error') {
    pendingRequest.reject(new Error(message.error || 'Mesh analysis worker failed'));
    return;
  }

  const workerResults = message.results ?? [];
  workerResults.forEach((entry) => {
    meshAnalysisCache.set(entry.cacheKey, entry.analysis ?? null);
    pendingRequest.results[entry.targetId] = entry.analysis ?? null;
  });
  pendingRequest.resolve(pendingRequest.results);
}

function handleSharedWorkerError(event: ErrorEvent): void {
  const error = event.error ?? new Error(event.message || 'Mesh analysis worker failed');
  disposeSharedWorker(error);
}

function ensureSharedWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(
      new URL('../workers/meshAnalysis.worker.ts', import.meta.url),
      { type: 'module' },
    );
    sharedWorker.addEventListener('message', handleSharedWorkerMessage);
    sharedWorker.addEventListener('error', handleSharedWorkerError);
  }

  return sharedWorker;
}

async function analyzeMeshBatchOnMainThread({
  assets,
  tasks,
  options,
  signal,
}: AnalyzeMeshBatchArgs): Promise<Record<string, MeshAnalysis | null>> {
  const results: Record<string, MeshAnalysis | null> = {};

  for (let index = 0; index < tasks.length; index += 1) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const task = tasks[index];
    const requestCacheKey = createRequestCacheKey(task.cacheKey, options);
    const analysis = await computeMeshAnalysisFromAssets(
      task.meshPath,
      assets,
      task.dimensions,
      options,
    );

    meshAnalysisCache.set(requestCacheKey, analysis ?? null);
    results[task.targetId] = analysis ?? null;
  }

  return results;
}

export async function analyzeMeshBatchWithWorker({
  assets,
  tasks,
  options,
  signal,
}: AnalyzeMeshBatchArgs): Promise<Record<string, MeshAnalysis | null>> {
  const results: Record<string, MeshAnalysis | null> = {};
  const pendingTasks: MeshAnalysisBatchTask[] = [];

  tasks.forEach((task) => {
    const requestCacheKey = createRequestCacheKey(task.cacheKey, options);
    if (meshAnalysisCache.has(requestCacheKey)) {
      results[task.targetId] = meshAnalysisCache.get(requestCacheKey) ?? null;
      return;
    }
    pendingTasks.push({
      ...task,
      cacheKey: requestCacheKey,
    });
  });

  if (pendingTasks.length === 0) {
    return results;
  }

  if (typeof Worker === 'undefined') {
    const fallbackResults = await analyzeMeshBatchOnMainThread({
      assets,
      tasks: pendingTasks,
      options,
      signal,
    });
    return { ...results, ...fallbackResults };
  }

  return await new Promise<Record<string, MeshAnalysis | null>>((resolve, reject) => {
    const requestId = ++requestIdCounter;
    const worker = ensureSharedWorker();

    const handleAbort = () => {
      const pendingRequest = clearPendingWorkerRequest(requestId);
      if (!pendingRequest) {
        return;
      }
      pendingRequest.reject(createAbortError());
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    pendingWorkerRequests.set(requestId, {
      results,
      resolve,
      reject,
      abortHandler: handleAbort,
      signal,
    });
    signal?.addEventListener('abort', handleAbort, { once: true });

    worker.postMessage({
      type: 'analyze-batch',
      requestId,
      assets,
      tasks: pendingTasks,
      options,
    });
  });
}
