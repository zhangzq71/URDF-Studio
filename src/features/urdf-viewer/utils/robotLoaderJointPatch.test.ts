import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { URDFJoint as RuntimeURDFJoint } from '@/core/parsers/urdf/loader';
import { JointType, type UrdfJoint } from '@/types';

import { patchJointInPlace } from './robotLoaderJointPatch';

const makeJointPatchData = (overrides: Partial<UrdfJoint> = {}): UrdfJoint => ({
  id: 'joint_1',
  name: 'joint_1',
  type: JointType.REVOLUTE,
  parentLinkId: 'base_link',
  childLinkId: 'link_1',
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

test('patchJointInPlace handles joints without explicit axis or limits', () => {
  const robot = new THREE.Group() as THREE.Group & {
    joints?: Record<string, RuntimeURDFJoint>;
  };
  const joint = new RuntimeURDFJoint();
  joint.name = 'joint_1';
  joint.origPosition = joint.position.clone();
  joint.origQuaternion = joint.quaternion.clone();
  robot.joints = { joint_1: joint };

  const patch = {
    jointName: 'joint_1',
    previousJointData: makeJointPatchData(),
    jointData: makeJointPatchData({
      origin: {
        xyz: { x: 0, y: 0, z: 0.2 },
        rpy: { r: 0, p: 0, y: 0 },
      },
    }),
  };

  const invalidations: number[] = [];
  const applied = patchJointInPlace(robot, patch, () => {
    invalidations.push(1);
  });

  assert.equal(applied, true);
  assert.equal(joint.ignoreLimits, true);
  assert.deepEqual(joint.axis.toArray(), [1, 0, 0]);
  assert.equal(joint.position.z, 0.2);
  assert.equal(invalidations.length, 1);
});
