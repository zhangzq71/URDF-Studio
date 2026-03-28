import { buildAssetIndex, findAssetByIndex } from '@/core/loaders';
import { resolveImportedAssetPath } from '@/core/parsers/meshPathUtils';
import { getVisualGeometryEntries } from '@/core/robot';
import { GeometryType, type RobotFile, type UrdfLink } from '@/types';

import { inferUsdBundleVirtualDirectory, isUsdPathWithinBundleDirectory } from './usdPreloadSources';

const KNOWN_BUNDLE_SEGMENTS = new Set([
  'urdf',
  'xml',
  'usd',
  'mjcf',
  'xacro',
  'meshes',
  'mesh',
  'materials',
  'material',
  'textures',
  'texture',
  'assets',
]);

const DUPLICATE_FOLDER_SUFFIX_PATTERN = /^(.*?)(?: \((\d+)\))?$/;

function normalizeBundleSegment(segment: string): string {
  const normalized = String(segment || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  return normalized.match(DUPLICATE_FOLDER_SUFFIX_PATTERN)?.[1] ?? normalized;
}

function isKnownBundleSegment(segment: string): boolean {
  return KNOWN_BUNDLE_SEGMENTS.has(normalizeBundleSegment(segment));
}

function normalizePath(path: string | null | undefined): string {
  return String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function normalizeDirectory(path: string | null | undefined): string {
  const normalized = normalizePath(path).replace(/\/?$/, '');
  return normalized ? `${normalized}/` : '';
}

function getParentDirectory(path: string | null | undefined): string {
  const normalized = normalizePath(path);
  if (!normalized) {
    return '';
  }

  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? `${normalized.slice(0, lastSlash + 1)}` : '';
}

function isPathInsideDirectory(path: string, directory: string): boolean {
  if (!directory) return false;
  const normalizedPath = normalizePath(path);
  const normalizedDirectory = normalizeDirectory(directory);
  return normalizedPath.startsWith(normalizedDirectory);
}

function inferGenericBundleDirectory(sourceFilePath: string | null | undefined): string {
  const normalizedPath = normalizePath(sourceFilePath);
  if (!normalizedPath) {
    return '';
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '';
  }

  const markerIndex = segments.findIndex((segment) => isKnownBundleSegment(segment));
  if (markerIndex > 0) {
    return normalizeDirectory(segments.slice(0, markerIndex).join('/'));
  }

  if (markerIndex === 0) {
    return '';
  }

  return normalizeDirectory(segments.slice(0, -1).join('/'));
}

function isTopLevelKnownBundleSource(path: string): boolean {
  const segments = normalizePath(path).split('/').filter(Boolean);
  return segments.length > 1 && isKnownBundleSegment(segments[0] || '');
}

function collectTopLevelKnownAssetDirectories(assets: Record<string, string>): Set<string> {
  const directories = new Set<string>();

  Object.keys(assets).forEach((assetPath) => {
    const [topLevelSegment] = normalizePath(assetPath).split('/');
    if (!topLevelSegment || !isKnownBundleSegment(topLevelSegment)) {
      return;
    }

    directories.add(normalizeDirectory(topLevelSegment));
  });

  return directories;
}

function collectReferencedMeshPaths(robotLinks?: Record<string, UrdfLink>): Set<string> {
  const referencedPaths = new Set<string>();

  if (!robotLinks) {
    return referencedPaths;
  }

  Object.values(robotLinks).forEach((link) => {
    getVisualGeometryEntries(link).forEach((entry) => {
      if (entry.geometry.type === GeometryType.MESH && entry.geometry.meshPath) {
        referencedPaths.add(entry.geometry.meshPath);
      }
    });

    if (link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      referencedPaths.add(link.collision.meshPath);
    }

    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        referencedPaths.add(body.meshPath);
      }
    });
  });

  return referencedPaths;
}

export function buildViewerRobotLinksScopeSignature(
  robotLinks?: Record<string, UrdfLink>,
): string {
  return Array.from(collectReferencedMeshPaths(robotLinks))
    .sort((left, right) => left.localeCompare(right))
    .join('\n');
}

function collectMatchingAssetKeys(
  meshPath: string,
  assets: Record<string, string>,
  sourceFilePath?: string | null,
): Set<string> {
  const matches = new Set<string>();
  const candidatePool = new Set<string>();
  const normalizedMeshPath = normalizePath(meshPath);
  if (normalizedMeshPath) {
    candidatePool.add(normalizedMeshPath);
  }

  const resolvedPath = resolveImportedAssetPath(meshPath, sourceFilePath);
  if (resolvedPath) {
    candidatePool.add(normalizePath(resolvedPath));
  }

  const normalizedCandidates = Array.from(candidatePool)
    .map((candidate) => normalizePath(candidate).toLowerCase())
    .filter(Boolean);

  Object.keys(assets).forEach((assetPath) => {
    const normalizedAssetPath = normalizePath(assetPath);
    if (!normalizedAssetPath) {
      return;
    }

    const assetPathLower = normalizedAssetPath.toLowerCase();
    const matched = normalizedCandidates.includes(assetPathLower);

    if (matched) {
      matches.add(normalizedAssetPath);
    }
  });

  return matches;
}

function buildAssetKeysByUrl(assets: Record<string, string>): Map<string, string[]> {
  const keysByUrl = new Map<string, string[]>();

  Object.entries(assets).forEach(([assetPath, assetUrl]) => {
    const normalizedAssetPath = normalizePath(assetPath);
    if (!normalizedAssetPath) {
      return;
    }

    const existing = keysByUrl.get(assetUrl);
    if (existing) {
      existing.push(normalizedAssetPath);
      return;
    }

    keysByUrl.set(assetUrl, [normalizedAssetPath]);
  });

  return keysByUrl;
}

