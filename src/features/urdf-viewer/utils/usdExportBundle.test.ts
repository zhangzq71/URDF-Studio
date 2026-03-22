import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import { GeometryType, JointType } from '../../../types/index.ts';
import type { RobotState } from '../../../types/index.ts';
import {
  buildUsdExportBundleFromPreparedCache,
  buildUsdExportBundleFromSnapshot,
  prepareUsdExportCacheFromSnapshot,
  resolveUsdExportSceneSnapshot,
} from './usdExportBundle.ts';

function createTriangleBuffers() {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,

    0, 0, 0,
    0, 1, 0,
    0, 0, 1,

    0, 0, 0,
    0, 0, 1,
    1, 0, 0,

    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);

  const indices = new Uint32Array([
    0, 1, 2,
    3, 4, 5,
    6, 7, 8,
    9, 10, 11,
  ]);

  return { positions, indices };
}

test('buildUsdExportBundleFromSnapshot preserves current robot edits and emits exportable mesh files', async () => {
  const { positions, indices } = createTriangleBuffers();

  const snapshot = {
    stageSourcePath: '/robots/demo/demo.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/base_link', null],
        ['/Robot/link1', '/Robot/base_link'],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/base_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/demo.usd',
      linkParentPairs: [
        ['/Robot/base_link', null],
        ['/Robot/link1', '/Robot/base_link'],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [
        {
          linkPath: '/Robot/link1',
          parentLinkPath: '/Robot/base_link',
          jointName: 'joint_link1',
          jointTypeName: 'revolute',
          axisToken: 'Z',
          lowerLimitDeg: -90,
          upperLimitDeg: 90,
          localPivotInLink: [0, 0, 0],
        },
      ],
      meshCountsByLinkPath: {
        '/Robot/base_link': {
          visualMeshCount: 1,
          collisionMeshCount: 0,
        },
        '/Robot/link1': {
          visualMeshCount: 1,
          collisionMeshCount: 2,
          collisionPrimitiveCounts: {
            mesh: 2,
          },
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
          },
        },
        {
          meshId: '/Robot/link1/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/link1/visuals/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 9, count: 9, stride: 3 },
            indices: { offset: 3, count: 3, stride: 1 },
          },
        },
        {
          meshId: '/Robot/link1/collisions.proto_mesh_id0',
          sectionName: 'collisions',
          resolvedPrimPath: '/Robot/link1/collisions/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 18, count: 9, stride: 3 },
            indices: { offset: 6, count: 3, stride: 1 },
          },
        },
        {
          meshId: '/Robot/link1/collisions.proto_mesh_id1',
          sectionName: 'collisions',
          resolvedPrimPath: '/Robot/link1/collisions/mesh_1',
          primType: 'mesh',
          ranges: {
            positions: { offset: 27, count: 9, stride: 3 },
            indices: { offset: 9, count: 3, stride: 1 },
          },
        },
      ],
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms: new Float32Array(0),
      rangesByMeshId: {},
    },
  };

  const currentRobot: RobotState = {
    name: 'edited_robot',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 2, y: 2, z: 2 },
          color: '#ff0000',
          origin: { xyz: { x: 1, y: 2, z: 3 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#00ff00',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 1,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
      link1: {
        id: 'link1',
        name: 'link1',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#ffffff',
          origin: { xyz: { x: 4, y: 5, z: 6 }, rpy: { r: 0.1, p: 0.2, y: 0.3 } },
        },
        collision: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#cccccc',
          origin: { xyz: { x: 7, y: 8, z: 9 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [
          {
            type: GeometryType.MESH,
            dimensions: { x: 3, y: 3, z: 3 },
            color: '#888888',
            origin: { xyz: { x: 10, y: 11, z: 12 }, rpy: { r: 0, p: 0, y: 0 } },
          },
        ],
        inertial: {
          mass: 42,
          origin: { xyz: { x: 0.4, y: 0.5, z: 0.6 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 2, ixy: 0, ixz: 0, iyy: 3, iyz: 0, izz: 4 },
        },
      },
    },
    joints: {
      joint_link1: {
        id: 'joint_link1',
        name: 'joint_link1',
        type: JointType.REVOLUTE,
        parentLinkId: 'base_link',
        childLinkId: 'link1',
        origin: { xyz: { x: 1, y: 1, z: 1 }, rpy: { r: 0, p: 0, y: 0 } },
        axis: { x: 0, y: 0, z: 1 },
        limit: { lower: -1, upper: 1, effort: 1, velocity: 1 },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
    },
  };

  const bundle = buildUsdExportBundleFromSnapshot(snapshot, {
    fileName: 'demo.usd',
    currentRobot,
  });

  assert.equal(bundle.robot.name, 'edited_robot');
  assert.equal(bundle.robot.links.link1.inertial.mass, 42);
  assert.deepEqual(bundle.robot.links.base_link.visual.origin.xyz, { x: 1, y: 2, z: 3 });
  assert.deepEqual(bundle.robot.links.link1.visual.origin.xyz, { x: 4, y: 5, z: 6 });

  assert.match(bundle.robot.links.base_link.visual.meshPath || '', /base_link_visual_0\.obj$/);
  assert.match(bundle.robot.links.link1.visual.meshPath || '', /link1_visual_0\.obj$/);
  assert.match(bundle.robot.links.link1.collision.meshPath || '', /link1_collision_0\.obj$/);
  assert.match(bundle.robot.links.link1.collisionBodies?.[0]?.meshPath || '', /link1_collision_1\.obj$/);

  assert.equal(bundle.meshFiles.size, 4);

  const baseVisualBlob = bundle.meshFiles.get(bundle.robot.links.base_link.visual.meshPath || '');
  assert.ok(baseVisualBlob);

  const baseVisualText = await baseVisualBlob!.text();
  assert.match(baseVisualText, /^o base_link_visual_0/m);
  assert.match(baseVisualText, /^v 0 0 0$/m);
  assert.match(baseVisualText, /^f 1 2 3$/m);
});

test('buildUsdExportBundleFromSnapshot keeps descriptor transforms in origins instead of baking them twice into OBJ vertices', async () => {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const transforms = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    5, 6, 7, 1,
  ]);

  const snapshot = {
    stageSourcePath: '/robots/demo/translated.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/base_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/translated.usd',
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [],
      meshCountsByLinkPath: {
        '/Robot/base_link': {
          visualMeshCount: 1,
          collisionMeshCount: 0,
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
            transform: { offset: 0, count: 16, stride: 16 },
          },
        },
      ],
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms,
      rangesByMeshId: {},
    },
  };

  const currentRobot: RobotState = {
    name: 'translated_robot',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#ffffff',
          origin: { xyz: { x: 5, y: 6, z: 7 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#cccccc',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 1,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
    },
    joints: {},
  };

  const bundle = buildUsdExportBundleFromSnapshot(snapshot, {
    fileName: 'translated.usd',
    currentRobot,
  });

  assert.ok(bundle);
  assert.deepEqual(bundle.robot.links.base_link.visual.origin.xyz, { x: 5, y: 6, z: 7 });

  const meshPath = bundle.robot.links.base_link.visual.meshPath || '';
  const meshBlob = bundle.meshFiles.get(meshPath);
  assert.ok(meshBlob);

  const meshText = await meshBlob!.text();
  assert.match(meshText, /^v 0 0 0$/m);
  assert.doesNotMatch(meshText, /^v 5 6 7$/m);
});

