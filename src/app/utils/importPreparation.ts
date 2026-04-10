import {
  resolveRobotFileData,
  isStandaloneXacroEntry,
  type RobotImportResult,
} from '@/core/parsers/importRobotFile';
import { resolveImportedAssetPath, resolveMeshAssetUrl } from '@/core/parsers/meshPathUtils';
import { validateMJCFImportExternalAssets } from '@/core/parsers/mjcf/mjcfImportValidation';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { isAssetFile } from '@/features/file-io/utils/formatDetection';
import {
  createImportPathCollisionMap,
  remapImportedPath,
} from '@/features/file-io/utils/libraryImportPathCollisions';
import { isMotorLibraryDataFilePath } from '@/shared/data/motorLibrary';
import { isAssetLibraryOnlyFormat, isVisibleLibraryEntry } from '@/shared/utils/robotFileSupport';
import { pickPreferredImportFile } from '@/app/hooks/importPreferredFile';
import { extractStandaloneImportAssetReferences } from './importPackageAssetReferences.ts';
import { buildPreResolvedImportContentSignature } from './preResolvedImportSignature.ts';
import {
  peekPreResolvedRobotImport,
  primePreResolvedRobotImports,
} from './preResolvedRobotImportCache.ts';
import { normalizeLooseImportBundleRoot } from './import-preparation/bundleRootNormalization.ts';
import {
  processWithConcurrency,
  resolveImportPreparationConcurrency,
} from './import-preparation/concurrency.ts';
import { scheduleFailFastInDev } from '@/core/utils/runtimeDiagnostics';
import { detectImportFormat } from './import-preparation/formatDetection.ts';
import {
  createImportedUsdFile,
  createImportedUsdFileFromLooseFile,
  isUsdFamilyPath,
} from './import-preparation/usdFiles.ts';
import { pickFastPreparedPreferredFile } from './import-preparation/fastPreferredFile.ts';
import {
  createImportProgressEmitter,
  mapImportProgressToPercentRange,
} from './import-preparation/progress.ts';
import {
  determineCriticalDeferredAssetNames,
  collectRobotAssetPaths,
} from './import-preparation/criticalDeferredAssets.ts';
import {
  createVisibleImportedAssetFile,
  isAuxiliaryTextImportPath,
  isImportableDefinitionPath,
  shouldLoadAuxiliaryImportText,
  shouldMirrorTextMeshAssetContent,
} from './import-preparation/pathClassification.ts';
import {
  isSupportedArchiveImportFile,
  withArchiveImportSession,
  type ArchiveImportEntry,
  type ArchiveImportSession,
} from './archiveImport.ts';
import { GeometryType, type RobotData, type RobotFile, type UrdfLink } from '@/types';

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

const MAX_EAGER_TEXT_MESH_ASSET_BYTES = 8 * 1024 * 1024;

export { detectImportFormat };

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

