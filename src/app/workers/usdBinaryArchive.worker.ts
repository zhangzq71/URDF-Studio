/// <reference lib="webworker" />

import {
  convertUsdArchiveFilesToBinaryCore,
  type BinaryReadyUsdRuntime,
} from '../utils/usdBinaryArchive.ts';
import type {
  ConvertUsdArchiveFilesToBinaryWorkerRequest,
  UsdBinaryArchiveWorkerResponse,
} from '../utils/usdBinaryArchiveWorker.ts';
import {
  hydrateUsdBinaryArchiveFilesFromWorker,
  serializeUsdBinaryArchiveFilesForWorker,
} from '../utils/usdBinaryArchiveWorkerTransfer.ts';

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

let binaryUsdRuntimePromise: Promise<BinaryReadyUsdRuntime> | null = null;

type UsdBindingsModule = {
  getUsdModule: (options?: Record<string, unknown>) => Promise<BinaryReadyUsdRuntime['USD']>;
};

async function loadBinaryUsdRuntime(): Promise<BinaryReadyUsdRuntime> {
  if (!binaryUsdRuntimePromise) {
    binaryUsdRuntimePromise = (async () => {
      const bindingsModuleUrl = new URL(
        '/usd/bindings/index.js',
        globalThis.location?.href ?? self.location.href,
      ).href;
      const bindingsModule = await import(
        /* @vite-ignore */ bindingsModuleUrl
      ) as UsdBindingsModule;

      const USD = await bindingsModule.getUsdModule({
        PTHREAD_POOL_LIMIT: 1,
        PTHREAD_POOL_SIZE: 1,
        PTHREAD_NUM_CORES: 1,
        PTHREAD_POOL_PREWARM: false,
        print: () => {},
        printErr: (...args: unknown[]) => {
          const message = args.map((entry) => String(entry ?? '')).join(' ');
          if (!message) return;
          if (message.includes('Selected hydra renderer doesn\'t support prim type')) return;
          if (message.includes('Unsupported interpolation type')) return;
          if (message.includes('pluginFactory') && message.includes('Failed verification')) return;
          console.error(...args);
        },
      });

      return { USD };
    })().catch((error) => {
      binaryUsdRuntimePromise = null;
      throw error;
    });
  }

  return binaryUsdRuntimePromise;
}

workerScope.addEventListener('message', (event: MessageEvent<ConvertUsdArchiveFilesToBinaryWorkerRequest>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  void (async () => {
    try {
      const archiveFiles = hydrateUsdBinaryArchiveFilesFromWorker(message.archiveFiles);
      const result = await convertUsdArchiveFilesToBinaryCore(archiveFiles, {
        loadRuntime: loadBinaryUsdRuntime,
        onProgress: ({ current, total, filePath }) => {
          const progressResponse: UsdBinaryArchiveWorkerResponse = {
            type: 'convert-usd-archive-files-to-binary-progress',
            requestId: message.requestId,
            current,
            total,
            filePath,
          };
          workerScope.postMessage(progressResponse);
        },
      });
      const serialized = await serializeUsdBinaryArchiveFilesForWorker(result);
      const response: UsdBinaryArchiveWorkerResponse = {
        type: 'convert-usd-archive-files-to-binary-result',
        requestId: message.requestId,
        result: serialized.payload,
      };
      workerScope.postMessage(response, serialized.transferables);
    } catch (error) {
      const response: UsdBinaryArchiveWorkerResponse = {
        type: 'convert-usd-archive-files-to-binary-error',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : 'USD binary archive worker failed',
      };
      workerScope.postMessage(response);
    }
  })();
});

export {};
