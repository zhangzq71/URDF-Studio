import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { buildMJCFHierarchy } from './mjcfHierarchyBuilder.ts';

function toFixedColorArray(color: THREE.Color, digits = 4): number[] {
    return color.toArray().map((value) => Number(value.toFixed(digits)));
}

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
    assert.deepEqual(toFixedColorArray(visualMaterial.color), toFixedColorArray(new THREE.Color(0xffffff)));
    assert.equal(visualMaterial.toneMapped, false);
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
    const expected = new THREE.Color().setRGB(0.1, 0.2, 0.3, THREE.SRGBColorSpace);
    assert.deepEqual(toFixedColorArray(visualMaterial.color), toFixedColorArray(expected));
    assert.equal(visualMaterial.toneMapped, false);
    assert.equal(visualMaterial.opacity, 1);
    assert.equal(visualMaterial.transparent, false);
});

test('inherits geom alpha onto material asset opacity without overriding asset rgb', async () => {
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
                                rgba: [0.8, 0.6, 0.4, 0.25],
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
    const expected = new THREE.Color().setRGB(0.1, 0.2, 0.3, THREE.SRGBColorSpace);
    assert.deepEqual(toFixedColorArray(visualMaterial.color), toFixedColorArray(expected));
    assert.equal(visualMaterial.transparent, true);
    assert.ok(Math.abs(visualMaterial.opacity - 0.25) < 1e-9);
    assert.equal(visualMaterial.depthWrite, false);
});

test('skips rendering fully transparent inherited material-backed geoms', async () => {
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
                                name: 'hidden_inertial_proxy',
                                type: 'box',
                                size: [0.1, 0.1, 0.1],
                                material: 'body_mat',
                                rgba: [0, 0, 0, 0],
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
            ['body_mat', {
                name: 'body_mat',
                rgba: [0.7, 0.4, 0.2, 1],
            }],
        ]),
        textureMap: new Map(),
        sourceFileDir: '',
    });

    const visualGroups: string[] = [];
    rootGroup.traverse((child: any) => {
        if (child?.isURDFVisual) {
            visualGroups.push(child.name);
        }
    });

    assert.deepEqual(visualGroups, []);
});

test('interprets explicit MJCF geom rgba values as sRGB to match URDF imports', async () => {
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
                                rgba: [1, 0.4235294118, 0.0392156863, 1],
                                hasExplicitRgba: true,
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
    const expected = new THREE.Color().setRGB(1, 0.4235294118, 0.0392156863, THREE.SRGBColorSpace);
    assert.deepEqual(toFixedColorArray(visualMaterial.color), toFixedColorArray(expected));
    assert.equal(visualMaterial.toneMapped, false);
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

test('restacks coincident MJCF visual roots to preserve authored overlay order', async () => {
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
                        name: 'wing_link',
                        pos: [0, 0, 0],
                        geoms: [
                            {
                                name: 'wing_brown',
                                type: 'box',
                                size: [0.1, 0.05, 0.001],
                                pos: [0.01, 0.02, 0.03],
                                quat: [1, 0, 0, 0],
                                contype: 0,
                                conaffinity: 0,
                            },
                            {
                                name: 'wing_membrane',
                                type: 'box',
                                size: [0.1, 0.05, 0.001],
                                pos: [0.01, 0.02, 0.03],
                                quat: [1, 0, 0, 0],
                                rgba: [0.539, 0.686, 0.8, 0.4],
                                hasExplicitRgba: true,
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

    const visualGroups = new Map<string, THREE.Object3D>();
    rootGroup.traverse((child: any) => {
        if (child?.isURDFVisual) {
            visualGroups.set(child.name, child);
        }
    });

    const wingBrown = visualGroups.get('wing_brown');
    const wingMembrane = visualGroups.get('wing_membrane');
    assert.ok(wingBrown);
    assert.ok(wingMembrane);
    assert.equal(wingBrown.userData.visualStackIndex, 0);
    assert.equal(wingMembrane.userData.visualStackIndex, 1);

    const membraneMesh = wingMembrane.children.find((child: any) => child?.isMesh) as THREE.Mesh | undefined;
    assert.ok(membraneMesh);
    assert.equal(membraneMesh.renderOrder, 1);
    assert.ok(membraneMesh.material instanceof THREE.MeshStandardMaterial);
    assert.equal(membraneMesh.material.polygonOffset, true);
    assert.equal(membraneMesh.material.transparent, true);
    assert.equal(membraneMesh.material.depthWrite, false);
});

test('reports geom build progress while constructing the hierarchy', async () => {
    const rootGroup = new THREE.Group();
    const progressUpdates: Array<[number, number]> = [];

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
                                contype: 0,
                                conaffinity: 0,
                            },
                            {
                                name: 'base_collision',
                                type: 'sphere',
                                size: [0.12],
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
        onProgress: ({ processedGeoms, totalGeoms }) => {
            progressUpdates.push([processedGeoms, totalGeoms]);
        },
    });

    assert.deepEqual(progressUpdates, [
        [0, 2],
        [1, 2],
        [2, 2],
    ]);
});

test('tracks MJCF joint ref values without double-applying them to runtime joint transforms', async () => {
    const rootGroup = new THREE.Group();
    const { jointsMap, linksMap } = await buildMJCFHierarchy({
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
                        geoms: [],
                        joints: [],
                        children: [
                            {
                                name: 'knee_link',
                                pos: [0, 0, 0],
                                geoms: [
                                    {
                                        name: 'knee_visual',
                                        type: 'box',
                                        size: [0.1, 0.1, 0.1],
                                        contype: 0,
                                        conaffinity: 0,
                                    },
                                ],
                                joints: [
                                    {
                                        name: 'knee_joint',
                                        type: 'hinge',
                                        axis: [0, 0, 1],
                                        ref: Math.PI / 4,
                                    },
                                ],
                                children: [],
                            },
                        ],
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

    const joint = jointsMap.knee_joint as THREE.Object3D & {
        angle?: number;
        jointValue?: number;
        referencePosition?: number;
    };
    assert.ok(joint);
    assert.ok(Math.abs((joint.angle ?? 0) - Math.PI / 4) < 1e-9);
    assert.equal(joint.jointValue, Math.PI / 4);
    assert.equal(joint.referencePosition, Math.PI / 4);

    const expectedQuaternion = new THREE.Quaternion();
    const actualQuaternion = joint.quaternion.clone().normalize();
    assert.ok(actualQuaternion.angleTo(expectedQuaternion) <= 1e-9);

    const kneeLink = linksMap.knee_link as THREE.Object3D;
    assert.ok(kneeLink);
    const kneeLinkQuaternion = kneeLink.quaternion.clone().normalize();
    assert.ok(kneeLinkQuaternion.angleTo(new THREE.Quaternion()) <= 1e-9);
});
