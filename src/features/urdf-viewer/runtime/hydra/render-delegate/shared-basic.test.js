import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUrdfTruthFileNameForStagePath } from './shared-basic.js';

test('resolveUrdfTruthFileNameForStagePath prefers the longest known Unitree token match', () => {
    assert.equal(
        resolveUrdfTruthFileNameForStagePath('/unitree_model/go2w/usd/go2w.usd'),
        'go2w_description.urdf',
    );
    assert.equal(
        resolveUrdfTruthFileNameForStagePath('/unitree_model/b2w/usd/b2w.usd'),
        'b2w_description.urdf',
    );
});

test('resolveUrdfTruthFileNameForStagePath preserves exact handless and h1_2 stems', () => {
    assert.equal(
        resolveUrdfTruthFileNameForStagePath('/unitree_model/h1_2/usd/h1_2.usd'),
        'h1_2.urdf',
    );
    assert.equal(
        resolveUrdfTruthFileNameForStagePath('/unitree_model/h1_2/usd/h1_2_handless.usd'),
        'h1_2_handless.urdf',
    );
});
