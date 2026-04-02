/// <reference lib="webworker" />

import {
  prepareImportPayload,
  type PrepareImportWorkerRequest,
  type PrepareImportWorkerResponse,
} from '@/app/utils/importPreparation';
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
      preResolvePreferredImport: message.preResolvePreferredImport,
    });
    const response: PrepareImportWorkerResponse = {
      type: 'prepare-import-result',
      requestId: message.requestId,
      payload,
    };
    workerScope.postMessage(response);
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
