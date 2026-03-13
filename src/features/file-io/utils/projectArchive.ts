const ASSET_FILE_PREFIX = 'assets/files';
const LIBRARY_FILE_PREFIX = 'library/files';

export const PROJECT_VERSION = '2.0';
export const PROJECT_ASSET_MANIFEST_FILE = 'assets/manifest.json';
export const PROJECT_ALL_FILE_CONTENTS_FILE = 'library/all-file-contents.json';
export const PROJECT_MOTOR_LIBRARY_FILE = 'library/motor-library.json';
export const PROJECT_ORIGINAL_URDF_FILE = 'workspace/original-urdf.txt';
export const PROJECT_ROBOT_HISTORY_FILE = 'history/robot.json';
export const PROJECT_ASSEMBLY_HISTORY_FILE = 'history/assembly.json';

export const normalizeArchivePath = (inputPath: string): string => {
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');

  return segments.join('/');
};

export const buildAssetArchivePath = (logicalPath: string): string => {
  const normalized = normalizeArchivePath(logicalPath);
  return normalized ? `${ASSET_FILE_PREFIX}/${normalized}` : ASSET_FILE_PREFIX;
};

export const buildLibraryArchivePath = (logicalPath: string): string => {
  const normalized = normalizeArchivePath(logicalPath);
  return normalized ? `${LIBRARY_FILE_PREFIX}/${normalized}` : LIBRARY_FILE_PREFIX;
};

const scoreLogicalPath = (logicalPath: string): number => {
  const normalized = normalizeArchivePath(logicalPath);
  const segments = normalized ? normalized.split('/').length : 0;
  const hasExtension = /\.[a-z0-9]+$/i.test(normalized) ? 1 : 0;
  return segments * 100 + hasExtension * 10 + normalized.length;
};

export const chooseCanonicalLogicalPath = (keys: string[], fallbackName: string): string => {
  const candidates = Array.from(
    new Set(keys.map((key) => normalizeArchivePath(key)).filter(Boolean)),
  );

  if (candidates.length === 0) {
    return normalizeArchivePath(fallbackName) || fallbackName;
  }

  return candidates.sort((left, right) => {
    const scoreDelta = scoreLogicalPath(right) - scoreLogicalPath(left);
    if (scoreDelta !== 0) return scoreDelta;
    return left.localeCompare(right);
  })[0];
};

export const ensureUniqueLogicalPath = (
  logicalPath: string,
  usedPaths: Set<string>,
  fallbackBaseName: string,
): string => {
  const normalized = normalizeArchivePath(logicalPath) || normalizeArchivePath(fallbackBaseName) || 'asset';
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }

  const lastSlash = normalized.lastIndexOf('/');
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : '';

  let suffix = 2;
  let candidate = normalized;
  while (usedPaths.has(candidate)) {
    const nextName = `${baseName}_${suffix}${extension}`;
    candidate = directory ? `${directory}/${nextName}` : nextName;
    suffix += 1;
  }

  usedPaths.add(candidate);
  return candidate;
};
