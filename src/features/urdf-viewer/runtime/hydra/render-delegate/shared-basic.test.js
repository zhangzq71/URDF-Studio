import test from 'node:test';
import assert from 'node:assert/strict';

import { disposeUsdHandle, resolveUrdfTruthFileNameForStagePath } from './shared-basic.js';

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

test('disposeUsdHandle deletes live handles and flushes pending deletes', () => {
    let deleteCount = 0;
    let flushCount = 0;
    const handle = {
        delete() {
            deleteCount += 1;
        },
    };
    const usdModule = {
        flushPendingDeletes() {
            flushCount += 1;
        },
    };

    disposeUsdHandle(usdModule, handle);

    assert.equal(deleteCount, 1);
    assert.equal(flushCount, 1);
});
