import type { RobotFile } from '@/types';
import {
  createUsdPreloadSource,
  inferUsdBundleVirtualDirectory,
  isUsdPathWithinBundleDirectory,
  toVirtualUsdPath,
} from '@/features/urdf-viewer/utils/usdPreloadSources';

interface UsdRoundtripStageExport {
  content: string;
  downloadFileName: string;
  outputVirtualPath?: string | null;
}

export interface BuildUsdRoundtripArchiveOptions {
  sourceFile: Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
  stageExport: UsdRoundtripStageExport;
  availableFiles: Array<Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>>;
  assets: Record<string, string>;
  allFileContents?: Record<string, string>;
}

export interface UsdRoundtripArchive {
  archiveFileName: string;
  archiveFiles: Map<string, Blob>;
}

function normalizePathKey(path: string): string {
  return String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function getDirectoryPath(path: string): string {
  const normalized = normalizePathKey(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
}

function getPathBasename(path: string): string {
  const normalized = normalizePathKey(path);
  if (!normalized) {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

function withZipExtension(fileName: string): string {
  const trimmed = String(fileName || '').trim();
  if (!trimmed) {
    return 'usd_bundle.zip';
  }

  const usdExtensionPattern = /\.(usd[a-z]?)$/i;
  return usdExtensionPattern.test(trimmed)
    ? trimmed.replace(usdExtensionPattern, '.zip')
    : `${trimmed}.zip`;
}

function resolveRoundtripVirtualPath(
  sourceFileName: string,
  stageExport: UsdRoundtripStageExport,
): string {
  const explicitPath = normalizePathKey(stageExport.outputVirtualPath || '');
  if (explicitPath) {
    return toVirtualUsdPath(explicitPath);
  }

  const sourceDirectory = getDirectoryPath(sourceFileName);
  return toVirtualUsdPath(
    sourceDirectory
      ? `${sourceDirectory}/${stageExport.downloadFileName}`
      : stageExport.downloadFileName,
  );
}

function getArchiveRootDirectory(bundleDirectory: string, sourceFileName: string): string {
  const normalizedBundleDirectory = normalizePathKey(bundleDirectory).replace(/\/+$/, '');
  if (normalizedBundleDirectory) {
    const segments = normalizedBundleDirectory.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1] || '';
    }
  }

  return getPathBasename(sourceFileName).replace(/\.[^/.]+$/, '');
}

function toArchiveRelativePath(virtualPath: string, bundleDirectory: string, archiveRoot: string): string {
  const normalizedVirtualPath = normalizePathKey(virtualPath);
  const normalizedBundleDirectory = normalizePathKey(bundleDirectory).replace(/\/+$/, '');
  const relativePath = normalizedBundleDirectory
    && normalizedVirtualPath.startsWith(`${normalizedBundleDirectory}/`)
    ? normalizedVirtualPath.slice(normalizedBundleDirectory.length + 1)
    : normalizedVirtualPath;

  return archiveRoot
    ? `${archiveRoot}/${relativePath}`
    : relativePath;
}

export async function buildUsdRoundtripArchive({
  sourceFile,
  stageExport,
  availableFiles,
  assets,
  allFileContents = {},
}: BuildUsdRoundtripArchiveOptions): Promise<UsdRoundtripArchive> {
  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  const archiveRoot = getArchiveRootDirectory(bundleDirectory, sourceFile.name);
  const outputVirtualPath = resolveRoundtripVirtualPath(sourceFile.name, stageExport);
  const sourceRootPath = normalizePathKey(sourceFile.name);
  const outputRootPath = normalizePathKey(outputVirtualPath);
  const archiveFiles = new Map<string, Blob>();
  const addedPaths = new Set<string>();

  const addArchiveBlob = async (virtualPath: string, loadBlob: () => Promise<Blob>) => {
    if (!isUsdPathWithinBundleDirectory(virtualPath, bundleDirectory)) {
      return;
    }

    const normalizedPath = normalizePathKey(virtualPath);
    if (!normalizedPath || normalizedPath === sourceRootPath || normalizedPath === outputRootPath || addedPaths.has(normalizedPath)) {
      return;
    }

    archiveFiles.set(
      toArchiveRelativePath(virtualPath, bundleDirectory, archiveRoot),
      await loadBlob(),
    );
    addedPaths.add(normalizedPath);
  };

  for (const file of availableFiles) {
    await addArchiveBlob(
      file.name,
      createUsdPreloadSource(file, assets).loadBlob,
    );
  }

  for (const [path, content] of Object.entries(allFileContents)) {
    await addArchiveBlob(
      path,
      async () => new Blob([content], { type: 'text/plain;charset=utf-8' }),
    );
  }

  for (const [path, blobUrl] of Object.entries(assets)) {
    await addArchiveBlob(
      path,
      async () => {
        const response = await fetch(blobUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch USD bundle asset: ${path}`);
        }
        return response.blob();
      },
    );
  }

  archiveFiles.set(
    toArchiveRelativePath(outputVirtualPath, bundleDirectory, archiveRoot),
    new Blob([stageExport.content], { type: 'text/plain;charset=utf-8' }),
  );

  return {
    archiveFileName: withZipExtension(stageExport.downloadFileName),
    archiveFiles,
  };
}
