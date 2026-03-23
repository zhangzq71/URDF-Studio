import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldMountRobotBeforeAssetsComplete } from './loadStrategy.ts';

test('keeps URDF robots on the full-load path so the first visible frame uses final bounds', () => {
  assert.equal(shouldMountRobotBeforeAssetsComplete('urdf'), false);
});

test('keeps MJCF robots on the full-load path', () => {
  assert.equal(shouldMountRobotBeforeAssetsComplete('mjcf'), false);
});
