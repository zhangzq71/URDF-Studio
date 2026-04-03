import test from 'node:test';
import assert from 'node:assert/strict';

import { LinkRotationController } from './link-rotation.js';

function createRenderInterface() {
    return {
        meshes: {
            '/Robot/arm_link/visuals.proto_mesh_id0': {},
        },
    };
}

test('LinkRotationController schedules joint catalog builds and reports ready on success', async () => {
    const controller = new LinkRotationController();
    controller.setRenderInterface(createRenderInterface());
    controller.buildJointCatalog = async function () {
        this.jointCatalogByLinkPath.set('/Robot/arm_link', {
            linkPath: '/Robot/arm_link',
        });
    };

    const buildPromise = controller.startJointCatalogBuildIfNeeded();

    assert.ok(buildPromise instanceof Promise);
    await buildPromise;

    assert.equal(controller.jointCatalogStatus, 'ready');
    assert.equal(controller.jointCatalogError, null);
    assert.equal(controller.jointCatalogBuildPromise, null);
    assert.equal(controller.jointCatalogByLinkPath.size, 1);
});

test('LinkRotationController exposes build failures as catalog errors', async () => {
    const controller = new LinkRotationController();
    controller.setRenderInterface(createRenderInterface());
    controller.buildJointCatalog = async function () {
        throw new Error('joint-catalog-build-failed');
    };

    await assert.rejects(
        controller.startJointCatalogBuildIfNeeded(),
        /joint-catalog-build-failed/,
    );

    assert.equal(controller.jointCatalogStatus, 'error');
    assert.equal(controller.jointCatalogError, 'joint-catalog-build-failed');
    assert.equal(controller.jointCatalogBuildPromise, null);
});

test('LinkRotationController does not swallow joint catalog readiness failures', async () => {
    const controller = new LinkRotationController();
    controller.startJointCatalogBuildIfNeeded = () => Promise.reject(new Error('joint-ready-failed'));

    await assert.rejects(
        controller.ensureJointCatalogReady(),
        /joint-ready-failed/,
    );
});

test('LinkRotationController logs joint catalog prewarm failures instead of silently swallowing them', async () => {
    const controller = new LinkRotationController();
    controller.ensureJointCatalogBuildScheduled = () => {};
    controller.ensureJointCatalogReady = async () => {
        throw new Error('joint-catalog-prewarm-failed');
    };

    const originalConsoleError = console.error;
    const loggedErrors = [];
    console.error = (...args) => {
        loggedErrors.push(args);
    };

    try {
        await controller.prewarmJointCatalog();
    }
    finally {
        console.error = originalConsoleError;
    }

    assert.equal(loggedErrors.length, 1);
    assert.match(String(loggedErrors[0]?.[0] || ''), /Failed to prewarm joint catalog/);
});

test('LinkRotationController logs joint pose prewarm failures instead of silently swallowing them', () => {
    const controller = new LinkRotationController();
    controller.enabled = true;
    controller.renderInterface = createRenderInterface();
    controller.apply = () => {
        throw new Error('joint-pose-prewarm-failed');
    };

    const originalConsoleError = console.error;
    const loggedErrors = [];
    console.error = (...args) => {
        loggedErrors.push(args);
    };

    try {
        controller.prewarmJointPosePipeline();
    }
    finally {
        console.error = originalConsoleError;
    }

    assert.equal(loggedErrors.length, 1);
    assert.match(String(loggedErrors[0]?.[0] || ''), /Failed to prewarm joint pose pipeline/);
});

test('LinkRotationController surfaces cached metadata getter failures as catalog build errors', async () => {
    const controller = new LinkRotationController();
    controller.setRenderInterface({
        meshes: {
            '/Robot/arm_link/visuals.proto_mesh_id0': {},
        },
        getCachedRobotMetadataSnapshot() {
            throw new Error('cached-metadata-crashed');
        },
    });

    await assert.rejects(
        controller.startJointCatalogBuildIfNeeded(),
        /Failed to read cached render robot metadata snapshot/,
    );

    assert.equal(controller.jointCatalogStatus, 'error');
    assert.match(String(controller.jointCatalogError || ''), /Failed to read cached render robot metadata snapshot/);
});
