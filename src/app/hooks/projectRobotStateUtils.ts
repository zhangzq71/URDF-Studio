import type {
  RobotClosedLoopConstraint,
  RobotData,
  RobotState,
  UrdfJoint,
  UrdfLink,
} from '@/types';
import { syncRobotVisualColorsFromMaterials } from '@/core/robot/materials';

export interface RobotActivityEntryLike {
  id: string;
  timestamp: string;
  label: string;
}

export interface RobotHistoryLike {
  past: RobotData[];
  future: RobotData[];
}

interface CurrentRobotExportInput {
  robotName: string;
  robotLinks: Record<string, UrdfLink>;
  robotJoints: Record<string, UrdfJoint>;
  rootLinkId: string;
  robotMaterials?: RobotData['materials'];
  closedLoopConstraints?: RobotClosedLoopConstraint[];
}

export function buildCurrentRobotExportData({
  robotName,
  robotLinks,
  robotJoints,
  rootLinkId,
  robotMaterials,
  closedLoopConstraints,
}: CurrentRobotExportInput): RobotData {
  return {
    name: robotName,
    links: robotLinks,
    joints: robotJoints,
    rootLinkId,
    materials: robotMaterials,
    closedLoopConstraints,
  };
}

export function buildCurrentRobotExportState(
  input: CurrentRobotExportInput,
): RobotState {
  return {
    ...buildCurrentRobotExportData(input),
    selection: { type: null, id: null },
  };
}

export function buildImportedRobotStoreState(
  robotState: RobotData | null,
  robotHistory: RobotHistoryLike,
  robotActivity: RobotActivityEntryLike[],
) {
  if (!robotState) {
    return {
      _history: robotHistory,
      _activity: robotActivity,
    };
  }

  const normalizedRobotState = syncRobotVisualColorsFromMaterials(robotState);

  return {
    name: normalizedRobotState.name,
    links: normalizedRobotState.links,
    joints: normalizedRobotState.joints,
    rootLinkId: normalizedRobotState.rootLinkId,
    materials: normalizedRobotState.materials,
    closedLoopConstraints: normalizedRobotState.closedLoopConstraints,
    _history: robotHistory,
    _activity: robotActivity,
  };
}
