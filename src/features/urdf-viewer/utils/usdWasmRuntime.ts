import {
  appendCacheKey,
  buildUsdBindingsScriptUrl,
  ensureClassicScriptLoaded,
} from './usdBindingsScriptLoader.ts';
import type { UsdLoadingProgress } from '../types';

const EMHD_BINDINGS_CACHE_KEY = '20260318a';

type UsdModule = {
  FS_createPath?: (...args: any[]) => void;
  FS_createDataFile?: (...args: any[]) => void;
  FS_readFile?: (path: string, opts?: { encoding?: 'utf8'; flags?: string }) => Uint8Array | string;
  FS_writeFile?: (path: string, data: string | ArrayLike<number> | ArrayBufferView, opts?: { flags?: string }) => void;
  FS_unlink?: (...args: any[]) => void;
  flushPendingDeletes?: () => void;
  HdWebSyncDriver?: new (...args: any[]) => any;
};

type UsdFsHelperInstance = {
  canOperateOnUsdFilesystem: () => boolean;
  clearStageFiles: (usdRoot: { clear?: () => void } | null) => void;
  hasVirtualFilePath: (filePath: string) => boolean;
  trackVirtualFilePath?: (filePath: string) => void;
  untrackVirtualFilePath?: (filePath: string) => void;
};

type LoadVirtualFileFn = (args: {
  USD: UsdModule;
  usdFsHelper: UsdFsHelperInstance;
  messageLog?: HTMLElement | null;
  file: File;
  fullPath: string;
  isRootFile?: boolean;
  onLoadRootUsdPath: (path: string) => Promise<void>;
}) => Promise<void>;

type LoadUsdStageFn = (args: {
  USD: UsdModule;
  usdFsHelper: UsdFsHelperInstance;
  messageLog?: HTMLElement | null;
  progressBar?: HTMLElement | null;
  progressLabel?: HTMLElement | null;
  showLoadUi?: boolean;
  readStageMetadata?: boolean;
  loadCollisionPrims?: boolean;
  loadVisualPrims?: boolean;
  loadPassLabel?: string;
  params: URLSearchParams;
  displayName: string;
  pathToLoad: string;
  isLoadActive: () => boolean;
  debugFileHandling?: boolean;
  onResolvedFilename: (normalizedPath: string, resolvedDisplayName: string) => void;
  applyMeshFilters: () => void;
  rebuildLinkAxes: () => void;
  renderFrame: () => void;
  onProgress?: (progress: UsdLoadingProgress) => void;
}) => Promise<{
  driver: any;
  ready: boolean;
  drawFailed: boolean;
  timeout: number;
  endTimeCode: number;
  normalizedPath: string;
  loadedCollisionPrims: boolean;
  loadedVisualPrims: boolean;
} | null>;

type ApplyMeshVisibilityFiltersFn = (
  renderInterface: any,
  showVisualMeshes: boolean,
  showCollisionMeshes: boolean,
) => void;

export interface UsdWasmRuntime {
  USD: UsdModule;
  usdFsHelper: UsdFsHelperInstance;
  loadVirtualFile: LoadVirtualFileFn;
  loadUsdStage: LoadUsdStageFn;
  applyMeshVisibilityFilters: ApplyMeshVisibilityFiltersFn;
  threadCount: number;
}

function withCacheKey(resourcePath: string): string {
  return appendCacheKey(resourcePath, EMHD_BINDINGS_CACHE_KEY);
}

function resolveGetUsdModuleFn(): ((config: Record<string, any>) => Promise<UsdModule>) | null {
  const globalUsd = globalThis as Record<string, unknown>;
  const needleGetter = globalUsd['NEEDLE:USD:GET'];
  if (typeof needleGetter === 'function') {
    return needleGetter as (config: Record<string, any>) => Promise<UsdModule>;
  }

  const exportedGetter = globalUsd.USD_WASM_MODULE;
  if (typeof exportedGetter === 'function') {
    return exportedGetter as (config: Record<string, any>) => Promise<UsdModule>;
  }

  return null;
}

export function resolvePreferredUsdThreadCount(preferredConcurrency?: number): number {
  const fallbackConcurrency = Number(globalThis.navigator?.hardwareConcurrency || 4);
  const resolvedConcurrency = preferredConcurrency ?? fallbackConcurrency;
  return Math.max(1, Math.min(10, Math.floor(resolvedConcurrency) || 1));
}

