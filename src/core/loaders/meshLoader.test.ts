import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { parseURDF } from '@/core/parsers/urdf/parser';

import {
    buildColladaRootNormalizationHints,
    buildAssetIndex,
    createMeshLoader,
    findAssetByIndex,
    findAssetByPath,
} from './index';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function getFirstRenderable(object: THREE.Object3D): THREE.Object3D {
    const first = object.children[0];
    assert.ok(first, 'expected Collada scene to contain a child object');
    return first;
}

function getFirstMesh(object: THREE.Object3D): THREE.Mesh {
    let found: THREE.Mesh | null = null;
    object.traverse((child) => {
        if (!found && (child as THREE.Mesh).isMesh) {
            found = child as THREE.Mesh;
        }
    });
    assert.ok(found, 'expected Collada scene to contain a mesh');
    return found;
}

test('createMeshLoader normalizes go2 Collada scene roots for unitree DAE assets', async () => {
    const meshPath = 'test/unitree_ros/robots/go2_description/dae/hip.dae';
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/go2_description/urdf/go2_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
    const manager = new THREE.LoadingManager();
    const loadMesh = createMeshLoader(
        {
            [meshPath]: meshDataUrl,
            'package://go2_description/dae/hip.dae': meshDataUrl,
            'hip.dae': meshDataUrl,
        },
        manager,
        '',
        { colladaRootNormalizationHints },
    );

    const loadedObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        loadMesh('package://go2_description/dae/hip.dae', manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

    assert.ok(Math.abs(loadedObject.rotation.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.w - 1) < 1e-6);
});

test('createMeshLoader normalizes go2 Collada scene roots for exported zip mesh paths', async () => {
    const meshPath = 'test/unitree_ros/robots/go2_description/dae/hip.dae';
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/go2_description/urdf/go2_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
    const manager = new THREE.LoadingManager();
    const loadMesh = createMeshLoader(
        {
            [meshPath]: meshDataUrl,
            'meshes/dae/hip.dae': meshDataUrl,
            'package://go2_description/meshes/dae/hip.dae': meshDataUrl,
            'hip.dae': meshDataUrl,
        },
        manager,
        '',
        { colladaRootNormalizationHints },
    );

    const loadedObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        loadMesh('package://go2_description/meshes/dae/hip.dae', manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

    assert.ok(Math.abs(loadedObject.rotation.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.w - 1) < 1e-6);
});

test('createMeshLoader keeps b2w Collada package meshes in Z-up robot space', async () => {
    const meshPath = 'test/unitree_ros/robots/b2w_description/meshes/RL_thigh.dae';
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/b2w_description/urdf/b2w_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
    const manager = new THREE.LoadingManager();
    const loadMesh = createMeshLoader(
        {
            [meshPath]: meshDataUrl,
            'package://b2w_description/meshes/RL_thigh.dae': meshDataUrl,
            'RL_thigh.dae': meshDataUrl,
        },
        manager,
        '',
        { colladaRootNormalizationHints },
    );

    const loadedObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        loadMesh('package://b2w_description/meshes/RL_thigh.dae', manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

    assert.ok(Math.abs(loadedObject.rotation.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.w - 1) < 1e-6);
});

test('createMeshLoader keeps b2 Collada package meshes in Z-up robot space', async () => {
    const meshPath = 'test/unitree_ros/robots/b2_description/meshes/RL_thigh.dae';
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/b2_description/urdf/b2_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
    const manager = new THREE.LoadingManager();
    const loadMesh = createMeshLoader(
        {
            [meshPath]: meshDataUrl,
            'package://b2_description/meshes/RL_thigh.dae': meshDataUrl,
            'RL_thigh.dae': meshDataUrl,
        },
        manager,
        '',
        { colladaRootNormalizationHints },
    );

    const loadedObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        loadMesh('package://b2_description/meshes/RL_thigh.dae', manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

    assert.ok(Math.abs(loadedObject.rotation.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.rotation.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.x) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.y) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.z) < 1e-6);
    assert.ok(Math.abs(loadedObject.quaternion.w - 1) < 1e-6);
});

test('findAssetByPath resolves package-prefixed b2w mesh paths against imported zip assets', () => {
    const assets = {
        'meshes/RR_thigh.dae': 'blob:rr-thigh',
    };

    assert.equal(
        findAssetByPath('/b2w_description/meshes/RR_thigh.dae', assets),
        'blob:rr-thigh',
    );
    assert.equal(
        findAssetByPath('b2w_description/meshes/RR_thigh.dae', assets),
        'blob:rr-thigh',
    );
});

test('findAssetByPath prefers exact b2w rear hip assets over generic hip aliases', () => {
    const assets = {
        'robots/b2w_description/meshes/hip.dae': 'blob:generic-hip',
        'robots/b2w_description/meshes/FL_hip.dae': 'blob:fl-hip',
        'robots/b2w_description/meshes/RL_hip.dae': 'blob:rl-hip',
        'robots/b2w_description/meshes/RR_hip.dae': 'blob:rr-hip',
    };

    assert.equal(
        findAssetByPath('/b2w_description/meshes/RL_hip.dae', assets, 'robots/b2w_description/urdf/'),
        'blob:rl-hip',
    );
    assert.equal(
        findAssetByPath('/b2w_description/meshes/RR_hip.dae', assets, 'robots/b2w_description/urdf/'),
        'blob:rr-hip',
    );
});

test('findAssetByIndex resolves package-prefixed b2w mesh paths against imported zip assets', () => {
    const assets = {
        'meshes/RR_thigh.dae': 'blob:rr-thigh',
    };
    const index = buildAssetIndex(assets);

    assert.equal(
        findAssetByIndex('/b2w_description/meshes/RR_thigh.dae', index),
        'blob:rr-thigh',
    );
    assert.equal(
        findAssetByIndex('b2w_description/meshes/RR_thigh.dae', index),
        'blob:rr-thigh',
    );
});

test('createMeshLoader keeps b2w rear hip mesh selection stable when generic hip assets are present', async () => {
    const urdfContent = fs.readFileSync('test/unitree_ros/robots/b2w_description/urdf/b2w_description.urdf', 'utf8');
    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(parseURDF(urdfContent).links);
    const flHip = fs.readFileSync('test/unitree_ros/robots/b2w_description/meshes/FL_hip.dae', 'utf8');
    const rlHip = fs.readFileSync('test/unitree_ros/robots/b2w_description/meshes/RL_hip.dae', 'utf8');
    const rrHip = fs.readFileSync('test/unitree_ros/robots/b2w_description/meshes/RR_hip.dae', 'utf8');
    const genericHip = fs.readFileSync('test/unitree_ros/robots/b2w_description/meshes/hip.dae', 'utf8');
    const manager = new THREE.LoadingManager();
    const loadMesh = createMeshLoader(
        {
            'robots/b2w_description/meshes/hip.dae': `data:text/xml;base64,${Buffer.from(genericHip).toString('base64')}`,
            'robots/b2w_description/meshes/FL_hip.dae': `data:text/xml;base64,${Buffer.from(flHip).toString('base64')}`,
            'robots/b2w_description/meshes/RL_hip.dae': `data:text/xml;base64,${Buffer.from(rlHip).toString('base64')}`,
            'robots/b2w_description/meshes/RR_hip.dae': `data:text/xml;base64,${Buffer.from(rrHip).toString('base64')}`,
        },
        manager,
        'robots/b2w_description/urdf/',
        { colladaRootNormalizationHints },
    );

    const loadMeshPath = (meshPath: string) => new Promise<THREE.Object3D>((resolve, reject) => {
        loadMesh(meshPath, manager, (result, err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

    const loadedRlHip = await loadMeshPath('/b2w_description/meshes/RL_hip.dae');
    const loadedRrHip = await loadMeshPath('/b2w_description/meshes/RR_hip.dae');

    assert.equal(getFirstMesh(loadedRlHip).name, 'object23.022');
    assert.equal(getFirstMesh(loadedRrHip).name, 'object23.021');
});
