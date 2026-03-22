import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import {
    buildColladaRootNormalizationHints,
    createLoadingManager,
    createMeshLoader,
} from '@/core/loaders';
import { parseURDF } from '@/core/parsers/urdf/parser';
import { URDFLoader } from './URDFLoader';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.Document = dom.window.Document as typeof Document;
globalThis.Element = dom.window.Element as typeof Element;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function getWorldBox(object: THREE.Object3D) {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
}

function expectBoxEquals(actual: THREE.Box3, expected: THREE.Box3, epsilon = 1e-6) {
    const actualMin = actual.min.toArray();
    const expectedMin = expected.min.toArray();
    const actualMax = actual.max.toArray();
    const expectedMax = expected.max.toArray();

    actualMin.forEach((value, index) => {
        assert.ok(Math.abs(value - expectedMin[index]) < epsilon);
    });
    actualMax.forEach((value, index) => {
        assert.ok(Math.abs(value - expectedMax[index]) < epsilon);
    });
}

test('URDFLoader applies local visual material to nested mesh groups', () => {
    const loader = new URDFLoader();
    loader.loadMeshCb = (_url, _manager, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshPhongMaterial({ color: new THREE.Color(1, 1, 1) }),
        );
        group.add(mesh);
        onLoad(group);
    };

    const robot = loader.parse(`<?xml version="1.0"?>
<robot name="material_group">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="link.obj" />
      </geometry>
      <material name="base_link_mat">
        <color rgba="0.1 0.2 0.3 1" />
      </material>
    </visual>
  </link>
</robot>`, '/tmp/');

    let nestedMesh: THREE.Mesh | null = null;
    robot.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !nestedMesh) {
            nestedMesh = child as THREE.Mesh;
        }
    });

    assert.ok(nestedMesh);
    const material = nestedMesh.material as THREE.MeshPhongMaterial;
    assert.equal(material.name, 'base_link_mat');
    assert.deepEqual(material.color.toArray().map((value) => Number(value.toFixed(4))), [0.1, 0.2, 0.3]);
});

test('URDFLoader preserves named mesh materials for multi-material DAE groups', () => {
    const loader = new URDFLoader();
    loader.loadMeshCb = (_url, _manager, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            [
                new THREE.MeshPhongMaterial({ name: '磨砂铝合金.008', color: new THREE.Color(1, 0, 0) }),
                new THREE.MeshPhongMaterial({ name: '灰色硅胶.009', color: new THREE.Color(0, 1, 0) }),
            ],
        );
        group.add(mesh);
        onLoad(group);
    };

    const robot = loader.parse(`<?xml version="1.0"?>
<robot name="material_group">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="link.dae" />
      </geometry>
      <material name="磨砂铝合金_008-effect">
        <color rgba="0.2 0.2 0.2 1" />
      </material>
      <material name="灰色硅胶_009-effect">
        <color rgba="0.6 0.6 0.6 1" />
      </material>
    </visual>
  </link>
</robot>`, '/tmp/');

    let nestedMesh: THREE.Mesh | null = null;
    robot.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !nestedMesh) {
            nestedMesh = child as THREE.Mesh;
        }
    });

    assert.ok(nestedMesh);
    assert.ok(Array.isArray(nestedMesh.material));
    const materialNames = (nestedMesh.material as THREE.Material[]).map((material) => material.name);
    assert.deepEqual(materialNames, ['磨砂铝合金.008', '灰色硅胶.009']);
});

test('URDFLoader overrides single named OBJ materials when URDF provides the export color', () => {
    const loader = new URDFLoader();
    loader.loadMeshCb = (_url, _manager, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshPhongMaterial({ name: 'material_0', color: new THREE.Color(0.5, 0.5, 0.5) }),
        );
        group.add(mesh);
        onLoad(group);
    };

    const robot = loader.parse(`<?xml version="1.0"?>
<robot name="single_named_obj_material">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="link.obj" />
      </geometry>
      <material name="exported_color">
        <color rgba="0.82 0.15 0.15 1" />
      </material>
    </visual>
  </link>
</robot>`, '/tmp/');

    let nestedMesh: THREE.Mesh | null = null;
    robot.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !nestedMesh) {
            nestedMesh = child as THREE.Mesh;
        }
    });

    assert.ok(nestedMesh);
    const material = nestedMesh.material as THREE.MeshPhongMaterial;
    assert.equal(material.name, 'exported_color');
    assert.deepEqual(material.color.toArray().map((value) => Number(value.toFixed(2))), [0.82, 0.15, 0.15]);
});

