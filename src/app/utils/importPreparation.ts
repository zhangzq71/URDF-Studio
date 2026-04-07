import {
  resolveRobotFileData,
  isStandaloneXacroEntry,
  type RobotImportResult,
} from '@/core/parsers/importRobotFile';
import { resolveImportedAssetPath, resolveMeshAssetUrl } from '@/core/parsers/meshPathUtils';
import { isMJCF } from '@/core/parsers/mjcf';
import { validateMJCFImportExternalAssets } from '@/core/parsers/mjcf/mjcfImportValidation';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { isSDF } from '@/core/parsers/sdf/sdfParser';
import { isUSDA } from '@/core/parsers/usd';
import { pickPreferredUsdRootFile } from '@/core/parsers/usd/usdFormatUtils';
import { isXacro } from '@/core/parsers/xacro';
import { isAssetFile } from '@/features/file-io/utils/formatDetection';
import {
  createImportPathCollisionMap,
  remapImportedPath,
} from '@/features/file-io/utils/libraryImportPathCollisions';
import { isMotorLibraryDataFilePath } from '@/shared/data/motorLibrary';
import {
  isAssetLibraryOnlyFormat,
  isVisibleLibraryAssetPath,
  isVisibleLibraryEntry,
} from '@/shared/utils/robotFileSupport';
import {
  isUrdfSelfContainedInImportBundle,
  pickPreferredImportFile,
} from '@/app/hooks/importPreferredFile';
import {
  extractStandaloneImportAssetReferences,
  inferCommonPackageAssetBundleRoot,
} from './importPackageAssetReferences.ts';
import { buildPreResolvedImportContentSignature } from './preResolvedImportSignature.ts';
import {
  isSupportedArchiveImportFile,
  withArchiveImportSession,
  type ArchiveImportEntry,
  type ArchiveImportSession,
} from './archiveImport.ts';
import { GeometryType, type RobotData, type RobotFile, type UrdfLink } from '@/types';

const USD_BINARY_MAGIC = new Uint8Array([80, 88, 82, 45, 85, 83, 68, 67]); // "PXR-USDC"
const usdTextDecoder = new TextDecoder();
const MAX_EAGER_TEXT_USD_BYTES = 1024 * 1024;

export interface PreparedImportBlobFile {
  name: string;
  blob: Blob;
}

export interface PreparedDeferredImportAssetFile {
  name: string;
  sourcePath: string;
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
  deferredAssetFiles: PreparedDeferredImportAssetFile[];
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
  onProgress?: (progress: PrepareImportProgress) => void;
}

export type PrepareImportProgressPhase =
  | 'reading-archive'
  | 'extracting-files'
  | 'finalizing-import';

