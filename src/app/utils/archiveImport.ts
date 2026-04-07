import { isSupportedArchiveImportFile } from '@/shared/utils/robotFileSupport';

export interface ArchiveImportEntry {
  path: string;
  name: string;
  size: number;
  lastModified: number;
}

export interface ArchiveExtractionSnapshot {
  processedEntries: number;
  totalEntries: number;
  processedBytes: number;
  totalBytes: number;
}

export interface ArchiveImportSession {
  entries: ArchiveImportEntry[];
  extractEntries: (
    requestedPaths: readonly string[],
    onProgress?: (snapshot: ArchiveExtractionSnapshot) => void,
  ) => Promise<Array<{ path: string; file: File; size: number }>>;
}

interface ArchiveReaderEntryLike {
  name?: string;
  size?: number;
  lastModified?: number;
}

interface ArchiveFilesArrayEntryLike {
  file?: ArchiveReaderEntryLike | null;
  path?: string;
}

interface ArchiveReaderLike {
  getFilesArray(): Promise<ArchiveFilesArrayEntryLike[]>;
  extractSingleFile(path: string): Promise<File>;
  extractFiles(onEntryExtracted?: (entry: { file: File; path: string }) => void): Promise<unknown>;
  close(): Promise<void>;
}

interface ArchiveModuleLike {
  Archive: {
    init(options?: { getWorker?: () => Worker } | null): unknown;
    open(file: File): Promise<ArchiveReaderLike>;
  };
}

let archiveModulePromise: Promise<ArchiveModuleLike> | null = null;
let browserArchiveInitPromise: Promise<void> | null = null;
const NODE_ARCHIVE_MODULE_SPECIFIER = 'libarchive.js/dist/libarchive-node.mjs';
const MIN_FULL_ARCHIVE_EXTRACTION_ENTRIES = 8;
const FULL_ARCHIVE_EXTRACTION_ENTRY_RATIO = 0.55;
const FULL_ARCHIVE_EXTRACTION_BYTES_RATIO = 0.6;

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

function normalizeArchiveEntryPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function resolveArchiveEntryPath(entry: ArchiveFilesArrayEntryLike): string | null {
  const fileName = typeof entry.file?.name === 'string' ? entry.file.name : '';
  if (!fileName) {
    return null;
  }

  const normalizedPath = normalizeArchiveEntryPath(`${entry.path || ''}${fileName}`);
  return normalizedPath || null;
}

async function loadArchiveModule(): Promise<ArchiveModuleLike> {
  if (!archiveModulePromise) {
    archiveModulePromise = isNodeRuntime()
      ? import(
          /* @vite-ignore */
          NODE_ARCHIVE_MODULE_SPECIFIER
        )
      : import('libarchive.js');
  }

  const archiveModule = await archiveModulePromise;

  if (!isNodeRuntime()) {
    if (!browserArchiveInitPromise) {
      browserArchiveInitPromise = import('libarchive.js/dist/worker-bundle.js?worker').then(
        (module) => {
          const ArchiveWorker = module.default as new () => Worker;
          archiveModule.Archive.init({
            getWorker: () => new ArchiveWorker(),
          });
        },
      );
    }

    await browserArchiveInitPromise;
  }

  return archiveModule;
}

async function withArchiveReader<T>(
  archiveFile: File,
  action: (reader: ArchiveReaderLike) => Promise<T>,
): Promise<T> {
  const archiveModule = await loadArchiveModule();
  const reader = await archiveModule.Archive.open(archiveFile);

  try {
    return await action(reader);
  } finally {
    await reader.close().catch(() => undefined);
  }
}

async function listArchiveEntriesFromReader(
  reader: ArchiveReaderLike,
): Promise<ArchiveImportEntry[]> {
  const entries = await reader.getFilesArray();

  return entries
    .map((entry) => {
      const path = resolveArchiveEntryPath(entry);
      if (!path) {
        return null;
      }

      return {
        path,
        name: entry.file?.name || path.split('/').pop() || path,
        size: Number(entry.file?.size || 0),
        lastModified: Number(entry.file?.lastModified || 0),
      } satisfies ArchiveImportEntry;
    })
    .filter((entry): entry is ArchiveImportEntry => Boolean(entry));
}

function normalizeRequestedArchivePaths(requestedPaths: readonly string[]): string[] {
  return Array.from(
    new Set(
      requestedPaths
        .map((path) => normalizeArchiveEntryPath(path))
        .filter((path) => path.length > 0),
    ),
  );
}

function canReadExtractedArchiveFile(
  entry: ArchiveFilesArrayEntryLike,
): entry is ArchiveFilesArrayEntryLike & {
  file: File;
} {
  return entry.file instanceof File;
}

function shouldExtractWholeArchive(
  requestedPaths: readonly string[],
  entries: readonly ArchiveImportEntry[],
  entryMap: ReadonlyMap<string, ArchiveImportEntry>,
): boolean {
  if (requestedPaths.length < MIN_FULL_ARCHIVE_EXTRACTION_ENTRIES || entries.length === 0) {
    return false;
  }

  const totalEntries = entries.length;
  const requestedEntryRatio = requestedPaths.length / totalEntries;
  if (requestedEntryRatio >= FULL_ARCHIVE_EXTRACTION_ENTRY_RATIO) {
    return true;
  }

  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes <= 0) {
    return false;
  }

  const requestedBytes = requestedPaths.reduce(
    (sum, path) => sum + (entryMap.get(path)?.size || 0),
    0,
  );
  return requestedBytes / totalBytes >= FULL_ARCHIVE_EXTRACTION_BYTES_RATIO;
}

