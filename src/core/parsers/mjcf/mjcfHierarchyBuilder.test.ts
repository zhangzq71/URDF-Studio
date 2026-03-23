import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { buildMJCFHierarchy } from './mjcfHierarchyBuilder.ts';

test('applies texture-backed material assets to generated visual meshes', async (t) => {
  const originalLoadAsync = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = async function mockLoadAsync(
    _url: string,
    _onProgress?: (event: ProgressEvent<EventTarget>) => void,
  ): Promise<THREE.Texture<HTMLImageElement>> {
    const texture = new THREE.Texture() as THREE.Texture<HTMLImageElement>;
    texture.needsUpdate = true;
    return texture;
  };
    t.after(() => {
        THREE.TextureLoader.prototype.loadAsync = originalLoadAsync;
    });

    const rootGroup = new THREE.Group();
    await buildMJCFHierarchy({
        bodies: [
            {
                name: 'world',
                pos: [0, 0, 0],
                geoms: [],
                joints: [],
                children: [
                    {
                        name: 'base',
                        pos: [0, 0, 0],
                        geoms: [
                            {
                                name: 'body-shell',
                                type: 'box',
                                size: [0.1, 0.1, 0.1],
                                material: 'carbon_fibre',
                                contype: 0,
                                conaffinity: 0,
                            },
                        ],
                        joints: [],
                        children: [],
                    },
                ],
            },
        ],
        rootGroup,
        meshMap: new Map(),
        assets: {
            'assets/carbon.png': 'mock://assets/carbon.png',
        },
        meshCache: new Map(),
        compilerSettings: {
            angleUnit: 'radian',
            meshdir: '',
            texturedir: 'assets',
            eulerSequence: 'xyz',
        },
        materialMap: new Map([
            ['carbon_fibre', {
                name: 'carbon_fibre',
                texture: 'carbon',
                texrepeat: [2, 3],
                shininess: 1,
                reflectance: 0.4,
            }],
        ]),
        textureMap: new Map([
            ['carbon', {
                name: 'carbon',
                file: 'assets/carbon.png',
                type: '2d',
            }],
        ]),
        sourceFileDir: '',
    });

    let visualMaterial: THREE.MeshStandardMaterial | null = null;
    rootGroup.traverse((child) => {
        if (!('isMesh' in child) || !(child as any).isMesh) {
            return;
        }

        const mesh = child as THREE.Mesh;
        if (mesh.userData.isVisualMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
            visualMaterial = mesh.material;
        }
    });

    assert.ok(visualMaterial);
    assert.equal(visualMaterial.name, 'carbon_fibre');
    assert.ok(visualMaterial.map instanceof THREE.Texture);
    assert.equal(visualMaterial.map.repeat.x, 2);
    assert.equal(visualMaterial.map.repeat.y, 3);
    assert.equal(visualMaterial.roughness, 0);
    assert.equal(visualMaterial.metalness, 0.4);
});

test('does not let inherited geom rgba override material asset colors', async () => {
    const rootGroup = new THREE.Group();
    await buildMJCFHierarchy({
        bodies: [
            {
                name: 'world',
                pos: [0, 0, 0],
                geoms: [],
                joints: [],
                children: [
                    {
                        name: 'base',
                        pos: [0, 0, 0],
                        geoms: [
                            {
                                name: 'body-shell',
                                type: 'box',
                                size: [0.1, 0.1, 0.1],
                                material: 'steel_mat',
                                rgba: [0.8, 0.6, 0.4, 1],
                                hasExplicitRgba: false,
                                contype: 0,
                                conaffinity: 0,
                            } as any,
                        ],
                        joints: [],
                        children: [],
                    },
                ],
            },
        ],
        rootGroup,
        meshMap: new Map(),
        assets: {},
        meshCache: new Map(),
        compilerSettings: {
            angleUnit: 'radian',
            meshdir: '',
            texturedir: '',
            eulerSequence: 'xyz',
        },
        materialMap: new Map([
            ['steel_mat', {
                name: 'steel_mat',
                rgba: [0.1, 0.2, 0.3, 1],
            }],
        ]),
        textureMap: new Map(),
        sourceFileDir: '',
    });

    let visualMaterial: THREE.MeshStandardMaterial | null = null;
    rootGroup.traverse((child) => {
        if (!('isMesh' in child) || !(child as any).isMesh) {
            return;
        }

        const mesh = child as THREE.Mesh;
        if (mesh.userData.isVisualMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
            visualMaterial = mesh.material;
        }
    });

    assert.ok(visualMaterial);
    assert.ok(Math.abs(visualMaterial.color.r - 0.1) < 1e-6);
    assert.ok(Math.abs(visualMaterial.color.g - 0.2) < 1e-6);
    assert.ok(Math.abs(visualMaterial.color.b - 0.3) < 1e-6);
});

test('keeps collision proxy geoms out of runtime visuals when a dedicated visual geom exists', async () => {
    const rootGroup = new THREE.Group();
    await buildMJCFHierarchy({
        bodies: [
            {
                name: 'world',
                pos: [0, 0, 0],
                geoms: [],
                joints: [],
                children: [
                    {
                        name: 'base_link',
                        pos: [0, 0, 0],
                        geoms: [
                            {
                                name: 'base_visual',
                                type: 'box',
                                size: [0.1, 0.1, 0.1],
                                group: 1,
                                contype: 0,
                                conaffinity: 0,
                            },
                            {
                                name: 'base_collision',
                                type: 'box',
                                size: [0.2, 0.15, 0.15],
                                pos: [0, 0, 0.08],
                            },
                        ],
                        joints: [],
                        children: [],
                    },
                ],
            },
        ],
        rootGroup,
        meshMap: new Map(),
        assets: {},
        meshCache: new Map(),
        compilerSettings: {
            angleUnit: 'radian',
            meshdir: '',
            texturedir: '',
            eulerSequence: 'xyz',
        },
        materialMap: new Map(),
        textureMap: new Map(),
        sourceFileDir: '',
    });

    const visualGroups: string[] = [];
    const collisionGroups: string[] = [];

    rootGroup.traverse((child: any) => {
        if (child.isURDFVisual) {
            visualGroups.push(child.name);
        }

        if (child.isURDFCollider) {
            collisionGroups.push(child.name);
        }
    });

    assert.deepEqual(visualGroups, ['base_visual']);
    assert.deepEqual(collisionGroups, ['base_collision']);
});
