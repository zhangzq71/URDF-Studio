import { ensureUsdWasmRuntime } from '@/features/urdf-viewer/utils/usdWasmRuntime';

type BinaryReadyUsdModule = Awaited<ReturnType<typeof ensureUsdWasmRuntime>>['USD'] & {
  FS_readFile?: (path: string, opts?: { encoding?: 'utf8'; flags?: string }) => Uint8Array | string;
  FS_writeFile?: (path: string, data: string | ArrayLike<number> | ArrayBufferView, opts?: { flags?: string }) => void;
};

function isUsdLayerPath(path: string): boolean {
  return /\.usd$/i.test(path);
}

function createFsRoot(label: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  // Use relative virtual filesystem paths so crate export preserves authored
  // relative asset references like "../assets/foo.png" instead of rewriting
  // them to absolute "/tmp/..." paths inside the WASM sandbox.
  return `tmp/${label}-${suffix}`;
}

function ensureVirtualDirectory(module: BinaryReadyUsdModule, absoluteDirectoryPath: string): void {
  const normalized = absoluteDirectoryPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  if (!normalized || normalized === '/') return;

  let parent = '/';
  for (const segment of normalized.split('/').filter(Boolean)) {
    try {
      module.FS_createPath?.(parent, segment, true, true);
    } catch {
      // Directory creation is idempotent in our usage; ignore collisions.
    }
    parent = parent === '/' ? `/${segment}` : `${parent}/${segment}`;
  }
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '/';
}

function joinFsPath(root: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${root}/${normalizedRelative}`;
}

function toBinaryBlob(data: Uint8Array | string): Blob {
  return typeof data === 'string'
    ? new Blob([data], { type: 'application/octet-stream' })
    : new Blob([data], { type: 'application/octet-stream' });
}

export async function convertUsdArchiveFilesToBinary(
  archiveFiles: Map<string, Blob>,
  options: {
    onProgress?: (progress: {
      current: number;
      total: number;
      filePath: string;
    }) => void;
  } = {},
): Promise<Map<string, Blob>> {
  const { onProgress } = options;
  if (typeof document === 'undefined') {
    return archiveFiles;
  }

  const runtime = await ensureUsdWasmRuntime();
  const USD = runtime.USD as BinaryReadyUsdModule;

  if (
    typeof USD.FS_createPath !== 'function'
    || typeof USD.FS_writeFile !== 'function'
    || typeof USD.FS_readFile !== 'function'
    || typeof USD.UsdStage?.Open !== 'function'
  ) {
    throw new Error('USD binary export runtime is unavailable.');
  }

  const sourceRoot = createFsRoot('urdf-studio-usd-src');
  const targetRoot = createFsRoot('urdf-studio-usd-bin');
  const usdLayerPaths = Array.from(archiveFiles.keys()).filter(isUsdLayerPath);
  const totalUsdLayers = usdLayerPaths.length;
  const binaryFiles = new Map<string, Blob>();
  const cleanupFilePaths = new Set<string>();
  const encoder = new TextEncoder();

  try {
    ensureVirtualDirectory(USD, sourceRoot);
    ensureVirtualDirectory(USD, targetRoot);

    for (const [relativePath, blob] of archiveFiles) {
      if (!isUsdLayerPath(relativePath)) {
        binaryFiles.set(relativePath, blob);
        continue;
      }

      const sourceFsPath = joinFsPath(sourceRoot, relativePath);
      ensureVirtualDirectory(USD, dirname(sourceFsPath));
      USD.FS_writeFile(sourceFsPath, encoder.encode(await blob.text()));
      cleanupFilePaths.add(sourceFsPath);
    }

    for (const [index, relativePath] of usdLayerPaths.entries()) {
      onProgress?.({
        current: index + 1,
        total: totalUsdLayers,
        filePath: relativePath,
      });
      const sourceFsPath = joinFsPath(sourceRoot, relativePath);
      const targetFsPath = joinFsPath(targetRoot, relativePath);
      ensureVirtualDirectory(USD, dirname(targetFsPath));

      const stage = USD.UsdStage.Open(sourceFsPath);
      if (!stage) {
        throw new Error(`Failed to open authored USD layer: ${relativePath}`);
      }

      try {
        stage.Export(targetFsPath, false);
      } finally {
        if (typeof (stage as { delete?: () => void }).delete === 'function') {
          (stage as { delete: () => void }).delete();
        }
        USD.flushPendingDeletes?.();
      }

      const binaryData = USD.FS_readFile(targetFsPath);
      if (!(binaryData instanceof Uint8Array) && typeof binaryData !== 'string') {
        throw new Error(`Failed to read binary USD layer: ${relativePath}`);
      }

      binaryFiles.set(relativePath, toBinaryBlob(binaryData));
      cleanupFilePaths.add(targetFsPath);
    }

    return binaryFiles;
  } finally {
    for (const filePath of cleanupFilePaths) {
      try {
        USD.FS_unlink?.(filePath);
      } catch {
        // Best-effort cleanup of temporary virtual filesystem files.
      }
    }
    USD.flushPendingDeletes?.();
  }
}
