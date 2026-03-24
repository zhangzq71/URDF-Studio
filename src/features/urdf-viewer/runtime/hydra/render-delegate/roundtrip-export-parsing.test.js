import test from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';

import {
    parseColliderEntriesFromLayerText,
    parseUrdfMaterialMetadataFromLayerText,
    parseVisualSemanticChildNamesFromLayerText,
} from './shared-basic.js';
import { ThreeRenderDelegateInterface } from './ThreeRenderDelegateInterface.js';

const exportedBaseLayerText = `#usda 1.0
def Xform "Robot"
{
    def Xform "base_link"
    {
        def Xform "visuals"
        {
            def Xform "gripper"
            {
                custom string urdf:materialColor = "#12ab34"
                custom string urdf:materialTexture = "textures/base_color.png"
                def Mesh "mesh"
                {
                }
            }
        }
        def Xform "collisions"
        {
            def Xform "collision_0"
            {
                uniform token purpose = "guide"
                def Cube "cube"
                {
                }
            }
        }
        def Xform "arm_link"
        {
            def Xform "visuals"
            {
                def Xform "camera"
                {
                    custom string urdf:materialColor = "#abcdef"
                    def Mesh "mesh"
                    {
                    }
                }
            }
            def Xform "collisions"
            {
                def Xform "collision_1"
                {
                    uniform token purpose = "guide"
                    def Cylinder "cylinder"
                    {
                    }
                }
            }
        }
    }
}`;

test('parseVisualSemanticChildNamesFromLayerText finds semantic children across nested link-local scopes', () => {
    const result = parseVisualSemanticChildNamesFromLayerText(exportedBaseLayerText);

    assert.deepEqual(result.get('base_link'), ['gripper']);
    assert.deepEqual(result.get('arm_link'), ['camera']);
});

test('parseColliderEntriesFromLayerText finds collider entries across nested link-local scopes', () => {
    const result = parseColliderEntriesFromLayerText(exportedBaseLayerText);

    assert.deepEqual(result.get('base_link'), [{ entryName: 'collision_0', referencePath: null }]);
    assert.deepEqual(result.get('arm_link'), [{ entryName: 'collision_1', referencePath: null }]);
});

test('parseUrdfMaterialMetadataFromLayerText extracts URDF export material metadata for nested visual prims', () => {
    const result = parseUrdfMaterialMetadataFromLayerText(exportedBaseLayerText);

    assert.deepEqual(result.get('/Robot/base_link/visuals/gripper'), {
        color: '#12ab34',
        texture: 'textures/base_color.png',
    });
    assert.deepEqual(result.get('/Robot/base_link/arm_link/visuals/camera'), {
        color: '#abcdef',
    });
});

test('normalizeRobotSceneSnapshot synthesizes fallback material records from exported URDF metadata', () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
        location: { search: '' },
    };
    try {
        const delegate = new ThreeRenderDelegateInterface({
            stage: () => ({
                GetRootLayer: () => ({
                    ExportToString: () => exportedBaseLayerText,
                }),
                GetUsedLayers: () => [],
                GetDefaultPrim: () => ({
                    GetPath: () => ({ pathString: '/Robot' }),
                }),
            }),
            driver: () => null,
            allowDriverStageLookup: false,
        });
        delegate.createFallbackMaterialFromSnapshot = (materialId) => ({ materialId });

        const snapshot = delegate.normalizeRobotSceneSnapshot({
            generatedAtMs: 1,
            stage: {
                stageSourcePath: '/tmp/roundtrip.usda',
                defaultPrimPath: '/Robot',
            },
            robotTree: {
                linkParentPairs: [['/Robot/base_link', null]],
                jointCatalogEntries: [],
                rootLinkPaths: ['/Robot/base_link'],
            },
            physics: {
                linkDynamicsEntries: [],
            },
            render: {
                meshDescriptors: [{
                    meshId: '/Robot/base_link/visuals/gripper/mesh.proto_mesh_id0',
                    resolvedPrimPath: '/Robot/base_link/visuals/gripper/mesh',
                    sectionName: 'visuals',
                    primType: 'mesh',
                }],
                materials: [],
            },
        }, {
            stageSourcePath: '/tmp/roundtrip.usda',
        });

        assert.ok(snapshot);
        assert.equal(snapshot.render.materials.length, 1);
        assert.equal(snapshot.render.meshDescriptors[0].materialId, '/Robot/base_link/visuals/gripper/__urdf_material');

        const fallbackMaterial = snapshot.render.materials[0];
        const expectedColor = new Color('#12ab34');
        assert.equal(fallbackMaterial.materialId, '/Robot/base_link/visuals/gripper/__urdf_material');
        assert.equal(fallbackMaterial.mapPath, 'textures/base_color.png');
        assert.ok(Array.isArray(fallbackMaterial.color));
        assert.ok(Math.abs(fallbackMaterial.color[0] - expectedColor.r) < 1e-6);
        assert.ok(Math.abs(fallbackMaterial.color[1] - expectedColor.g) < 1e-6);
        assert.ok(Math.abs(fallbackMaterial.color[2] - expectedColor.b) < 1e-6);
    }
    finally {
        globalThis.window = previousWindow;
    }
});

