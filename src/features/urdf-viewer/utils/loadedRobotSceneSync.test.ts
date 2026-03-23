import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { URDFLink, URDFVisual } from '@/core/parsers/urdf/loader/URDFClasses';

import { parseURDFMaterials } from './urdfMaterials';
import { syncLoadedRobotScene } from './loadedRobotSceneSync';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;

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
    [0.9, 0.95, 0.95],
  );
  assert.deepEqual(
    secondaryMaterial.color.toArray().map((value) => Number(value.toFixed(4))),
    [0.05, 0.05, 0.05],
  );
  assert.equal(primaryMaterial.roughness, 0.68);
  assert.equal(primaryMaterial.metalness, 0.02);
  assert.equal(primaryMaterial.envMapIntensity, 0.3);
});
