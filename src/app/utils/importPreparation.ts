import JSZip from 'jszip';
import { isMJCF } from '@/core/parsers/mjcf';
import { isUSDA } from '@/core/parsers/usd';
import { isXacro } from '@/core/parsers/xacro';
import {
  createImportPathCollisionMap,
  isMeshFile,
  remapImportedPath,
} from '@/features/file-io/utils';
import type { RobotFile } from '@/types';

const USD_BINARY_MAGIC = new Uint8Array([80, 88, 82, 45, 85, 83, 68, 67]); // "PXR-USDC"
const usdTextDecoder = new TextDecoder();

export interface PreparedImportBlobFile {
  name: string;
  blob: Blob;
}

export interface PreparedImportLibraryFile {
  path: string;
  content: string;
}

export interface PreparedImportPayload {
  robotFiles: RobotFile[];
  assetFiles: PreparedImportBlobFile[];
  usdSourceFiles: PreparedImportBlobFile[];
  libraryFiles: PreparedImportLibraryFile[];
}

export interface PrepareImportPayloadArgs {
  files: readonly File[];
  existingPaths: readonly string[];
}

export interface PrepareImportWorkerRequest {
  type: 'prepare-import';
  requestId: number;
  files: File[];
  existingPaths: string[];
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
}

export const detectImportFormat = (
  content: string,
  filename: string,
): 'urdf' | 'mjcf' | 'usd' | 'xacro' | null => {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith('.xacro') || lowerName.endsWith('.urdf.xacro')) return 'xacro';
  if (lowerName.endsWith('.urdf')) return 'urdf';
  if (
    lowerName.endsWith('.usda')
    || lowerName.endsWith('.usdc')
    || lowerName.endsWith('.usdz')
    || lowerName.endsWith('.usd')
  ) {
    return 'usd';
  }

  if (lowerName.endsWith('.xml')) {
    if (isMJCF(content)) return 'mjcf';
    if (isXacro(content)) return 'xacro';
    if (content.includes('<robot')) return 'urdf';
  }

  if (isUSDA(content)) return 'usd';
  if (isMJCF(content)) return 'mjcf';
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
  return lowerPath.endsWith('.usd')
    || lowerPath.endsWith('.usda')
    || lowerPath.endsWith('.usdc')
    || lowerPath.endsWith('.usdz');
}

export function createImportedUsdFile(name: string, bytes: Uint8Array): RobotFile {
  const lowerName = name.toLowerCase();
  const isBinaryUsd = lowerName.endsWith('.usdc')
    || lowerName.endsWith('.usdz')
    || hasBinaryMagic(bytes, USD_BINARY_MAGIC);
  const isTextUsd = !isBinaryUsd && (lowerName.endsWith('.usda') || isLikelyTextBuffer(bytes));

  return {
    name,
    content: isTextUsd ? usdTextDecoder.decode(bytes) : '',
    format: 'usd',
  };
}

function shouldSkipImportPath(path: string): boolean {
  const pathParts = path.split('/');
  return pathParts.some((part) => part.startsWith('.'));
}

function isImportableDefinitionPath(lowerPath: string): boolean {
  return lowerPath.endsWith('.urdf')
    || lowerPath.endsWith('.xml')
    || lowerPath.endsWith('.mjcf')
    || lowerPath.endsWith('.xacro');
}

function renameCollectedImportPayload(
  payload: CollectedImportPayload,
  existingPaths: readonly string[],
): PreparedImportPayload {
  const importedPaths = [
    ...payload.robotFiles.map((file) => file.name),
    ...payload.assetFiles.map((file) => file.name),
    ...payload.libraryFiles.map((file) => file.path),
  ];
  const pathCollisionMap = createImportPathCollisionMap(importedPaths, existingPaths);

  return {
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
  };
}

async function collectImportPayloadFromZipFile(zipFile: File): Promise<CollectedImportPayload> {
  const payload: CollectedImportPayload = {
    robotFiles: [],
    assetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
  };
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const entryTasks: Promise<void>[] = [];

  zip.forEach((relativePath, fileEntry) => {
    if (fileEntry.dir || shouldSkipImportPath(relativePath)) {
      return;
    }

    const lowerPath = relativePath.toLowerCase();
    entryTasks.push((async () => {
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

      if (lowerPath.includes('motor library') && lowerPath.endsWith('.txt')) {
        const content = await fileEntry.async('string');
        payload.libraryFiles.push({ path: relativePath, content });
        return;
      }

      const blob = await fileEntry.async('blob');
      payload.assetFiles.push({ name: relativePath, blob });
      if (isMeshFile(relativePath)) {
        payload.robotFiles.push({ name: relativePath, content: '', format: 'mesh' });
      }
    })());
  });

  await Promise.all(entryTasks);
  return payload;
}

async function collectImportPayloadFromLooseFiles(files: readonly File[]): Promise<CollectedImportPayload> {
  const payload: CollectedImportPayload = {
    robotFiles: [],
    assetFiles: [],
    usdSourceFiles: [],
    libraryFiles: [],
  };

  await Promise.all(files.map(async (file) => {
    const path = file.webkitRelativePath || file.name;
    const lowerPath = path.toLowerCase();

    if (shouldSkipImportPath(path)) {
      return;
    }

    if (isUsdFamilyPath(path)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      payload.robotFiles.push(createImportedUsdFile(path, bytes));
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

    if (path.includes('motor library') && lowerPath.endsWith('.txt')) {
      const content = await file.text();
      payload.libraryFiles.push({ path, content });
      return;
    }

    payload.assetFiles.push({ name: path, blob: file });
    if (isMeshFile(path)) {
      payload.robotFiles.push({ name: path, content: '', format: 'mesh' });
    }
  }));

  return payload;
}

export async function prepareImportPayload({
  files,
  existingPaths,
}: PrepareImportPayloadArgs): Promise<PreparedImportPayload> {
  const collectedPayload = files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')
    ? await collectImportPayloadFromZipFile(files[0])
    : await collectImportPayloadFromLooseFiles(files);

  return renameCollectedImportPayload(collectedPayload, existingPaths);
}
