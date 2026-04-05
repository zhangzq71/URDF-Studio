import JSZip from 'jszip';
import {
  resolveRobotFileData,
  isStandaloneXacroEntry,
  type RobotImportResult,
} from '@/core/parsers/importRobotFile';
import { isMJCF } from '@/core/parsers/mjcf';
import { isSDF } from '@/core/parsers/sdf/sdfParser';
import { isUSDA } from '@/core/parsers/usd';
import { pickPreferredUsdRootFile } from '@/core/parsers/usd/usdFormatUtils';
import { isXacro } from '@/core/parsers/xacro';
import { isMotorLibraryDataFilePath } from '@/shared/data/motorLibrary';
import {
  createImportPathCollisionMap,
  isAssetFile,
  isMeshFile,
  remapImportedPath,
} from '@/features/file-io';
import {
  isUrdfSelfContainedInImportBundle,
  pickPreferredImportFile,
} from '@/app/hooks/importPreferredFile';
import { inferCommonPackageAssetBundleRoot } from './importPackageAssetReferences.ts';
import { buildPreResolvedImportContentSignature } from './preResolvedImportSignature.ts';
import type { RobotFile } from '@/types';

const USD_BINARY_MAGIC = new Uint8Array([80, 88, 82, 45, 85, 83, 68, 67]); // "PXR-USDC"
const usdTextDecoder = new TextDecoder();
const MAX_EAGER_TEXT_USD_BYTES = 1024 * 1024;

export interface PreparedImportBlobFile {
  name: string;
  blob: Blob;
}

export interface PreparedImportLibraryFile {
  path: string;
  content: string;
}

export interface PreparedImportTextFile {
  path: string;
  content: string;
}

export interface PreResolvedImportEntry {
  fileName: string;
  format: RobotFile['format'];
  contentSignature: string;
  result: RobotImportResult;
}

export interface PreparedImportPayload {
  robotFiles: RobotFile[];
  assetFiles: PreparedImportBlobFile[];
  usdSourceFiles: PreparedImportBlobFile[];
  libraryFiles: PreparedImportLibraryFile[];
  textFiles: PreparedImportTextFile[];
  preferredFileName: string | null;
  preResolvedImports: PreResolvedImportEntry[];
}

export interface PrepareImportPayloadArgs {
  files: readonly ImportPreparationFileInput[];
  existingPaths: readonly string[];
  preResolvePreferredImport?: boolean;
}

export interface ImportPreparationFileDescriptor {
  file: File;
  relativePath?: string;
}

export type ImportPreparationFileInput = File | ImportPreparationFileDescriptor;

export interface PrepareImportWorkerRequest {
  type: 'prepare-import';
  requestId: number;
  files: ImportPreparationFileDescriptor[];
  existingPaths: string[];
  preResolvePreferredImport?: boolean;
}

export interface PrepareImportWorkerResponse {
  type: 'prepare-import-result' | 'prepare-import-error';
  requestId: number;
  payload?: PreparedImportPayload;
  error?: string;
}

interface CollectedImportPayload {
  robotFiles: RobotFile[];
  assetFiles: PreparedImportBlobFile[];
  usdSourceFiles: PreparedImportBlobFile[];
  libraryFiles: PreparedImportLibraryFile[];
  textFiles: PreparedImportTextFile[];
}

const LOOSE_IMPORT_ROOTLESS_FOLDERS = new Set([
  'meshes',
  'mesh',
  'mjcf',
  'urdf',
  'robot',
  'robots',
  'textures',
  'texture',
  'dae',
  'obj',
  'stl',
  'usd',
  'usda',
  'usdc',
  'usdz',
  'xacro',
  'sdf',
  'motor library',
  'materials',
  'launch',
  'config',
  'rviz',
  'worlds',
  'media',
  'thumbnail',
  'thumbnails',
]);

