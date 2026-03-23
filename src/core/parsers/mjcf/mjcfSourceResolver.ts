import type { RobotFile } from '@/types';
import {
  MJCF_COMPILER_ANGLE_SCOPE_ATTR,
  MJCF_COMPILER_EULERSEQ_SCOPE_ATTR,
} from './mjcfCompilerScope';

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

function getCombinedCompilerAttributes(doc: Document): {
  angle: string;
  meshdir: string;
  texturedir: string;
  eulerseq: string;
} {
  let angle = '';
  let meshdir = '';
  let texturedir = '';
  let eulerseq = '';

  doc.querySelectorAll('compiler').forEach((compilerEl) => {
    const nextAngle = compilerEl.getAttribute('angle');
    if (nextAngle) {
      angle = nextAngle;
    }

    const nextMeshdir = compilerEl.getAttribute('meshdir');
    if (nextMeshdir !== null) {
      meshdir = nextMeshdir;
    }

    const nextTexturedir = compilerEl.getAttribute('texturedir');
    if (nextTexturedir !== null) {
      texturedir = nextTexturedir;
    }

    const nextEulerSeq = compilerEl.getAttribute('eulerseq');
    if (nextEulerSeq) {
      eulerseq = nextEulerSeq;
    }
  });

  return { angle, meshdir, texturedir, eulerseq };
}

function prefixIdentifier(value: string, prefix: string): string {
  const trimmed = value.trim();
  if (!trimmed || !prefix) {
    return trimmed;
  }

  return `${prefix}${trimmed}`;
}

function applyAssetDirectory(filePath: string, directory: string): string {
  const trimmed = filePath.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes(':')) {
    return trimmed;
  }

  const normalizedDirectory = normalizePath(directory);
  if (!normalizedDirectory) {
    return normalizePath(trimmed);
  }

  return normalizePath(`${normalizedDirectory}/${trimmed}`);
}

function prefixAttachedModelDocument(doc: Document, prefix: string): void {
  const compilerAttrs = getCombinedCompilerAttributes(doc);
  const referenceAttributes = [
    'mesh',
    'material',
    'texture',
    'class',
    'childclass',
    'joint',
    'joint1',
    'joint2',
    'body',
    'body1',
    'body2',
    'site',
    'site1',
    'site2',
    'geom',
    'geom1',
    'geom2',
    'tendon',
    'tendon1',
    'tendon2',
    'actuator',
    'objname',
    'name1',
    'name2',
  ] as const;
  const elements = Array.from(doc.querySelectorAll('*'));

  elements.forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    const name = element.getAttribute('name');
    if (name) {
      element.setAttribute('name', prefixIdentifier(name, prefix));
    }

    if (tagName === 'default') {
      const className = element.getAttribute('class');
      if (className) {
        element.setAttribute('class', prefixIdentifier(className, prefix));
      }
    }
  });

  elements.forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    referenceAttributes.forEach((attributeName) => {
      if (tagName === 'default' && attributeName === 'class') {
        return;
      }

      const value = element.getAttribute(attributeName);
      if (!value) {
        return;
      }

      element.setAttribute(attributeName, prefixIdentifier(value, prefix));
    });

    if (tagName === 'mesh') {
      const fileAttr = element.getAttribute('file');
      if (fileAttr) {
        element.setAttribute('file', applyAssetDirectory(fileAttr, compilerAttrs.meshdir));
      }
    }

    if (tagName === 'texture') {
      const fileAttr = element.getAttribute('file');
      if (fileAttr) {
        element.setAttribute('file', applyAssetDirectory(fileAttr, compilerAttrs.texturedir));
      }
    }
  });
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

