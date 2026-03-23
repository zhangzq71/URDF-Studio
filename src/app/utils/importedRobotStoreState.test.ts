import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINK } from '../../types/constants.ts';
import { JointType, type RobotData } from '../../types/index.ts';

import { buildImportedRobotStoreState } from '../hooks/projectRobotStateUtils';

function createRobotData(): RobotData {
  return {
    name: 'imported_bot',
    rootLinkId: 'base_link',
    materials: {
      carbon: { color: '#222222' },
    },
    closedLoopConstraints: [
      {
        id: 'loop-1',
        type: 'connect',
        linkAId: 'base_link',
        linkBId: 'tool_link',
        anchorWorld: { x: 0, y: 0, z: 0 },
        anchorLocalA: { x: 0, y: 0, z: 0 },
        anchorLocalB: { x: 0, y: 0, z: 0 },
      },
    ],
    links: {
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
    },
    joints: {
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
    },
  };
}

test('buildImportedRobotStoreState keeps materials and closed-loop constraints when restoring a project', () => {
  const robotState = createRobotData();
  const robotHistory = {
    past: [createRobotData()],
    future: [],
  };
  const robotActivity = [
    {
      id: 'activity-1',
      timestamp: '2026-03-20T00:00:00.000Z',
      label: 'Load imported project',
    },
  ];

  const nextState = buildImportedRobotStoreState(robotState, robotHistory, robotActivity);

  assert.equal(nextState.name, 'imported_bot');
  assert.deepEqual(nextState.materials, robotState.materials);
  assert.deepEqual(nextState.closedLoopConstraints, robotState.closedLoopConstraints);
  assert.deepEqual(nextState._history, robotHistory);
  assert.deepEqual(nextState._activity, robotActivity);
});
