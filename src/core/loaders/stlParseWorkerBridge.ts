import { parseStlGeometryData, type SerializedStlGeometryData } from './stlGeometryData';
import type { ParseStlWorkerRequest, StlParseWorkerResponse } from './stlParseWorkerProtocol';

interface WorkerLike {
    addEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
    removeEventListener: (type: 'message' | 'error', listener: EventListenerOrEventListenerObject) => void;
    postMessage: (message: ParseStlWorkerRequest) => void;
    terminate: () => void;
}

interface WorkerPoolEntry {
    pendingCount: number;
    worker: WorkerLike;
}

interface PendingWorkerRequest {
    reject: (error: unknown) => void;
    resolve: (result: SerializedStlGeometryData) => void;
    workerEntry: WorkerPoolEntry;
}

interface CreateStlParseWorkerPoolClientOptions {
    canUseWorker?: () => boolean;
    cacheLimit?: number;
    createWorker?: () => WorkerLike;
    getWorkerCount?: () => number;
}

interface StlParseWorkerPoolClient {
    clearCache: () => void;
    dispose: (rejectPendingWith?: unknown) => void;
    load: (assetUrl: string) => Promise<SerializedStlGeometryData>;
}

const DEFAULT_CACHE_LIMIT = 48;

async function loadSerializedStlGeometryDataInline(assetUrl: string): Promise<SerializedStlGeometryData> {
    const response = await fetch(assetUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch STL asset: ${response.status} ${response.statusText}`);
    }

    return parseStlGeometryData(await response.arrayBuffer());
}

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
    if (event.error instanceof Error) {
        return event.error;
    }

    return new Error(event.message || 'STL parse worker failed');
}

function resolveDefaultWorkerCount(): number {
    if (typeof navigator === 'undefined') {
        return 1;
    }

    const hardwareConcurrency = Number(navigator.hardwareConcurrency || 2);
    return Math.max(1, Math.min(10, Math.floor(hardwareConcurrency / 2)));
}

function cloneSerializedStlGeometryData(result: SerializedStlGeometryData): SerializedStlGeometryData {
    return {
        positions: result.positions.slice(0),
        normals: result.normals.slice(0),
        maxDimension: result.maxDimension,
    };
}

export function createStlParseWorkerPoolClient(
    {
        canUseWorker = () => typeof Worker !== 'undefined',
        cacheLimit = DEFAULT_CACHE_LIMIT,
        createWorker = () => new Worker(
            new URL('./workers/stlParse.worker.ts', import.meta.url),
            { type: 'module' },
        ),
        getWorkerCount = resolveDefaultWorkerCount,
    }: CreateStlParseWorkerPoolClientOptions = {},
): StlParseWorkerPoolClient {
    const resolvedCache = new Map<string, SerializedStlGeometryData>();
    const pendingLoads = new Map<string, Promise<SerializedStlGeometryData>>();
    const pendingRequests = new Map<number, PendingWorkerRequest>();
    const workerPool: WorkerPoolEntry[] = [];
    let requestIdCounter = 0;
    let workerUnavailable = false;

    const touchResolvedCache = (assetUrl: string, result: SerializedStlGeometryData): void => {
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
        pendingRequest.workerEntry.pendingCount = Math.max(0, pendingRequest.workerEntry.pendingCount - 1);
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

    const handleWorkerMessage = (event: MessageEvent<StlParseWorkerResponse>): void => {
        const message = event.data;
        if (!message) {
            return;
        }

        const pendingRequest = clearPendingWorkerRequest(message.requestId);
        if (!pendingRequest) {
            return;
        }

        if (message.type === 'parse-stl-error') {
            pendingRequest.reject(new Error(message.error || 'STL parse worker failed'));
            return;
        }

        pendingRequest.resolve(message.result);
    };

    const handleWorkerError = (event: ErrorEvent): void => {
        workerUnavailable = true;
        disposeWorkerPool(createWorkerError(event));
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

    const dispatchToWorkerPool = (assetUrl: string): Promise<SerializedStlGeometryData> => {
        if (workerUnavailable) {
            throw new Error('STL parse worker is unavailable');
        }

        const pool = ensureWorkerPool();
        const workerEntry = pool.reduce((bestEntry, entry) => (
            entry.pendingCount < bestEntry.pendingCount ? entry : bestEntry
        ), pool[0]);

        return new Promise<SerializedStlGeometryData>((resolve, reject) => {
            const requestId = ++requestIdCounter;
            pendingRequests.set(requestId, {
                resolve,
                reject,
                workerEntry,
            });
            workerEntry.pendingCount += 1;

            try {
                workerEntry.worker.postMessage({
                    type: 'parse-stl',
                    requestId,
                    assetUrl,
                });
            } catch (error) {
                clearPendingWorkerRequest(requestId);
                workerUnavailable = true;
                disposeWorkerPool(error);
                reject(error);
            }
        });
    };

    const load = async (assetUrl: string): Promise<SerializedStlGeometryData> => {
        const cachedResult = resolvedCache.get(assetUrl);
        if (cachedResult) {
            touchResolvedCache(assetUrl, cachedResult);
            return cachedResult;
        }

        const pendingLoad = pendingLoads.get(assetUrl);
        if (pendingLoad) {
            return await pendingLoad;
        }

        const nextLoad = (canUseWorker()
            ? dispatchToWorkerPool(assetUrl)
            : loadSerializedStlGeometryDataInline(assetUrl))
            .then((result) => {
                touchResolvedCache(assetUrl, result);
                return result;
            })
            .finally(() => {
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

const sharedStlParseWorkerPoolClient = createStlParseWorkerPoolClient();

export async function loadSerializedStlGeometryData(assetUrl: string): Promise<SerializedStlGeometryData> {
    return await sharedStlParseWorkerPoolClient.load(assetUrl);
}

export function clearStlParseWorkerPoolClientCache(): void {
    sharedStlParseWorkerPoolClient.clearCache();
}

export function disposeStlParseWorkerPoolClient(rejectPendingWith?: unknown): void {
    sharedStlParseWorkerPoolClient.dispose(rejectPendingWith);
}

export { cloneSerializedStlGeometryData };
