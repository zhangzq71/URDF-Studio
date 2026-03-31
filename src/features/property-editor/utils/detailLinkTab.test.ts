import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDetailLinkTabAfterGeometrySelection,
  resolveDetailLinkTabAfterViewerMeshSelect,
} from './detailLinkTab.ts';

test('viewer visual mesh selection switches to the visual tab', () => {
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('detail', 'collision', 'visual'), 'visual');
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('detail', 'visual', 'visual'), 'visual');
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('detail', 'physics', 'visual'), 'visual');
});

test('viewer collision mesh selection switches to the collision tab', () => {
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('detail', 'visual', 'collision'), 'collision');
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('detail', 'physics', 'collision'), 'collision');
});

test('hardware mesh selection now follows the same tab-switch policy as detail', () => {
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('hardware', 'collision', 'visual'), 'visual');
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('hardware', 'physics', 'collision'), 'collision');
  assert.equal(resolveDetailLinkTabAfterViewerMeshSelect('hardware', 'physics', 'visual'), 'visual');
});

test('explicit geometry selection follows the chosen geometry subtype', () => {
  assert.equal(resolveDetailLinkTabAfterGeometrySelection('visual'), 'visual');
  assert.equal(resolveDetailLinkTabAfterGeometrySelection('collision'), 'collision');
});