test('normalizeRobotSceneSnapshot synthesizes mesh descriptors from proto blobs when driver omits descriptors', () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
        location: { search: '' },
    };
    try {
        const delegate = new ThreeRenderDelegateInterface({
            stage: () => ({
                GetRootLayer: () => ({
                    ExportToString: () => '#usda 1.0\n',
                }),
                GetUsedLayers: () => [],
                GetDefaultPrim: () => ({
                    GetPath: () => ({ pathString: '/Robot' }),
                }),
            }),
            driver: () => null,
            allowDriverStageLookup: false,
        });
        delegate.getResolvedVisualTransformPrimPathForMeshId = (meshId) => (
            meshId === '/Robot/base_link/visuals.proto_mesh_id0'
                ? '/Robot/base_link/visuals/mesh'
                : null
        );

        const snapshot = delegate.normalizeRobotSceneSnapshot({
            generatedAtMs: 1,
            stage: {
                stageSourcePath: '/tmp/runtime-proto-blob.usda',
                defaultPrimPath: '/Robot',
            },
            robotTree: {
                linkParentPairs: [['/Robot/base_link', null]],
                jointCatalogEntries: [],
                rootLinkPaths: ['/Robot/base_link'],
            },
            physics: {
                linkDynamicsEntries: [],
            },
            render: {
                meshDescriptors: [],
                materials: [{
                    materialId: '/Robot/Looks/base_link',
                    name: 'base_link',
                }],
                protoDataBlobs: {
                    '/Robot/base_link/visuals.proto_mesh_id0': {
                        valid: true,
                        numVertices: 3,
                        points: Float32Array.from([
                            0, 0, 0,
                            1, 0, 0,
                            0, 1, 0,
                        ]),
                        numIndices: 3,
                        indices: Uint32Array.from([0, 1, 2]),
                        numNormals: 3,
                        normalsDimension: 3,
                        normals: Float32Array.from([
                            0, 0, 1,
                            0, 0, 1,
                            0, 0, 1,
                        ]),
                        numUVs: 3,
                        uvDimension: 2,
                        uv: Float32Array.from([
                            0, 0,
                            1, 0,
                            0, 1,
                        ]),
                        transform: Float32Array.from([
                            1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0, 0, 0, 1,
                        ]),
                        materialId: '/Robot/Looks/base_link',
                    },
                },
            },
        }, {
            stageSourcePath: '/tmp/runtime-proto-blob.usda',
        });

        assert.ok(snapshot);
        assert.equal(snapshot.render.meshDescriptors.length, 1);
        assert.equal(snapshot.render.meshDescriptors[0].meshId, '/Robot/base_link/visuals.proto_mesh_id0');
        assert.equal(snapshot.render.meshDescriptors[0].resolvedPrimPath, '/Robot/base_link/visuals/mesh');
        assert.equal(snapshot.render.meshDescriptors[0].sectionName, 'visuals');
        assert.equal(snapshot.render.meshDescriptors[0].primType, 'mesh');
        assert.equal(snapshot.render.meshDescriptors[0].geometry.numVertices, 3);
        assert.equal(snapshot.render.meshDescriptors[0].geometry.materialId, '/Robot/Looks/base_link');
        assert.equal(snapshot.render.meshDescriptors[0].ranges.positions.count, 9);
        assert.equal(snapshot.render.meshDescriptors[0].ranges.indices.count, 3);
        assert.equal(snapshot.render.protoBlobCount, 1);
        assert.equal(snapshot.buffers.positions.length, 9);
        assert.equal(snapshot.buffers.indices.length, 3);
    }
    finally {
        globalThis.window = previousWindow;
    }
});

