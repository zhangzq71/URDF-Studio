import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshPhysicalMaterial, Texture } from 'three';

import { ThreeRenderDelegateCore } from './ThreeRenderDelegateCore.js';
import { getDefaultMaterial, setDefaultMaterial } from './default-material-state.js';
import {
    getActiveMaterialBindingWarningOwner,
    materialBindingWarningHandlers,
    registerMaterialBindingApiWarningHandler,
    setActiveMaterialBindingWarningOwner,
} from './shared-basic.js';

test('ThreeRenderDelegateCore.dispose unregisters material binding warning state', () => {
    const delegate = Object.create(ThreeRenderDelegateCore.prototype);
    const handler = () => false;

    delegate._materialBindingWarningHandler = handler;
    delegate._materialBindingWarningSummaryTimer = null;

    setActiveMaterialBindingWarningOwner(delegate);
    registerMaterialBindingApiWarningHandler(handler);

    assert.equal(materialBindingWarningHandlers.has(handler), true);
    assert.equal(getActiveMaterialBindingWarningOwner(), delegate);

    try {
        delegate.dispose();
        assert.equal(materialBindingWarningHandlers.has(handler), false);
        assert.equal(getActiveMaterialBindingWarningOwner(), null);
    } finally {
        materialBindingWarningHandlers.delete(handler);
        if (getActiveMaterialBindingWarningOwner() === delegate) {
            setActiveMaterialBindingWarningOwner(null);
        }
    }
});

test('ThreeRenderDelegateCore.dispose deletes cached guide stages before clearing them', () => {
    const delegate = Object.create(ThreeRenderDelegateCore.prototype);
    const previousUsd = globalThis.USD;
    let flushCount = 0;
    let deletedCount = 0;

    delegate._openedGuideStages = new Map([
        ['/a.usd', { delete() { deletedCount += 1; } }],
        ['/b.usd', { delete() { deletedCount += 1; } }],
    ]);

    Object.defineProperty(globalThis, 'USD', {
        value: {
            flushPendingDeletes() {
                flushCount += 1;
            },
        },
        configurable: true,
        writable: true,
    });

    try {
        delegate.dispose();
        assert.equal(deletedCount, 2);
        assert.equal(flushCount, 2);
        assert.equal(delegate._openedGuideStages.size, 0);
    } finally {
        if (previousUsd === undefined) {
            delete globalThis.USD;
        } else {
            Object.defineProperty(globalThis, 'USD', {
                value: previousUsd,
                configurable: true,
                writable: true,
            });
        }
    }
});

test('ThreeRenderDelegateCore.dispose releases orphan hydra materials without touching usdRoot-bound or default materials', () => {
    const delegate = Object.create(ThreeRenderDelegateCore.prototype);
    const usdRoot = new Group();
    const previousDefaultMaterial = getDefaultMaterial();

    let boundMaterialDisposeCount = 0;
    let boundTextureDisposeCount = 0;
    let orphanMaterialDisposeCount = 0;
    let orphanTextureDisposeCount = 0;
    let snapshotMaterialDisposeCount = 0;
    let snapshotTextureDisposeCount = 0;
    let defaultMaterialDisposeCount = 0;

    const createTrackedTexture = (onDispose) => {
        const texture = new Texture();
        texture.dispose = () => {
            onDispose();
        };
        return texture;
    };

    const createTrackedMaterial = (texture, onDispose) => {
        const material = new MeshPhysicalMaterial({ map: texture });
        material.dispose = () => {
            onDispose();
        };
        return material;
    };

    const boundMaterial = createTrackedMaterial(
        createTrackedTexture(() => {
            boundTextureDisposeCount += 1;
        }),
        () => {
            boundMaterialDisposeCount += 1;
        },
    );
    const orphanMaterial = createTrackedMaterial(
        createTrackedTexture(() => {
            orphanTextureDisposeCount += 1;
        }),
        () => {
            orphanMaterialDisposeCount += 1;
        },
    );
    const snapshotMaterial = createTrackedMaterial(
        createTrackedTexture(() => {
            snapshotTextureDisposeCount += 1;
        }),
        () => {
            snapshotMaterialDisposeCount += 1;
        },
    );
    const defaultMaterial = new MeshPhysicalMaterial();
    defaultMaterial.dispose = () => {
        defaultMaterialDisposeCount += 1;
    };
    setDefaultMaterial(defaultMaterial);

    usdRoot.add(new Mesh(new BoxGeometry(1, 1, 1), boundMaterial));

    const orphanWrapper = { _material: orphanMaterial };

    delegate.config = { usdRoot };
    delegate.registry = { dispose() { } };
    delegate.materials = {
        '/Looks/bound': { _material: boundMaterial },
        '/Looks/default': { _material: defaultMaterial },
        '/Looks/orphan': orphanWrapper,
        '/Looks/orphan_alias': orphanWrapper,
    };
    delegate._stageFallbackMaterialCache = new Map();
    delegate._snapshotFallbackMaterialCache = new Map([
        ['/Looks/snapshot', { _material: snapshotMaterial }],
    ]);
    delegate._openedGuideStages = new Map();
    delegate._materialBindingWarningSummaryTimer = null;
    delegate._materialBindingWarningHandler = null;
    delegate.enableHydraPhaseInstrumentation = false;
    delegate._disposed = false;

    try {
        delegate.dispose();

        assert.equal(boundMaterialDisposeCount, 0);
        assert.equal(boundTextureDisposeCount, 0);
        assert.equal(orphanMaterialDisposeCount, 1);
        assert.equal(orphanTextureDisposeCount, 1);
        assert.equal(snapshotMaterialDisposeCount, 1);
        assert.equal(snapshotTextureDisposeCount, 1);
        assert.equal(defaultMaterialDisposeCount, 0);
    } finally {
        setDefaultMaterial(previousDefaultMaterial);
    }
});