test('buildUsdExportBundleFromSnapshot still bakes descriptor transforms when no authored origin is available', async () => {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const transforms = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    5, 6, 7, 1,
  ]);

  const snapshot = {
    stageSourcePath: '/robots/demo/unhydrated.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/base_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/unhydrated.usd',
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [],
      meshCountsByLinkPath: {
        '/Robot/base_link': {
          visualMeshCount: 1,
          collisionMeshCount: 0,
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
            transform: { offset: 0, count: 16, stride: 16 },
          },
        },
      ],
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms,
      rangesByMeshId: {},
    },
  };

  const bundle = buildUsdExportBundleFromSnapshot(snapshot, {
    fileName: 'unhydrated.usd',
  });

  assert.ok(bundle);
  assert.deepEqual(bundle.robot.links.base_link.visual.origin.xyz, { x: 0, y: 0, z: 0 });

  const meshPath = bundle.robot.links.base_link.visual.meshPath || '';
  const meshBlob = bundle.meshFiles.get(meshPath);
  assert.ok(meshBlob);

  const meshText = await meshBlob!.text();
  assert.match(meshText, /^v 5 6 7$/m);
});

test('buildUsdExportBundleFromSnapshot assigns extra visual descriptors to fixed child links and syncs materials into robot state', () => {
  const { positions, indices } = createTriangleBuffers();

  const snapshot = {
    stageSourcePath: '/robots/demo/g1.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/torso_link', null],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/torso_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/g1.usd',
      linkParentPairs: [
        ['/Robot/torso_link', null],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [],
      meshCountsByLinkPath: {
        '/Robot/torso_link': {
          visualMeshCount: 2,
          collisionMeshCount: 0,
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/torso_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/torso_link/visuals/torso_link',
          primType: 'mesh',
          materialId: '/Looks/Torso',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
          },
        },
        {
          meshId: '/Robot/torso_link/visuals.proto_mesh_id1',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/torso_link/visuals/head_link',
          primType: 'mesh',
          materialId: '/Looks/Head',
          ranges: {
            positions: { offset: 9, count: 9, stride: 3 },
            indices: { offset: 3, count: 3, stride: 1 },
          },
        },
      ],
      materials: [
        {
          materialId: '/Looks/Torso',
          name: 'Torso',
          color: [0.2, 0.3, 0.4, 1],
        },
        {
          materialId: '/Looks/Head',
          name: 'Head',
          color: [0.9, 0.9, 0.9, 1],
        },
      ],
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms: new Float32Array(0),
      rangesByMeshId: {},
    },
  };

  const currentRobot: RobotState = {
    name: 'g1_export',
    rootLinkId: 'torso_link',
    selection: { type: null, id: null },
    links: {
      torso_link: {
        id: 'torso_link',
        name: 'torso_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#3b82f6',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [],
        inertial: {
          mass: 10,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
      head_link: {
        id: 'head_link',
        name: 'head_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#3b82f6',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [],
        inertial: {
          mass: 0,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
        },
      },
    },
    joints: {
      fixed_head_link: {
        id: 'fixed_head_link',
        name: 'fixed_head_link',
        type: JointType.FIXED,
        parentLinkId: 'torso_link',
        childLinkId: 'head_link',
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        axis: { x: 0, y: 0, z: 1 },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
    },
    materials: {},
  };

  const bundle = buildUsdExportBundleFromSnapshot(snapshot, {
    fileName: 'g1.usd',
    currentRobot,
  });

  assert.ok(bundle);
  assert.equal(bundle.robot.links.torso_link.visual.meshPath, 'torso_link_visual_0.obj');
  assert.equal(bundle.robot.links.head_link.visual.meshPath, 'torso_link_visual_1.obj');
  assert.equal(bundle.robot.links.head_link.visual.color, '#f3f3f3');
  assert.equal(bundle.robot.materials?.head_link?.color, '#f3f3f3');
  assert.equal(bundle.meshFiles.has('torso_link_visual_1.obj'), true);
});

test('buildUsdExportBundleFromSnapshot falls back to preferred live visual material when descriptor material binding is missing', async () => {
  const { positions, indices } = createTriangleBuffers();

  const snapshot = {
    stageSourcePath: '/robots/demo/go2.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/base_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/go2.usd',
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [],
      meshCountsByLinkPath: {
        '/Robot/base_link': {
          visualMeshCount: 1,
          collisionMeshCount: 0,
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/base_link',
          primType: 'mesh',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
          },
        },
      ],
      materials: [],
      preferredVisualMaterialsByLinkPath: {
        '/Robot/base_link': {
          name: 'Body',
          color: [0.6717, 0.6924, 0.7743, 1],
        },
      },
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms: new Float32Array(0),
      rangesByMeshId: {},
    },
  };

  const currentRobot: RobotState = {
    name: 'go2_export',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#3b82f6',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [],
        inertial: {
          mass: 1,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
    },
    joints: {},
    materials: {
      base_link: {
        color: '#3b82f6',
      },
    },
  };

  const bundle = buildUsdExportBundleFromSnapshot(snapshot, {
    fileName: 'go2.usd',
    currentRobot,
  });

  assert.ok(bundle);
  assert.equal(bundle.robot.links.base_link.visual.color, '#d6d9e4');
  assert.equal(bundle.robot.materials?.base_link?.color, '#d6d9e4');
  assert.equal(bundle.robot.links.base_link.visual.meshPath, 'base_link_visual_0.obj');

  const meshText = await bundle.meshFiles.get('base_link_visual_0.obj')?.text();
  assert.ok(meshText);
  assert.match(meshText, /^v 0 0 0 0\.6717 0\.6924 0\.7743$/m);

  const parsedObject = new OBJLoader().parse(meshText);
  let hasVertexColors = false;
  parsedObject.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    hasVertexColors = Boolean(child.geometry?.getAttribute?.('color'));
  });
  assert.equal(hasVertexColors, true);
});

