import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAppModeAfterRobotContentChange } from './contentChangeAppMode.ts';

test('resolveAppModeAfterRobotContentChange normalizes every legacy mode into the merged edit view', () => {
  assert.equal(resolveAppModeAfterRobotContentChange('skeleton'), 'detail');
  assert.equal(resolveAppModeAfterRobotContentChange('detail'), 'detail');
  assert.equal(resolveAppModeAfterRobotContentChange('hardware'), 'detail');
});
