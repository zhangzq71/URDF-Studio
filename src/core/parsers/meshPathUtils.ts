/**
 * Mesh path utilities for robust export.
 *
 * Handles common path formats from imported URDF/MJCF/Xacro files:
 * - package://<pkg>/meshes/part.stl
 * - ../meshes/part.stl
 * - /meshes/part.stl
 * - windows\\path\\part.stl
 */

const normalizeRelativePath = (path: string): string => {
  const segments = path.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.join('/');
};

const stripPackagePrefix = (path: string): string => {
  if (!path.startsWith('package://')) return path;
  const withoutScheme = path.slice('package://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  return slashIndex >= 0 ? withoutScheme.slice(slashIndex + 1) : withoutScheme;
};

const stripBlobPrefix = (path: string): string => {
  if (!path.startsWith('blob:')) return path;
  const slashIndex = path.indexOf('/', 5);
  return slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
};

/**
 * Convert any mesh path into a stable export path relative to zip "meshes/" folder.
 */
export const normalizeMeshPathForExport = (meshPath: string): string => {
  const raw = (meshPath || '').trim();
  if (!raw) return '';

  let normalized = raw.replace(/\\/g, '/');
  normalized = stripBlobPrefix(normalized);
  normalized = stripPackagePrefix(normalized);

  // Drop Windows drive prefix (e.g. C:/)
  normalized = normalized.replace(/^[A-Za-z]:\//, '');

  normalized = normalized.replace(/^\/+/, '');
  normalized = normalized.replace(/^(\.\/)+/, '');
  normalized = normalizeRelativePath(normalized);

  const lower = normalized.toLowerCase();
  const meshDirIndex = lower.indexOf('/meshes/');
  if (meshDirIndex >= 0) {
    normalized = normalized.slice(meshDirIndex + '/meshes/'.length);
  } else if (lower.startsWith('meshes/')) {
    normalized = normalized.slice('meshes/'.length);
  } else if (lower.startsWith('mesh/')) {
    normalized = normalized.slice('mesh/'.length);
  }

  normalized = normalizeRelativePath(normalized);

  if (!normalized) {
    const fallback = raw.split(/[\\/]/).pop() || '';
    return fallback;
  }

  return normalized;
};

const pushUnique = (values: string[], seen: Set<string>, value?: string) => {
  if (!value) return;
  const v = value.trim();
  if (!v) return;
  if (seen.has(v)) return;
  seen.add(v);
  values.push(v);
};

/**
 * Build candidate keys for mesh lookup in assets map.
 */
export const buildMeshLookupCandidates = (meshPath: string): string[] => {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const raw = (meshPath || '').trim();
  const slashNormalized = raw.replace(/\\/g, '/');
  const strippedPackage = stripPackagePrefix(slashNormalized);
  const strippedBlob = stripBlobPrefix(slashNormalized);
  const strippedBoth = stripPackagePrefix(strippedBlob);
  const relative = normalizeRelativePath(strippedBoth.replace(/^\/+/, '').replace(/^(\.\/)+/, ''));
  const exportRelative = normalizeMeshPathForExport(meshPath);
  const filename = (exportRelative || relative || slashNormalized).split('/').pop() || '';

  pushUnique(candidates, seen, raw);
  pushUnique(candidates, seen, slashNormalized);
  pushUnique(candidates, seen, strippedPackage);
  pushUnique(candidates, seen, strippedBlob);
  pushUnique(candidates, seen, strippedBoth);
  pushUnique(candidates, seen, relative);
  pushUnique(candidates, seen, exportRelative);

  pushUnique(candidates, seen, filename);

  if (exportRelative) {
    pushUnique(candidates, seen, `meshes/${exportRelative}`);
    pushUnique(candidates, seen, `/meshes/${exportRelative}`);
  }

  if (filename) {
    pushUnique(candidates, seen, `meshes/${filename}`);
    pushUnique(candidates, seen, `/meshes/${filename}`);
  }

  return candidates;
};

/**
 * Resolve mesh blob URL from assets map using robust matching.
 */
export const resolveMeshAssetUrl = (
  meshPath: string,
  assets: Record<string, string>
): string | null => {
  const candidates = buildMeshLookupCandidates(meshPath);
  if (candidates.length === 0) return null;

  // 1) Fast exact match
  for (const candidate of candidates) {
    const exact = assets[candidate];
    if (exact) return exact;
  }

  const lowerCandidates = candidates.map((c) => c.toLowerCase());

  // 2) Case-insensitive exact match
  for (const [key, value] of Object.entries(assets)) {
    if (lowerCandidates.includes(key.toLowerCase())) {
      return value;
    }
  }

  // 3) Suffix-based fuzzy match (handles nested paths and aliases)
  for (const [key, value] of Object.entries(assets)) {
    const keyLower = key.toLowerCase();
    for (const candidate of lowerCandidates) {
      if (keyLower.endsWith(candidate) || candidate.endsWith(keyLower)) {
        return value;
      }
    }
  }

  return null;
};
