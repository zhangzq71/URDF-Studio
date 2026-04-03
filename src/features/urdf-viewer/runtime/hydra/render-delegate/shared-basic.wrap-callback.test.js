import test from 'node:test';
import assert from 'node:assert/strict';

import {
    hydraCallbackErrorCounts,
    wrapHydraCallbackObject,
} from './shared-basic.js';

test('wrapHydraCallbackObject preserves sync callback failures instead of returning undefined', () => {
    hydraCallbackErrorCounts.clear();
    const expected = new Error('sync-failure');
    const target = {
        read() {
            throw expected;
        },
    };
    const wrapped = wrapHydraCallbackObject(target, 'SyncScope');

    assert.throws(
        () => wrapped.read(),
        (error) => {
            assert.equal(error, expected);
            return true;
        },
    );
    assert.equal(hydraCallbackErrorCounts.get('SyncScope.read'), 1);
});

test('wrapHydraCallbackObject preserves async callback failures instead of resolving undefined', async () => {
    hydraCallbackErrorCounts.clear();
    const expected = new Error('async-failure');
    const target = {
        async load() {
            throw expected;
        },
    };
    const wrapped = wrapHydraCallbackObject(target, 'AsyncScope');

    await assert.rejects(
        wrapped.load(),
        (error) => {
            assert.equal(error, expected);
            return true;
        },
    );
    assert.equal(hydraCallbackErrorCounts.get('AsyncScope.load'), 1);
});
