/// <reference lib="webworker" />

import {
  prepareImportPayload,
  type PrepareImportWorkerRequest,
  type PrepareImportWorkerResponse,
} from '@/app/utils/importPreparation';
import { serializePreparedImportPayloadForWorker } from '@/app/utils/importPreparationTransfer';
import { ensureWorkerXmlDomApis } from './ensureWorkerXmlDomApis';

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
ensureWorkerXmlDomApis(workerScope as unknown as typeof globalThis);

workerScope.addEventListener('message', async (event: MessageEvent<PrepareImportWorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== 'prepare-import') {
    return;
  }

  try {
    const payload = await prepareImportPayload({
      files: message.files,
      existingPaths: message.existingPaths,
    });
    const serialized = await serializePreparedImportPayloadForWorker(payload);
    const response: PrepareImportWorkerResponse = {
      type: 'prepare-import-result',
      requestId: message.requestId,
      payload: serialized.payload,
    };
    workerScope.postMessage(response, serialized.transferables);
  } catch (error) {
    const response: PrepareImportWorkerResponse = {
      type: 'prepare-import-error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : 'Import preparation worker failed',
    };
    workerScope.postMessage(response);
  }
});

export {};
