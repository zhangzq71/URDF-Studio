import type { RobotFile } from '@/types';
import type { PreparedUsdPreloadFile, PreparedUsdStageOpenData } from './usdStageOpenPreparation.ts';
import {
  buildUsdBundlePreloadEntries,
  toVirtualUsdPath,
} from './usdPreloadSources.ts';
import { buildCriticalUsdDependencyPaths } from './usdCriticalDependencyPaths.ts';

export { buildCriticalUsdDependencyPaths } from './usdCriticalDependencyPaths.ts';

export function resolveUsdStageOpenPreparationConcurrency(preferredConcurrency?: number): number {
  const fallbackConcurrency = Number(globalThis.navigator?.hardwareConcurrency || 4);
  const resolvedConcurrency = preferredConcurrency ?? fallbackConcurrency;
  return Math.max(2, Math.min(10, Math.floor(resolvedConcurrency) || 2));
}

async function runWithConcurrency<T>(
  items: readonly T[],
  maxConcurrency: number,
  handler: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const concurrency = Math.max(1, Math.min(Math.floor(maxConcurrency) || 1, items.length));
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await handler(items[currentIndex]!, currentIndex);
    }
  });

  await Promise.all(workers);
}

function normalizePreparedUsdError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Failed to prepare USD preload file';
}

export async function prepareUsdStageOpenDataCore(
  sourceFile: Pick<RobotFile, 'name' | 'content' | 'blobUrl'>,
  availableFiles: Array<Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>>,
  assets: Record<string, string>,
): Promise<PreparedUsdStageOpenData> {
  const stageSourcePath = toVirtualUsdPath(sourceFile.name);
  const preloadEntries = buildUsdBundlePreloadEntries(sourceFile, availableFiles, assets);
  const preloadFiles = new Array<PreparedUsdPreloadFile>(preloadEntries.length);

  await runWithConcurrency(
    preloadEntries,
    resolveUsdStageOpenPreparationConcurrency(),
    async (entry, index): Promise<void> => {
      try {
        const blob = await entry.loadBlob();
        preloadFiles[index] = {
          path: entry.path,
          blob,
          error: null,
        };
      } catch (error) {
        preloadFiles[index] = {
          path: entry.path,
          blob: null,
          error: normalizePreparedUsdError(error),
        };
      }
    },
  );

  return {
    stageSourcePath,
    criticalDependencyPaths: buildCriticalUsdDependencyPaths(stageSourcePath),
    preloadFiles,
  };
}
