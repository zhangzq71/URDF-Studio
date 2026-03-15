import type { RobotFile } from '@/types';

type MJCFFileMap = Record<string, string>;

interface IndexedMJCFFileMap {
  fileMap: MJCFFileMap;
  mjcfFiles: RobotFile[];
  normalizedEntries: Array<{
    original: string;
    normalized: string;
    basename: string;
  }>;
  byNormalized: Map<string, string>;
  byBasename: Map<string, string[]>;
}

const indexedFileMapCache = new WeakMap<RobotFile[], IndexedMJCFFileMap>();
const resolvedSourceCache = new WeakMap<RobotFile[], WeakMap<RobotFile, ResolvedMJCFSource>>();

function normalizePath(path: string): string {
  const slashNormalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
  const parts = slashNormalized.split('/').filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join('/');
}

function getBasePath(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
}

function getIndexedMJCFFileMap(files: RobotFile[]): IndexedMJCFFileMap {
  const cached = indexedFileMapCache.get(files);
  if (cached) {
    return cached;
  }

  const mjcfFiles = files.filter((file) => file.format === 'mjcf');
  const fileMap: MJCFFileMap = {};
  mjcfFiles.forEach((file) => {
    if (typeof file.content === 'string' && file.content) {
      fileMap[file.name] = file.content;
    }
  });

  const normalizedEntries = Object.keys(fileMap).map((original) => {
    const normalized = normalizePath(original);
    return {
      original,
      normalized,
      basename: normalized.split('/').pop() || normalized,
    };
  });
  const byNormalized = new Map<string, string>();
  const byBasename = new Map<string, string[]>();

  normalizedEntries.forEach((entry) => {
    byNormalized.set(entry.normalized, entry.original);
    const existing = byBasename.get(entry.basename) || [];
    existing.push(entry.original);
    byBasename.set(entry.basename, existing);
  });

  const indexed = {
    fileMap,
    mjcfFiles,
    normalizedEntries,
    byNormalized,
    byBasename,
  } satisfies IndexedMJCFFileMap;
  indexedFileMapCache.set(files, indexed);
  return indexed;
}

function getResolvedSourceMemo(files: RobotFile[]): WeakMap<RobotFile, ResolvedMJCFSource> {
  const cached = resolvedSourceCache.get(files);
  if (cached) {
    return cached;
  }

  const memo = new WeakMap<RobotFile, ResolvedMJCFSource>();
  resolvedSourceCache.set(files, memo);
  return memo;
}

function resolveFileInMap(filename: string, indexedFileMap: IndexedMJCFFileMap, basePath: string): string | null {
  const normalizedFilename = normalizePath(filename.trim());
  if (!normalizedFilename) {
    return null;
  }

  const normalizedBasePath = normalizePath(basePath);

  if (normalizedBasePath) {
    const baseParts = normalizedBasePath.split('/').filter(Boolean);
    for (let i = baseParts.length; i >= 0; i -= 1) {
      const prefix = baseParts.slice(0, i).join('/');
      const tryPath = normalizePath(prefix ? `${prefix}/${normalizedFilename}` : normalizedFilename);
      const found = indexedFileMap.byNormalized.get(tryPath);
      if (found) {
        return found;
      }
    }
  }

  const directMatch = indexedFileMap.byNormalized.get(normalizedFilename);
  if (directMatch) {
    return directMatch;
  }

  const suffixMatch = indexedFileMap.normalizedEntries.find((key) => key.normalized.endsWith(`/${normalizedFilename}`));
  if (suffixMatch) {
    return suffixMatch.original;
  }

  const justFilename = normalizedFilename.split('/').pop() || '';
  if (justFilename) {
    const basenameMatches = indexedFileMap.byBasename.get(justFilename);
    if (basenameMatches?.length) {
      return basenameMatches[0];
    }
  }

  return null;
}

function parseXml(content: string): Document | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    return doc.querySelector('parsererror') ? null : doc;
  } catch {
    return null;
  }
}

function gatherIncludeTargets(content: string): string[] {
  const doc = parseXml(content);
  if (!doc) {
    return [];
  }

  return Array.from(doc.querySelectorAll('include[file]'))
    .map((includeEl) => includeEl.getAttribute('file')?.trim() || '')
    .filter(Boolean);
}

function hasRenderableMJCFContent(content: string): boolean {
  const doc = parseXml(content);
  if (!doc) {
    return false;
  }

  const mujocoEl = doc.querySelector('mujoco');
  if (!mujocoEl) {
    return false;
  }

  const worldbodies = mujocoEl.querySelectorAll(':scope > worldbody');
  for (const worldbody of worldbodies) {
    if (worldbody.querySelector(':scope > body')) {
      return true;
    }

    const directGeoms = worldbody.querySelectorAll(':scope > geom');
    if (directGeoms.length > 0) {
      return true;
    }
  }

  return false;
}

