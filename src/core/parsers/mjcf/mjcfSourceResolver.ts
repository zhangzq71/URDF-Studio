import type { RobotFile } from '@/types';

type MJCFFileMap = Record<string, string>;

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

function resolveFileInMap(filename: string, fileMap: MJCFFileMap, basePath: string): string | null {
  const normalizedFilename = normalizePath(filename.trim());
  if (!normalizedFilename) {
    return null;
  }

  const normalizedBasePath = normalizePath(basePath);
  const normalizedKeys = Object.keys(fileMap).map((key) => ({
    original: key,
    normalized: normalizePath(key),
  }));

  if (normalizedBasePath) {
    const baseParts = normalizedBasePath.split('/').filter(Boolean);
    for (let i = baseParts.length; i >= 0; i -= 1) {
      const prefix = baseParts.slice(0, i).join('/');
      const tryPath = normalizePath(prefix ? `${prefix}/${normalizedFilename}` : normalizedFilename);
      const found = normalizedKeys.find((key) => key.normalized === tryPath);
      if (found) {
        return found.original;
      }
    }
  }

  const directMatch = normalizedKeys.find((key) => key.normalized === normalizedFilename);
  if (directMatch) {
    return directMatch.original;
  }

  const suffixMatch = normalizedKeys.find((key) => key.normalized.endsWith(`/${normalizedFilename}`));
  if (suffixMatch) {
    return suffixMatch.original;
  }

  const justFilename = normalizedFilename.split('/').pop() || '';
  if (justFilename) {
    const fileNameMatch = normalizedKeys.find((key) => key.normalized === justFilename || key.normalized.endsWith(`/${justFilename}`));
    if (fileNameMatch) {
      return fileNameMatch.original;
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
  fileMap: MJCFFileMap,
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

    const resolvedPath = resolveFileInMap(includePath, fileMap, basePath);
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
      fileMap[resolvedPath],
      fileMap,
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

function buildMJCFFileMap(files: RobotFile[]): MJCFFileMap {
  const fileMap: MJCFFileMap = {};
  files.forEach((file) => {
    if (typeof file.content === 'string' && file.content) {
      fileMap[file.name] = file.content;
    }
  });
  return fileMap;
}

function findDirectParentFile(targetFile: RobotFile, files: RobotFile[], fileMap: MJCFFileMap): RobotFile | null {
  const targetPath = normalizePath(targetFile.name);

  for (const candidate of files) {
    if (candidate.name === targetFile.name || candidate.format !== 'mjcf') {
      continue;
    }

    const includeTargets = gatherIncludeTargets(candidate.content);
    const candidateBasePath = getBasePath(candidate.name);
    const resolvedTargets = includeTargets
      .map((includePath) => resolveFileInMap(includePath, fileMap, candidateBasePath))
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizePath(value));

    if (resolvedTargets.includes(targetPath)) {
      return candidate;
    }
  }

  return null;
}

function findCanonicalSiblingFile(targetFile: RobotFile, files: RobotFile[], fileMap: MJCFFileMap): RobotFile | null {
  const basePath = getBasePath(targetFile.name);
  const directoryName = basePath.split('/').pop() || '';
  const siblingFiles = files.filter((file) => file.format === 'mjcf' && getBasePath(file.name) === basePath);
  const renderableSiblings = siblingFiles.filter((file) => {
    const expanded = expandIncludesRecursive(file.content, fileMap, getBasePath(file.name), [normalizePath(file.name)]);
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
  const mjcfFiles = files.filter((candidate) => candidate.format === 'mjcf');
  const fileMap = buildMJCFFileMap(mjcfFiles);
  const selectedBasePath = getBasePath(file.name);
  const selectedExpanded = expandIncludesRecursive(file.content, fileMap, selectedBasePath, [normalizePath(file.name)]);

  if (hasRenderableMJCFContent(selectedExpanded)) {
    return {
      content: selectedExpanded,
      sourceFile: file,
      effectiveFile: file,
      basePath: selectedBasePath,
    };
  }

  const parentFile = findDirectParentFile(file, mjcfFiles, fileMap) || findCanonicalSiblingFile(file, mjcfFiles, fileMap);
  if (!parentFile) {
    return {
      content: selectedExpanded,
      sourceFile: file,
      effectiveFile: file,
      basePath: selectedBasePath,
    };
  }

  const parentBasePath = getBasePath(parentFile.name);
  return {
    content: expandIncludesRecursive(parentFile.content, fileMap, parentBasePath, [normalizePath(parentFile.name)]),
    sourceFile: file,
    effectiveFile: parentFile,
    basePath: parentBasePath,
  };
}

export function processMJCFIncludes(content: string, files: RobotFile[], basePath = ''): string {
  const fileMap = buildMJCFFileMap(files.filter((file) => file.format === 'mjcf'));
  return expandIncludesRecursive(content, fileMap, basePath);
}
