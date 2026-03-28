import { rewriteRobotMeshPathsForSource } from '@/core/parsers/meshPathUtils';
import {
  createUsdPlaceholderRobotData,
  resolveRobotFileData,
  type RobotImportResult,
} from '@/core/parsers/importRobotFile';
import type { RobotData, RobotFile, RobotState } from '@/types';
import { parseEditableRobotSourceWithWorker } from './robotImportWorkerBridge';

type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

function sortKeysDeep(value: unknown): JsonLike {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, JsonLike>>((acc, key) => {
        const nextValue = (value as Record<string, unknown>)[key];
        if (nextValue !== undefined) {
          acc[key] = sortKeysDeep(nextValue);
        }
        return acc;
      }, {});
  }

  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return value as JsonLike;
  }

  return null;
}

export function createRobotSourceSnapshot(robot: RobotState): string {
  return JSON.stringify(sortKeysDeep({
    name: robot.name,
    rootLinkId: robot.rootLinkId,
    links: robot.links,
    joints: robot.joints,
    materials: robot.materials ?? null,
    closedLoopConstraints: robot.closedLoopConstraints ?? null,
  }));
}

interface CreateRobotSourceSnapshotFromUrdfContentOptions {
  sourcePath: string;
}

export async function createRobotSourceSnapshotFromUrdfContent(
  content: string,
  { sourcePath }: CreateRobotSourceSnapshotFromUrdfContentOptions,
): Promise<string | null> {
  const parsed = await parseEditableRobotSourceWithWorker({
    file: {
      format: 'urdf',
      name: sourcePath,
    },
    content,
  });

  if (!parsed) {
    return null;
  }

  return createRobotSourceSnapshot(
    rewriteRobotMeshPathsForSource(
      {
        ...parsed,
        selection: { type: null, id: null },
      },
      sourcePath,
    ),
  );
}

interface PreferredMjcfContentOptions {
  sourceContent?: string | null;
  generatedContent?: string | null;
  hasViewerEdits: boolean;
}

export function getPreferredMjcfContent({
  sourceContent,
  generatedContent,
  hasViewerEdits,
}: PreferredMjcfContentOptions): string | null {
  if (hasViewerEdits) {
    return generatedContent ?? sourceContent ?? null;
  }

  return sourceContent ?? generatedContent ?? null;
}

interface PreferredXmlContentOptions {
  fileContent?: string | null;
  originalContent?: string | null;
  generatedContent?: string | null;
  hasStoreEdits: boolean;
}

interface UseEmptyRobotForUsdHydrationOptions {
  selectedFileFormat?: RobotFile['format'] | null;
  selectedFileName?: string | null;
  documentLoadStatus?: 'idle' | 'loading' | 'hydrating' | 'ready' | 'error';
  documentLoadFileName?: string | null;
}

function getPreferredXmlContent({
  fileContent,
  originalContent,
  generatedContent,
  hasStoreEdits,
}: PreferredXmlContentOptions): string | null {
  if (hasStoreEdits) {
    return generatedContent ?? fileContent ?? originalContent ?? null;
  }

  return fileContent ?? originalContent ?? generatedContent ?? null;
}

export function getPreferredUrdfContent(options: PreferredXmlContentOptions): string | null {
  return getPreferredXmlContent(options);
}

export function getPreferredXacroContent(options: PreferredXmlContentOptions): string | null {
  return getPreferredXmlContent(options);
}

export function shouldUseEmptyRobotForUsdHydration({
  selectedFileFormat,
  selectedFileName,
  documentLoadStatus,
  documentLoadFileName,
}: UseEmptyRobotForUsdHydrationOptions): boolean {
  return (
    selectedFileFormat === 'usd'
    && documentLoadStatus === 'hydrating'
    && Boolean(selectedFileName)
    && selectedFileName === documentLoadFileName
  );
}

interface CreatePreviewRobotStateOptions {
  availableFiles: RobotFile[];
  assets?: Record<string, string>;
  allFileContents?: Record<string, string>;
  usdRobotData?: RobotData | null;
}

export function createPreviewRobotState(
  file: RobotFile,
  {
    availableFiles,
    assets,
    allFileContents,
    usdRobotData,
  }: CreatePreviewRobotStateOptions,
): RobotState | null {
  const resolved = resolveRobotFileData(file, {
    availableFiles,
    assets,
    allFileContents,
    usdRobotData,
  });

  return createPreviewRobotStateFromImportResult(file, resolved);
}

export function createPreviewRobotStateFromImportResult(
  file: RobotFile,
  resolved: RobotImportResult,
): RobotState | null {
  if (resolved.status === 'ready') {
    return {
      ...resolved.robotData,
      selection: { type: null, id: null },
    };
  }

  if (resolved.status === 'needs_hydration' && file.format === 'usd') {
    return {
      ...createUsdPlaceholderRobotData(file),
      selection: { type: null, id: null },
    };
  }

  return null;
}