export const detectImportFormat = (
  content: string,
  filename: string,
): 'urdf' | 'mjcf' | 'usd' | 'xacro' | 'sdf' | null => {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith('.xacro') || lowerName.endsWith('.urdf.xacro')) return 'xacro';
  if (lowerName.endsWith('.urdf')) return 'urdf';
  if (lowerName.endsWith('.sdf')) return 'sdf';
  if (
    lowerName.endsWith('.usda') ||
    lowerName.endsWith('.usdc') ||
    lowerName.endsWith('.usdz') ||
    lowerName.endsWith('.usd')
  ) {
    return 'usd';
  }

  if (lowerName.endsWith('.xml')) {
    if (isMJCF(content)) return 'mjcf';
    if (isSDF(content)) return 'sdf';
    if (isXacro(content)) return 'xacro';
    if (content.includes('<robot')) return 'urdf';
  }

  if (isUSDA(content)) return 'usd';
  if (isMJCF(content)) return 'mjcf';
  if (isSDF(content)) return 'sdf';
  if (isXacro(content)) return 'xacro';
  if (content.includes('<robot')) return 'urdf';

  return null;
};

function hasBinaryMagic(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) return false;

  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[index] !== magic[index]) return false;
  }

  return true;
}

function isLikelyTextBuffer(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  if (sample.some((byte) => byte === 0)) return false;

  const decoded = usdTextDecoder.decode(sample);
  if (decoded.trimStart().startsWith('#usda')) return true;

  let printableCount = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printableCount += 1;
    }
  }

  return sample.length > 0 && printableCount / sample.length > 0.9;
}

export function isUsdFamilyPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return (
    lowerPath.endsWith('.usd') ||
    lowerPath.endsWith('.usda') ||
    lowerPath.endsWith('.usdc') ||
    lowerPath.endsWith('.usdz')
  );
}

export function createImportedUsdFile(name: string, bytes: Uint8Array): RobotFile {
  const lowerName = name.toLowerCase();
  const isBinaryUsd =
    lowerName.endsWith('.usdc') ||
    lowerName.endsWith('.usdz') ||
    hasBinaryMagic(bytes, USD_BINARY_MAGIC);
  const isTextUsd = !isBinaryUsd && (lowerName.endsWith('.usda') || isLikelyTextBuffer(bytes));
  // Large USDA sidecar layers can be hundreds of MB. Keep them blob-backed and
  // avoid eagerly decoding them into JS strings during folder import.
  const shouldDecodeTextContent = isTextUsd && bytes.byteLength <= MAX_EAGER_TEXT_USD_BYTES;

  return {
    name,
    content: shouldDecodeTextContent ? usdTextDecoder.decode(bytes) : '',
    format: 'usd',
  };
}

async function createImportedUsdFileFromLooseFile(name: string, file: File): Promise<RobotFile> {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith('.usdc') || lowerName.endsWith('.usdz')) {
    return {
      name,
      content: '',
      format: 'usd',
    };
  }

  if (lowerName.endsWith('.usda')) {
    return {
      name,
      content: file.size <= MAX_EAGER_TEXT_USD_BYTES ? await file.text() : '',
      format: 'usd',
    };
  }

  const sampleBytes = new Uint8Array(await file.slice(0, Math.min(file.size, 2048)).arrayBuffer());
  const isBinaryUsd = hasBinaryMagic(sampleBytes, USD_BINARY_MAGIC);
  const isTextUsd = !isBinaryUsd && isLikelyTextBuffer(sampleBytes);

  return {
    name,
    content: isTextUsd && file.size <= MAX_EAGER_TEXT_USD_BYTES ? await file.text() : '',
    format: 'usd',
  };
}

function shouldSkipImportPath(path: string): boolean {
  const pathParts = path.split('/');
  return pathParts.some((part) => part.startsWith('.'));
}

function resolveImportInputFile(input: ImportPreparationFileInput): File {
  return input instanceof File ? input : input.file;
}

function resolveImportInputPath(input: ImportPreparationFileInput): string {
  if (!(input instanceof File) && input.relativePath) {
    return input.relativePath;
  }

  const file = resolveImportInputFile(input);
  return file.webkitRelativePath || file.name;
}

function normalizeImportPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function getTopLevelImportSegment(path: string): string | null {
  const normalized = normalizeImportPath(path);
  const separatorIndex = normalized.indexOf('/');
  if (separatorIndex <= 0) {
    return null;
  }

  return normalized.slice(0, separatorIndex);
}

function sanitizeInferredImportRoot(rootName: string | null | undefined): string | null {
  const trimmed = rootName?.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+/, '')
    .trim();

  return sanitized || null;
}

function inferBundleRootFromRobotFiles(robotFiles: readonly RobotFile[]): string | null {
  for (const file of robotFiles) {
    if (file.format === 'sdf') {
      const match = file.content.match(/<model\b[^>]*\bname\s*=\s*["']([^"']+)["']/i);
      const inferred = sanitizeInferredImportRoot(match?.[1]);
      if (inferred) {
        return inferred;
      }
    }
  }

  for (const file of robotFiles) {
    if (file.format === 'urdf' || file.format === 'xacro') {
      const match = file.content.match(/<robot\b[^>]*\bname\s*=\s*["']([^"']+)["']/i);
      const inferred = sanitizeInferredImportRoot(match?.[1]);
      if (inferred) {
        return inferred;
      }
    }
  }

  for (const file of robotFiles) {
    if (file.format === 'mjcf') {
      const match = file.content.match(/<mujoco\b[^>]*\bmodel\s*=\s*["']([^"']+)["']/i);
      const inferred = sanitizeInferredImportRoot(match?.[1]);
      if (inferred) {
        return inferred;
      }
    }
  }

  const firstDefinitionFile =
    robotFiles.find((file) => file.format !== 'mesh' && file.format !== 'usd') ??
    robotFiles.find((file) => file.format !== 'mesh') ??
    robotFiles[0];

  if (!firstDefinitionFile) {
    return null;
  }

  const inferredFromStem = firstDefinitionFile.name
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '');
  return sanitizeInferredImportRoot(inferredFromStem);
}

function hasExistingBundleRootPrefix(payload: CollectedImportPayload, bundleRoot: string): boolean {
  const normalizedBundleRoot = normalizeImportPath(bundleRoot);
  if (!normalizedBundleRoot) {
    return false;
  }

  const allPaths = [
    ...payload.robotFiles.map((file) => file.name),
    ...payload.assetFiles.map((file) => file.name),
    ...payload.usdSourceFiles.map((file) => file.name),
    ...payload.libraryFiles.map((file) => file.path),
    ...payload.textFiles.map((file) => file.path),
  ].map(normalizeImportPath);

  return allPaths.some(
    (path) => path === normalizedBundleRoot || path.startsWith(`${normalizedBundleRoot}/`),
  );
}

function shouldWrapLooseImportUnderBundleRoot(
  payload: CollectedImportPayload,
  options: {
    bundleRoot?: string | null;
    allowRootLevelDefinitionWithSingleFolder?: boolean;
  } = {},
): boolean {
  const allPaths = [
    ...payload.robotFiles.map((file) => file.name),
    ...payload.assetFiles.map((file) => file.name),
    ...payload.usdSourceFiles.map((file) => file.name),
    ...payload.libraryFiles.map((file) => file.path),
    ...payload.textFiles.map((file) => file.path),
  ].map(normalizeImportPath);

  if (allPaths.length === 0) {
    return false;
  }

  if (options.bundleRoot && hasExistingBundleRootPrefix(payload, options.bundleRoot)) {
    return false;
  }

  const topLevelSegments = new Set(
    allPaths.map(getTopLevelImportSegment).filter((segment): segment is string => Boolean(segment)),
  );

  const hasRootLevelDefinitionFile = payload.robotFiles.some(
    (file) =>
      file.format !== 'mesh' &&
      file.format !== 'usd' &&
      getTopLevelImportSegment(file.name) === null,
  );

  if (topLevelSegments.size === 0) {
    return false;
  }

  const hasConventionalRobotFolders = Array.from(topLevelSegments).every((segment) =>
    LOOSE_IMPORT_ROOTLESS_FOLDERS.has(segment.toLowerCase()),
  );

  if (!hasConventionalRobotFolders) {
    return false;
  }

  if (
    options.allowRootLevelDefinitionWithSingleFolder &&
    topLevelSegments.size === 1 &&
    hasRootLevelDefinitionFile
  ) {
    return true;
  }

  if (topLevelSegments.size <= 1) {
    return false;
  }

  return payload.robotFiles.some((file) => file.format !== 'mesh');
}

