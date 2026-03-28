import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { URDFLink, URDFVisual } from '@/core/parsers/urdf/loader/URDFClasses';

import { COLLISION_OVERLAY_RENDER_ORDER, MATERIAL_CONFIG, collisionBaseMaterial } from './materials';
import { parseURDFMaterials } from './urdfMaterials';
import { syncLoadedRobotScene } from './loadedRobotSceneSync';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;

function toLinearTuple(r: number, g: number, b: number): number[] {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
    .toArray()
    .map((value) => Number(value.toFixed(4)));
}

test('syncLoadedRobotScene upgrades late URDF visual meshes to shared matte materials', () => {
  const urdfMaterials = parseURDFMaterials(`<?xml version="1.0"?>
<robot name="demo">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo/meshes/base.dae" />
      </geometry>
      <material name="Material">
        <color rgba="0.9 0.95 0.95 1" />
      </material>
      <material name="dark-rubber">
        <color rgba="0.05 0.05 0.05 1" />
      </material>
    </visual>
  </link>
</robot>`);

  const robot = new THREE.Group();
  const link = new URDFLink();
  link.name = 'base_link';

  const visual = new URDFVisual();
  visual.name = 'base_visual';

  const colladaScene = new THREE.Group();
  colladaScene.name = 'Scene';

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    [
      new THREE.MeshLambertMaterial({ name: 'Material', color: new THREE.Color(1, 1, 1) }),
      new THREE.MeshLambertMaterial({ name: 'dark-rubber', color: new THREE.Color(0, 0, 0) }),
    ],
  );

  colladaScene.add(mesh);
  visual.add(colladaScene);
  link.add(visual);
  robot.add(link);
  (robot as any).links = { base_link: link };

  const result = syncLoadedRobotScene({
    robot,
    sourceFormat: 'urdf',
    showCollision: false,
    showVisual: true,
    urdfMaterials,
  });

  if (!Array.isArray(mesh.material)) {
    assert.fail('expected upgraded URDF visual mesh to keep array material slots');
  }

  const nextMaterials = mesh.material;
  const [primaryMaterial, secondaryMaterial] = nextMaterials;
  assert.equal(result.changed, true);
  assert.equal(result.linkMeshMap.get('base_link:visual')?.includes(mesh), true);
  assert.equal(primaryMaterial instanceof THREE.MeshStandardMaterial, true);
  assert.equal(secondaryMaterial instanceof THREE.MeshStandardMaterial, true);
  if (
    !(primaryMaterial instanceof THREE.MeshStandardMaterial)
    || !(secondaryMaterial instanceof THREE.MeshStandardMaterial)
  ) {
    assert.fail('expected URDF visual materials to upgrade to MeshStandardMaterial');
  }
  assert.equal(mesh.userData.parentLinkName, 'base_link');
  assert.equal(mesh.userData.isVisualMesh, true);
  assert.equal(mesh.userData.isCollisionMesh, false);
  assert.deepEqual(
    primaryMaterial.color.toArray().map((value) => Number(value.toFixed(4))),
    toLinearTuple(0.9, 0.95, 0.95),
  );
  assert.deepEqual(
    secondaryMaterial.color.toArray().map((value) => Number(value.toFixed(4))),
    toLinearTuple(0.05, 0.05, 0.05),
  );
  assert.equal(primaryMaterial.roughness, MATERIAL_CONFIG.roughness);
  assert.equal(primaryMaterial.metalness, MATERIAL_CONFIG.metalness);
  assert.equal(primaryMaterial.envMapIntensity, MATERIAL_CONFIG.envMapIntensity);
  assert.equal(primaryMaterial.toneMapped, false);
  assert.equal(secondaryMaterial.toneMapped, false);
});

