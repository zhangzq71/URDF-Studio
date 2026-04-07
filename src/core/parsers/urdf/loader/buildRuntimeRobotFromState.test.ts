import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { createPlaceholderMesh } from '@/core/loaders';
import { DEFAULT_LINK, GeometryType } from '@/types';
import { parseThreeColorWithOpacity } from '@/core/utils/color.ts';
import { parseURDF } from '@/core/parsers/urdf/parser';
import { buildRuntimeRobotFromState } from './buildRuntimeRobotFromState';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.Document = dom.window.Document as typeof Document;
globalThis.Element = dom.window.Element as typeof Element;

function toFixedColorArray(color: THREE.Color, digits = 4): number[] {
  return color.toArray().map((value) => Number(value.toFixed(digits)));
}

test('buildRuntimeRobotFromState preserves link and joint hierarchy from parsed robot state', async () => {
  const robotState = parseURDF(`<?xml version="1.0"?>
<robot name="state_robot">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 2 3" />
      </geometry>
    </visual>
  </link>
  <link name="arm_link">
    <visual>
      <geometry>
        <cylinder radius="0.25" length="1.5" />
      </geometry>
    </visual>
  </link>
  <joint name="base_to_arm" type="revolute">
    <parent link="base_link" />
    <child link="arm_link" />
    <origin xyz="0 0 1" rpy="0 0 0.5" />
    <axis xyz="0 1 0" />
    <limit lower="-1" upper="1" effort="2" velocity="3" />
  </joint>
</robot>`);

  assert.ok(robotState, 'expected parsed robot state');

  const robot = await buildRuntimeRobotFromState({
    robotName: robotState.name,
    links: robotState.links,
    joints: robotState.joints,
    manager: new THREE.LoadingManager(),
    loadMeshCb: (_path, _manager, done) => done(null),
  });

  assert.equal(robot.robotName, 'state_robot');
  assert.deepEqual(Object.keys(robot.links).sort(), ['arm_link', 'base_link']);
  assert.deepEqual(Object.keys(robot.joints), ['base_to_arm']);
  assert.equal(robot.children.length, 1);
  assert.equal(robot.children[0], robot.links.base_link);

  const joint = robot.joints.base_to_arm as THREE.Object3D & {
    axis: THREE.Vector3;
    child?: THREE.Object3D;
    limit?: { lower?: number; upper?: number; effort?: number; velocity?: number };
  };
  assert.equal(joint.parent, robot.links.base_link);
  assert.equal(joint.children[0], robot.links.arm_link);
  assert.equal(joint.child, robot.links.arm_link);
  assert.deepEqual(joint.axis.toArray(), [0, 1, 0]);
  assert.equal(joint.limit?.lower, -1);
  assert.equal(joint.limit?.upper, 1);
  assert.equal(joint.limit?.effort, 2);
  assert.equal(joint.limit?.velocity, 3);
});

test('buildRuntimeRobotFromState applies mesh scale and visual color overrides on state-built meshes', async () => {
  const manager = new THREE.LoadingManager();

  const robotState = {
    name: 'mesh_robot',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          meshPath: 'meshes/base_link.obj',
          dimensions: { x: 2, y: 3, z: 4 },
          color: '#12ab34',
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
      },
    },
    joints: {},
  };

  let robot: Awaited<ReturnType<typeof buildRuntimeRobotFromState>> | null = null;
  const ready = new Promise<void>((resolve) => {
    manager.onLoad = () => resolve();
  });

  const completionKey = '__build_runtime_robot_from_state_test__';
  manager.itemStart(completionKey);
  try {
    robot = await buildRuntimeRobotFromState({
      robotName: robotState.name,
      links: robotState.links,
      joints: robotState.joints,
      manager,
      loadMeshCb: (_path, _manager, done) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshPhongMaterial({ color: new THREE.Color('#ffffff') }),
        );
        done(mesh);
      },
    });
  } finally {
    manager.itemEnd(completionKey);
  }

  await ready;

  const baseLink = robot?.links.base_link;
  assert.ok(baseLink, 'expected base link');

  const visualGroup = baseLink.children.find((child: any) => child.isURDFVisual) as
    | THREE.Object3D
    | undefined;
  assert.ok(visualGroup, 'expected visual group');
  assert.deepEqual(visualGroup.scale.toArray(), [2, 3, 4]);
  assert.equal(visualGroup.children.length, 1);

  const mesh = visualGroup.children[0] as THREE.Mesh;
  assert.ok(mesh.isMesh, 'expected built mesh');

  const material = mesh.material as THREE.MeshStandardMaterial;
  const parsedColor = parseThreeColorWithOpacity('#12ab34');
  assert.ok(parsedColor, 'expected parsed override color');
  assert.deepEqual(toFixedColorArray(material.color), toFixedColorArray(parsedColor.color));
});