function assertUsdRuntimeEnvironment(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!globalThis.isSecureContext) {
    throw new Error(
      'USD loading requires a secure context. Open the app from `http://localhost:<port>` or `http://127.0.0.1:<port>`, '
      + 'or serve it over HTTPS. Accessing the Vite dev server from a LAN IP address or another non-HTTPS URL is not enough, '
      + 'even when `npm run dev` is sending COOP/COEP headers.',
    );
  }

  if (globalThis.crossOriginIsolated) {
    return;
  }

  throw new Error(
    'USD loading requires a cross-origin isolated page because the bundled USD WASM runtime uses SharedArrayBuffer. '
    + 'Start the app with `npm run dev` or `npm run preview`, open it from `localhost`/`127.0.0.1` (or HTTPS), '
    + 'and make sure the server sends `Cross-Origin-Opener-Policy: same-origin` and '
    + '`Cross-Origin-Embedder-Policy: require-corp`.',
  );
}

let getUsdModuleFnPromise: Promise<((config: Record<string, any>) => Promise<UsdModule>)> | null = null;
let usdRuntimePromise: Promise<UsdWasmRuntime> | null = null;

async function loadEmHdBindingsGetUsdModuleFn(): Promise<((config: Record<string, any>) => Promise<UsdModule>)> {
  const existingGetter = resolveGetUsdModuleFn();
  if (existingGetter) {
    return existingGetter;
  }

  if (!getUsdModuleFnPromise) {
    getUsdModuleFnPromise = ensureClassicScriptLoaded(buildUsdBindingsScriptUrl(EMHD_BINDINGS_CACHE_KEY))
      .then(() => {
        const loadedGetter = resolveGetUsdModuleFn();
        if (!loadedGetter) {
          throw new TypeError('USD WASM loader is unavailable after loading emHdBindings.js');
        }
        return loadedGetter;
      })
      .catch((error) => {
        getUsdModuleFnPromise = null;
        throw error;
      });
  }

  return getUsdModuleFnPromise;
}

export async function ensureUsdWasmRuntime(): Promise<UsdWasmRuntime> {
  if (!usdRuntimePromise) {
    usdRuntimePromise = (async () => {
      assertUsdRuntimeEnvironment();

      const [
        getUsdModuleFn,
        usdFsModule,
        usdLoaderModule,
        uploadWorkflowModule,
        visibilityModule,
      ] = await Promise.all([
        loadEmHdBindingsGetUsdModuleFn(),
        import('../runtime/viewer/usd-fs.js') as Promise<{
          UsdFsHelper: new (
            getUsdModule: () => UsdModule,
            debugFileHandling: boolean,
          ) => UsdFsHelperInstance;
        }>,
        import('../runtime/viewer/usd-loader.js') as Promise<{ loadUsdStage: LoadUsdStageFn }>,
        import('../runtime/viewer/upload-workflow.js') as Promise<{
          loadVirtualFile: LoadVirtualFileFn;
        }>,
        import('../runtime/viewer/visibility.js') as Promise<{
          applyMeshVisibilityFilters: ApplyMeshVisibilityFiltersFn;
        }>,
      ]);

      const threadCount = resolvePreferredUsdThreadCount();
      const USD = await getUsdModuleFn({
        mainScriptUrlOrBlob: withCacheKey('/usd/bindings/emHdBindings.js'),
        locateFile: (file: string) => withCacheKey(`/usd/bindings/${String(file || '')}`),
        PTHREAD_POOL_LIMIT: threadCount,
        PTHREAD_POOL_SIZE: threadCount,
        PTHREAD_NUM_CORES: threadCount,
        PTHREAD_POOL_PREWARM: true,
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

      return {
        USD,
        usdFsHelper: new usdFsModule.UsdFsHelper(() => USD, false),
        loadVirtualFile: uploadWorkflowModule.loadVirtualFile,
        loadUsdStage: usdLoaderModule.loadUsdStage,
        applyMeshVisibilityFilters: visibilityModule.applyMeshVisibilityFilters,
        threadCount,
      };
    })().catch((error) => {
      usdRuntimePromise = null;
      throw error;
    });
  }

  return usdRuntimePromise;
}

export function prewarmUsdWasmRuntimeInBackground(): void {
  void ensureUsdWasmRuntime().catch(() => {
    // Keep eager runtime prewarm best-effort; the foreground load path still surfaces real errors.
  });
}

export function disposeUsdDriver(runtime: Pick<UsdWasmRuntime, 'USD'>, driver: any): void {
  if (!driver) return;

  try {
    if (typeof driver.isDeleted === 'function' && driver.isDeleted()) {
      return;
    }
  } catch {
    // Ignore deleted-state probe failures and try direct disposal.
  }

  try {
    if (typeof driver.delete === 'function') {
      driver.delete();
    }
  } catch (error) {
    console.error('Failed to dispose USD driver.', error);
  }

  try {
    runtime.USD.flushPendingDeletes?.();
  } catch {
    // Flush is best-effort.
  }
}