test('prepareUsdExportCacheFromSnapshot materializes exportable mesh paths and reusable mesh files', async () => {
  const { positions, indices } = createTriangleBuffers();

  const snapshot = {
    stageSourcePath: '/robots/demo/demo.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/base_link', null],
        ['/Robot/link1', '/Robot/base_link'],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/base_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/demo.usd',
      linkParentPairs: [
        ['/Robot/base_link', null],
        ['/Robot/link1', '/Robot/base_link'],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [],
      meshCountsByLinkPath: {
        '/Robot/base_link': {
          visualMeshCount: 1,
          collisionMeshCount: 0,
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
          },
        },
      ],
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms: new Float32Array(0),
      rangesByMeshId: {},
    },
  };

  const prepared = prepareUsdExportCacheFromSnapshot(snapshot, {
    fileName: 'demo.usd',
  });

  assert.ok(prepared);
  assert.match(prepared.robotData.links.base_link.visual.meshPath || '', /base_link_visual_0\.obj$/);
  assert.equal(Object.keys(prepared.meshFiles).length, 1);

  const preparedBlob = prepared.meshFiles[prepared.robotData.links.base_link.visual.meshPath || ''];
  assert.ok(preparedBlob);
  const meshText = await preparedBlob.text();
  assert.match(meshText, /^o base_link_visual_0/m);
});

