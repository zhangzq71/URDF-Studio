import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';

import { ThreeRenderDelegateCore } from './ThreeRenderDelegateCore.js';
import { resolveSemanticChildLinkTargetFromResolvedPrimPath } from './shared-basic.js';

function createTranslationMatrix(x, y, z) {
    return new Matrix4().makeTranslation(x, y, z);
}

function decomposeTranslation(matrix) {
    const position = new Vector3();
    matrix.decompose(position, new Quaternion(), new Vector3());
    return position.toArray().map((value) => Number(value.toFixed(6)));
}

function createFoldedChildDelegate(overrides = {}) {
    const delegate = Object.create(ThreeRenderDelegateCore.prototype);
    Object.assign(delegate, {
        getUrdfTruthForCurrentStage() {
            return {
                visualsByLinkName: new Map(),
                collisionsByLinkName: new Map(),
                jointByChildLinkName: new Map(),
            };
        },
        getResolvedVisualTransformPrimPathForMeshId() {
            return null;
        },
        getResolvedPrimPathForMeshId() {
            return null;
        },
        getUrdfLinkWorldTransformFromJointChain() {
            return null;
        },
        getPreferredLinkWorldTransform() {
            return null;
        },
        getWorldTransformForPrimPath() {
            return null;
        },
        shouldUseUrdfVisualFallbackForMesh() {
            return true;
        },
    }, overrides);
    return delegate;
}

test('resolves folded visual and collision prims back to semantic child links', () => {
    const visualTarget = resolveSemanticChildLinkTargetFromResolvedPrimPath({
        owningLinkPath: '/Robot/torso_link',
        resolvedPrimPath: '/Robot/torso_link/visuals/head_link/mesh',
        sectionName: 'visuals',
        validLinkNames: new Map([['head_link', []], ['torso_link', []]]),
    });
    const collisionTarget = resolveSemanticChildLinkTargetFromResolvedPrimPath({
        owningLinkPath: '/Robot/torso_link',
        resolvedPrimPath: '/Robot/torso_link/collisions/head_link/mesh',
        sectionName: 'collisions',
        validLinkNames: new Map([['head_link', {}], ['torso_link', {}]]),
    });
    const assetTarget = resolveSemanticChildLinkTargetFromResolvedPrimPath({
        owningLinkPath: '/Robot/torso_link',
        resolvedPrimPath: '/Robot/torso_link/visuals/torso_link_rev_1_0/mesh',
        sectionName: 'visuals',
        validLinkNames: new Map([['head_link', []], ['torso_link', []]]),
    });

    assert.deepEqual(visualTarget, {
        linkName: 'head_link',
        linkPath: '/Robot/head_link',
    });
    assert.deepEqual(collisionTarget, {
        linkName: 'head_link',
        linkPath: '/Robot/head_link',
    });
    assert.equal(assetTarget, null);
});

test('uses semantic child link transforms for folded visual prims in URDF truth fallback', () => {
    const headVisualEntry = {
        localMatrix: new Matrix4().identity(),
    };
    const torsoVisualEntry = {
        localMatrix: createTranslationMatrix(9, 9, 9),
    };
    const delegate = createFoldedChildDelegate({
        getUrdfTruthForCurrentStage() {
            return {
                visualsByLinkName: new Map([
                    ['torso_link', [torsoVisualEntry]],
                    ['head_link', [headVisualEntry]],
                ]),
                collisionsByLinkName: new Map(),
                jointByChildLinkName: new Map(),
            };
        },
        getResolvedVisualTransformPrimPathForMeshId() {
            return '/Robot/torso_link/visuals/head_link/mesh';
        },
        getUrdfLinkWorldTransformFromJointChain(linkPath) {
            if (linkPath === '/Robot/head_link') {
                return createTranslationMatrix(1, 2, 3);
            }
            return createTranslationMatrix(9, 9, 9);
        },
        getPreferredLinkWorldTransform(linkPath) {
            if (linkPath === '/Robot/torso_link') {
                return new Matrix4().identity();
            }
            return null;
        },
        getWorldTransformForPrimPath() {
            return new Matrix4().identity();
        },
    });

    const matrix = delegate.getVisualWorldTransformFromUrdfTruth('/Robot/torso_link/visuals.proto_mesh_id0');

    assert.deepEqual(decomposeTranslation(matrix), [1, 2, 3]);
    assert.equal(delegate.getUrdfVisualEntryForMeshId('/Robot/torso_link/visuals.proto_mesh_id0'), headVisualEntry);
});

test('uses semantic child link transforms for folded collision prims in URDF truth fallback', () => {
    const headCollisionEntry = {
        originQuatWxyz: [1, 0, 0, 0],
        localMatrix: new Matrix4().identity(),
    };
    const torsoCollisionEntry = {
        originQuatWxyz: [1, 0, 0, 0],
        localMatrix: createTranslationMatrix(9, 9, 9),
    };
    const delegate = createFoldedChildDelegate({
        getUrdfTruthForCurrentStage() {
            return {
                visualsByLinkName: new Map(),
                collisionsByLinkName: new Map([
                    ['torso_link', {
                        all: [torsoCollisionEntry],
                        byType: new Map([['mesh', [torsoCollisionEntry]]]),
                    }],
                    ['head_link', {
                        all: [headCollisionEntry],
                        byType: new Map([['mesh', [headCollisionEntry]]]),
                    }],
                ]),
                jointByChildLinkName: new Map(),
            };
        },
        getResolvedPrimPathForMeshId() {
            return '/Robot/torso_link/collisions/head_link/mesh';
        },
        getUrdfLinkWorldTransformFromJointChain(linkPath) {
            if (linkPath === '/Robot/head_link') {
                return createTranslationMatrix(4, 5, 6);
            }
            return createTranslationMatrix(9, 9, 9);
        },
    });

    const matrix = delegate.getCollisionWorldTransformFromUrdfTruth('/Robot/torso_link/collisions.proto_mesh_id0');

    assert.deepEqual(decomposeTranslation(matrix), [4, 5, 6]);
    assert.equal(delegate.getUrdfCollisionEntryForMeshId('/Robot/torso_link/collisions.proto_mesh_id0'), headCollisionEntry);
});