test('URDFLoader preserves Z-up semantics for b2w base_link Collada meshes before link attachment', async () => {
    const meshPath = 'test/unitree_ros/robots/b2w_description/meshes/base_link.dae';
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/b2w_description/urdf/b2w_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
    const manager = createLoadingManager({
        [meshPath]: meshDataUrl,
        'package://b2w_description/meshes/base_link.dae': meshDataUrl,
        '/tmp/base_link.dae': meshDataUrl,
        'base_link.dae': meshDataUrl,
    });

    const meshLoader = createMeshLoader(
        {
            [meshPath]: meshDataUrl,
            'package://b2w_description/meshes/base_link.dae': meshDataUrl,
            '/tmp/base_link.dae': meshDataUrl,
            'base_link.dae': meshDataUrl,
        },
        manager,
        '',
        { colladaRootNormalizationHints },
    );

    const referenceObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        meshLoader('package://b2w_description/meshes/base_link.dae', manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });
    const referenceBox = getWorldBox(referenceObject);

    const loader = new URDFLoader(manager);
    loader.loadMeshCb = meshLoader;

    const robot = loader.parse(`<?xml version="1.0"?>
<robot name="b2w_base_link">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://b2w_description/meshes/base_link.dae" />
      </geometry>
    </visual>
  </link>
</robot>`, '/tmp/');

    const visualGroup = robot.children.find((child) => (child as any).isURDFVisual) as THREE.Object3D | undefined;
    assert.ok(visualGroup);

    for (let attempt = 0; attempt < 100 && visualGroup.children.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const loadedMeshRoot = visualGroup.children[0];
    assert.ok(loadedMeshRoot);
    assert.ok(Math.abs(loadedMeshRoot.rotation.x - referenceObject.rotation.x) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.rotation.y - referenceObject.rotation.y) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.rotation.z - referenceObject.rotation.z) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.x - referenceObject.quaternion.x) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.y - referenceObject.quaternion.y) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.z - referenceObject.quaternion.z) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.w - referenceObject.quaternion.w) < 1e-6);
    expectBoxEquals(getWorldBox(loadedMeshRoot), referenceBox);
});

test('URDFLoader preserves Z-up semantics for b2 base_link Collada meshes before link attachment', async () => {
    const meshPath = 'test/unitree_ros/robots/b2_description/meshes/base_link.dae';
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/b2_description/urdf/b2_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
    const manager = createLoadingManager({
        [meshPath]: meshDataUrl,
        'package://b2_description/meshes/base_link.dae': meshDataUrl,
        '/tmp/base_link.dae': meshDataUrl,
        'base_link.dae': meshDataUrl,
    });

    const meshLoader = createMeshLoader(
        {
            [meshPath]: meshDataUrl,
            'package://b2_description/meshes/base_link.dae': meshDataUrl,
            '/tmp/base_link.dae': meshDataUrl,
            'base_link.dae': meshDataUrl,
        },
        manager,
        '',
        { colladaRootNormalizationHints },
    );

    const referenceObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        meshLoader('package://b2_description/meshes/base_link.dae', manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });
    const referenceBox = getWorldBox(referenceObject);

    const loader = new URDFLoader(manager);
    loader.loadMeshCb = meshLoader;

    const robot = loader.parse(`<?xml version="1.0"?>
<robot name="b2_base_link">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://b2_description/meshes/base_link.dae" />
      </geometry>
    </visual>
  </link>
</robot>`, '/tmp/');

    const visualGroup = robot.children.find((child) => (child as any).isURDFVisual) as THREE.Object3D | undefined;
    assert.ok(visualGroup);

    for (let attempt = 0; attempt < 100 && visualGroup.children.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const loadedMeshRoot = visualGroup.children[0];
    assert.ok(loadedMeshRoot);
    assert.ok(Math.abs(loadedMeshRoot.rotation.x - referenceObject.rotation.x) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.rotation.y - referenceObject.rotation.y) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.rotation.z - referenceObject.rotation.z) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.x - referenceObject.quaternion.x) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.y - referenceObject.quaternion.y) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.z - referenceObject.quaternion.z) < 1e-6);
    assert.ok(Math.abs(loadedMeshRoot.quaternion.w - referenceObject.quaternion.w) < 1e-6);
    expectBoxEquals(getWorldBox(loadedMeshRoot), referenceBox);
});