function prefixCollectedImportPath(path: string, bundleRoot: string): string {
  const normalized = normalizeImportPath(path);
  if (!normalized) {
    return bundleRoot;
  }

  return `${bundleRoot}/${normalized}`;
}

function normalizeLooseImportBundleRoot(payload: CollectedImportPayload): CollectedImportPayload {
  const packageAssetBundleRoot = inferCommonPackageAssetBundleRoot(
    payload.robotFiles
      .filter((file) => file.format !== 'mesh' && file.format !== 'usd')
      .map((file) => ({ format: file.format, content: file.content })),
  );
  const bundleRoot =
    packageAssetBundleRoot &&
    shouldWrapLooseImportUnderBundleRoot(payload, {
      bundleRoot: packageAssetBundleRoot,
      allowRootLevelDefinitionWithSingleFolder: true,
    })
      ? packageAssetBundleRoot
      : shouldWrapLooseImportUnderBundleRoot(payload)
        ? inferBundleRootFromRobotFiles(payload.robotFiles)
        : null;
  if (!bundleRoot) {
    return payload;
  }

  return {
    robotFiles: payload.robotFiles.map((file) => ({
      ...file,
      name: prefixCollectedImportPath(file.name, bundleRoot),
    })),
    assetFiles: payload.assetFiles.map((file) => ({
      ...file,
      name: prefixCollectedImportPath(file.name, bundleRoot),
    })),
    usdSourceFiles: payload.usdSourceFiles.map((file) => ({
      ...file,
      name: prefixCollectedImportPath(file.name, bundleRoot),
    })),
    libraryFiles: payload.libraryFiles.map((file) => ({
      ...file,
      path: prefixCollectedImportPath(file.path, bundleRoot),
    })),
    textFiles: payload.textFiles.map((file) => ({
      ...file,
      path: prefixCollectedImportPath(file.path, bundleRoot),
    })),
  };
}

function isImportableDefinitionPath(lowerPath: string): boolean {
  return (
    lowerPath.endsWith('.urdf') ||
    lowerPath.endsWith('.sdf') ||
    lowerPath.endsWith('.xml') ||
    lowerPath.endsWith('.mjcf') ||
    lowerPath.endsWith('.xacro')
  );
}

function isAuxiliaryTextImportPath(lowerPath: string): boolean {
  return lowerPath.endsWith('.material');
}

const FAST_IMPORT_VARIANT_PENALTY_BY_TOKEN = new Map<string, number>([
  ['with', 2],
  ['hand', 8],
  ['gripper', 8],
  ['ftp', 10],
  ['dfq', 10],
  ['dual', 8],
  ['arm', 4],
  ['mode', 7],
  ['lock', 6],
  ['waist', 4],
  ['sensor', 3],
  ['camera', 3],
  ['comp', 5],
  ['debug', 6],
  ['test', 6],
  ['collision', 5],
  ['visual', 2],
  ['scene', 9],
  ['demo', 4],
  ['example', 4],
]);

const FAST_IMPORT_HELPER_PENALTY_BY_TOKEN = new Map<string, number>([
  ['scene', 12],
  ['world', 10],
  ['terrain', 8],
  ['floor', 8],
  ['env', 8],
  ['environment', 8],
  ['visualize', 10],
  ['viewer', 10],
  ['launcher', 10],
  ['demo', 4],
  ['example', 4],
  ['playground', 6],
]);

function getImportPathDepth(path: string): number {
  return normalizeImportPath(path).split('/').filter(Boolean).length;
}

