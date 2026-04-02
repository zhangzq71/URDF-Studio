import type { RobotState } from '@/types';

export function resolveUnifiedViewerVisualizerRobot({
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