test('buildRuntimeRobotFromState applies authored texture overrides onto loaded mesh materials', async () => {
  const originalTextureLoad = THREE.TextureLoader.prototype.load;
  const appliedTexture = new THREE.Texture();
  const requestedTexturePaths: string[] = [];

  THREE.TextureLoader.prototype.load = function mockTextureLoad(
    url: string,
    onLoad?: (texture: THREE.Texture<HTMLImageElement>) => void,
  ) {
    requestedTexturePaths.push(url);
    const texture = appliedTexture as THREE.Texture<HTMLImageElement>;
    onLoad?.(texture);
    return texture;
  };

  try {
    const manager = new THREE.LoadingManager();
    const robotState = {
      name: 'textured_mesh_robot',
      rootLinkId: 'base_link',
      links: {
        base_link: {
          ...DEFAULT_LINK,
          id: 'base_link',
          name: 'base_link',
          visual: {
            ...DEFAULT_LINK.visual,
            type: GeometryType.MESH,
            meshPath: 'meshes/base_link.obj',
            authoredMaterials: [{ texture: 'textures/coat.png' }],
          },
          collision: {
            ...DEFAULT_LINK.collision,
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
          },
        },
      },
      joints: {},
    };

    let robot: Awaited<ReturnType<typeof buildRuntimeRobotFromState>> | null = null;
    const ready = new Promise<void>((resolve) => {
      manager.onLoad = () => resolve();
    });
    const completionKey = '__build_runtime_robot_from_state_texture_override_test__';
    manager.itemStart(completionKey);

    try {
      robot = await buildRuntimeRobotFromState({
        robotName: robotState.name,
        links: robotState.links,
        joints: robotState.joints,
        manager,
        loadMeshCb: (_path, _manager, done) => {
          const embeddedTexture = new THREE.Texture();
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshPhongMaterial({
              color: new THREE.Color('#444444'),
              map: embeddedTexture,
            }),
          );
          done(mesh);
        },
      });
    } finally {
      manager.itemEnd(completionKey);
    }

    await ready;

    const baseLink = robot?.links.base_link;
    assert.ok(baseLink, 'expected textured base link');

    const visualGroup = baseLink.children.find((child: any) => child.isURDFVisual) as
      | THREE.Object3D
      | undefined;
    assert.ok(visualGroup, 'expected visual group');
    assert.equal(visualGroup.children.length, 1);

    const mesh = visualGroup.children[0] as THREE.Mesh;
    assert.ok(mesh.isMesh, 'expected loaded mesh');
    assert.deepEqual(requestedTexturePaths, ['textures/coat.png']);
    assert.equal(mesh.material instanceof THREE.MeshStandardMaterial, true);
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
      assert.fail('expected texture override to rebuild the mesh material');
    }

    assert.equal(mesh.material.map, appliedTexture);
    assert.notEqual(mesh.material.color.getHexString(), '444444');
    assert.equal(mesh.material.userData.urdfTextureApplied, true);
    assert.equal(mesh.material.userData.urdfTexturePath, 'textures/coat.png');
  } finally {
    THREE.TextureLoader.prototype.load = originalTextureLoad;
  }
});

test('buildRuntimeRobotFromState preserves embedded multi-material mesh slots for named palettes', async () => {
  const manager = new THREE.LoadingManager();
  const robotState = {
    name: 'multi_material_mesh_robot',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          meshPath: 'meshes/base_link.dae',
          authoredMaterials: [
            { name: 'body', color: '#bebebe' },
            { name: 'trim', color: '#111111' },
          ],
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
      },
    },
    joints: {},
  };

  let robot: Awaited<ReturnType<typeof buildRuntimeRobotFromState>> | null = null;
  const ready = new Promise<void>((resolve) => {
    manager.onLoad = () => resolve();
  });
  const completionKey = '__build_runtime_robot_from_state_multi_material_test__';
  manager.itemStart(completionKey);

  try {
    robot = await buildRuntimeRobotFromState({
      robotName: robotState.name,
      links: robotState.links,
      joints: robotState.joints,
      manager,
      loadMeshCb: (_path, _manager, done) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
          new THREE.MeshPhongMaterial({ name: 'body', color: new THREE.Color('#ff0000') }),
          new THREE.MeshPhongMaterial({ name: 'trim', color: new THREE.Color('#00ff00') }),
        ]);
        done(mesh);
      },
    });
  } finally {
    manager.itemEnd(completionKey);
  }

  await ready;

  const baseLink = robot?.links.base_link;
  assert.ok(baseLink, 'expected multi-material base link');

  const visualGroup = baseLink.children.find((child: any) => child.isURDFVisual) as
    | THREE.Object3D
    | undefined;
  assert.ok(visualGroup, 'expected visual group');
  assert.equal(visualGroup.children.length, 1);

  const mesh = visualGroup.children[0] as THREE.Mesh;
  assert.ok(Array.isArray(mesh.material), 'expected mesh to keep material slots');
  if (!Array.isArray(mesh.material)) {
    assert.fail('expected named multi-material mesh to preserve array material');
  }

  assert.deepEqual(
    mesh.material.map((material) => material.name),
    ['body', 'trim'],
  );
  assert.equal((mesh.material[0] as THREE.MeshPhongMaterial).color.getHexString(), 'ff0000');
  assert.equal((mesh.material[1] as THREE.MeshPhongMaterial).color.getHexString(), '00ff00');
});

test('buildRuntimeRobotFromState keeps placeholder meshes for missing visual assets', async () => {
  const robotState = {
    name: 'missing_visual_mesh',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          meshPath: 'package://aliengo_description/meshes/hip.dae',
        },
      },
    },
    joints: {},
  };

  const robot = await buildRuntimeRobotFromState({
    robotName: robotState.name,
    links: robotState.links,
    joints: robotState.joints,
    manager: new THREE.LoadingManager(),
    loadMeshCb: (path, _manager, done) => {
      done(createPlaceholderMesh(path));
    },
  });

  const baseLink = robot.links.base_link as THREE.Object3D | undefined;
  assert.ok(baseLink);

  const visualGroup = baseLink.children.find((child: any) => child.isURDFVisual) as
    | THREE.Object3D
    | undefined;
  assert.ok(visualGroup);

  let placeholderMesh: THREE.Mesh | null = null;
  visualGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.userData?.isPlaceholder) {
      placeholderMesh = child as THREE.Mesh;
    }
  });

  assert.ok(placeholderMesh);
  assert.equal(
    placeholderMesh.userData?.missingMeshPath,
    'package://aliengo_description/meshes/hip.dae',
  );
});