test('prepareUsdExportCacheFromSnapshot keeps primitive collisions as native geometry without phantom OBJ exports', () => {
  const { positions, indices } = createTriangleBuffers();

  const snapshot = {
    stageSourcePath: '/robots/demo/primitive-collision.usd',
    stage: {
      defaultPrimPath: '/Robot',
    },
    robotTree: {
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      rootLinkPaths: ['/Robot/base_link'],
    },
    robotMetadataSnapshot: {
      stageSourcePath: '/robots/demo/primitive-collision.usd',
      linkParentPairs: [
        ['/Robot/base_link', null],
      ] as Array<[string, string | null]>,
      jointCatalogEntries: [],
      meshCountsByLinkPath: {
        '/Robot/base_link': {
          visualMeshCount: 1,
          collisionMeshCount: 2,
          collisionPrimitiveCounts: {
            cube: 1,
            cylinder: 1,
          },
        },
      },
    },
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/mesh_0',
          primType: 'mesh',
          ranges: {
            positions: { offset: 0, count: 9, stride: 3 },
            indices: { offset: 0, count: 3, stride: 1 },
          },
        },
        {
          meshId: '/Robot/base_link/collisions.proto_box_id0',
          sectionName: 'collisions',
          resolvedPrimPath: '/Robot/base_link/collisions/box_0',
          primType: 'cube',
          extentSize: [0.2, 0.3, 0.4],
        },
        {
          meshId: '/Robot/base_link/collisions.proto_cylinder_id1',
          sectionName: 'collisions',
          resolvedPrimPath: '/Robot/base_link/collisions/cylinder_1',
          primType: 'cylinder',
          axis: 'Z',
          radius: 0.15,
          height: 0.9,
          extentSize: [0.3, 0.3, 0.9],
        },
      ],
    },
    buffers: {
      positions,
      indices,
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      transforms: new Float32Array(0),
      rangesByMeshId: {},
    },
  };

  const prepared = prepareUsdExportCacheFromSnapshot(snapshot, {
    fileName: 'primitive-collision.usd',
  });

  assert.ok(prepared);
  assert.equal(prepared.robotData.links.base_link.visual.meshPath, 'base_link_visual_0.obj');
  assert.equal(prepared.robotData.links.base_link.collision.type, GeometryType.BOX);
  assert.deepEqual(prepared.robotData.links.base_link.collision.dimensions, { x: 0.2, y: 0.3, z: 0.4 });
  assert.equal(prepared.robotData.links.base_link.collision.meshPath, undefined);
  assert.equal(prepared.robotData.links.base_link.collisionBodies?.length, 1);
  assert.equal(prepared.robotData.links.base_link.collisionBodies?.[0]?.type, GeometryType.CYLINDER);
  assert.deepEqual(prepared.robotData.links.base_link.collisionBodies?.[0]?.dimensions, { x: 0.15, y: 0.9, z: 0 });
  assert.equal(prepared.robotData.links.base_link.collisionBodies?.[0]?.meshPath, undefined);
  assert.deepEqual(Object.keys(prepared.meshFiles), ['base_link_visual_0.obj']);
});