test('normalizeRobotSceneSnapshot synthesizes mesh descriptors from live Hydra meshes when snapshot payload is incomplete', () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
        location: { search: '' },
    };
    try {
        const delegate = new ThreeRenderDelegateInterface({
            stage: () => ({
                GetRootLayer: () => ({
                    ExportToString: () => '#usda 1.0\n',
                }),
                GetUsedLayers: () => [],
                GetDefaultPrim: () => ({
                    GetPath: () => ({ pathString: '/Robot' }),
                }),
            }),
            driver: () => null,
            allowDriverStageLookup: false,
        });
        delegate.getResolvedVisualTransformPrimPathForMeshId = (meshId) => (
            meshId === '/Robot/base_link/visuals.proto_mesh_id0'
                ? '/Robot/base_link/visuals/mesh'
                : null
        );
        delegate.meshes = {
            '/Robot/base_link/visuals.proto_mesh_id0': {
                _id: '/Robot/base_link/visuals.proto_mesh_id0',
                _pendingMaterialId: '/Robot/Looks/base_link',
                _mesh: {
                    updateWorldMatrix() {},
                    matrixWorld: {
                        elements: [
                            1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0, 0, 0, 1,
                        ],
                    },
                    geometry: {
                        getAttribute(name) {
                            if (name === 'position') {
                                return {
                                    count: 3,
                                    itemSize: 3,
                                    array: Float32Array.from([
                                        0, 0, 0,
                                        0, 1, 0,
                                        0, 0, 1,
                                    ]),
                                };
                            }
                            if (name === 'normal') {
                                return {
                                    count: 3,
                                    itemSize: 3,
                                    array: Float32Array.from([
                                        1, 0, 0,
                                        1, 0, 0,
                                        1, 0, 0,
                                    ]),
                                };
                            }
                            if (name === 'uv') {
                                return {
                                    count: 3,
                                    itemSize: 2,
                                    array: Float32Array.from([
                                        0, 0,
                                        1, 0,
                                        0, 1,
                                    ]),
                                };
                            }
                            return null;
                        },
                        getIndex() {
                            return {
                                count: 3,
                                array: Uint16Array.from([0, 1, 2]),
                            };
                        },
                    },
                },
            },
        };

        const snapshot = delegate.normalizeRobotSceneSnapshot({
            generatedAtMs: 1,
            stage: {
                stageSourcePath: '/tmp/runtime-live-mesh.usda',
                defaultPrimPath: '/Robot',
            },
            robotTree: {
                linkParentPairs: [['/Robot/base_link', null]],
                jointCatalogEntries: [],
                rootLinkPaths: ['/Robot/base_link'],
            },
            physics: {
                linkDynamicsEntries: [],
            },
            render: {
                meshDescriptors: [],
                materials: [{
                    materialId: '/Robot/Looks/base_link',
                    name: 'base_link',
                }],
                meshDescriptorFormat: 'packed-v2',
                meshDescriptorHeaders: Int32Array.from([]),
                meshDescriptorScalars: Float32Array.from([]),
                meshDescriptorGeomSubsetSections: {},
            },
            buffers: {
                positions: Float32Array.from([]),
                indices: Uint32Array.from([]),
                normals: Float32Array.from([]),
                uvs: Float32Array.from([]),
                transforms: Float32Array.from([]),
                rangesByMeshId: {},
            },
        }, {
            stageSourcePath: '/tmp/runtime-live-mesh.usda',
        });

        assert.ok(snapshot);
        assert.equal(snapshot.render.meshDescriptors.length, 1);
        assert.equal(snapshot.render.meshDescriptors[0].meshId, '/Robot/base_link/visuals.proto_mesh_id0');
        assert.equal(snapshot.render.meshDescriptors[0].resolvedPrimPath, '/Robot/base_link/visuals/mesh');
        assert.equal(snapshot.render.meshDescriptors[0].sectionName, 'visuals');
        assert.equal(snapshot.render.meshDescriptors[0].geometry.numVertices, 3);
        assert.equal(snapshot.render.meshDescriptors[0].geometry.materialId, '/Robot/Looks/base_link');
        assert.equal(snapshot.render.meshDescriptors[0].ranges.positions.count, 9);
        assert.equal(snapshot.render.meshDescriptors[0].ranges.indices.count, 3);
        assert.equal(snapshot.render.protoBlobCount, 1);
        assert.equal(snapshot.buffers.positions.length, 9);
        assert.equal(snapshot.buffers.indices.length, 3);
    }
    finally {
        globalThis.window = previousWindow;
    }
});

