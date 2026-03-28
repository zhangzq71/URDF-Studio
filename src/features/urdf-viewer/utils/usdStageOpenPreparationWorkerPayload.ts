import type { RobotFile } from '@/types';
import {
  inferUsdBundleVirtualDirectory,
  isUsdPathWithinBundleDirectory,
} from './usdPreloadSources.ts';

type StageOpenSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl'>;
type StageOpenAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

export interface UsdStageOpenPreparationWorkerContextSnapshot {
  availableFiles?: StageOpenAvailableFile[];
  assets?: Record<string, string>;
}

export interface PreparedUsdStageOpenWorkerDispatch {
  sourceFile: StageOpenSourceFile;
  availableFiles?: StageOpenAvailableFile[];
  assets?: Record<string, string>;
  contextCacheKey: string | null;
  contextSnapshot: UsdStageOpenPreparationWorkerContextSnapshot | null;
}

const objectIdentityTokens = new WeakMap<object, number>();
let nextObjectIdentityToken = 1;

function getObjectIdentityToken(value: unknown): number {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return 0;
  }

  const objectValue = value as object;
  const cachedToken = objectIdentityTokens.get(objectValue);
  if (cachedToken) {
    return cachedToken;
  }

  const nextToken = nextObjectIdentityToken++;
  objectIdentityTokens.set(objectValue, nextToken);
  return nextToken;
}

function hasContextSnapshotContent(snapshot: UsdStageOpenPreparationWorkerContextSnapshot): boolean {
  return (snapshot.availableFiles?.length ?? 0) > 0
    || Object.keys(snapshot.assets ?? {}).length > 0;
}

function buildContextCacheKey(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
): string {
  return [
    sourceFile.name,
    `files:${getObjectIdentityToken(availableFiles)}`,
    `assets:${getObjectIdentityToken(assets)}`,
  ].join('|');
}

function filterStageOpenAvailableFiles(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
): StageOpenAvailableFile[] {
  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  return availableFiles.filter((file) => {
    if (file.format === 'mesh') {
      return false;
    }
    if (file.name === sourceFile.name) {
      return false;
    }
    return isUsdPathWithinBundleDirectory(file.name, bundleDirectory);
  });
}

function filterStageOpenAssets(
  sourceFile: StageOpenSourceFile,
  assets: Record<string, string>,
): Record<string, string> {
  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  return Object.fromEntries(
    Object.entries(assets).filter(([path]) => isUsdPathWithinBundleDirectory(path, bundleDirectory)),
  );
}

export function buildUsdStageOpenPreparationWorkerDispatch(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
): PreparedUsdStageOpenWorkerDispatch {
  const filteredAvailableFiles = filterStageOpenAvailableFiles(sourceFile, availableFiles);
  const filteredAssets = filterStageOpenAssets(sourceFile, assets);
  const contextSnapshot: UsdStageOpenPreparationWorkerContextSnapshot = {
    availableFiles: filteredAvailableFiles,
    assets: filteredAssets,
  };

  if (!hasContextSnapshotContent(contextSnapshot)) {
    return {
      sourceFile,
      availableFiles: filteredAvailableFiles,
      assets: filteredAssets,
      contextCacheKey: null,
      contextSnapshot: null,
    };
  }

  return {
    sourceFile,
    availableFiles: undefined,
    assets: undefined,
    contextCacheKey: buildContextCacheKey(sourceFile, availableFiles, assets),
    contextSnapshot,
  };
}