test('syncLoadedRobotScene upgrades MJCF visual meshes to the shared matte viewer materials', () => {
  const robot = new THREE.Group();
  const link = new URDFLink();
  link.name = 'base_link';

  const visual = new URDFVisual();
  visual.name = 'base_visual';

  const mjcfMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhongMaterial({ name: 'mjcf_body', color: new THREE.Color('#7f7f7f') }),
  );

  visual.add(mjcfMesh);
  link.add(visual);
  robot.add(link);
  (robot as any).links = { base_link: link };

  const result = syncLoadedRobotScene({
    robot,
    sourceFormat: 'mjcf',
    showCollision: false,
    showVisual: true,
    urdfMaterials: null,
  });

  assert.equal(result.linkMeshMap.get('base_link:visual')?.includes(mjcfMesh), true);
  assert.equal(mjcfMesh.material instanceof THREE.MeshStandardMaterial, true);
  if (!(mjcfMesh.material instanceof THREE.MeshStandardMaterial)) {
    assert.fail('expected MJCF visual material to upgrade to MeshStandardMaterial');
  }

  assert.equal(result.changed, true);
  assert.equal(mjcfMesh.userData.parentLinkName, 'base_link');
  assert.equal(mjcfMesh.userData.isVisualMesh, true);
  assert.equal(mjcfMesh.userData.isCollisionMesh, false);
  assert.equal(mjcfMesh.material.roughness, MATERIAL_CONFIG.roughness);
  assert.equal(mjcfMesh.material.metalness, MATERIAL_CONFIG.metalness);
  assert.equal(mjcfMesh.material.envMapIntensity, MATERIAL_CONFIG.envMapIntensity);
});

test('syncLoadedRobotScene keeps collision meshes as always-on-top overlays', () => {
  const robot = new THREE.Group();
  const link = new URDFLink();
  link.name = 'base_link';

  const collisionGroup = new THREE.Group();
  collisionGroup.name = 'base_collision';
  (collisionGroup as any).isURDFCollider = true;

  const collisionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );

  collisionGroup.add(collisionMesh);
  link.add(collisionGroup);
  robot.add(link);
  (robot as any).links = { base_link: link };

  const result = syncLoadedRobotScene({
    robot,
    sourceFormat: 'mjcf',
    showCollision: true,
    showVisual: true,
    urdfMaterials: null,
  });

  assert.equal(result.changed, true);
  assert.equal(result.linkMeshMap.get('base_link:collision')?.includes(collisionMesh), true);
  assert.equal(collisionMesh.material, collisionBaseMaterial);
  assert.equal(collisionMesh.userData.parentLinkName, 'base_link');
  assert.equal(collisionMesh.userData.isCollisionMesh, true);
  assert.equal(collisionMesh.userData.isVisualMesh, false);
  assert.equal(collisionMesh.visible, true);
  assert.equal(collisionMesh.renderOrder, COLLISION_OVERLAY_RENDER_ORDER);
  assert.equal(collisionBaseMaterial.depthTest, false);
  assert.equal(collisionBaseMaterial.depthWrite, false);
});

test('syncLoadedRobotScene traverses each collider subtree only once', () => {
  const robot = new THREE.Group();
  const link = new URDFLink();
  link.name = 'base_link';

  const collisionGroup = new THREE.Group();
  collisionGroup.name = 'base_collision';
  (collisionGroup as any).isURDFCollider = true;

  const nestedGroup = new THREE.Group();
  const collisionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  nestedGroup.add(collisionMesh);
  collisionGroup.add(nestedGroup);
  link.add(collisionGroup);
  robot.add(link);
  (robot as any).links = { base_link: link };

  const originalTraverse = collisionGroup.traverse.bind(collisionGroup);
  let traverseCalls = 0;
  collisionGroup.traverse = ((callback: (object: THREE.Object3D) => void) => {
    traverseCalls += 1;
    return originalTraverse(callback);
  }) as typeof collisionGroup.traverse;

  syncLoadedRobotScene({
    robot,
    sourceFormat: 'mjcf',
    showCollision: true,
    showVisual: true,
    urdfMaterials: null,
  });

  assert.equal(traverseCalls, 0);
  assert.equal(collisionMesh.userData.parentLinkName, 'base_link');
});

test('syncLoadedRobotScene skips hidden collider subtree processing when collisions are disabled', () => {
  const robot = new THREE.Group();
  const link = new URDFLink();
  link.name = 'base_link';

  const collisionGroup = new THREE.Group();
  collisionGroup.name = 'base_collision';
  (collisionGroup as any).isURDFCollider = true;

  const collisionMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const collisionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    collisionMaterial,
  );
  collisionGroup.add(collisionMesh);
  link.add(collisionGroup);
  robot.add(link);
  (robot as any).links = { base_link: link };

  const result = syncLoadedRobotScene({
    robot,
    sourceFormat: 'mjcf',
    showCollision: false,
    showVisual: true,
    urdfMaterials: null,
  });

  assert.equal(result.linkMeshMap.has('base_link:collision'), false);
  assert.equal(collisionGroup.visible, false);
  assert.equal(collisionGroup.userData.parentLinkName, 'base_link');
  assert.equal(collisionMesh.userData.isCollisionMesh, undefined);
  assert.equal(collisionMesh.userData.parentLinkName, undefined);
  assert.equal(collisionMesh.material, collisionMaterial);
});
