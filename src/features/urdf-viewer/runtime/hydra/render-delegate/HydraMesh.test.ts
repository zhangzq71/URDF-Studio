import test from 'node:test';
import assert from 'node:assert/strict';
import { BackSide, DoubleSide, FrontSide, Group } from 'three';

import { HydraMesh } from './HydraMesh.js';

const createHydraInterfaceStub = () => ({
    config: {
        usdRoot: new Group(),
    },
    materials: {},
});

test('HydraMesh defaults to front-face culling and honors sidedness updates', () => {
    const hydraMesh = new HydraMesh('Mesh', '/robot/base_link/mesh', createHydraInterfaceStub());
    const material = Array.isArray(hydraMesh._mesh.material)
        ? hydraMesh._mesh.material[0]
        : hydraMesh._mesh.material;

    assert.ok(material);
    assert.equal(material.side, FrontSide);

    hydraMesh.setDoubleSided(true);
    assert.equal(material.side, DoubleSide);

    hydraMesh.setCullStyle('front');
    assert.equal(material.side, BackSide);

    hydraMesh.setCullStyle('backUnlessDoubleSided');
    assert.equal(material.side, DoubleSide);

    hydraMesh.setDoubleSided(false);
    assert.equal(material.side, FrontSide);

    hydraMesh.setCullStyle('nothing');
    assert.equal(material.side, DoubleSide);
});
