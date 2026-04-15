/// <reference lib="webworker" />

import {
  USD_BINDINGS_CACHE_KEY,
  buildUsdBindingsAssetPath,
  buildUsdBindingsScriptUrl,
} from '@/features/urdf-viewer/utils/usdBindingsAssetPaths.ts';
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

type GetUsdModuleFn = (options?: Record<string, unknown>) => Promise<BinaryReadyUsdRuntime['USD']>;

function resolveGetUsdModuleFn(): GetUsdModuleFn | null {
  const g = globalThis as Record<string, unknown>;
  const getter = g['USD_WASM_MODULE'];
  if (typeof getter === 'function') {
    return getter as GetUsdModuleFn;
  }
  return null;
}

let classicScriptLoadPromise: Promise<void> | null = null;

async function ensureBindingsClassicScriptLoaded(): Promise<void> {
  if (!classicScriptLoadPromise) {
    classicScriptLoadPromise = (async () => {
      const baseHref = String(globalThis.location?.href || 'http://localhost/');
      const scriptUrl = new URL(buildUsdBindingsScriptUrl(USD_BINDINGS_CACHE_KEY), baseHref).href;
      const response = await fetch(scriptUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch USD bindings script: ${scriptUrl}`);
      }
      const source = await response.text();
      const globalEval = globalThis.eval.bind(globalThis) as (code: string) => unknown;
      globalEval(`${source}\n//# sourceURL=${scriptUrl}`);
    })().catch((error) => {
      classicScriptLoadPromise = null;
      throw error;
    });
  }
  return classicScriptLoadPromise;
}

async function loadBinaryUsdRuntime(): Promise<BinaryReadyUsdRuntime> {
  if (!binaryUsdRuntimePromise) {
    binaryUsdRuntimePromise = (async () => {
      await ensureBindingsClassicScriptLoaded();

      const getUsdModuleFn = resolveGetUsdModuleFn();
      if (!getUsdModuleFn) {
        throw new Error('USD WASM loader is unavailable after loading emHdBindings.js');
      }

      const USD = await getUsdModuleFn({
        mainScriptUrlOrBlob: buildUsdBindingsAssetPath('emHdBindings.js', {
          cacheKey: USD_BINDINGS_CACHE_KEY,
        }),
        locateFile: (file: string) =>
          buildUsdBindingsAssetPath(String(file || ''), {
            cacheKey: USD_BINDINGS_CACHE_KEY,
          }),
        PTHREAD_POOL_LIMIT: 1,
        PTHREAD_POOL_SIZE: 1,
        PTHREAD_NUM_CORES: 1,
        PTHREAD_POOL_PREWARM: false,
        print: () => {},
        printErr: (...args: unknown[]) => {
          const message = args.map((entry) => String(entry ?? '')).join(' ');
          if (!message) return;
          if (message.includes("Selected hydra renderer doesn't support prim type")) return;
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

workerScope.addEventListener(
  'message',
  (event: MessageEvent<ConvertUsdArchiveFilesToBinaryWorkerRequest>) => {
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
  },
);

export {};
