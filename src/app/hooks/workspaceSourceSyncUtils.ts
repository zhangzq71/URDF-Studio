import { createUsdPlaceholderRobotData, resolveRobotFileData } from '@/core/parsers/importRobotFile';
import type { RobotData, RobotFile, RobotState } from '@/types';

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

interface PreferredUrdfContentOptions {
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

export function getPreferredUrdfContent({
  fileContent,
  originalContent,
  generatedContent,
  hasStoreEdits,
}: PreferredUrdfContentOptions): string | null {
  if (hasStoreEdits) {
    return generatedContent ?? fileContent ?? originalContent ?? null;
  }

  return fileContent ?? originalContent ?? generatedContent ?? null;
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
  usdRobotData?: RobotData | null;
}

export function createPreviewRobotState(
  file: RobotFile,
  {
    availableFiles,
    assets,
    usdRobotData,
  }: CreatePreviewRobotStateOptions,
): RobotState | null {
  const resolved = resolveRobotFileData(file, {
    availableFiles,
    assets,
    usdRobotData,
  });

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