function buildScopedAssets(options: {
  assets: Record<string, string>;
  sourceFile?: Pick<RobotFile, 'name' | 'format'> | null;
  sourceFilePath?: string | null;
  robotLinks?: Record<string, UrdfLink>;
}): Record<string, string> {
  const { assets, sourceFile, sourceFilePath, robotLinks } = options;
  const normalizedSourcePath = normalizePath(sourceFilePath || sourceFile?.name);
  const isUsdSource = sourceFile?.format === 'usd';
  const bundleDirectory = isUsdSource
    ? normalizeDirectory(inferUsdBundleVirtualDirectory(sourceFile?.name || '').replace(/^\/+/, ''))
    : inferGenericBundleDirectory(normalizedSourcePath);
  const shouldIncludeTopLevelKnownAssetDirectories = !isUsdSource && isTopLevelKnownBundleSource(normalizedSourcePath);

  const relevantDirectories = new Set<string>();
  if (bundleDirectory) {
    relevantDirectories.add(bundleDirectory);
  }
  if (shouldIncludeTopLevelKnownAssetDirectories) {
    collectTopLevelKnownAssetDirectories(assets).forEach((directory) => {
      relevantDirectories.add(directory);
    });
  }

  const directAssetKeys = new Set<string>();
  const referencedMeshPaths = collectReferencedMeshPaths(robotLinks);
  const sourceDirectory = getParentDirectory(normalizedSourcePath);
  const assetIndex = buildAssetIndex(assets, sourceDirectory);
  const assetKeysByUrl = buildAssetKeysByUrl(assets);

  if (sourceFile?.format === 'mesh' && normalizedSourcePath) {
    referencedMeshPaths.add(normalizedSourcePath);
  }

  referencedMeshPaths.forEach((meshPath) => {
    collectMatchingAssetKeys(meshPath, assets, normalizedSourcePath).forEach((assetKey) => {
      directAssetKeys.add(assetKey);
      const assetDirectory = getParentDirectory(assetKey);
      if (assetDirectory) {
        relevantDirectories.add(assetDirectory);
      }
    });

    const resolvedAssetUrl = findAssetByIndex(meshPath, assetIndex, sourceDirectory);
    if (resolvedAssetUrl) {
      (assetKeysByUrl.get(resolvedAssetUrl) || []).forEach((assetKey) => {
        directAssetKeys.add(assetKey);
        const assetDirectory = getParentDirectory(assetKey);
        if (assetDirectory) {
          relevantDirectories.add(assetDirectory);
        }
      });
    }

    const resolvedMeshPath = resolveImportedAssetPath(meshPath, normalizedSourcePath);
    const meshDirectory = getParentDirectory(resolvedMeshPath || meshPath);
    if (meshDirectory) {
      relevantDirectories.add(meshDirectory);
    }
  });

  const scopedEntries = Object.entries(assets).filter(([assetPath]) => {
    const normalizedAssetPath = normalizePath(assetPath);
    if (!normalizedAssetPath) {
      return false;
    }

    if (directAssetKeys.has(normalizedAssetPath)) {
      return true;
    }

    for (const directory of relevantDirectories) {
      if (isPathInsideDirectory(normalizedAssetPath, directory)) {
        return true;
      }
    }

    return false;
  });

  return Object.fromEntries(scopedEntries);
}

function buildScopedAvailableFiles(options: {
  availableFiles: RobotFile[];
  sourceFile?: Pick<RobotFile, 'name' | 'format' | 'content' | 'blobUrl'> | null;
}): RobotFile[] {
  const { availableFiles, sourceFile } = options;
  if (sourceFile?.format !== 'usd') {
    return [];
  }

  const bundleDirectory = inferUsdBundleVirtualDirectory(sourceFile.name);
  const scopedFiles = availableFiles.filter((file) => (
    file.format !== 'mesh' && isUsdPathWithinBundleDirectory(file.name, bundleDirectory)
  ));

  if (!scopedFiles.some((file) => file.name === sourceFile.name)) {
    scopedFiles.unshift(sourceFile as RobotFile);
  }

  return scopedFiles;
}

function buildAssetsSignature(assets: Record<string, string>): string {
  return Object.entries(assets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, url]) => `${path}\u0000${url}`)
    .join('\n');
}

function buildAvailableFilesSignature(files: RobotFile[]): string {
  return files
    .map((file) => `${file.name}\u0000${file.format}\u0000${file.blobUrl || ''}\u0000${file.content}`)
    .join('\n');
}

export interface ViewerResourceScope {
  assets: Record<string, string>;
  availableFiles: RobotFile[];
  signature: string;
}

export function createStableViewerResourceScope(
  previous: ViewerResourceScope | null,
  options: {
    assets: Record<string, string>;
    availableFiles: RobotFile[];
    sourceFile?: Pick<RobotFile, 'name' | 'format' | 'content' | 'blobUrl'> | null;
    sourceFilePath?: string | null;
    robotLinks?: Record<string, UrdfLink>;
  },
): ViewerResourceScope {
  const scopedAssets = buildScopedAssets(options);
  const scopedAvailableFiles = buildScopedAvailableFiles(options);
  const signature = [
    buildAssetsSignature(scopedAssets),
    buildAvailableFilesSignature(scopedAvailableFiles),
  ].join('\n---\n');

  if (previous && previous.signature === signature) {
    return previous;
  }

  return {
    assets: scopedAssets,
    availableFiles: scopedAvailableFiles,
    signature,
  };
}
