import assert from 'node:assert/strict';
import test from 'node:test';

import { getRegressionSnapshot, setRegressionRuntimeRobot } from './regressionBridge';

test('getRegressionSnapshot summarizes joint-only runtime proxies without requiring traverse()', () => {
  setRegressionRuntimeRobot({
    name: 'usd-runtime-proxy',
    joints: {
      arm_joint: {
        name: 'arm_joint',
        type: 'revolute',
        jointType: 'revolute',
        angle: Math.PI / 4,
        axis: [0, 0, 1],
        limit: {
          lower: -Math.PI / 2,
          upper: Math.PI / 2,
        },
      },
    },
  });

  const snapshot = getRegressionSnapshot();

  assert.equal(snapshot.runtime?.name, 'usd-runtime-proxy');
  assert.equal(snapshot.runtime?.linkCount, 0);
  assert.equal(snapshot.runtime?.jointCount, 1);
  assert.deepEqual(snapshot.runtime?.joints, [
    {
      name: 'arm_joint',
      type: 'revolute',
      angle: Math.PI / 4,
      axis: [0, 0, 1],
      limit: {
        lower: -Math.PI / 2,
        upper: Math.PI / 2,
      },
    },
  ]);

  setRegressionRuntimeRobot(null);
});
