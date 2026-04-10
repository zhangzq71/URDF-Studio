import type { RobotState } from '@/types';

export function resolveUnifiedViewerEditorRobot({
  robot,
  viewerRobot,
  assemblyWorkspaceActive,
}: {
  robot: RobotState;
  viewerRobot: RobotState;
  assemblyWorkspaceActive: boolean;
}): RobotState {
  return assemblyWorkspaceActive ? viewerRobot : robot;
}
