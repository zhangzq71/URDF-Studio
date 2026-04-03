import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'three';

import { HydraMaterial } from './HydraMaterial.js';

function createTextureSource(onCloneDispose) {
    const sourceTexture = new Texture();
    sourceTexture.clone = () => {
        const clonedTexture = new Texture();
        clonedTexture.dispose = () => {
            onCloneDispose();
        };
        return clonedTexture;
    };
    return sourceTexture;
}

function buildMaterialNetworkUpdate(texturePath) {
    return [{
        networkId: '/Robot/Looks/TestNetwork',
        nodes: [
            {
                path: '/Robot/Looks/TestNetwork/PreviewSurface',
                parameters: {
                    roughness: 0.41,
                    metallic: 0.09,
                },
            },
            {
                path: '/Robot/Looks/TestNetwork/AlbedoTexture',
                parameters: {
                    resolvedPath: texturePath,
                },
            },
        ],
        relationships: [
            {
                inputId: '/Robot/Looks/TestNetwork/AlbedoTexture',
                outputId: '/Robot/Looks/TestNetwork/PreviewSurface',
                outputName: 'diffuseColor',
            },
        ],
    }];
}

test('HydraMaterial.applyNetworkUpdate reuses owned materials and disposes superseded texture clones', async () => {
    let firstCloneDisposeCount = 0;
    let secondCloneDisposeCount = 0;

    const firstSourceTexture = createTextureSource(() => {
        firstCloneDisposeCount += 1;
    });
    const secondSourceTexture = createTextureSource(() => {
        secondCloneDisposeCount += 1;
    });

    let activeSourceTexture = firstSourceTexture;
    const hydraInterface = {
        registry: {
            async getTexture() {
                return activeSourceTexture;
            },
        },
        createFallbackMaterialFromStage() {
            return null;
        },
    };

    const hydraMaterial = new HydraMaterial('/Robot/Looks/TestMaterial', hydraInterface);

    await hydraMaterial.applyNetworkUpdate(buildMaterialNetworkUpdate('/textures/albedo-a.png'));

    const firstMaterial = hydraMaterial._material;
    const firstAssignedMap = firstMaterial.map;

    assert.ok(firstAssignedMap, 'expected first network update to assign a cloned texture');

    activeSourceTexture = secondSourceTexture;
    await hydraMaterial.applyNetworkUpdate(buildMaterialNetworkUpdate('/textures/albedo-b.png'));

    assert.equal(hydraMaterial._material, firstMaterial);
    assert.notEqual(hydraMaterial._material.map, firstAssignedMap);
    assert.equal(firstCloneDisposeCount, 1);
    assert.equal(secondCloneDisposeCount, 0);
});