function expandIncludesRecursive(
  content: string,
  indexedFileMap: IndexedMJCFFileMap,
  basePath: string,
  includeStack: string[] = [],
): string {
  const doc = parseXml(content);
  if (!doc) {
    return content;
  }

  const includeElements = Array.from(doc.querySelectorAll('include[file]'));
  includeElements.forEach((includeEl) => {
    const includePath = includeEl.getAttribute('file')?.trim();
    if (!includePath) {
      includeEl.remove();
      return;
    }

    const resolvedPath = resolveFileInMap(includePath, indexedFileMap, basePath);
    if (!resolvedPath) {
      console.warn(`[MJCF] Include file not found: ${includePath}`);
      includeEl.remove();
      return;
    }

    const normalizedResolvedPath = normalizePath(resolvedPath);
    if (includeStack.includes(normalizedResolvedPath)) {
      console.warn(`[MJCF] Circular include detected: ${normalizedResolvedPath}`);
      includeEl.remove();
      return;
    }

    const includedContent = expandIncludesRecursive(
      indexedFileMap.fileMap[resolvedPath],
      indexedFileMap,
      getBasePath(resolvedPath),
      [...includeStack, normalizedResolvedPath],
    );

    const includedDoc = parseXml(includedContent);
    if (!includedDoc) {
      includeEl.remove();
      return;
    }

    const includedRoot = includedDoc.documentElement;
    const parent = includeEl.parentNode;
    if (!parent) {
      includeEl.remove();
      return;
    }

    Array.from(includedRoot.childNodes).forEach((child) => {
      parent.insertBefore(doc.importNode(child, true), includeEl);
    });

    includeEl.remove();
  });

  return new XMLSerializer().serializeToString(doc);
}

function findDirectParentFile(targetFile: RobotFile, files: RobotFile[], indexedFileMap: IndexedMJCFFileMap): RobotFile | null {
  const targetPath = normalizePath(targetFile.name);

  for (const candidate of files) {
    if (candidate.name === targetFile.name || candidate.format !== 'mjcf') {
      continue;
    }

    const includeTargets = gatherIncludeTargets(candidate.content);
    const candidateBasePath = getBasePath(candidate.name);
    const resolvedTargets = includeTargets
      .map((includePath) => resolveFileInMap(includePath, indexedFileMap, candidateBasePath))
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizePath(value));

    if (resolvedTargets.includes(targetPath)) {
      return candidate;
    }
  }

  return null;
}

function findCanonicalSiblingFile(targetFile: RobotFile, files: RobotFile[], indexedFileMap: IndexedMJCFFileMap): RobotFile | null {
  const basePath = getBasePath(targetFile.name);
  const directoryName = basePath.split('/').pop() || '';
  const siblingFiles = files.filter((file) => file.format === 'mjcf' && getBasePath(file.name) === basePath);
  const renderableSiblings = siblingFiles.filter((file) => {
    const expanded = expandIncludesRecursive(file.content, indexedFileMap, getBasePath(file.name), [normalizePath(file.name)]);
    return hasRenderableMJCFContent(expanded);
  });

  const canonicalName = directoryName ? `${directoryName}.xml` : '';
  return renderableSiblings.find((file) => file.name.split('/').pop() === canonicalName)
    || renderableSiblings.find((file) => file.name.split('/').pop() === 'scene.xml')
    || renderableSiblings[0]
    || null;
}

export interface ResolvedMJCFSource {
  content: string;
  sourceFile: RobotFile;
  effectiveFile: RobotFile;
  basePath: string;
}

export function resolveMJCFSource(file: RobotFile, files: RobotFile[]): ResolvedMJCFSource {
  const memo = getResolvedSourceMemo(files);
  const cached = memo.get(file);
  if (cached) {
    return cached;
  }

  const indexedFileMap = getIndexedMJCFFileMap(files);
  const mjcfFiles = indexedFileMap.mjcfFiles;
  const selectedBasePath = getBasePath(file.name);
  const selectedExpanded = expandIncludesRecursive(file.content, indexedFileMap, selectedBasePath, [normalizePath(file.name)]);

  if (hasRenderableMJCFContent(selectedExpanded)) {
    const resolved = {
      content: selectedExpanded,
      sourceFile: file,
      effectiveFile: file,
      basePath: selectedBasePath,
    };
    memo.set(file, resolved);
    return resolved;
  }

  const parentFile = findDirectParentFile(file, mjcfFiles, indexedFileMap) || findCanonicalSiblingFile(file, mjcfFiles, indexedFileMap);
  if (!parentFile) {
    const resolved = {
      content: selectedExpanded,
      sourceFile: file,
      effectiveFile: file,
      basePath: selectedBasePath,
    };
    memo.set(file, resolved);
    return resolved;
  }

  const parentBasePath = getBasePath(parentFile.name);
  const resolved = {
    content: expandIncludesRecursive(parentFile.content, indexedFileMap, parentBasePath, [normalizePath(parentFile.name)]),
    sourceFile: file,
    effectiveFile: parentFile,
    basePath: parentBasePath,
  };
  memo.set(file, resolved);
  return resolved;
}

export function processMJCFIncludes(content: string, files: RobotFile[], basePath = ''): string {
  return expandIncludesRecursive(content, getIndexedMJCFFileMap(files), basePath);
}
