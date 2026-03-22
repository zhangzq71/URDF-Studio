import test from 'node:test';
import assert from 'node:assert/strict';

import type { CanonicalMJCFSnapshot } from './mjcfSnapshot.ts';
import { diffCanonicalSnapshots } from './mjcfSnapshot.ts';

function createBaseSnapshot(geomOverrides: Partial<CanonicalMJCFSnapshot['geoms'][number]>): CanonicalMJCFSnapshot {
    return {
        schema: 'urdf-studio.mjcf-canonical/v1',
        meta: {
            modelName: 'test-model',
            effectiveFile: 'test.xml',
        },
        counts: {
            bodies: 1,
            joints: 0,
            geoms: 1,
            meshes: 0,
            materials: 0,
        },
        bodies: [{
            key: 'body',
            name: 'body',
            parentKey: null,
            path: 'body',
            pos: [0, 0, 0],
            quat: [1, 0, 0, 0],
            mass: null,
            inertialPos: null,
            inertialQuat: null,
            inertia: null,
            fullinertia: null,
        }],
        joints: [],
        geoms: [{
            key: 'body::geom[0]',
            name: null,
            bodyKey: 'body',
            type: 'capsule',
            size: [0.1, 0.5],
            mesh: null,
            material: null,
            mass: null,
            pos: [0, 0, 0],
            quat: [1, 0, 0, 0],
            rgba: [0.5, 0.5, 0.5, 1],
            group: null,
            contype: null,
            conaffinity: null,
            ...geomOverrides,
        }],
        assets: {
            meshes: [],
            materials: [],
        },
    };
}

test('diffCanonicalSnapshots ignores roll-only quaternion changes for axisymmetric primitives', () => {
    const expected = createBaseSnapshot({
        type: 'capsule',
        quat: [1, 0, 0, 0],
    });
    const actual = createBaseSnapshot({
        type: 'capsule',
        quat: [0.707107, 0, 0, 0.707107],
    });

    const diffs = diffCanonicalSnapshots(expected, actual);

    assert.equal(
        diffs.some((diff) => diff.type === 'GEOM_QUAT_MISMATCH'),
        false,
        `expected no capsule quaternion diff, got ${JSON.stringify(diffs, null, 2)}`,
    );
});

test('diffCanonicalSnapshots still reports quaternion changes for non-axisymmetric primitives', () => {
    const expected = createBaseSnapshot({
        type: 'box',
        size: [0.1, 0.2, 0.3],
        quat: [1, 0, 0, 0],
    });
    const actual = createBaseSnapshot({
        type: 'box',
        size: [0.1, 0.2, 0.3],
        quat: [0.707107, 0, 0, 0.707107],
    });

    const diffs = diffCanonicalSnapshots(expected, actual);

    assert.equal(diffs.some((diff) => diff.type === 'GEOM_QUAT_MISMATCH'), true);
});
