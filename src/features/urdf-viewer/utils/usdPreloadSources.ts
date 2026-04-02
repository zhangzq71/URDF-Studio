import type { RobotFile } from '@/types';
import { buildCriticalUsdDependencyPaths } from './usdCriticalDependencyPaths.ts';

export type UsdPreloadSourceKind = 'blob-url' | 'text-content';

export interface UsdPreloadSource {
  kind: UsdPreloadSourceKind;
  loadBlob: () => Promise<Blob>;
}

export interface UsdPreloadEntry {
  path: string;
  loadBlob: () => Promise<Blob>;
}

type StageOpenSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl'>;
type StageOpenAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

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

function isUsdLayerPath(path: string): boolean {
  return /\.usd(?:a|c|z)?$/i.test(normalizeUsdAssetPath(path));
}

function hasInlineUsdLayerTextContent(
  file: Pick<RobotFile, 'name' | 'content'> | null | undefined,
): boolean {
  if (!file || !isUsdLayerPath(file.name)) {
    return false;
  }

  const normalizedPath = normalizeUsdAssetPath(file.name).toLowerCase();
  if (normalizedPath.endsWith('.usdc') || normalizedPath.endsWith('.usdz')) {
    return false;
  }

  return typeof file.content === 'string' && file.content.length > 0;
}

function pickMoreInformativeUsdLayerFile<T extends Pick<RobotFile, 'name' | 'content' | 'blobUrl'>>(
  existingFile: T | undefined,
  candidateFile: T,
): T {
  if (!existingFile) {
    return candidateFile;
  }

  const existingHasInlineText = hasInlineUsdLayerTextContent(existingFile);
  const candidateHasInlineText = hasInlineUsdLayerTextContent(candidateFile);
  if (candidateHasInlineText !== existingHasInlineText) {
    return candidateHasInlineText ? candidateFile : existingFile;
  }

  if (!existingFile.blobUrl && candidateFile.blobUrl) {
    return candidateFile;
  }

  if (
    (existingFile.content?.length ?? 0) === 0
    && (candidateFile.content?.length ?? 0) > 0
  ) {
    return candidateFile;
  }

  return existingFile;
}

function buildUsdStageOpenFileIndex(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
): Map<string, StageOpenSourceFile | StageOpenAvailableFile> {
  const fileIndex = new Map<string, StageOpenSourceFile | StageOpenAvailableFile>();

  const registerFile = (file: StageOpenSourceFile | StageOpenAvailableFile) => {
    if (!isUsdLayerPath(file.name)) {
      return;
    }

    const virtualPath = toVirtualUsdPath(file.name);
    const existingFile = fileIndex.get(virtualPath);
    fileIndex.set(virtualPath, pickMoreInformativeUsdLayerFile(existingFile, file));
  };

  availableFiles.forEach(registerFile);
  registerFile(sourceFile);

  return fileIndex;
}

export function extractUsdLayerReferencesFromText(layerText: string): string[] {
  if (!layerText) {
    return [];
  }

  const references = new Set<string>();
  const referenceRegex = /@([^@]+\.usd(?:a|c|z)?)@/gi;
  let match: RegExpExecArray | null = null;
  while ((match = referenceRegex.exec(layerText))) {
    const referencePath = String(match[1] || '').trim();
    if (!referencePath) {
      continue;
    }
    references.add(referencePath);
  }

  return Array.from(references);
}

export function resolveUsdLayerReferencePath(baseUsdPath: string, referencedPath: string): string | null {
  const normalizedReferencePath = String(referencedPath || '').trim().replace(/\\/g, '/');
  if (!normalizedReferencePath) {
    return null;
  }

  if (/^[a-z]+:\/\//i.test(normalizedReferencePath)) {
    return null;
  }

  if (normalizedReferencePath.startsWith('/')) {
    return toVirtualUsdPath(normalizedReferencePath);
  }

  const baseSegments = normalizeUsdAssetPath(baseUsdPath).split('/').filter(Boolean);
  baseSegments.pop();

  normalizedReferencePath.split('/').forEach((segment) => {
    if (!segment || segment === '.') {
      return;
    }
    if (segment === '..') {
      if (baseSegments.length > 0) {
        baseSegments.pop();
      }
      return;
    }
    baseSegments.push(segment);
  });

  return baseSegments.length > 0 ? `/${baseSegments.join('/')}` : '/';
}

export function collectUsdStageOpenRelevantVirtualPaths(
  sourceFile: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
): string[] {
  const rootPath = toVirtualUsdPath(sourceFile.name);
  const fileIndex = buildUsdStageOpenFileIndex(sourceFile, availableFiles);
  const pendingPaths = [
    rootPath,
    ...buildCriticalUsdDependencyPaths(rootPath),
  ];
  const visitedPaths = new Set<string>();
  const orderedPaths: string[] = [];

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.shift()!;
    if (visitedPaths.has(currentPath) || !isUsdLayerPath(currentPath)) {
      continue;
    }

    visitedPaths.add(currentPath);
    orderedPaths.push(currentPath);

    const currentFile = fileIndex.get(currentPath);
    if (!hasInlineUsdLayerTextContent(currentFile)) {
      continue;
    }

    extractUsdLayerReferencesFromText(currentFile.content).forEach((referencePath) => {
      const resolvedPath = resolveUsdLayerReferencePath(currentPath, referencePath);
      if (!resolvedPath || visitedPaths.has(resolvedPath) || !isUsdLayerPath(resolvedPath)) {
        return;
      }
      pendingPaths.push(resolvedPath);
    });
  }

  return orderedPaths;
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
  const fileIndex = buildUsdStageOpenFileIndex(sourceFile, availableFiles);
  const relevantVirtualPaths = collectUsdStageOpenRelevantVirtualPaths(sourceFile, availableFiles);
  const preloadEntries = new Map<string, UsdPreloadEntry>();

  const addEntry = (path: string, loadBlob: () => Promise<Blob>) => {
    const virtualPath = toVirtualUsdPath(path);
    if (!preloadEntries.has(virtualPath)) {
      preloadEntries.set(virtualPath, { path: virtualPath, loadBlob });
    }
  };

  relevantVirtualPaths.forEach((virtualPath) => {
    const file = fileIndex.get(virtualPath);
    if (file) {
      addEntry(file.name, createUsdPreloadSource(file, assets).loadBlob);
      return;
    }

    const resolvedBlobUrl = resolveUsdBlobUrl(virtualPath, undefined, assets);
    if (resolvedBlobUrl) {
      addEntry(virtualPath, () => fetchBlobFromUrl(resolvedBlobUrl));
    }
  });

  addEntry(sourceFile.name, createUsdPreloadSource(sourceFile, assets).loadBlob);

  return Array.from(preloadEntries.values()).sort((left, right) => {
    if (left.path === rootPath) return 1;
    if (right.path === rootPath) return -1;
    return left.path.localeCompare(right.path);
  });
}
