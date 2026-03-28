import {
  rewriteRobotMeshPathsForSource,
  rewriteUrdfAssetPathsForExport,
} from '@/core/parsers/meshPathUtils';
import type { RobotState } from '@/types';
import {
  createRobotSourceSnapshot,
  createRobotSourceSnapshotFromUrdfContent,
} from './workspaceSourceSyncUtils';

interface ResolveUrdfSourceExportContentOptions {
  currentRobot: RobotState;
  exportRobotName: string;
  selectedFileName: string;
  selectedFileContent?: string | null;
  originalUrdfContent?: string | null;
  useRelativePaths?: boolean;
  preferSourceVisualMeshes?: boolean;
}

function normalizeRobotForSnapshot(robot: RobotState): RobotState {
  return {
    ...robot,
    selection: { type: null, id: null },
  };
}

async function buildSnapshotFromUrdfContent(
  urdfContent: string,
  sourceFilePath: string,
): Promise<string | null> {
  return createRobotSourceSnapshotFromUrdfContent(urdfContent, {
    sourcePath: sourceFilePath,
  });
}

export async function resolveUrdfSourceExportContent({
  currentRobot,
  exportRobotName,
  selectedFileName,
  selectedFileContent,
  originalUrdfContent,
  useRelativePaths = false,
  preferSourceVisualMeshes = true,
}: ResolveUrdfSourceExportContentOptions): Promise<string | null> {
  if (!preferSourceVisualMeshes) {
    return null;
  }

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
    const candidateSnapshot = await buildSnapshotFromUrdfContent(
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
