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
    dispose: (rejectPendingWith?: unknown) => void;
    load: (assetUrl: string) => Promise<SerializedStlGeometryData>;
}

const DEFAULT_CACHE_LIMIT = 48;

async function fetchAssetBuffer(assetUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(assetUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch STL asset: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
}

function createWorkerError(event: ErrorEvent | { error?: unknown; message?: string }): Error {
    if (event.error instanceof Error) {
        return event.error;
    }

    return new Error(event.message || 'STL parse worker failed');
}

function invokeWorkerListener(
    listener: EventListenerOrEventListenerObject,
    event: Event,
): void {
    if (typeof listener === 'function') {
        listener(event);
        return;
    }

    listener.handleEvent(event);
}

function createInlineStlParseWorker(): WorkerLike {
    const messageListeners = new Set<EventListenerOrEventListenerObject>();
    const errorListeners = new Set<EventListenerOrEventListenerObject>();
    let terminated = false;

    const emitMessage = (payload: StlParseWorkerResponse): void => {
        const event = { data: payload } as MessageEvent<StlParseWorkerResponse>;
        messageListeners.forEach((listener) => {
            invokeWorkerListener(listener, event as unknown as Event);
        });
    };

    const emitError = (requestId: number, error: unknown): void => {
        const workerError = createWorkerError({
            error,
            message: error instanceof Error ? error.message : 'STL parse worker failed',
        });
        emitMessage({
            type: 'parse-stl-error',
            requestId,
            error: workerError.message,
        });
    };

    return {
        addEventListener(type, listener) {
            if (type === 'message') {
                messageListeners.add(listener);
                return;
            }

            errorListeners.add(listener);
        },
        removeEventListener(type, listener) {
            if (type === 'message') {
                messageListeners.delete(listener);
                return;
            }

            errorListeners.delete(listener);
        },
        postMessage(message) {
            queueMicrotask(() => {
                void (async () => {
                    if (terminated || message.type !== 'parse-stl') {
                        return;
                    }

                    try {
                        const assetBuffer = await fetchAssetBuffer(message.assetUrl);
                        if (terminated) {
                            return;
                        }

                        emitMessage({
                            type: 'parse-stl-result',
                            requestId: message.requestId,
                            result: parseStlGeometryData(assetBuffer),
                        });
                    } catch (error) {
                        if (terminated) {
                            return;
                        }

                        emitError(message.requestId, error);
                    }
                })();
            });
        },
        terminate() {
            terminated = true;
            messageListeners.clear();
            errorListeners.clear();
        },
    };
}

function resolveDefaultWorkerCount(): number {
    if (typeof navigator === 'undefined') {
        return 1;
    }

    const hardwareConcurrency = Number(navigator.hardwareConcurrency || 2);
    return Math.max(1, Math.min(4, hardwareConcurrency - 1));
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
        canUseWorker = () => typeof Worker !== 'undefined' || typeof window === 'undefined',
        cacheLimit = DEFAULT_CACHE_LIMIT,
        createWorker = () => (
            typeof Worker !== 'undefined'
                ? new Worker(
                    new URL('./workers/stlParse.worker.ts', import.meta.url),
                    { type: 'module' },
                )
                : createInlineStlParseWorker()
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

        if (!canUseWorker()) {
            throw new Error('STL parse worker is unavailable in this environment');
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

        const nextLoad = dispatchToWorkerPool(assetUrl)
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
        dispose: disposeWorkerPool,
        load,
    };
}

const sharedStlParseWorkerPoolClient = createStlParseWorkerPoolClient();

export async function loadSerializedStlGeometryData(assetUrl: string): Promise<SerializedStlGeometryData> {
    return await sharedStlParseWorkerPoolClient.load(assetUrl);
}

export function disposeStlParseWorkerPoolClient(rejectPendingWith?: unknown): void {
    sharedStlParseWorkerPoolClient.dispose(rejectPendingWith);
}

export { cloneSerializedStlGeometryData };
