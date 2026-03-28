import type { RobotFile } from '@/types';
import {
  buildUsdBundlePreloadEntries,
  toVirtualUsdPath,
} from './usdPreloadSources.ts';

export interface PreparedUsdPreloadFile {
  path: string;
  blob: Blob | null;
  bytes?: ArrayBuffer | Uint8Array | null;
  mimeType?: string | null;
  error?: string | null;
}

export interface PreparedUsdStageOpenData {
  stageSourcePath: string;
  criticalDependencyPaths: string[];
  preloadFiles: PreparedUsdPreloadFile[];
}

const dependencyStemByRootUsdFile: Record<string, string> = {
  'g1_29dof_rev_1_0.usd': 'g1_29dof_rev_1_0',
  'g1_23dof_rev_1_0.usd': 'g1_23dof_rev_1_0',
  'go2.usd': 'go2_description',
  'go2w.usd': 'go2w_description',
  'h1.usd': 'h1',
  'h1_2.usd': 'h1_2',
  'h1_2_handless.usd': 'h1_2_handless',
  'b2.usd': 'b2_description',
  'b2w.usd': 'b2w_description',
};

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

function getVirtualUsdDirectory(path: string): string {
  const normalizedPath = toVirtualUsdPath(path);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex < 0) return '/';
  return normalizedPath.slice(0, lastSlashIndex + 1);
}

function inferUsdDependencyStem(stagePath: string): string | null {
  const normalizedPath = toVirtualUsdPath(stagePath).toLowerCase();
  const fileName = normalizedPath.split('/').pop() || '';
  if (!fileName) return null;

  const mappedStem = dependencyStemByRootUsdFile[fileName];
  if (mappedStem) return mappedStem;

  const inferredStem = fileName.replace(/\.usd[a-z]?$/i, '');
  if (!inferredStem) return null;
  if (!normalizedPath.includes('/configuration/')) return inferredStem;

  return inferredStem.replace(/_(base|physics|robot|sensor)$/i, '');
}

function normalizePreparedUsdError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Failed to prepare USD preload file';
}

export function buildCriticalUsdDependencyPaths(stagePath: string): string[] {
  const normalizedStagePath = toVirtualUsdPath(stagePath);
  const dependencyStem = inferUsdDependencyStem(normalizedStagePath);
  if (!dependencyStem) return [];

  const rootDirectory = getVirtualUsdDirectory(normalizedStagePath);
  const configurationDirectory = rootDirectory.toLowerCase().endsWith('/configuration/')
    ? rootDirectory
    : `${rootDirectory}configuration/`;

  const suffixes = dependencyStem === 'h1_2_handless'
    ? ['base', 'physics', 'robot']
    : ['base', 'physics', 'sensor'];

  return suffixes.map((suffix) => `${configurationDirectory}${dependencyStem}_${suffix}.usd`);
}

export async function prepareUsdStageOpenData(
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
