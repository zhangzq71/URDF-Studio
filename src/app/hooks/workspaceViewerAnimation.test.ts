import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINK, JointType, type RobotData, type UrdfJoint } from '@/types';
import {
  WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX,
  WORKSPACE_VIEWER_WORLD_ROOT_ID,
} from './workspaceSourceSyncUtils.ts';
import {
  buildWorkspaceViewerRobotTransitionFrame,
  canAnimateWorkspaceViewerRobotTransition,
} from './workspaceViewerAnimation.ts';

function createSyntheticRootJoint(
  componentId: string,
  origin: Pick<UrdfJoint['origin'], 'xyz' | 'rpy'>,
): UrdfJoint {
  const jointId = `${WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX}${componentId}`;
  return {
    id: jointId,
    name: jointId,
    type: JointType.FIXED,
    parentLinkId: WORKSPACE_VIEWER_WORLD_ROOT_ID,
    childLinkId: `${componentId}_base_link`,
    origin,
    dynamics: { damping: 0, friction: 0 },
    hardware: {
      armature: 0,
      motorType: 'None',
      motorId: '',
      motorDirection: 1,
    },
  };
}

function createWorkspaceViewerRobot(
  syntheticJointOrigin: Pick<UrdfJoint['origin'], 'xyz' | 'rpy'>,
): RobotData {
  const componentJointId = `${WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX}comp_a`;

  return {
    name: 'workspace',
    rootLinkId: WORKSPACE_VIEWER_WORLD_ROOT_ID,
    links: {
      [WORKSPACE_VIEWER_WORLD_ROOT_ID]: {
        ...DEFAULT_LINK,
        id: WORKSPACE_VIEWER_WORLD_ROOT_ID,
        name: 'world',
        visible: false,
      },
      comp_a_base_link: {
        ...DEFAULT_LINK,
        id: 'comp_a_base_link',
        name: 'comp_a_base_link',
      },
      comp_a_tool_link: {
        ...DEFAULT_LINK,
        id: 'comp_a_tool_link',
        name: 'comp_a_tool_link',
      },
    },
    joints: {
      [componentJointId]: createSyntheticRootJoint('comp_a', syntheticJointOrigin),
      comp_a_joint: {
        id: 'comp_a_joint',
        name: 'comp_a_joint',
        type: JointType.REVOLUTE,
        parentLinkId: 'comp_a_base_link',
        childLinkId: 'comp_a_tool_link',
        origin: {
          xyz: { x: 0, y: 0, z: 0.25 },
          rpy: { r: 0.1, p: -0.2, y: 0.3 },
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

test('canAnimateWorkspaceViewerRobotTransition only allows stable workspace viewer transitions', () => {
  const fromRobot = createWorkspaceViewerRobot({
    xyz: { x: 0, y: 0, z: 0 },
    rpy: { r: 0, p: 0, y: 0 },
  });
  const toRobot = createWorkspaceViewerRobot({
    xyz: { x: 0.6, y: -0.2, z: 0.1 },
    rpy: { r: 0, p: 0, y: Math.PI / 2 },
  });

  assert.equal(canAnimateWorkspaceViewerRobotTransition(fromRobot, toRobot), true);

  const invalidRootRobot: RobotData = {
    ...toRobot,
    rootLinkId: 'base_link',
  };
  assert.equal(canAnimateWorkspaceViewerRobotTransition(fromRobot, invalidRootRobot), false);
});

test('buildWorkspaceViewerRobotTransitionFrame interpolates only workspace synthetic root joints', () => {
  const fromRobot = createWorkspaceViewerRobot({
    xyz: { x: 0, y: 0, z: 0 },
    rpy: { r: 0, p: 0, y: 0 },
  });
  const toRobot = createWorkspaceViewerRobot({
    xyz: { x: 0.8, y: -0.4, z: 0.2 },
    rpy: { r: 0, p: 0, y: Math.PI / 2 },
  });

  const midRobot = buildWorkspaceViewerRobotTransitionFrame({
    fromRobot,
    toRobot,
    alpha: 0.5,
  });
  const syntheticJointId = `${WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX}comp_a`;

  assert.ok(midRobot);
  assert.equal(midRobot.joints[syntheticJointId]?.origin.xyz.x, 0.4);
  assert.equal(midRobot.joints[syntheticJointId]?.origin.xyz.y, -0.2);
  assert.equal(midRobot.joints[syntheticJointId]?.origin.xyz.z, 0.1);
  assert.ok(Math.abs((midRobot.joints[syntheticJointId]?.origin.rpy.y ?? 0) - Math.PI / 4) < 1e-6);

  assert.deepEqual(
    midRobot.joints.comp_a_joint?.origin,
    toRobot.joints.comp_a_joint?.origin,
  );
});

test('buildWorkspaceViewerRobotTransitionFrame falls back to the target robot when transition is not animatable', () => {
  const fromRobot = createWorkspaceViewerRobot({
    xyz: { x: 0, y: 0, z: 0 },
    rpy: { r: 0, p: 0, y: 0 },
  });
  const toRobot = createWorkspaceViewerRobot({
    xyz: { x: 0.8, y: -0.4, z: 0.2 },
    rpy: { r: 0, p: 0, y: Math.PI / 2 },
  });

  delete fromRobot.joints[`${WORKSPACE_VIEWER_COMPONENT_ROOT_JOINT_PREFIX}comp_a`];

  const frameRobot = buildWorkspaceViewerRobotTransitionFrame({
    fromRobot,
    toRobot,
    alpha: 0.5,
  });

  assert.equal(frameRobot, toRobot);
});