export interface PrepareImportProgress {
  phase: PrepareImportProgressPhase;
  progressPercent: number | null;
  processedEntries: number;
  totalEntries: number;
  processedBytes: number;
  totalBytes: number;
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

export interface HydrateDeferredImportAssetsWorkerRequest {
  type: 'hydrate-deferred-import-assets';
  requestId: number;
  archiveFile: File;
  assetFiles: PreparedDeferredImportAssetFile[];
}

export interface PrepareImportWorkerResponse {
  type: 'prepare-import-result' | 'prepare-import-error' | 'prepare-import-progress';
  requestId: number;
  payload?: PreparedImportPayload;
  error?: string;
  progress?: PrepareImportProgress;
}

export interface HydrateDeferredImportAssetsWorkerResponse {
  type:
    | 'hydrate-deferred-import-assets-result'
    | 'hydrate-deferred-import-assets-error'
    | 'hydrate-deferred-import-assets-progress';
  requestId: number;
  assetFiles?: PreparedImportBlobFile[];
  error?: string;
  progress?: PrepareImportProgress;
}

export type ImportPreparationWorkerResponse =
  | PrepareImportWorkerResponse
  | HydrateDeferredImportAssetsWorkerResponse;

export type ImportPreparationWorkerRequest =
  | PrepareImportWorkerRequest
  | HydrateDeferredImportAssetsWorkerRequest;

interface CollectedImportPayload {
  robotFiles: RobotFile[];
  assetFiles: PreparedImportBlobFile[];
  deferredAssetFiles: PreparedDeferredImportAssetFile[];
  usdSourceFiles: PreparedImportBlobFile[];
  libraryFiles: PreparedImportLibraryFile[];
  textFiles: PreparedImportTextFile[];
}

function createEmptyCollectedImportPayload(): CollectedImportPayload {
  return {
    robotFiles: [],
    assetFiles: [],
    deferredAssetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
    textFiles: [],
  };
}

function createEmptyPreparedImportPayload(): PreparedImportPayload {
  return {
    robotFiles: [],
    assetFiles: [],
    deferredAssetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
    textFiles: [],
    preferredFileName: null,
    preResolvedImports: [],
  };
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

const MAX_EAGER_TEXT_MESH_ASSET_BYTES = 8 * 1024 * 1024;

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
    robotFiles.find((file) => !isAssetLibraryOnlyFormat(file.format) && file.format !== 'usd') ??
    robotFiles.find((file) => !isAssetLibraryOnlyFormat(file.format)) ??
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
      !isAssetLibraryOnlyFormat(file.format) &&
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

  return payload.robotFiles.some((file) => !isAssetLibraryOnlyFormat(file.format));
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
      .filter((file) => !isAssetLibraryOnlyFormat(file.format) && file.format !== 'usd')
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
    deferredAssetFiles: payload.deferredAssetFiles.map((file) => ({
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
  return (
    lowerPath.endsWith('.material') || lowerPath.endsWith('.gazebo') || lowerPath.endsWith('.mtl')
  );
}

function shouldMirrorTextMeshAssetContent(lowerPath: string): boolean {
  return lowerPath.endsWith('.dae') || lowerPath.endsWith('.obj');
}

function createVisibleImportedAssetFile(path: string): RobotFile | null {
  if (!isVisibleLibraryAssetPath(path)) {
    return null;
  }

  return {
    name: path,
    content: '',
    format: 'mesh',
  };
}

function shouldLoadAuxiliaryImportText(robotFiles: readonly RobotFile[]): boolean {
  return robotFiles.some(
    (file) => file.format === 'sdf' || file.format === 'xacro' || file.format === 'usd',
  );
}

function normalizeResolvedImportAssetPath(
  assetPath: string,
  sourceFilePath?: string | null,
): string {
  return normalizeImportPath(resolveImportedAssetPath(assetPath, sourceFilePath));
}

function parseObjMaterialLibraryPaths(meshPath: string, content: string): string[] {
  const materialLibraryPaths = new Set<string>();
  const matches = content.matchAll(/^[ \t]*mtllib[ \t]+(.+)$/gim);

  for (const match of matches) {
    const rawValue = String(match[1] || '').trim();
    if (!rawValue) {
      continue;
    }

    const resolvedPath = normalizeResolvedImportAssetPath(rawValue, meshPath);
    if (!resolvedPath) {
      continue;
    }

    materialLibraryPaths.add(resolvedPath);
  }

  return [...materialLibraryPaths];
}

function collectReferencedMjcfTextMeshPaths(
  robotFiles: readonly RobotFile[],
  preResolvePreferredImport: boolean,
): Set<string> {
  if (!preResolvePreferredImport) {
    return new Set<string>();
  }

  const preferredFile = pickFastPreparedPreferredFile([...robotFiles], [...robotFiles]);
  if (!preferredFile || preferredFile.format !== 'mjcf') {
    return new Set<string>();
  }

  const referencedTextMeshPaths = new Set<string>();
  const addFallbackReferences = () => {
    extractStandaloneImportAssetReferences(preferredFile, {
      sourcePath: preferredFile.name,
    }).forEach((assetPath) => {
      const resolvedPath = normalizeResolvedImportAssetPath(assetPath, preferredFile.name);
      if (resolvedPath && shouldMirrorTextMeshAssetContent(resolvedPath.toLowerCase())) {
        referencedTextMeshPaths.add(resolvedPath);
      }
    });
  };

  try {
    const importResult = resolveRobotFileData(preferredFile, {
      availableFiles: [...robotFiles],
    });

    if (importResult.status === 'ready') {
      collectRobotAssetPaths(importResult.robotData).forEach((assetPath) => {
        const normalizedPath = normalizeImportPath(assetPath);
        if (normalizedPath && shouldMirrorTextMeshAssetContent(normalizedPath.toLowerCase())) {
          referencedTextMeshPaths.add(normalizedPath);
        }
      });
    }
  } catch {
    // Fall back to source-level asset reference extraction if early MJCF parse fails.
  }

  if (referencedTextMeshPaths.size === 0) {
    addFallbackReferences();
  }

  return referencedTextMeshPaths;
}

function collectReferencedMjcfObjMaterialPaths(
  textFiles: readonly PreparedImportTextFile[],
): Set<string> {
  const materialPaths = new Set<string>();

  textFiles.forEach((file) => {
    if (!file.path.toLowerCase().endsWith('.obj')) {
      return;
    }

    parseObjMaterialLibraryPaths(file.path, file.content).forEach((materialPath) => {
      if (materialPath.toLowerCase().endsWith('.mtl')) {
        materialPaths.add(materialPath);
      }
    });
  });

  return materialPaths;
}

function clampImportProgressPercent(value: number | null): number | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function createImportProgressEmitter(
  onProgress?: (progress: PrepareImportProgress) => void,
): (progress: PrepareImportProgress) => void {
  let lastSignature: string | null = null;

  return (progress) => {
    if (!onProgress) {
      return;
    }

    const nextProgress: PrepareImportProgress = {
      ...progress,
      progressPercent: clampImportProgressPercent(progress.progressPercent),
      processedEntries: Math.max(0, Math.round(progress.processedEntries)),
      totalEntries: Math.max(0, Math.round(progress.totalEntries)),
      processedBytes: Math.max(0, Math.round(progress.processedBytes)),
      totalBytes: Math.max(0, Math.round(progress.totalBytes)),
    };
    const signature = JSON.stringify(nextProgress);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    onProgress(nextProgress);
  };
}

function addResolvedDeferredAssetName(
  assetPath: string,
  deferredAssetLookup: Record<string, string>,
  target: Set<string>,
): void {
  const resolvedAssetName = resolveMeshAssetUrl(assetPath, deferredAssetLookup);
  if (resolvedAssetName) {
    target.add(resolvedAssetName);
  }
}

function collectGeometryAssetPaths(
  target: Set<string>,
  geometry?: UrdfLink['visual'] | UrdfLink['collision'] | null,
): void {
  if (!geometry) {
    return;
  }

  if (geometry.type === GeometryType.MESH && geometry.meshPath) {
    target.add(geometry.meshPath);
  }

  if (geometry.mjcfMesh?.file) {
    target.add(geometry.mjcfMesh.file);
  }

  if (geometry.mjcfHfield?.file) {
    target.add(geometry.mjcfHfield.file);
  }

  (geometry.authoredMaterials ?? []).forEach((material) => {
    if (material.texture) {
      target.add(material.texture);
    }
  });
}

function collectRobotAssetPaths(robotData: RobotData): Set<string> {
  const assetPaths = new Set<string>();

  Object.values(robotData.links).forEach((link) => {
    collectGeometryAssetPaths(assetPaths, link.visual);
    collectGeometryAssetPaths(assetPaths, link.collision);
    (link.visualBodies ?? []).forEach((body) => collectGeometryAssetPaths(assetPaths, body));
    (link.collisionBodies ?? []).forEach((body) => collectGeometryAssetPaths(assetPaths, body));
  });

  Object.values(robotData.materials ?? {}).forEach((material) => {
    if (material.texture) {
      assetPaths.add(material.texture);
    }
  });

  return assetPaths;
}

function collectSourceDerivedDeferredAssetNames(
  preferredFile: RobotFile | null,
  availableRobotFiles: readonly RobotFile[],
  allFileContents: Record<string, string>,
  deferredAssetLookup: Record<string, string>,
  target: Set<string>,
): void {
  if (!preferredFile) {
    return;
  }

  if (preferredFile.format === 'mjcf') {
    const resolvedSource = resolveMJCFSource(preferredFile, [...availableRobotFiles]);
    if (resolvedSource.issues.length > 0) {
      return;
    }

    validateMJCFImportExternalAssets(
      resolvedSource.sourceFile.name,
      resolvedSource.content,
      [...availableRobotFiles],
      {},
    ).forEach((issue) => {
      addResolvedDeferredAssetName(issue.resolvedPath, deferredAssetLookup, target);
    });

    return;
  }

  extractStandaloneImportAssetReferences(preferredFile, {
    allFileContents,
    sourcePath: preferredFile.name,
  }).forEach((assetPath) => {
    addResolvedDeferredAssetName(assetPath, deferredAssetLookup, target);
  });
}

function inferPreferredFileAssetRoot(file: RobotFile | null): string | null {
  if (!file) {
    return null;
  }

  const normalizedName = normalizeImportPath(file.name);
  if (!normalizedName) {
    return null;
  }

  const pathParts = normalizedName.split('/').filter(Boolean);
  if (pathParts.length <= 1) {
    return pathParts[0] ?? null;
  }

  const assetRootMarkerIndex = pathParts.findIndex((segment) => {
    const lowerSegment = segment.toLowerCase();
    return lowerSegment === 'urdf' || lowerSegment === 'xacro' || lowerSegment === 'mjcf';
  });

  if (assetRootMarkerIndex > 0) {
    return pathParts.slice(0, assetRootMarkerIndex).join('/');
  }

  return pathParts.slice(0, -1).join('/');
}

function determineCriticalDeferredAssetNames(
  preferredFile: RobotFile | null,
  preferredImportResult: RobotImportResult | null,
  deferredAssetFiles: readonly PreparedDeferredImportAssetFile[],
  availableRobotFiles: readonly RobotFile[],
  allFileContents: Record<string, string>,
): Set<string> {
  if (deferredAssetFiles.length === 0) {
    return new Set<string>();
  }

  const assetLookup = Object.fromEntries(deferredAssetFiles.map((file) => [file.name, file.name]));
  const criticalAssetNames = new Set<string>();

  if (preferredFile?.format === 'mesh') {
    addResolvedDeferredAssetName(preferredFile.name, assetLookup, criticalAssetNames);
  }

  if (preferredImportResult?.status === 'ready') {
    collectRobotAssetPaths(preferredImportResult.robotData).forEach((assetPath) => {
      addResolvedDeferredAssetName(assetPath, assetLookup, criticalAssetNames);
    });
  }

  collectSourceDerivedDeferredAssetNames(
    preferredFile,
    availableRobotFiles,
    allFileContents,
    assetLookup,
    criticalAssetNames,
  );

  if (criticalAssetNames.size > 0) {
    return criticalAssetNames;
  }

  const preferredFileAssetRoot = inferPreferredFileAssetRoot(preferredFile);
  if (!preferredFileAssetRoot) {
    return criticalAssetNames;
  }

  deferredAssetFiles.forEach((file) => {
    if (
      file.name === preferredFileAssetRoot ||
      file.name.startsWith(`${preferredFileAssetRoot}/`)
    ) {
      criticalAssetNames.add(file.name);
    }
  });

  return criticalAssetNames;
}

function resolveImportPreparationConcurrency(): number {
  if (typeof navigator === 'undefined') {
    return 4;
  }

  const hardwareConcurrency = Number(navigator.hardwareConcurrency || 4);
  return Math.max(2, Math.min(8, Math.ceil(hardwareConcurrency / 2)));
}

async function processWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) {
          return;
        }
        await task(items[currentIndex], currentIndex);
      }
    }),
  );
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

function pickFastPreparedPreferredFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
): RobotFile | null {
  const visibleFiles = files.filter(isVisibleLibraryEntry);
  const robotDefinitionFiles = visibleFiles.filter(
    (file) => !isAssetLibraryOnlyFormat(file.format),
  );
  if (robotDefinitionFiles.length === 0) {
    return visibleFiles.find((file) => file.format === 'mesh') ?? null;
  }

  const urdfFiles = robotDefinitionFiles.filter((file) => file.format === 'urdf');
  const mjcfFiles = robotDefinitionFiles.filter((file) => file.format === 'mjcf');

  if (urdfFiles.length > 0 && mjcfFiles.length > 0) {
    return pickPreferredImportFile(robotDefinitionFiles, filePool);
  }

  if (urdfFiles.length > 0) {
    return (
      [...urdfFiles].sort((left, right) => {
        const leftSelfContained = isUrdfSelfContainedInImportBundle(left, filePool);
        const rightSelfContained = isUrdfSelfContainedInImportBundle(right, filePool);
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

  return robotDefinitionFiles[0] ?? visibleFiles[0] ?? null;
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
    ...payload.deferredAssetFiles.map((file) => file.name),
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
    deferredAssetFiles: payload.deferredAssetFiles.map((file) => ({
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
  const visibleRobotFiles = renamedPayload.robotFiles.filter(isVisibleLibraryEntry);
  const standaloneRootXacro =
    shouldPreResolvePreferredImport &&
    visibleRobotFiles.length > 0 &&
    visibleRobotFiles.every(
      (file) => file.format === 'xacro' || isAssetLibraryOnlyFormat(file.format),
    )
      ? (visibleRobotFiles.find(
          (file) => file.format === 'xacro' && isStandaloneXacroEntry(file),
        ) ?? null)
      : null;
  const preferredFile = shouldPreResolvePreferredImport
    ? (standaloneRootXacro ?? pickPreferredImportFile(visibleRobotFiles, renamedPayload.robotFiles))
    : pickFastPreparedPreferredFile(visibleRobotFiles, renamedPayload.robotFiles);
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

async function collectImportPayloadFromArchiveSession(
  archiveSession: ArchiveImportSession,
  options: {
    preResolvePreferredImport?: boolean;
  } = {},
  onProgress?: (progress: PrepareImportProgress) => void,
): Promise<CollectedImportPayload> {
  const payload = createEmptyCollectedImportPayload();
  const emitProgress = createImportProgressEmitter(onProgress);
  emitProgress({
    phase: 'reading-archive',
    progressPercent: 0,
    processedEntries: 0,
    totalEntries: 0,
    processedBytes: 0,
    totalBytes: 0,
  });

  const processableEntries = archiveSession.entries.filter(
    (entry) => !shouldSkipImportPath(entry.path),
  );
  const auxiliaryTextEntries: ArchiveImportEntry[] = [];
  const mirroredTextMeshAssetEntries: ArchiveImportEntry[] = [];
  const usdEntries: ArchiveImportEntry[] = [];
  const definitionEntries: ArchiveImportEntry[] = [];
  const libraryEntries: ArchiveImportEntry[] = [];

  const totalEntries = processableEntries.length;
  const totalBytes = processableEntries.reduce((sum, current) => sum + current.size, 0);
  let processedEntries = 0;
  let processedBytes = 0;
  const reportExtractionProgress = () => {
    emitProgress({
      phase: 'extracting-files',
      progressPercent: totalEntries > 0 ? (processedEntries / totalEntries) * 100 : 100,
      processedEntries,
      totalEntries,
      processedBytes,
      totalBytes,
    });
  };

  reportExtractionProgress();

  processableEntries.forEach((entry) => {
    const { path, size } = entry;
    const lowerPath = path.toLowerCase();

    if (isUsdFamilyPath(path)) {
      usdEntries.push(entry);
    } else if (isImportableDefinitionPath(lowerPath)) {
      definitionEntries.push(entry);
    } else if (isMotorLibraryDataFilePath(path)) {
      libraryEntries.push(entry);
    } else if (isAuxiliaryTextImportPath(lowerPath)) {
      auxiliaryTextEntries.push(entry);
    } else if (isAssetFile(path)) {
      payload.deferredAssetFiles.push({ name: path, sourcePath: path });
      if (shouldMirrorTextMeshAssetContent(lowerPath) && size <= MAX_EAGER_TEXT_MESH_ASSET_BYTES) {
        mirroredTextMeshAssetEntries.push(entry);
      }
      const visibleAssetFile = createVisibleImportedAssetFile(path);
      if (visibleAssetFile) {
        payload.robotFiles.push(visibleAssetFile);
      }
    }
    processedEntries += 1;
    processedBytes += size;
    reportExtractionProgress();
  });

  const concurrency = resolveImportPreparationConcurrency();

  const extractedUsdEntries = await archiveSession.extractEntries(
    usdEntries.map((entry) => entry.path),
  );
  await processWithConcurrency(extractedUsdEntries, concurrency, async ({ path, file }) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    payload.robotFiles.push(createImportedUsdFile(path, bytes));
    payload.usdSourceFiles.push({ name: path, blob: new Blob([bytes]) });
  });

  const extractedDefinitionEntries = await archiveSession.extractEntries(
    definitionEntries.map((entry) => entry.path),
  );
  await processWithConcurrency(extractedDefinitionEntries, concurrency, async ({ path, file }) => {
    const content = await file.text();
    const format = detectImportFormat(content, path);
    if (format) {
      payload.robotFiles.push({ name: path, content, format });
    }
  });

  const extractedLibraryEntries = await archiveSession.extractEntries(
    libraryEntries.map((entry) => entry.path),
  );
  await processWithConcurrency(extractedLibraryEntries, concurrency, async ({ path, file }) => {
    const content = await file.text();
    payload.libraryFiles.push({ path, content });
  });

  const referencedMjcfTextMeshPaths = collectReferencedMjcfTextMeshPaths(
    payload.robotFiles,
    options.preResolvePreferredImport !== false,
  );

  if (shouldLoadAuxiliaryImportText(payload.robotFiles) && auxiliaryTextEntries.length > 0) {
    const extractedAuxiliaryTextEntries = await archiveSession.extractEntries(
      auxiliaryTextEntries.map((entry) => entry.path),
    );
    await processWithConcurrency(
      extractedAuxiliaryTextEntries,
      concurrency,
      async ({ path, file }) => {
        const content = await file.text();
        payload.textFiles.push({ path, content });
      },
    );
  }

  if (referencedMjcfTextMeshPaths.size > 0 && mirroredTextMeshAssetEntries.length > 0) {
    const targetedMirroredTextMeshEntries = mirroredTextMeshAssetEntries.filter((entry) =>
      referencedMjcfTextMeshPaths.has(normalizeImportPath(entry.path)),
    );

    if (targetedMirroredTextMeshEntries.length > 0) {
      const extractedMirroredTextMeshEntries = await archiveSession.extractEntries(
        targetedMirroredTextMeshEntries.map((entry) => entry.path),
      );
      const importedMjcfMeshTextFiles: PreparedImportTextFile[] = [];

      await processWithConcurrency(
        extractedMirroredTextMeshEntries,
        concurrency,
        async ({ path, file }) => {
          importedMjcfMeshTextFiles.push({ path, content: await file.text() });
        },
      );

      payload.textFiles.push(...importedMjcfMeshTextFiles);

      const referencedMjcfMaterialPaths =
        collectReferencedMjcfObjMaterialPaths(importedMjcfMeshTextFiles);
      if (referencedMjcfMaterialPaths.size > 0 && auxiliaryTextEntries.length > 0) {
        const targetedAuxiliaryTextEntries = auxiliaryTextEntries.filter((entry) =>
          referencedMjcfMaterialPaths.has(normalizeImportPath(entry.path)),
        );

        if (targetedAuxiliaryTextEntries.length > 0) {
          const extractedAuxiliaryTextEntries = await archiveSession.extractEntries(
            targetedAuxiliaryTextEntries.map((entry) => entry.path),
          );
          await processWithConcurrency(
            extractedAuxiliaryTextEntries,
            concurrency,
            async ({ path, file }) => {
              payload.textFiles.push({ path, content: await file.text() });
            },
          );
        }
      }
    }
  }

  emitProgress({
    phase: 'finalizing-import',
    progressPercent: 100,
    processedEntries: totalEntries,
    totalEntries,
    processedBytes: totalBytes,
    totalBytes,
  });

  return payload;
}

async function hydrateDeferredImportAssetsFromArchiveSession(
  archiveSession: ArchiveImportSession,
  assetFiles: readonly PreparedDeferredImportAssetFile[],
  onProgress?: (progress: PrepareImportProgress) => void,
): Promise<PreparedImportBlobFile[]> {
  const emitProgress = createImportProgressEmitter(onProgress);
  emitProgress({
    phase: 'reading-archive',
    progressPercent: 0,
    processedEntries: 0,
    totalEntries: assetFiles.length,
    processedBytes: 0,
    totalBytes: 0,
  });

  const totalEntries = assetFiles.length;
  if (assetFiles.length === 0) {
    emitProgress({
      phase: 'finalizing-import',
      progressPercent: 100,
      processedEntries: 0,
      totalEntries: 0,
      processedBytes: 0,
      totalBytes: 0,
    });
    return [];
  }

  const assetFileLookup = new Map(assetFiles.map((file) => [file.sourcePath, file] as const));
  const extractedAssetFiles = await archiveSession.extractEntries(
    assetFiles.map((file) => file.sourcePath),
    ({ processedEntries, processedBytes, totalBytes }) => {
      emitProgress({
        phase: 'extracting-files',
        progressPercent: totalBytes > 0 ? (processedBytes / totalBytes) * 100 : 100,
        processedEntries,
        totalEntries,
        processedBytes,
        totalBytes,
      });
    },
  );
  const hydratedAssetFiles: PreparedImportBlobFile[] = [];

  await processWithConcurrency(
    extractedAssetFiles,
    resolveImportPreparationConcurrency(),
    async ({ path, file }) => {
      const assetFile = assetFileLookup.get(path);
      if (!assetFile) {
        throw new Error(`Missing deferred asset "${path}" in archive.`);
      }

      hydratedAssetFiles.push({
        name: assetFile.name,
        blob: file,
      });
    },
  );

  emitProgress({
    phase: 'finalizing-import',
    progressPercent: 100,
    processedEntries: extractedAssetFiles.length,
    totalEntries,
    processedBytes: extractedAssetFiles.reduce((sum, current) => sum + current.size, 0),
    totalBytes: extractedAssetFiles.reduce((sum, current) => sum + current.size, 0),
  });

  return hydratedAssetFiles.sort((left, right) => left.name.localeCompare(right.name));
}

export async function hydrateDeferredImportAssets(
  archiveFile: File,
  assetFiles: readonly PreparedDeferredImportAssetFile[],
  onProgress?: (progress: PrepareImportProgress) => void,
): Promise<PreparedImportBlobFile[]> {
  return withArchiveImportSession(archiveFile, async (archiveSession) =>
    hydrateDeferredImportAssetsFromArchiveSession(archiveSession, assetFiles, onProgress),
  );
}

async function collectImportPayloadFromLooseFiles(
  files: readonly ImportPreparationFileInput[],
  options: {
    preResolvePreferredImport?: boolean;
  } = {},
  onProgress?: (progress: PrepareImportProgress) => void,
): Promise<CollectedImportPayload> {
  const payload: CollectedImportPayload = {
    robotFiles: [],
    assetFiles: [],
    deferredAssetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
    textFiles: [],
  };
  const emitProgress = createImportProgressEmitter(onProgress);
  const auxiliaryTextFiles: Array<{ path: string; file: File }> = [];
  const mirroredTextMeshFiles: Array<{ path: string; file: File }> = [];
  const totalEntries = files.length;
  const totalBytes = files.reduce((sum, input) => sum + resolveImportInputFile(input).size, 0);
  let processedEntries = 0;
  let processedBytes = 0;
  const reportExtractionProgress = () => {
    emitProgress({
      phase: 'extracting-files',
      progressPercent: totalEntries > 0 ? (processedEntries / totalEntries) * 100 : 100,
      processedEntries,
      totalEntries,
      processedBytes,
      totalBytes,
    });
  };

  reportExtractionProgress();

  await processWithConcurrency(files, resolveImportPreparationConcurrency(), async (input) => {
    const file = resolveImportInputFile(input);
    const path = resolveImportInputPath(input);
    const lowerPath = path.toLowerCase();

    if (shouldSkipImportPath(path)) {
      processedEntries += 1;
      processedBytes += file.size;
      reportExtractionProgress();
      return;
    }

    if (isUsdFamilyPath(path)) {
      payload.robotFiles.push(await createImportedUsdFileFromLooseFile(path, file));
      payload.usdSourceFiles.push({ name: path, blob: file });
    } else if (isImportableDefinitionPath(lowerPath)) {
      const content = await file.text();
      const format = detectImportFormat(content, file.name);
      if (format) {
        payload.robotFiles.push({ name: path, content, format });
      }
    } else if (isMotorLibraryDataFilePath(path)) {
      const content = await file.text();
      payload.libraryFiles.push({ path, content });
    } else if (isAuxiliaryTextImportPath(lowerPath)) {
      auxiliaryTextFiles.push({ path, file });
    } else if (isAssetFile(path)) {
      if (
        shouldMirrorTextMeshAssetContent(lowerPath) &&
        file.size <= MAX_EAGER_TEXT_MESH_ASSET_BYTES
      ) {
        mirroredTextMeshFiles.push({ path, file });
      }
      payload.assetFiles.push({ name: path, blob: file });
      const visibleAssetFile = createVisibleImportedAssetFile(path);
      if (visibleAssetFile) {
        payload.robotFiles.push(visibleAssetFile);
      }
    }

    processedEntries += 1;
    processedBytes += file.size;
    reportExtractionProgress();
  });

  if (shouldLoadAuxiliaryImportText(payload.robotFiles) && auxiliaryTextFiles.length > 0) {
    await processWithConcurrency(
      auxiliaryTextFiles,
      resolveImportPreparationConcurrency(),
      async ({ path, file }) => {
        payload.textFiles.push({ path, content: await file.text() });
      },
    );
  }

  const referencedMjcfTextMeshPaths = collectReferencedMjcfTextMeshPaths(
    payload.robotFiles,
    options.preResolvePreferredImport !== false,
  );

  if (referencedMjcfTextMeshPaths.size > 0 && mirroredTextMeshFiles.length > 0) {
    const targetedMirroredTextMeshFiles = mirroredTextMeshFiles.filter(({ path }) =>
      referencedMjcfTextMeshPaths.has(normalizeImportPath(path)),
    );

    if (targetedMirroredTextMeshFiles.length > 0) {
      const importedMjcfMeshTextFiles: PreparedImportTextFile[] = [];

      await processWithConcurrency(
        targetedMirroredTextMeshFiles,
        resolveImportPreparationConcurrency(),
        async ({ path, file }) => {
          importedMjcfMeshTextFiles.push({ path, content: await file.text() });
        },
      );

      payload.textFiles.push(...importedMjcfMeshTextFiles);

      const referencedMjcfMaterialPaths =
        collectReferencedMjcfObjMaterialPaths(importedMjcfMeshTextFiles);
      if (referencedMjcfMaterialPaths.size > 0 && auxiliaryTextFiles.length > 0) {
        const targetedAuxiliaryTextFiles = auxiliaryTextFiles.filter(({ path }) =>
          referencedMjcfMaterialPaths.has(normalizeImportPath(path)),
        );

        if (targetedAuxiliaryTextFiles.length > 0) {
          await processWithConcurrency(
            targetedAuxiliaryTextFiles,
            resolveImportPreparationConcurrency(),
            async ({ path, file }) => {
              payload.textFiles.push({ path, content: await file.text() });
            },
          );
        }
      }
    }
  }

  emitProgress({
    phase: 'finalizing-import',
    progressPercent: 100,
    processedEntries: totalEntries,
    totalEntries,
    processedBytes: totalBytes,
    totalBytes,
  });

  return payload;
}

function sortCollectedImportPayload(payload: CollectedImportPayload): CollectedImportPayload {
  return {
    robotFiles: [...payload.robotFiles].sort((left, right) => left.name.localeCompare(right.name)),
    assetFiles: [...payload.assetFiles].sort((left, right) => left.name.localeCompare(right.name)),
    deferredAssetFiles: [...payload.deferredAssetFiles].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    usdSourceFiles: [...payload.usdSourceFiles].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    libraryFiles: [...payload.libraryFiles].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    textFiles: [...payload.textFiles].sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function mapImportProgressToPercentRange(
  progress: PrepareImportProgress,
  rangeStart: number,
  rangeEnd: number,
): PrepareImportProgress {
  if (progress.progressPercent == null) {
    return progress;
  }

  const clampedPercent = clampImportProgressPercent(progress.progressPercent) ?? 0;
  const progressRatio = clampedPercent / 100;

  return {
    ...progress,
    progressPercent: rangeStart + progressRatio * (rangeEnd - rangeStart),
  };
}

export async function prepareImportPayload({
  files,
  existingPaths,
  preResolvePreferredImport = true,
  onProgress,
}: PrepareImportPayloadArgs): Promise<PreparedImportPayload> {
  const firstFile = files[0] ? resolveImportInputFile(files[0]) : null;
  const isSingleArchiveImport =
    files.length === 1 && firstFile ? isSupportedArchiveImportFile(firstFile.name) : false;
  if (isSingleArchiveImport) {
    return withArchiveImportSession(firstFile, async (archiveSession) => {
      const collectedPayload = await collectImportPayloadFromArchiveSession(
        archiveSession,
        {
          preResolvePreferredImport,
        },
        onProgress
          ? (progress) => onProgress(mapImportProgressToPercentRange(progress, 0, 72))
          : undefined,
      );
      const sortedCollectedPayload = sortCollectedImportPayload(collectedPayload);

      if (
        sortedCollectedPayload.robotFiles.length === 0 &&
        sortedCollectedPayload.libraryFiles.length === 0
      ) {
        return createEmptyPreparedImportPayload();
      }

      const preparedPayload = renameCollectedImportPayload(
        normalizeLooseImportBundleRoot(sortedCollectedPayload),
        existingPaths,
        {
          preResolvePreferredImport,
        },
      );

      if (preparedPayload.deferredAssetFiles.length === 0) {
        return preparedPayload;
      }

      const preferredFile = preparedPayload.preferredFileName
        ? (preparedPayload.robotFiles.find(
            (file) => file.name === preparedPayload.preferredFileName,
          ) ?? null)
        : null;
      const preparedTextFileContents = Object.fromEntries(
        preparedPayload.textFiles.map((file) => [file.path, file.content]),
      );
      const preResolvedPreferredImport =
        preferredFile == null
          ? null
          : (preparedPayload.preResolvedImports.find(
              (entry) => entry.fileName === preferredFile.name,
            ) ?? null);
      const preferredImportResult =
        preResolvedPreferredImport?.result ??
        (preferredFile && preferredFile.format !== 'usd'
          ? resolveRobotFileData(preferredFile, {
              availableFiles: preparedPayload.robotFiles,
              allFileContents: preparedTextFileContents,
            })
          : null);
      const criticalDeferredAssetNames = determineCriticalDeferredAssetNames(
        preferredFile,
        preferredImportResult,
        preparedPayload.deferredAssetFiles,
        preparedPayload.robotFiles,
        preparedTextFileContents,
      );

      if (criticalDeferredAssetNames.size === 0) {
        return preparedPayload;
      }

      const immediateDeferredAssetFiles = preparedPayload.deferredAssetFiles.filter((file) =>
        criticalDeferredAssetNames.has(file.name),
      );
      const remainingDeferredAssetFiles = preparedPayload.deferredAssetFiles.filter(
        (file) => !criticalDeferredAssetNames.has(file.name),
      );
      const criticalAssetFiles = await hydrateDeferredImportAssetsFromArchiveSession(
        archiveSession,
        immediateDeferredAssetFiles,
        onProgress
          ? (progress) => onProgress(mapImportProgressToPercentRange(progress, 72, 92))
          : undefined,
      );

      return {
        ...preparedPayload,
        assetFiles: [...preparedPayload.assetFiles, ...criticalAssetFiles],
        deferredAssetFiles: remainingDeferredAssetFiles,
      };
    });
  }

  const collectedPayload = await collectImportPayloadFromLooseFiles(
    files,
    {
      preResolvePreferredImport,
    },
    onProgress,
  );
  const sortedCollectedPayload = sortCollectedImportPayload(collectedPayload);

  if (
    sortedCollectedPayload.robotFiles.length === 0 &&
    sortedCollectedPayload.libraryFiles.length === 0
  ) {
    return createEmptyPreparedImportPayload();
  }

  return renameCollectedImportPayload(
    normalizeLooseImportBundleRoot(sortedCollectedPayload),
    existingPaths,
    {
      preResolvePreferredImport,
    },
  );
}
