import type { RobotFile } from '@/types';
import type { PreparedUsdStageOpenData } from './usdStageOpenPreparation';
import {
  inferUsdBundleVirtualDirectory,
  isUsdPathWithinBundleDirectory,
} from './usdPreloadSources.ts';
import { prepareUsdStageOpenWithWorker } from './usdStageOpenPreparationWorkerBridge.ts';
import { prepareUsdStageOpenData } from './usdStageOpenPreparation.ts';

type StageOpenSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl'>;
type StageOpenAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

const PREPARED_USD_STAGE_OPEN_CACHE_LIMIT = 8;
const preparedUsdStageOpenCache = new Map<string, Promise<PreparedUsdStageOpenData>>();

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function buildSourceFileSignature(sourceFile: StageOpenSourceFile): string {
  return [
    sourceFile.name,
    sourceFile.blobUrl ?? '',
    hashString(sourceFile.content),
    String(sourceFile.content.length),
  ].join('\u0000');
}

function buildScopedAvailableFilesSignature(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
): string {
  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  return availableFiles
    .filter((file) => file.format !== 'mesh' && isUsdPathWithinBundleDirectory(file.name, bundleDirectory))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((file) => [
      file.name,
      file.format,
      file.blobUrl ?? '',
      hashString(file.content),
      String(file.content.length),
    ].join('\u0000'))
    .join('\n');
}

function buildScopedAssetsSignature(
  sourceFile: StageOpenSourceFile,
  assets: Record<string, string>,
): string {
  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  return Object.entries(assets)
    .filter(([path]) => isUsdPathWithinBundleDirectory(path, bundleDirectory))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, url]) => `${path}\u0000${url}`)
    .join('\n');
}

function buildPreparedUsdStageOpenCacheKey(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
): string {
  return [
    buildSourceFileSignature(sourceFile),
    buildScopedAvailableFilesSignature(sourceFile, availableFiles),
    buildScopedAssetsSignature(sourceFile, assets),
  ].join('\n---\n');
}

function hasPreparedRootStagePayload(result: PreparedUsdStageOpenData): boolean {
  return result.preloadFiles.some((entry) => (
    entry.path === result.stageSourcePath
    && (
      !!entry.blob
      || ((entry.bytes instanceof ArrayBuffer || ArrayBuffer.isView(entry.bytes))
        && entry.bytes.byteLength > 0)
    )
  ));
}

export async function loadPreparedUsdStageOpenDataCached(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
  loader: () => Promise<PreparedUsdStageOpenData>,
): Promise<PreparedUsdStageOpenData> {
  const cacheKey = buildPreparedUsdStageOpenCacheKey(sourceFile, availableFiles, assets);
  const cachedPromise = preparedUsdStageOpenCache.get(cacheKey);
  if (cachedPromise) {
    return cachedPromise;
  }

  const pendingPromise = loader()
    .then((result) => {
      if (!hasPreparedRootStagePayload(result)) {
        preparedUsdStageOpenCache.delete(cacheKey);
      }
      return result;
    })
    .catch((error) => {
      preparedUsdStageOpenCache.delete(cacheKey);
      throw error;
    });

  preparedUsdStageOpenCache.set(cacheKey, pendingPromise);
  if (preparedUsdStageOpenCache.size > PREPARED_USD_STAGE_OPEN_CACHE_LIMIT) {
    const oldestEntry = preparedUsdStageOpenCache.keys().next();
    if (!oldestEntry.done) {
      preparedUsdStageOpenCache.delete(oldestEntry.value);
    }
  }

  return pendingPromise;
}

export function clearPreparedUsdStageOpenCache(): void {
  preparedUsdStageOpenCache.clear();
}

export function prewarmPreparedUsdStageOpenDataInBackground(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
): void {
  void loadPreparedUsdStageOpenDataCached(
    sourceFile,
    availableFiles,
    assets,
    () => prepareUsdStageOpenWithWorker(
      sourceFile,
      availableFiles,
      assets,
    ).catch(() => prepareUsdStageOpenData(sourceFile, availableFiles, assets)),
  ).catch(() => {
    // Keep import-time stage-open prewarm best-effort.
  });
}