test('buildUsdExportBundleFromPreparedCache preserves current robot edits without rereading snapshot', () => {
  const prepared = {
    stageSourcePath: '/robots/demo/demo.usd',
    robotData: {
      name: 'snapshot_robot',
      rootLinkId: 'base_link',
      links: {
        base_link: {
          id: 'base_link',
          name: 'base_link',
          visible: true,
          visual: {
            type: GeometryType.MESH,
            dimensions: { x: 1, y: 1, z: 1 },
            color: '#ffffff',
            meshPath: 'base_link_visual_0.obj',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          collision: {
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
            color: '#cccccc',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          inertial: {
            mass: 1,
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
          },
        },
      },
      joints: {},
    },
    meshFiles: {
      'base_link_visual_0.obj': new Blob(['o cached_mesh\nv 0 0 0\nf 1 1 1\n'], { type: 'text/plain' }),
    },
  };

  const currentRobot: RobotState = {
    name: 'edited_robot',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 2, y: 2, z: 2 },
          color: '#ff0000',
          origin: { xyz: { x: 1, y: 2, z: 3 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#00ff00',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 5,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
    },
    joints: {},
  };

  const bundle = buildUsdExportBundleFromPreparedCache(prepared, {
    currentRobot,
  });

  assert.ok(bundle);
  assert.equal(bundle.robot.name, 'edited_robot');
  assert.deepEqual(bundle.robot.links.base_link.visual.origin.xyz, { x: 1, y: 2, z: 3 });
  assert.equal(bundle.robot.links.base_link.visual.meshPath, 'base_link_visual_0.obj');
  assert.equal(bundle.meshFiles.get('base_link_visual_0.obj'), prepared.meshFiles['base_link_visual_0.obj']);
});

test('buildUsdExportBundleFromPreparedCache keeps prepared USD geometry and synthetic world root when current store only has skeleton links', () => {
  const prepared = {
    stageSourcePath: '/robots/demo/go2.usd',
    robotData: {
      name: 'go2_description',
      rootLinkId: 'world',
      links: {
        world: {
          id: 'world',
          name: 'world',
          visible: true,
          visual: {
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
            color: '#808080',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          collision: {
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
            color: '#ef4444',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          inertial: {
            mass: 0,
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
          },
        },
        base_link: {
          id: 'base_link',
          name: 'base_link',
          visible: true,
          visual: {
            type: GeometryType.MESH,
            dimensions: { x: 1, y: 1, z: 1 },
            color: '#d6d9e4',
            meshPath: 'base_link_visual_0.obj',
            origin: { xyz: { x: 0.12, y: 0.34, z: 0.56 }, rpy: { r: 0.1, p: 0.2, y: 0.3 } },
          },
          collision: {
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
            color: '#cccccc',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          inertial: {
            mass: 1,
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
          },
        },
      },
      joints: {
        world_to_base_link: {
          id: 'world_to_base_link',
          name: 'world_to_base_link',
          type: JointType.FIXED,
          parentLinkId: 'world',
          childLinkId: 'base_link',
          origin: { xyz: { x: 1, y: 2, z: 3 }, rpy: { r: 0.4, p: 0.5, y: 0.6 } },
          axis: { x: 0, y: 0, z: 1 },
          dynamics: { damping: 0, friction: 0 },
          hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
        },
      },
    },
    meshFiles: {
      'base_link_visual_0.obj': new Blob(['o prepared_mesh\nv 0 0 0\nf 1 1 1\n'], { type: 'text/plain' }),
    },
  };

  const currentRobot: RobotState = {
    name: 'go2_description',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#808080',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 5,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
    },
    joints: {},
  };

  const bundle = buildUsdExportBundleFromPreparedCache(prepared, {
    currentRobot,
  });

  assert.ok(bundle);
  assert.equal(bundle.robot.rootLinkId, 'world');
  assert.ok(bundle.robot.links.world);
  assert.ok(bundle.robot.joints.world_to_base_link);
  assert.equal(bundle.robot.links.base_link.visual.type, GeometryType.MESH);
  assert.equal(bundle.robot.links.base_link.visual.meshPath, 'base_link_visual_0.obj');
  assert.deepEqual(bundle.robot.links.base_link.visual.origin?.xyz, { x: 0.12, y: 0.34, z: 0.56 });
  assert.deepEqual(bundle.robot.joints.world_to_base_link.origin.xyz, { x: 1, y: 2, z: 3 });
});

test('resolveUsdExportSceneSnapshot prefers cached store snapshot before live render snapshot', () => {
  const cachedSnapshot = {
    stageSourcePath: '/robots/cached.usd',
    render: {
      meshDescriptors: [],
    },
  };

  let liveSnapshotReads = 0;
  const liveSnapshot = {
    stageSourcePath: '/robots/live.usd',
    render: {
      meshDescriptors: [],
    },
  };

  const resolved = resolveUsdExportSceneSnapshot({
    stageSourcePath: '/robots/cached.usd',
    cachedSnapshot,
    targetWindow: {
      renderInterface: {
        getCachedRobotSceneSnapshot: () => {
          liveSnapshotReads += 1;
          return liveSnapshot;
        },
      },
    },
  });

  assert.equal(resolved, cachedSnapshot);
  assert.equal(liveSnapshotReads, 0);
});

test('resolveUsdExportSceneSnapshot enriches cached snapshots with live preferred material records when available', () => {
  const cachedSnapshot = {
    stageSourcePath: '/robots/go2.usd',
    render: {
      meshDescriptors: [
        {
          meshId: '/Robot/base_link/visuals.proto_mesh_id0',
          sectionName: 'visuals',
          resolvedPrimPath: '/Robot/base_link/visuals/base_link',
          primType: 'mesh',
        },
      ],
    },
  };

  const resolved = resolveUsdExportSceneSnapshot({
    stageSourcePath: '/robots/go2.usd',
    cachedSnapshot,
    targetWindow: {
      renderInterface: {
        getPreferredVisualMaterialForLink: (linkPath: string) => (
          linkPath === '/Robot/base_link'
            ? {
                name: 'Body',
                opacity: 1,
                color: {
                  r: 0.6717054843902588,
                  g: 0.6924257278442383,
                  b: 0.7742701768875122,
                },
              }
            : null
        ),
      },
    },
  });

  assert.notEqual(resolved, cachedSnapshot);
  assert.deepEqual(resolved?.render?.preferredVisualMaterialsByLinkPath, {
    '/Robot/base_link': {
      name: 'Body',
      opacity: 1,
      color: [0.6717054843902588, 0.6924257278442383, 0.7742701768875122],
    },
  });
});

test('resolveUsdExportSceneSnapshot normalizes bare stage source paths for live snapshot lookups', () => {
  let receivedStageSourcePath: string | null = null;
  const liveSnapshot = {
    stageSourcePath: '/robots/b2/b2.usd',
    render: {
      meshDescriptors: [],
    },
  };

  const resolved = resolveUsdExportSceneSnapshot({
    stageSourcePath: 'robots/b2/b2.usd',
    cachedSnapshot: null,
    targetWindow: {
      renderInterface: {
        getCachedRobotSceneSnapshot: (stageSourcePath: string | null) => {
          receivedStageSourcePath = stageSourcePath;
          return stageSourcePath === '/robots/b2/b2.usd' ? liveSnapshot : null;
        },
      },
    },
  });

  assert.equal(receivedStageSourcePath, '/robots/b2/b2.usd');
  assert.equal(resolved, liveSnapshot);
});