export async function withArchiveImportSession<T>(
  archiveFile: File,
  action: (session: ArchiveImportSession) => Promise<T>,
): Promise<T> {
  return withArchiveReader(archiveFile, async (reader) => {
    const entries = await listArchiveEntriesFromReader(reader);
    const entryMap = new Map(entries.map((entry) => [entry.path, entry] as const));
    let fullyExtractedEntryMap: Map<string, { path: string; file: File; size: number }> | null =
      null;

    const emitArchiveExtractionProgress = (
      requestedPaths: readonly string[],
      entryMapForProgress: ReadonlyMap<string, { size: number }>,
      onProgress?: (snapshot: ArchiveExtractionSnapshot) => void,
    ): void => {
      if (!onProgress) {
        return;
      }

      const totalBytes = requestedPaths.reduce(
        (sum, path) => sum + (entryMapForProgress.get(path)?.size || 0),
        0,
      );
      let processedEntries = 0;
      let processedBytes = 0;

      onProgress({
        processedEntries,
        totalEntries: requestedPaths.length,
        processedBytes,
        totalBytes,
      });

      requestedPaths.forEach((path) => {
        processedEntries += 1;
        processedBytes += entryMapForProgress.get(path)?.size || 0;
        onProgress({
          processedEntries,
          totalEntries: requestedPaths.length,
          processedBytes,
          totalBytes,
        });
      });
    };

    const ensureFullyExtractedEntries = async (): Promise<
      Map<string, { path: string; file: File; size: number }>
    > => {
      if (fullyExtractedEntryMap) {
        return fullyExtractedEntryMap;
      }

      await reader.extractFiles();
      const extractedEntries = await reader.getFilesArray();
      fullyExtractedEntryMap = new Map(
        extractedEntries.flatMap((entry) => {
          const path = resolveArchiveEntryPath(entry);
          if (!path || !canReadExtractedArchiveFile(entry)) {
            return [];
          }

          return [
            [
              path,
              {
                path,
                file: entry.file,
                size: entryMap.get(path)?.size || entry.file.size,
              },
            ] as const,
          ];
        }),
      );

      return fullyExtractedEntryMap;
    };

    return action({
      entries,
      extractEntries: async (requestedPaths, onProgress) => {
        const normalizedRequestedPaths = normalizeRequestedArchivePaths(requestedPaths);

        if (normalizedRequestedPaths.length === 0) {
          onProgress?.({
            processedEntries: 0,
            totalEntries: 0,
            processedBytes: 0,
            totalBytes: 0,
          });
          return [];
        }

        normalizedRequestedPaths.forEach((path) => {
          if (!entryMap.has(path)) {
            throw new Error(`Missing deferred asset "${path}" in archive.`);
          }
        });

        if (
          fullyExtractedEntryMap ||
          shouldExtractWholeArchive(normalizedRequestedPaths, entries, entryMap)
        ) {
          const extractedEntryMap = await ensureFullyExtractedEntries();
          const extractedFiles = normalizedRequestedPaths.map((path) => {
            const extractedEntry = extractedEntryMap.get(path);
            if (!extractedEntry) {
              throw new Error(`Missing deferred asset "${path}" in archive.`);
            }

            return extractedEntry;
          });

          emitArchiveExtractionProgress(normalizedRequestedPaths, entryMap, onProgress);
          return extractedFiles;
        }

        const totalBytes = normalizedRequestedPaths.reduce(
          (sum, path) => sum + (entryMap.get(path)?.size || 0),
          0,
        );
        let processedEntries = 0;
        let processedBytes = 0;
        onProgress?.({
          processedEntries,
          totalEntries: normalizedRequestedPaths.length,
          processedBytes,
          totalBytes,
        });

        const extractedFiles: Array<{ path: string; file: File; size: number }> = [];

        for (const path of normalizedRequestedPaths) {
          const file = await reader.extractSingleFile(path);
          const size = entryMap.get(path)?.size || file.size;

          extractedFiles.push({ path, file, size });
          processedEntries += 1;
          processedBytes += size;
          onProgress?.({
            processedEntries,
            totalEntries: normalizedRequestedPaths.length,
            processedBytes,
            totalBytes,
          });
        }

        return extractedFiles;
      },
    });
  });
}

export async function listArchiveEntries(archiveFile: File): Promise<ArchiveImportEntry[]> {
  return withArchiveImportSession(archiveFile, async (session) => session.entries);
}

export async function extractArchiveEntries(
  archiveFile: File,
  requestedPaths: readonly string[],
  onProgress?: (snapshot: ArchiveExtractionSnapshot) => void,
): Promise<Array<{ path: string; file: File; size: number }>> {
  return withArchiveImportSession(archiveFile, async (session) =>
    session.extractEntries(requestedPaths, onProgress),
  );
}

export { isSupportedArchiveImportFile };