function expandAttachedModelsRecursive(
  content: string,
  indexedFileMap: IndexedMJCFFileMap,
  basePath: string,
  attachStack: string[] = [],
): string {
  const doc = parseXml(content);
  if (!doc) {
    return content;
  }

  const hostMujoco = doc.querySelector('mujoco');
  if (!hostMujoco) {
    return content;
  }

  const attachElements = Array.from(doc.querySelectorAll('attach[model]'));
  if (attachElements.length === 0) {
    return new XMLSerializer().serializeToString(doc);
  }

  const modelAssetByName = new Map<string, string>();
  doc.querySelectorAll('asset > model[name][file]').forEach((modelEl) => {
    const name = modelEl.getAttribute('name')?.trim();
    const file = modelEl.getAttribute('file')?.trim();
    if (name && file) {
      modelAssetByName.set(name, file);
    }
  });

  attachElements.forEach((attachEl) => {
    const modelName = attachEl.getAttribute('model')?.trim();
    const bodyName = attachEl.getAttribute('body')?.trim();
    const prefix = attachEl.getAttribute('prefix')?.trim() || '';

    if (!modelName || !bodyName) {
      attachEl.remove();
      return;
    }

    const modelFile = modelAssetByName.get(modelName);
    if (!modelFile) {
      console.warn(`[MJCF] Attached model asset not found: ${modelName}`);
      attachEl.remove();
      return;
    }

    const resolvedPath = resolveFileInMap(modelFile, indexedFileMap, basePath);
    if (!resolvedPath) {
      console.warn(`[MJCF] Attached model file not found: ${modelFile}`);
      attachEl.remove();
      return;
    }

    const normalizedResolvedPath = normalizePath(resolvedPath);
    if (attachStack.includes(normalizedResolvedPath)) {
      console.warn(`[MJCF] Circular attach detected: ${normalizedResolvedPath}`);
      attachEl.remove();
      return;
    }

    const attachedContent = expandMJCFSource(
      indexedFileMap.fileMap[resolvedPath],
      indexedFileMap,
      getBasePath(resolvedPath),
      [...attachStack, normalizedResolvedPath],
    );
    const attachedDoc = parseXml(attachedContent);
    if (!attachedDoc) {
      attachEl.remove();
      return;
    }

    prefixAttachedModelDocument(attachedDoc, prefix);

    const prefixedBodyName = prefixIdentifier(bodyName, prefix);
    const attachedRootBody = Array.from(attachedDoc.querySelectorAll('worldbody body'))
      .find((bodyEl) => bodyEl.getAttribute('name')?.trim() === prefixedBodyName);

    if (!attachedRootBody) {
      console.warn(`[MJCF] Attached body not found: ${bodyName} in ${resolvedPath}`);
      attachEl.remove();
      return;
    }

    const attachedMujoco = attachedDoc.querySelector('mujoco');
    if (!attachedMujoco) {
      attachEl.remove();
      return;
    }

    const insertionAnchor = hostMujoco.querySelector(':scope > worldbody');
    const attachedCompilerAttrs = getCombinedCompilerAttributes(attachedDoc);
    if (attachedCompilerAttrs.angle) {
      attachedRootBody.setAttribute(MJCF_COMPILER_ANGLE_SCOPE_ATTR, attachedCompilerAttrs.angle);
    }
    if (attachedCompilerAttrs.eulerseq) {
      attachedRootBody.setAttribute(MJCF_COMPILER_EULERSEQ_SCOPE_ATTR, attachedCompilerAttrs.eulerseq);
    }

    attachedMujoco.querySelectorAll(':scope > default').forEach((defaultEl) => {
      hostMujoco.insertBefore(doc.importNode(defaultEl, true), insertionAnchor);
    });

    attachedMujoco.querySelectorAll(':scope > asset').forEach((assetEl) => {
      const assetClone = doc.importNode(assetEl, true) as Element;
      Array.from(assetClone.querySelectorAll(':scope > model')).forEach((modelEl) => modelEl.remove());
      if (assetClone.children.length > 0) {
        hostMujoco.insertBefore(assetClone, insertionAnchor);
      }
    });

    attachEl.parentNode?.insertBefore(doc.importNode(attachedRootBody, true), attachEl);
    attachEl.remove();
  });

  return new XMLSerializer().serializeToString(doc);
}

function expandMJCFSource(
  content: string,
  indexedFileMap: IndexedMJCFFileMap,
  basePath: string,
  expansionStack: string[] = [],
): string {
  const included = expandIncludesRecursive(content, indexedFileMap, basePath, expansionStack);
  return expandAttachedModelsRecursive(included, indexedFileMap, basePath, expansionStack);
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
    const expanded = expandMJCFSource(file.content, indexedFileMap, getBasePath(file.name), [normalizePath(file.name)]);
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
  const selectedExpanded = expandMJCFSource(file.content, indexedFileMap, selectedBasePath, [normalizePath(file.name)]);

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
    content: expandMJCFSource(parentFile.content, indexedFileMap, parentBasePath, [normalizePath(parentFile.name)]),
    sourceFile: file,
    effectiveFile: parentFile,
    basePath: parentBasePath,
  };
  memo.set(file, resolved);
  return resolved;
}

export function processMJCFIncludes(content: string, files: RobotFile[], basePath = ''): string {
  return expandMJCFSource(content, getIndexedMJCFFileMap(files), basePath);
}
