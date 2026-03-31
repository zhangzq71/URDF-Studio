/// <reference lib="webworker" />

import { prepareUsdExportCacheFromResolvedSnapshot } from '../utils/usdExportBundle.ts';
import { serializePreparedUsdExportCacheForWorker } from '../utils/usdPreparedExportCacheWorkerTransfer.ts';
import type {
  UsdPreparedExportCacheWorkerRequest,
  UsdPreparedExportCacheWorkerResponse,
} from '../utils/usdPreparedExportCacheWorker.ts';

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<UsdPreparedExportCacheWorkerRequest>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  void (async () => {
    try {
      const result = prepareUsdExportCacheFromResolvedSnapshot(
        message.snapshot,
        message.resolution,
      );
      const serialized = await serializePreparedUsdExportCacheForWorker(result);
      const response: UsdPreparedExportCacheWorkerResponse = {
        type: 'prepare-usd-prepared-export-cache-result',
        requestId: message.requestId,
        result: serialized.payload,
      };
      workerScope.postMessage(response, serialized.transferables);
    } catch (error) {
      const response: UsdPreparedExportCacheWorkerResponse = {
        type: 'prepare-usd-prepared-export-cache-error',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : 'USD prepared export cache worker failed',
      };
      workerScope.postMessage(response);
    }
  })();
});

export {};