function collectReferencedTextMeshPathsForPreferredImport(
  robotFiles: readonly RobotFile[],
  preResolvePreferredImport: boolean,
): Set<string> {
  const preferredFile = pickFastPreparedPreferredFile([...robotFiles], [...robotFiles]);
  if (!preferredFile) {
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

  if (preferredFile.format === 'sdf') {
    addFallbackReferences();
    return referencedTextMeshPaths;
  }

  if (preferredFile.format !== 'mjcf') {
    return referencedTextMeshPaths;
  }

  if (!preResolvePreferredImport) {
    addFallbackReferences();
    return referencedTextMeshPaths;
  }

  try {
    const importResult =
      peekPreResolvedRobotImport(preferredFile) ??
      resolveRobotFileData(preferredFile, {
        availableFiles: [...robotFiles],
      });

    if (importResult.status === 'ready') {
      primePreResolvedRobotImports([
        {
          fileName: preferredFile.name,
          format: preferredFile.format,
          contentSignature: buildPreResolvedImportContentSignature(preferredFile.content),
          result: importResult,
        },
      ]);

      collectRobotAssetPaths(importResult.robotData).forEach((assetPath) => {
        const normalizedPath = normalizeImportPath(assetPath);
        if (normalizedPath && shouldMirrorTextMeshAssetContent(normalizedPath.toLowerCase())) {
          referencedTextMeshPaths.add(normalizedPath);
        }
      });
    }
  } catch (error) {
    scheduleFailFastInDev(
      'importPreparation:collectReferencedTextMeshPathsForPreferredImport',
      new Error(
        `Failed to pre-parse MJCF import "${preferredFile.name}" while collecting text-mesh dependencies.`,
        { cause: error },
      ),
      'warn',
    );
  }

  if (referencedTextMeshPaths.size === 0) {
    addFallbackReferences();
  }

  return referencedTextMeshPaths;
}

function collectReferencedObjMaterialPaths(
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

function appendPreparedImportTextFileIfMissing(
  target: PreparedImportTextFile[],
  nextFile: PreparedImportTextFile,
): void {
  const normalizedNextPath = normalizeImportPath(nextFile.path);
  if (target.some((file) => normalizeImportPath(file.path) === normalizedNextPath)) {
    return;
  }

  target.push(nextFile);
}

function appendPreparedImportTextFilesIfMissing(
  target: PreparedImportTextFile[],
  nextFiles: readonly PreparedImportTextFile[],
): void {
  nextFiles.forEach((file) => appendPreparedImportTextFileIfMissing(target, file));
}

function appendPreparedImportBlobFileIfMissing(
  target: PreparedImportBlobFile[],
  nextFile: PreparedImportBlobFile,
): void {
  const normalizedNextPath = normalizeImportPath(nextFile.name);
  if (target.some((file) => normalizeImportPath(file.name) === normalizedNextPath)) {
    return;
  }

  target.push(nextFile);
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
  const cachedPreferredImportResult =
    shouldPreResolvePreferredImport && preferredFile
      ? peekPreResolvedRobotImport(preferredFile)
      : null;
  const preferredImportResult =
    cachedPreferredImportResult ??
    (shouldPreResolvePreferredImport && preferredFile
      ? preferredFile.format === 'xacro' || preferredFile.format === 'sdf'
        ? resolveRobotFileData(preferredFile, {
            availableFiles: renamedPayload.robotFiles,
            allFileContents: importTextFileContents,
          })
        : resolveRobotFileData(preferredFile, {
            availableFiles: renamedPayload.robotFiles,
          })
      : null);

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

  const referencedTextMeshPaths = collectReferencedTextMeshPathsForPreferredImport(
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
        appendPreparedImportTextFileIfMissing(payload.textFiles, { path, content });
      },
    );
  }

  if (referencedTextMeshPaths.size > 0 && mirroredTextMeshAssetEntries.length > 0) {
    const targetedMirroredTextMeshEntries = mirroredTextMeshAssetEntries.filter((entry) =>
      referencedTextMeshPaths.has(normalizeImportPath(entry.path)),
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

      appendPreparedImportTextFilesIfMissing(payload.textFiles, importedMjcfMeshTextFiles);

      const referencedObjMaterialPaths =
        collectReferencedObjMaterialPaths(importedMjcfMeshTextFiles);
      if (referencedObjMaterialPaths.size > 0 && auxiliaryTextEntries.length > 0) {
        const targetedAuxiliaryTextEntries = auxiliaryTextEntries.filter((entry) =>
          referencedObjMaterialPaths.has(normalizeImportPath(entry.path)),
        );

        if (targetedAuxiliaryTextEntries.length > 0) {
          const extractedAuxiliaryTextEntries = await archiveSession.extractEntries(
            targetedAuxiliaryTextEntries.map((entry) => entry.path),
          );
          await processWithConcurrency(
            extractedAuxiliaryTextEntries,
            concurrency,
            async ({ path, file }) => {
              appendPreparedImportTextFileIfMissing(payload.textFiles, {
                path,
                content: await file.text(),
              });
              appendPreparedImportBlobFileIfMissing(payload.assetFiles, {
                name: path,
                blob: file,
              });
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
        appendPreparedImportTextFileIfMissing(payload.textFiles, {
          path,
          content: await file.text(),
        });
      },
    );
  }

  const referencedTextMeshPaths = collectReferencedTextMeshPathsForPreferredImport(
    payload.robotFiles,
    options.preResolvePreferredImport !== false,
  );

  if (referencedTextMeshPaths.size > 0 && mirroredTextMeshFiles.length > 0) {
    const targetedMirroredTextMeshFiles = mirroredTextMeshFiles.filter(({ path }) =>
      referencedTextMeshPaths.has(normalizeImportPath(path)),
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

      appendPreparedImportTextFilesIfMissing(payload.textFiles, importedMjcfMeshTextFiles);

      const referencedObjMaterialPaths =
        collectReferencedObjMaterialPaths(importedMjcfMeshTextFiles);
      if (referencedObjMaterialPaths.size > 0 && auxiliaryTextFiles.length > 0) {
        const targetedAuxiliaryTextFiles = auxiliaryTextFiles.filter(({ path }) =>
          referencedObjMaterialPaths.has(normalizeImportPath(path)),
        );

        if (targetedAuxiliaryTextFiles.length > 0) {
          await processWithConcurrency(
            targetedAuxiliaryTextFiles,
            resolveImportPreparationConcurrency(),
            async ({ path, file }) => {
              appendPreparedImportTextFileIfMissing(payload.textFiles, {
                path,
                content: await file.text(),
              });
              appendPreparedImportBlobFileIfMissing(payload.assetFiles, {
                name: path,
                blob: file,
              });
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