test('normalizeRobotSceneSnapshot serializes preferred live visual materials by link path', () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
        location: { search: '' },
    };
    try {
        const delegate = new ThreeRenderDelegateInterface({
            stage: () => ({
                GetRootLayer: () => ({
                    ExportToString: () => '#usda 1.0\n',
                }),
                GetUsedLayers: () => [],
                GetDefaultPrim: () => ({
                    GetPath: () => ({ pathString: '/Robot' }),
                }),
            }),
            driver: () => null,
            allowDriverStageLookup: false,
        });
        delegate.getPreferredVisualMaterialForLink = (linkPath) => (
            linkPath === '/Robot/base_link'
                ? {
                    name: 'Body',
                    color: new Color('#d6d9e4'),
                    opacity: 1,
                }
                : null
        );

        const snapshot = delegate.normalizeRobotSceneSnapshot({
            generatedAtMs: 1,
            stage: {
                stageSourcePath: '/tmp/preferred-material.usda',
                defaultPrimPath: '/Robot',
            },
            robotTree: {
                linkParentPairs: [['/Robot/base_link', null]],
                jointCatalogEntries: [],
                rootLinkPaths: ['/Robot/base_link'],
            },
            physics: {
                linkDynamicsEntries: [],
            },
            render: {
                meshDescriptors: [{
                    meshId: '/Robot/base_link/visuals.proto_mesh_id0',
                    resolvedPrimPath: '/Robot/base_link/visuals/base_link',
                    sectionName: 'visuals',
                    primType: 'mesh',
                }],
                materials: [],
            },
        }, {
            stageSourcePath: '/tmp/preferred-material.usda',
        });

        assert.ok(snapshot.render.preferredVisualMaterialsByLinkPath);
        const preferredRecord = snapshot.render.preferredVisualMaterialsByLinkPath['/Robot/base_link'];
        assert.equal(preferredRecord.name, 'Body');
        assert.equal(preferredRecord.opacity, 1);
        assert.ok(Array.isArray(preferredRecord.color));
        const expectedColor = new Color('#d6d9e4');
        assert.ok(Math.abs(preferredRecord.color[0] - expectedColor.r) < 1e-6);
        assert.ok(Math.abs(preferredRecord.color[1] - expectedColor.g) < 1e-6);
        assert.ok(Math.abs(preferredRecord.color[2] - expectedColor.b) < 1e-6);
    }
    finally {
        globalThis.window = previousWindow;
    }
});

test('normalizeRobotSceneSnapshot prefers richer stage-built metadata over incomplete raw scene metadata', () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
        location: { search: '' },
    };
    try {
        const delegate = new ThreeRenderDelegateInterface({
            stage: () => ({
                GetRootLayer: () => ({
                    ExportToString: () => '#usda 1.0\n',
                }),
                GetUsedLayers: () => [],
                GetDefaultPrim: () => ({
                    GetPath: () => ({ pathString: '/Robot' }),
                }),
            }),
            driver: () => null,
            allowDriverStageLookup: false,
        });
        delegate.buildRobotMetadataSnapshotForStage = () => ({
            stageSourcePath: '/tmp/b2-helper-links.usda',
            generatedAtMs: 2,
            source: 'usd-stage-cpp',
            linkParentPairs: [
                ['/Robot/base_link', null],
                ['/Robot/base_link/imu_link', '/Robot/base_link'],
            ],
            jointCatalogEntries: [{
                jointPath: '/Robot/joints/joint_imu',
                jointName: 'joint_imu',
                jointTypeName: 'PhysicsFixedJoint',
                linkPath: '/Robot/base_link/imu_link',
                parentLinkPath: '/Robot/base_link',
                originXyz: [0, 0, 0.05],
                originQuatWxyz: [1, 0, 0, 0],
                axis: [1, 0, 0],
            }],
            linkDynamicsEntries: [],
            meshCountsByLinkPath: {},
        });

        const snapshot = delegate.normalizeRobotSceneSnapshot({
            generatedAtMs: 1,
            stage: {
                stageSourcePath: '/tmp/b2-helper-links.usda',
                defaultPrimPath: '/Robot',
            },
            robotTree: {
                linkParentPairs: [['/Robot/base_link', null]],
                jointCatalogEntries: [],
                rootLinkPaths: ['/Robot/base_link'],
            },
            physics: {
                linkDynamicsEntries: [],
            },
            robotMetadataSnapshot: {
                stageSourcePath: '/tmp/b2-helper-links.usda',
                generatedAtMs: 1,
                source: 'robot-scene-snapshot',
                linkParentPairs: [['/Robot/base_link', null]],
                jointCatalogEntries: [],
                linkDynamicsEntries: [],
                meshCountsByLinkPath: {},
            },
            render: {
                meshDescriptors: [],
                materials: [],
            },
        }, {
            stageSourcePath: '/tmp/b2-helper-links.usda',
        });

        assert.ok(snapshot);
        assert.equal(snapshot.robotMetadataSnapshot.jointCatalogEntries.length, 1);
        assert.ok(snapshot.robotTree.linkParentPairs.some(([childPath, parentPath]) => childPath === '/Robot/base_link/imu_link' && parentPath === '/Robot/base_link'));
        assert.equal(delegate.getCachedRobotMetadataSnapshot('/tmp/b2-helper-links.usda')?.jointCatalogEntries?.length, 1);
    }
    finally {
        globalThis.window = previousWindow;
    }
});
