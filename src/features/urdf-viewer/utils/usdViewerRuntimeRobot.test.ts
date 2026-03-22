import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_JOINT, JointType } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData';
import { createUsdViewerRuntimeRobot } from './usdViewerRuntimeRobot.ts';

function createResolution(): ViewerRobotDataResolution {
  return {
    stageSourcePath: '/Robot/runtime.usd',
    linkIdByPath: {
      '/Robot/base_link': 'base_link',
      '/Robot/arm_link': 'arm_link',
    },
    linkPathById: {
      base_link: '/Robot/base_link',
      arm_link: '/Robot/arm_link',
    },
    jointPathById: {
      arm_joint: '/Robot/joints/arm_joint',
    },
    childLinkPathByJointId: {
      arm_joint: '/Robot/arm_link',
    },
    parentLinkPathByJointId: {
      arm_joint: '/Robot/base_link',
    },
    robotData: {
      name: 'runtime_robot',
      rootLinkId: 'base_link',
      links: {},
      joints: {
        arm_joint: {
          ...DEFAULT_JOINT,
          id: 'arm_joint',
          name: 'arm_joint',
          type: JointType.REVOLUTE,
          childLinkId: 'arm_link',
          limit: {
            ...DEFAULT_JOINT.limit,
            lower: -Math.PI / 2,
            upper: Math.PI / 2,
          },
        },
      },
    },
  };
}

test('USD runtime joint preview only schedules render work and defers heavy refresh until commit', () => {
  let applyCalls = 0;
  let renderRequests = 0;
  let scheduledDecorationRefreshes = 0;
  let flushedDecorationRefreshes = 0;
  const jointAngleUpdates: Array<{ linkPath: string; angleDeg: number }> = [];

  const runtimeRobot = createUsdViewerRuntimeRobot({
    resolution: createResolution(),
    linkRotationController: {
      apply: () => {
        applyCalls += 1;
      },
      getJointInfoForLink: () => ({
        angleDeg: 0,
        lowerLimitDeg: -90,
        upperLimitDeg: 90,
      }),
      setJointAngleForLink: (linkPath: string, angleDeg: number) => {
        jointAngleUpdates.push({ linkPath, angleDeg });
      },
    },
    requestRender: () => {
      renderRequests += 1;
    },
    scheduleDecorationRefresh: () => {
      scheduledDecorationRefreshes += 1;
    },
    flushDecorationRefresh: () => {
      flushedDecorationRefreshes += 1;
    },
  });

  const joint = runtimeRobot.joints.arm_joint as {
    angle: number;
    setJointValue: (value: number) => void;
    finalizeJointValue?: () => void;
  };

  joint.setJointValue(Math.PI / 4);

  assert.equal(joint.angle, Math.PI / 4);
  assert.deepEqual(jointAngleUpdates, [{ linkPath: '/Robot/arm_link', angleDeg: 45 }]);
  assert.equal(renderRequests, 1);
  assert.equal(scheduledDecorationRefreshes, 1);
  assert.equal(flushedDecorationRefreshes, 0);
  assert.equal(applyCalls, 0);

  joint.finalizeJointValue?.();
  assert.equal(flushedDecorationRefreshes, 1);
});

test('USD runtime joint skips redundant work when the requested angle is unchanged', () => {
  let renderRequests = 0;
  let scheduledDecorationRefreshes = 0;
  let setJointAngleCalls = 0;

  const runtimeRobot = createUsdViewerRuntimeRobot({
    resolution: createResolution(),
    linkRotationController: {
      apply: () => {},
      getJointInfoForLink: () => ({
        angleDeg: 0,
        lowerLimitDeg: -90,
        upperLimitDeg: 90,
      }),
      setJointAngleForLink: () => {
        setJointAngleCalls += 1;
      },
    },
    requestRender: () => {
      renderRequests += 1;
    },
    scheduleDecorationRefresh: () => {
      scheduledDecorationRefreshes += 1;
    },
  });

  const joint = runtimeRobot.joints.arm_joint as {
    setJointValue: (value: number) => void;
  };

  joint.setJointValue(0);

  assert.equal(setJointAngleCalls, 0);
  assert.equal(renderRequests, 0);
  assert.equal(scheduledDecorationRefreshes, 0);
});

test('USD runtime joint writes back the clamped runtime angle without re-emitting selection sync', () => {
  const jointAngleUpdates: Array<{
    angleDeg: number;
    linkPath: string;
    options?: { emitSelectionChanged?: boolean };
  }> = [];

  const runtimeRobot = createUsdViewerRuntimeRobot({
    resolution: createResolution(),
    linkRotationController: {
      apply: () => {},
      getJointInfoForLink: () => ({
        angleDeg: 0,
        lowerLimitDeg: -90,
        upperLimitDeg: 90,
      }),
      setJointAngleForLink: (linkPath: string, angleDeg: number, options?: { emitSelectionChanged?: boolean }) => {
        jointAngleUpdates.push({ linkPath, angleDeg, options });
        return {
          angleDeg: 30,
          lowerLimitDeg: -90,
          upperLimitDeg: 90,
        };
      },
    },
  });

  const joint = runtimeRobot.joints.arm_joint as {
    angle: number;
    setJointValue: (value: number) => void;
  };

  joint.setJointValue(Math.PI / 4);

  assert.equal(joint.angle, Math.PI / 6);
  assert.deepEqual(jointAngleUpdates, [{
    linkPath: '/Robot/arm_link',
    angleDeg: 45,
    options: { emitSelectionChanged: false },
  }]);
});
