import test from 'node:test';
import assert from 'node:assert/strict';
import { BackSide, BoxGeometry, DoubleSide, FrontSide, Group, MeshPhysicalMaterial } from 'three';

import { isCoplanarOffsetMaterial } from '../../../../../core/loaders/coplanarMaterialOffset.ts';
import { HydraMesh } from './HydraMesh.js';

const createHydraInterfaceStub = () => ({
    config: {
        usdRoot: new Group(),
    },
    meshes: {},
    materials: {},
    _preferredVisualMaterialByLinkCache: new Map(),
    resolveMaterialIdForMesh(materialId) {
        return materialId;
    },
    getOrCreateMaterialById(materialId) {
        return this.materials[materialId] || null;
    },
    getPreferredVisualMaterialForLink() {
        return null;
    },
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

test('HydraMesh stabilizes coincident visual proto meshes on the same link', () => {
    const hydraInterface = createHydraInterfaceStub();
    hydraInterface.materials['/Looks/Inner'] = {
        _material: new MeshPhysicalMaterial({ name: 'inner_shell', color: 0xffffff }),
    };
    hydraInterface.materials['/Looks/Outer'] = {
        _material: new MeshPhysicalMaterial({ name: 'outer_shell', color: 0x111111 }),
    };

    const innerMesh = new HydraMesh('Mesh', '/Robot/base_link/visuals.proto_mesh_id0', hydraInterface);
    const outerMesh = new HydraMesh('Mesh', '/Robot/base_link/visuals.proto_mesh_id1', hydraInterface);
    hydraInterface.meshes[innerMesh._id] = innerMesh;
    hydraInterface.meshes[outerMesh._id] = outerMesh;

    innerMesh._mesh.geometry = new BoxGeometry(1, 1, 1);
    outerMesh._mesh.geometry = new BoxGeometry(1, 1, 1);
    outerMesh._mesh.scale.setScalar(1.02);
    innerMesh._mesh.updateMatrixWorld(true);
    outerMesh._mesh.updateMatrixWorld(true);

    innerMesh.setMaterial('/Looks/Inner');
    outerMesh.setMaterial('/Looks/Outer');

    const resolvedInnerMaterial = Array.isArray(innerMesh._mesh.material)
        ? innerMesh._mesh.material[0]
        : innerMesh._mesh.material;
    const resolvedOuterMaterial = Array.isArray(outerMesh._mesh.material)
        ? outerMesh._mesh.material[0]
        : outerMesh._mesh.material;

    assert.equal(innerMesh._mesh.renderOrder, 0);
    assert.equal(outerMesh._mesh.renderOrder, 1);
    assert.equal(resolvedInnerMaterial?.polygonOffset, false);
    assert.equal(resolvedOuterMaterial?.polygonOffset, true);
});

test('HydraMesh restacks repeated Unitree-style visual shells idempotently', () => {
    const hydraInterface = createHydraInterfaceStub();
    hydraInterface.materials['/Looks/Inner'] = {
        _material: new MeshPhysicalMaterial({ name: 'unitree_inner', color: 0xffffff }),
    };
    hydraInterface.materials['/Looks/Outer'] = {
        _material: new MeshPhysicalMaterial({ name: 'unitree_outer', color: 0x111111 }),
    };

    const innerMesh = new HydraMesh('Mesh', '/go2_description/base_link/visuals.proto_mesh_id0', hydraInterface);
    const outerMesh = new HydraMesh('Mesh', '/go2_description/base_link/visuals.proto_mesh_id1', hydraInterface);
    hydraInterface.meshes[innerMesh._id] = innerMesh;
    hydraInterface.meshes[outerMesh._id] = outerMesh;

    innerMesh._mesh.geometry = new BoxGeometry(1, 1, 1);
    outerMesh._mesh.geometry = new BoxGeometry(1, 1, 1);
    outerMesh._mesh.scale.setScalar(1.02);
    innerMesh._mesh.updateMatrixWorld(true);
    outerMesh._mesh.updateMatrixWorld(true);

    innerMesh.setMaterial('/Looks/Inner');
    outerMesh.setMaterial('/Looks/Outer');
    outerMesh.restackSiblingVisualProtoMeshes('/go2_description/base_link');
    innerMesh.restackSiblingVisualProtoMeshes('/go2_description/base_link');

    const resolvedInnerMaterial = Array.isArray(innerMesh._mesh.material)
        ? innerMesh._mesh.material[0]
        : innerMesh._mesh.material;
    const resolvedOuterMaterial = Array.isArray(outerMesh._mesh.material)
        ? outerMesh._mesh.material[0]
        : outerMesh._mesh.material;

    assert.equal(innerMesh._mesh.renderOrder, 0);
    assert.equal(outerMesh._mesh.renderOrder, 1);
    assert.equal(isCoplanarOffsetMaterial(resolvedInnerMaterial), false);
    assert.equal(isCoplanarOffsetMaterial(resolvedOuterMaterial), true);
});