function getImportBaseName(path: string): string {
  const normalized = normalizeImportPath(path);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function getImportStem(path: string): string {
  const baseName = getImportBaseName(path);
  const lastDotIndex = baseName.lastIndexOf('.');
  return (lastDotIndex >= 0 ? baseName.slice(0, lastDotIndex) : baseName).toLowerCase();
}

function tokenizeImportIdentity(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreFastImportVariantPenalty(fileName: string): number {
  const tokens = tokenizeImportIdentity(getImportStem(fileName));
  const tokenSet = new Set(tokens);

  let penalty = 0;
  tokens.forEach((token) => {
    penalty += FAST_IMPORT_VARIANT_PENALTY_BY_TOKEN.get(token) ?? 0;
  });

  if (tokenSet.has('with') && (tokenSet.has('hand') || tokenSet.has('gripper'))) {
    penalty += 6;
  }

  if (tokenSet.has('dual') && tokenSet.has('arm')) {
    penalty += 6;
  }

  if (tokenSet.has('lock') && tokenSet.has('waist')) {
    penalty += 4;
  }

  return penalty;
}

function scoreFastImportHelperPenalty(fileName: string): number {
  return tokenizeImportIdentity(getImportStem(fileName)).reduce(
    (penalty, token) => penalty + (FAST_IMPORT_HELPER_PENALTY_BY_TOKEN.get(token) ?? 0),
    0,
  );
}

function compareFastImportPathPreference(leftName: string, rightName: string): number {
  const depthDiff = getImportPathDepth(leftName) - getImportPathDepth(rightName);
  if (depthDiff !== 0) {
    return depthDiff;
  }

  const leftBase = getImportBaseName(leftName);
  const rightBase = getImportBaseName(rightName);
  if (leftBase.length !== rightBase.length) {
    return leftBase.length - rightBase.length;
  }

  return leftName.localeCompare(rightName);
}

function pickFastPreparedPreferredFile(files: RobotFile[]): RobotFile | null {
  const robotDefinitionFiles = files.filter((file) => file.format !== 'mesh');
  if (robotDefinitionFiles.length === 0) {
    return files[0] ?? null;
  }

  const urdfFiles = robotDefinitionFiles.filter((file) => file.format === 'urdf');
  if (urdfFiles.length > 0) {
    return (
      [...urdfFiles].sort((left, right) => {
        const leftSelfContained = isUrdfSelfContainedInImportBundle(left, robotDefinitionFiles);
        const rightSelfContained = isUrdfSelfContainedInImportBundle(right, robotDefinitionFiles);
        if (leftSelfContained !== rightSelfContained) {
          return Number(rightSelfContained) - Number(leftSelfContained);
        }

        const variantPenaltyDiff =
          scoreFastImportVariantPenalty(left.name) - scoreFastImportVariantPenalty(right.name);
        if (variantPenaltyDiff !== 0) {
          return variantPenaltyDiff;
        }

        return compareFastImportPathPreference(left.name, right.name);
      })[0] ?? null
    );
  }

  const mjcfFiles = robotDefinitionFiles.filter((file) => file.format === 'mjcf');
  if (mjcfFiles.length > 0) {
    return (
      [...mjcfFiles].sort((left, right) => {
        const helperPenaltyDiff =
          scoreFastImportHelperPenalty(left.name) - scoreFastImportHelperPenalty(right.name);
        if (helperPenaltyDiff !== 0) {
          return helperPenaltyDiff;
        }

        return compareFastImportPathPreference(left.name, right.name);
      })[0] ?? null
    );
  }

  const preferredUsd = pickPreferredUsdRootFile(
    robotDefinitionFiles.filter((file) => file.format === 'usd'),
  );
  if (preferredUsd) {
    return preferredUsd;
  }

  const standaloneXacroFiles = robotDefinitionFiles.filter(
    (file) => file.format === 'xacro' && isStandaloneXacroEntry(file),
  );
  if (standaloneXacroFiles.length > 0) {
    return (
      [...standaloneXacroFiles].sort((left, right) =>
        compareFastImportPathPreference(left.name, right.name),
      )[0] ?? null
    );
  }

  const xacroFiles = robotDefinitionFiles.filter((file) => file.format === 'xacro');
  if (xacroFiles.length > 0) {
    return (
      [...xacroFiles].sort((left, right) =>
        compareFastImportPathPreference(left.name, right.name),
      )[0] ?? null
    );
  }

  const sdfFiles = robotDefinitionFiles.filter((file) => file.format === 'sdf');
  if (sdfFiles.length > 0) {
    return (
      [...sdfFiles].sort((left, right) =>
        compareFastImportPathPreference(left.name, right.name),
      )[0] ?? null
    );
  }

  return robotDefinitionFiles[0] ?? files[0] ?? null;
}

function renameCollectedImportPayload(
  payload: CollectedImportPayload,
  existingPaths: readonly string[],
  options: {
    preResolvePreferredImport?: boolean;
  } = {},
): PreparedImportPayload {
  const importedPaths = [
    ...payload.robotFiles.map((file) => file.name),
    ...payload.assetFiles.map((file) => file.name),
    ...payload.libraryFiles.map((file) => file.path),
    ...payload.textFiles.map((file) => file.path),
  ];
  const pathCollisionMap = createImportPathCollisionMap(importedPaths, existingPaths);

  const renamedPayload = {
    robotFiles: payload.robotFiles.map((file) => ({
      ...file,
      name: remapImportedPath(file.name, pathCollisionMap),
    })),
    assetFiles: payload.assetFiles.map((file) => ({
      ...file,
      name: remapImportedPath(file.name, pathCollisionMap),
    })),
    usdSourceFiles: payload.usdSourceFiles.map((file) => ({
      ...file,
      name: remapImportedPath(file.name, pathCollisionMap),
    })),
    libraryFiles: payload.libraryFiles.map((file) => ({
      ...file,
      path: remapImportedPath(file.path, pathCollisionMap),
    })),
    textFiles: payload.textFiles.map((file) => ({
      ...file,
      path: remapImportedPath(file.path, pathCollisionMap),
    })),
  };
  const shouldPreResolvePreferredImport = options.preResolvePreferredImport !== false;
  const importTextFileContents = shouldPreResolvePreferredImport
    ? Object.fromEntries(renamedPayload.textFiles.map((file) => [file.path, file.content]))
    : {};
  const preferredFile = shouldPreResolvePreferredImport
    ? pickPreferredImportFile(renamedPayload.robotFiles, renamedPayload.robotFiles)
    : pickFastPreparedPreferredFile(renamedPayload.robotFiles);
  const preferredImportResult =
    shouldPreResolvePreferredImport && preferredFile
      ? preferredFile.format === 'xacro' || preferredFile.format === 'sdf'
        ? resolveRobotFileData(preferredFile, {
            availableFiles: renamedPayload.robotFiles,
            allFileContents: importTextFileContents,
          })
        : resolveRobotFileData(preferredFile, {
            availableFiles: renamedPayload.robotFiles,
          })
      : null;

  const preResolvedImports =
    shouldPreResolvePreferredImport && preferredFile && preferredImportResult
      ? [
          {
            fileName: preferredFile.name,
            format: preferredFile.format,
            contentSignature: buildPreResolvedImportContentSignature(preferredFile.content),
            result: preferredImportResult,
          },
        ]
      : [];

  return {
    ...renamedPayload,
    preferredFileName: preferredFile?.name ?? null,
    preResolvedImports,
  };
}

async function collectImportPayloadFromZipFile(zipFile: File): Promise<CollectedImportPayload> {
  const payload: CollectedImportPayload = {
    robotFiles: [],
    assetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
    textFiles: [],
  };
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const entryTasks: Promise<void>[] = [];
  const auxiliaryTextEntries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];

  zip.forEach((relativePath, fileEntry) => {
    if (fileEntry.dir || shouldSkipImportPath(relativePath)) {
      return;
    }

    const lowerPath = relativePath.toLowerCase();
    entryTasks.push(
      (async () => {
        if (isUsdFamilyPath(relativePath)) {
          const bytes = await fileEntry.async('uint8array');
          payload.robotFiles.push(createImportedUsdFile(relativePath, bytes));
          payload.usdSourceFiles.push({ name: relativePath, blob: new Blob([bytes]) });
          return;
        }

        if (isImportableDefinitionPath(lowerPath)) {
          const content = await fileEntry.async('string');
          const format = detectImportFormat(content, relativePath);
          if (format) {
            payload.robotFiles.push({ name: relativePath, content, format });
          }
          return;
        }

        if (isMotorLibraryDataFilePath(relativePath)) {
          const content = await fileEntry.async('string');
          payload.libraryFiles.push({ path: relativePath, content });
          return;
        }

        if (isAuxiliaryTextImportPath(lowerPath)) {
          auxiliaryTextEntries.push({ path: relativePath, entry: fileEntry });
          return;
        }

        if (isAssetFile(relativePath)) {
          const blob = await fileEntry.async('blob');
          payload.assetFiles.push({ name: relativePath, blob });
          if (isMeshFile(relativePath)) {
            payload.robotFiles.push({ name: relativePath, content: '', format: 'mesh' });
          }
        }
      })(),
    );
  });

  await Promise.all(entryTasks);

  if (payload.robotFiles.some((file) => file.format === 'sdf') && auxiliaryTextEntries.length > 0) {
    await Promise.all(
      auxiliaryTextEntries.map(async ({ path, entry }) => {
        const content = await entry.async('string');
        payload.textFiles.push({ path, content });
      }),
    );
  }

  return payload;
}

async function collectImportPayloadFromLooseFiles(
  files: readonly ImportPreparationFileInput[],
): Promise<CollectedImportPayload> {
  const payload: CollectedImportPayload = {
    robotFiles: [],
    assetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
    textFiles: [],
  };
  const auxiliaryTextFiles: Array<{ path: string; file: File }> = [];

  await Promise.all(
    files.map(async (input) => {
      const file = resolveImportInputFile(input);
      const path = resolveImportInputPath(input);
      const lowerPath = path.toLowerCase();

      if (shouldSkipImportPath(path)) {
        return;
      }

      if (isUsdFamilyPath(path)) {
        payload.robotFiles.push(await createImportedUsdFileFromLooseFile(path, file));
        payload.usdSourceFiles.push({ name: path, blob: file });
        return;
      }

      if (isImportableDefinitionPath(lowerPath)) {
        const content = await file.text();
        const format = detectImportFormat(content, file.name);
        if (format) {
          payload.robotFiles.push({ name: path, content, format });
        }
        return;
      }

      if (isMotorLibraryDataFilePath(path)) {
        const content = await file.text();
        payload.libraryFiles.push({ path, content });
        return;
      }

      if (isAuxiliaryTextImportPath(lowerPath)) {
        auxiliaryTextFiles.push({ path, file });
        return;
      }

      if (isAssetFile(path)) {
        payload.assetFiles.push({ name: path, blob: file });
        if (isMeshFile(path)) {
          payload.robotFiles.push({ name: path, content: '', format: 'mesh' });
        }
      }
    }),
  );

  if (payload.robotFiles.some((file) => file.format === 'sdf') && auxiliaryTextFiles.length > 0) {
    await Promise.all(
      auxiliaryTextFiles.map(async ({ path, file }) => {
        const content = await file.text();
        payload.textFiles.push({ path, content });
      }),
    );
  }

  return payload;
}

export async function prepareImportPayload({
  files,
  existingPaths,
  preResolvePreferredImport = true,
}: PrepareImportPayloadArgs): Promise<PreparedImportPayload> {
  const firstFile = files[0] ? resolveImportInputFile(files[0]) : null;
  const collectedPayload =
    files.length === 1 && firstFile && firstFile.name.toLowerCase().endsWith('.zip')
      ? await collectImportPayloadFromZipFile(firstFile)
      : await collectImportPayloadFromLooseFiles(files);

  return renameCollectedImportPayload(
    normalizeLooseImportBundleRoot(collectedPayload),
    existingPaths,
    {
      preResolvePreferredImport,
    },
  );
}
