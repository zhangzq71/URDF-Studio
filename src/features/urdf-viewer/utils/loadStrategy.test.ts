import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldMountRobotBeforeAssetsComplete } from './loadStrategy.ts';

test('mounts URDF robots before all mesh assets finish loading', () => {
  assert.equal(shouldMountRobotBeforeAssetsComplete('urdf'), true);
});

test('keeps MJCF robots on the full-load path', () => {
  assert.equal(shouldMountRobotBeforeAssetsComplete('mjcf'), false);
});
