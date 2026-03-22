import test from 'node:test';
import assert from 'node:assert/strict';

import { JointType, type UrdfJoint } from '@/types';

import { detectSingleJointPatch } from './robotLoaderDiff';

const makeJoint = (overrides: Partial<UrdfJoint> = {}): UrdfJoint => ({
  id: 'joint_1',
  name: 'joint_1',
  type: JointType.FLOATING,
  parentLinkId: 'world',
  childLinkId: 'base_link',
  origin: {
    xyz: { x: 0, y: 0, z: 0 },
    rpy: { r: 0, p: 0, y: 0 },
  },
  axis: undefined,
  limit: undefined,
  dynamics: { damping: 0, friction: 0 },
  hardware: {
    armature: 0,
    motorType: '',
    motorId: '',
    motorDirection: 1,
  },
  ...overrides,
});

test('detectSingleJointPatch tolerates joints without limits', () => {
  const prevJoints = {
    joint_1: makeJoint(),
  };
  const nextJoints = {
    joint_1: makeJoint({
      origin: {
        xyz: { x: 0, y: 0, z: 0.1 },
        rpy: { r: 0, p: 0, y: 0 },
      },
    }),
  };

  const patch = detectSingleJointPatch(prevJoints, nextJoints);

  assert.ok(patch);
  assert.equal(patch?.jointName, 'joint_1');
});
