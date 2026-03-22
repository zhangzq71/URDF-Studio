import { parseURDF } from '@/core/parsers';
import {
  rewriteRobotMeshPathsForSource,
  rewriteUrdfAssetPathsForExport,
} from '@/core/parsers/meshPathUtils';
import type { RobotState } from '@/types';
import { createRobotSourceSnapshot } from './workspaceSourceSyncUtils';

interface ResolveUrdfSourceExportContentOptions {
  currentRobot: RobotState;
  exportRobotName: string;
  selectedFileName: string;
  selectedFileContent?: string | null;
  originalUrdfContent?: string | null;
  useRelativePaths?: boolean;
}

function normalizeRobotForSnapshot(robot: RobotState): RobotState {
  return {
    ...robot,
    selection: { type: null, id: null },
  };
}

function buildSnapshotFromUrdfContent(
  urdfContent: string,
  sourceFilePath: string,
): string | null {
  const parsed = parseURDF(urdfContent);
  if (!parsed) {
    return null;
  }

  const normalizedRobot = rewriteRobotMeshPathsForSource(
    normalizeRobotForSnapshot(parsed),
    sourceFilePath,
  );

  return createRobotSourceSnapshot(normalizedRobot);
}

export function resolveUrdfSourceExportContent({
  currentRobot,
  exportRobotName,
  selectedFileName,
  selectedFileContent,
  originalUrdfContent,
  useRelativePaths = false,
}: ResolveUrdfSourceExportContentOptions): string | null {
  const currentSnapshot = createRobotSourceSnapshot(
    rewriteRobotMeshPathsForSource(
      normalizeRobotForSnapshot(currentRobot),
      selectedFileName,
    ),
  );

  const candidateContents = [
    originalUrdfContent,
    selectedFileContent,
  ].filter((content, index, values): content is string => {
    const trimmed = content?.trim();
    return Boolean(trimmed) && values.indexOf(content) === index;
  });

  for (const candidateContent of candidateContents) {
    const candidateSnapshot = buildSnapshotFromUrdfContent(
      candidateContent,
      selectedFileName,
    );

    if (candidateSnapshot !== currentSnapshot) {
      continue;
    }

    return rewriteUrdfAssetPathsForExport(candidateContent, {
      exportRobotName,
      useRelativePaths,
    });
  }

  return null;
}
