import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUnifiedViewerSceneMode } from './unifiedViewerSceneMode.ts';

test('resolveUnifiedViewerSceneMode collapses all app scenes onto the legacy detail viewer runtime', () => {
  assert.equal(resolveUnifiedViewerSceneMode('skeleton'), 'detail');
  assert.equal(resolveUnifiedViewerSceneMode('detail'), 'detail');
  assert.equal(resolveUnifiedViewerSceneMode('hardware'), 'detail');
});
