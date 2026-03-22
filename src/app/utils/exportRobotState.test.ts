import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINK } from '../../types/constants.ts';
import { JointType, type RobotClosedLoopConstraint, type RobotData, type UrdfJoint, type UrdfLink } from '../../types/index.ts';

import {
  buildCurrentRobotExportData as buildProjectRobotData,
  buildCurrentRobotExportState as buildCurrentExportRobot,
} from '../hooks/projectRobotStateUtils';

function createLinks(): Record<string, UrdfLink> {
  return {
    base_link: {
      ...DEFAULT_LINK,
      id: 'base_link',
      name: 'base_link',
    },
    tool_link: {
      ...DEFAULT_LINK,
      id: 'tool_link',
      name: 'tool_link',
    },
  };
}

function createJoints(): Record<string, UrdfJoint> {
  return {
    joint_a: {
      id: 'joint_a',
      name: 'joint_a',
      type: JointType.REVOLUTE,
      parentLinkId: 'base_link',
      childLinkId: 'tool_link',
      origin: {
        xyz: { x: 0, y: 0, z: 0 },
        rpy: { r: 0, p: 0, y: 0 },
      },
      axis: { x: 0, y: 0, z: 1 },
      limit: { lower: -1, upper: 1, effort: 10, velocity: 5 },
      dynamics: { damping: 0, friction: 0 },
      hardware: {
        armature: 0,
        motorType: 'None',
        motorId: '',
        motorDirection: 1,
      },
    },
  };
}

function createClosedLoopConstraints(): RobotClosedLoopConstraint[] {
  return [
    {
      id: 'loop-1',
      type: 'connect',
      linkAId: 'base_link',
      linkBId: 'tool_link',
      anchorWorld: { x: 0, y: 0, z: 0 },
      anchorLocalA: { x: 0, y: 0, z: 0 },
      anchorLocalB: { x: 0, y: 0, z: 0 },
    },
  ];
}

test('buildCurrentExportRobot preserves materials and closed-loop constraints for the current robot store', () => {
  const materials = {
    steel: { color: '#999999' },
  };
  const closedLoopConstraints = createClosedLoopConstraints();

  const robot = buildCurrentExportRobot({
    robotName: 'demo_bot',
    robotLinks: createLinks(),
    robotJoints: createJoints(),
    rootLinkId: 'base_link',
    robotMaterials: materials,
    closedLoopConstraints,
  });

  assert.equal(robot.name, 'demo_bot');
  assert.deepEqual(robot.materials, materials);
  assert.deepEqual(robot.closedLoopConstraints, closedLoopConstraints);
  assert.deepEqual(robot.selection, { type: null, id: null });
});

test('buildProjectRobotData includes materials and closed-loop constraints', () => {
  const materials = {
    anodized: { color: '#0088ff' },
  };
  const closedLoopConstraints = createClosedLoopConstraints();

  const robotData: RobotData = buildProjectRobotData({
    robotName: 'project_bot',
    robotLinks: createLinks(),
    robotJoints: createJoints(),
    rootLinkId: 'base_link',
    robotMaterials: materials,
    closedLoopConstraints,
  });

  assert.equal(robotData.name, 'project_bot');
  assert.deepEqual(robotData.materials, materials);
  assert.deepEqual(robotData.closedLoopConstraints, closedLoopConstraints);
});
