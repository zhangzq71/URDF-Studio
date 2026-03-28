export interface PackageAssetReferenceSource {
  format: string;
  content: string;
}

export interface StandalonePackageAssetImportWarning {
  bundleRoots: string[];
  packageNames: string[];
}

const PACKAGE_ASSET_URI_PATTERN = /\b(?:package|model):\/\/([^\s"'<>]+)/g;

const PACKAGE_ROOT_BOUNDARY_SEGMENTS = new Set([
  'meshes',
  'mesh',
  'materials',
  'material',
  'textures',
  'texture',
  'urdf',
  'robot',
  'robots',
  'xacro',
  'sdf',
  'mjcf',
  'dae',
  'obj',
  'stl',
  'gltf',
  'glb',
  'launch',
  'config',
  'rviz',
  'worlds',
  'media',
  'thumbnail',
  'thumbnails',
]);

const ROOT_REFERENCE_FORMATS = new Set(['urdf', 'xacro', 'sdf']);

function sanitizeRootSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+/, '');
}

function normalizeRootSegments(path: string): string[] {
  const segments = path.replace(/\\/g, '/').split('/');
  const normalized: string[] = [];

  for (const rawSegment of segments) {
    const segment = sanitizeRootSegment(rawSegment);
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (normalized.length > 0) {
        normalized.pop();
      }
      continue;
    }
    normalized.push(segment);
  }

  return normalized;
}

function inferBundleRootFromUriPath(uriPath: string): string | null {
  const segments = normalizeRootSegments(uriPath);
  if (segments.length === 0) {
    return null;
  }

  const [packageName, ...relativeSegments] = segments;
  const boundaryIndex = relativeSegments.findIndex((segment) =>
    PACKAGE_ROOT_BOUNDARY_SEGMENTS.has(segment.toLowerCase()),
  );

  const rootSegments = [
    packageName,
    ...(
      boundaryIndex > 0
        ? relativeSegments.slice(0, boundaryIndex)
        : []
    ),
  ].filter(Boolean);

  return rootSegments.length > 0 ? rootSegments.join('/') : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function commonRootPrefix(roots: readonly string[]): string | null {
  if (roots.length === 0) {
    return null;
  }

  const splitRoots = roots.map((root) => root.split('/').filter(Boolean));
  const prefix = [...splitRoots[0]];

  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const candidate = prefix.slice(0, index + 1);
    const matchesAll = splitRoots.every((segments) =>
      candidate.every((segment, segmentIndex) => segments[segmentIndex] === segment),
    );
    if (matchesAll) {
      return candidate.join('/');
    }
  }

  return null;
}

export function extractPackageAssetBundleRoots(content: string): string[] {
  const roots: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = PACKAGE_ASSET_URI_PATTERN.exec(content)) !== null) {
    const inferredRoot = inferBundleRootFromUriPath(match[1] ?? '');
    if (inferredRoot) {
      roots.push(inferredRoot);
    }
  }

  return uniqueSorted(roots);
}

export function inferCommonPackageAssetBundleRoot(
  sources: readonly PackageAssetReferenceSource[],
): string | null {
  const roots = uniqueSorted(
    sources.flatMap((source) => (
      ROOT_REFERENCE_FORMATS.has(source.format)
        ? extractPackageAssetBundleRoots(source.content)
        : []
    )),
  );

  return commonRootPrefix(roots);
}

export function buildStandalonePackageAssetImportWarning(
  source: PackageAssetReferenceSource | null,
  assetPaths: readonly string[],
): StandalonePackageAssetImportWarning | null {
  if (!source || assetPaths.length > 0 || !ROOT_REFERENCE_FORMATS.has(source.format)) {
    return null;
  }

  const bundleRoots = extractPackageAssetBundleRoots(source.content);
  if (bundleRoots.length === 0) {
    return null;
  }

  return {
    bundleRoots,
    packageNames: uniqueSorted(bundleRoots.map((root) => root.split('/')[0] ?? root)),
  };
}
