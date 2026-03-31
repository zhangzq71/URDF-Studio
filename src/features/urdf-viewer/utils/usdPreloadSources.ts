import type { RobotFile } from '@/types';

export type UsdPreloadSourceKind = 'blob-url' | 'text-content';

export interface UsdPreloadSource {
  kind: UsdPreloadSourceKind;
  loadBlob: () => Promise<Blob>;
}

export interface UsdPreloadEntry {
  path: string;
  loadBlob: () => Promise<Blob>;
}

function normalizeUsdAssetPath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function normalizeUsdBundleVirtualDirectory(path: string): string {
  const normalized = String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/?$/, '/');
  if (!normalized || normalized === '/') {
    return '/';
  }
  return `/${normalized}`;
}

export function toVirtualUsdPath(path: string): string {
  const normalizedPath = normalizeUsdAssetPath(path);
  if (!normalizedPath) {
    return '/';
  }
  return `/${normalizedPath}`;
}

export function inferUsdBundleVirtualDirectory(sourcePath: string): string {
  const normalizedSourcePath = normalizeUsdAssetPath(sourcePath);
  if (!normalizedSourcePath) {
    return '/';
  }

  const segments = normalizedSourcePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return '/';
  }

  const usdSegmentIndex = segments.findIndex((segment) => segment.toLowerCase() === 'usd');
  if (usdSegmentIndex > 0) {
    return normalizeUsdBundleVirtualDirectory(segments.slice(0, usdSegmentIndex).join('/'));
  }
  if (usdSegmentIndex === 0) {
    return '/';
  }

  if (segments.length === 1) {
    return '/';
  }
  return normalizeUsdBundleVirtualDirectory(segments.slice(0, -1).join('/'));
}

export function isUsdPathWithinBundleDirectory(path: string, bundleDirectory: string): boolean {
  const virtualPath = toVirtualUsdPath(path);
  const normalizedBundleDirectory = normalizeUsdBundleVirtualDirectory(bundleDirectory);

  if (normalizedBundleDirectory === '/') {
    return true;
  }
  return virtualPath.startsWith(normalizedBundleDirectory);
}

async function fetchBlobFromUrl(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob source: ${response.status}`);
  }

  return response.blob();
}

export function resolveUsdBlobUrl(
  filePath: string,
  fileBlobUrl: string | undefined,
  assets: Record<string, string>,
): string | null {
  if (fileBlobUrl) {
    return fileBlobUrl;
  }

  const normalizedPath = normalizeUsdAssetPath(filePath);
  if (!normalizedPath) {
    return null;
  }

  return assets[normalizedPath] ?? assets[`/${normalizedPath}`] ?? null;
}

export function createUsdPreloadSource(
  file: Pick<RobotFile, 'name' | 'content' | 'blobUrl'>,
  assets: Record<string, string>,
): UsdPreloadSource {
  const normalizedPath = normalizeUsdAssetPath(file.name).toLowerCase();
  const canInlineTextContent = typeof file.content === 'string'
    && file.content.length > 0
    && !normalizedPath.endsWith('.usdc')
    && !normalizedPath.endsWith('.usdz');

  if (canInlineTextContent) {
    return {
      kind: 'text-content',
      loadBlob: async () => new Blob([file.content], { type: 'text/plain' }),
    };
  }

  const resolvedBlobUrl = resolveUsdBlobUrl(file.name, file.blobUrl, assets);
  if (resolvedBlobUrl) {
    return {
      kind: 'blob-url',
      loadBlob: () => fetchBlobFromUrl(resolvedBlobUrl),
    };
  }

  return {
    kind: 'text-content',
    loadBlob: async () => new Blob([file.content], { type: 'text/plain' }),
  };
}

export function buildUsdBundlePreloadEntries(
  sourceFile: Pick<RobotFile, 'name' | 'content' | 'blobUrl'>,
  availableFiles: Array<Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>>,
  assets: Record<string, string>,
): UsdPreloadEntry[] {
  const rootPath = toVirtualUsdPath(sourceFile.name);
  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  const preloadEntries = new Map<string, UsdPreloadEntry>();

  const addEntry = (path: string, loadBlob: () => Promise<Blob>) => {
    const virtualPath = toVirtualUsdPath(path);
    if (!preloadEntries.has(virtualPath)) {
      preloadEntries.set(virtualPath, { path: virtualPath, loadBlob });
    }
  };

  availableFiles.forEach((file) => {
    if (file.format === 'mesh') return;
    if (!isUsdPathWithinBundleDirectory(file.name, bundleDirectory)) return;
    addEntry(file.name, createUsdPreloadSource(file, assets).loadBlob);
  });

  Object.entries(assets).forEach(([path, url]) => {
    if (!isUsdPathWithinBundleDirectory(path, bundleDirectory)) return;
    addEntry(path, () => fetchBlobFromUrl(url));
  });

  addEntry(sourceFile.name, createUsdPreloadSource(sourceFile, assets).loadBlob);

  return Array.from(preloadEntries.values()).sort((left, right) => {
    if (left.path === rootPath) return 1;
    if (right.path === rootPath) return -1;
    return left.path.localeCompare(right.path);
  });
}
