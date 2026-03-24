import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDetailLinkTabAfterGeometrySelection,
  resolveDetailLinkTabAfterViewerMeshSelect,
} from './detailLinkTab.ts';

test('viewer visual mesh selection preserves the current detail tab', () => {
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('collision', 'visual'), 'collision');
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('joint', 'visual'), 'joint');
});

test('viewer collision mesh selection switches to the collision tab', () => {
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('visual', 'collision'), 'collision');
});

test('explicit geometry selection follows the chosen geometry subtype', () => {
  assert.equal(resolveDetailLinkTabAfterGeometrySelection('visual'), 'visual');
  assert.equal(resolveDetailLinkTabAfterGeometrySelection('collision'), 'collision');
});
