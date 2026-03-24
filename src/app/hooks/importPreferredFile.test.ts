import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import type { RobotFile } from '@/types';
import {
  isUrdfSelfContainedInImportBundle,
  pickPreferredImportFile,
} from './importPreferredFile';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser;
}

function readFixture(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function createRobotFile(name: string, format: RobotFile['format'], content = ''): RobotFile {
  return {
    name,
    format,
    content,
  };
}

test('pickPreferredImportFile prefers MJCF for mixed mujoco bundles with mismatched URDF package roots', () => {
  const urdfFile = createRobotFile(
    'b2_description_mujoco/xml/b2_description.urdf',
    'urdf',
    readFixture('test/unitree_ros/robots/b2_description_mujoco/xml/b2_description.urdf'),
  );
  const mjcfFile = createRobotFile(
    'b2_description_mujoco/xml/b2.xml',
    'mjcf',
    readFixture('test/unitree_ros/robots/b2_description_mujoco/xml/b2.xml'),
  );
  const sceneFile = createRobotFile(
    'b2_description_mujoco/xml/scene.xml',
    'mjcf',
    readFixture('test/unitree_ros/robots/b2_description_mujoco/xml/scene.xml'),
  );
  const meshFile = createRobotFile('b2_description_mujoco/meshes/base_link.obj', 'mesh');

  const preferredFile = pickPreferredImportFile(
    [urdfFile, mjcfFile, sceneFile, meshFile],
    [urdfFile, mjcfFile, sceneFile, meshFile],
  );

  assert.equal(preferredFile?.name, 'b2_description_mujoco/xml/b2.xml');
});

test('pickPreferredImportFile keeps URDF first for self-contained mixed bundles', () => {
  const urdfFile = createRobotFile(
    'demo_description/urdf/demo.urdf',
    'urdf',
    `<?xml version="1.0"?>
<robot name="demo_description">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_description/meshes/base_link.stl" />
      </geometry>
    </visual>
  </link>
</robot>`,
  );
  const mjcfFile = createRobotFile(
    'demo_description/xml/demo.xml',
    'mjcf',
    '<mujoco model="demo"><worldbody><body name="base_link" /></worldbody></mujoco>',
  );
  const meshFile = createRobotFile('demo_description/meshes/base_link.stl', 'mesh');

  const preferredFile = pickPreferredImportFile(
    [urdfFile, mjcfFile, meshFile],
    [urdfFile, mjcfFile, meshFile],
  );

  assert.equal(preferredFile?.name, 'demo_description/urdf/demo.urdf');
});

test('isUrdfSelfContainedInImportBundle detects missing package roots', () => {
  const urdfFile = createRobotFile(
    'vendor_bundle/demo.urdf',
    'urdf',
    `<?xml version="1.0"?>
<robot name="demo">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://missing_description/meshes/base_link.stl" />
      </geometry>
    </visual>
  </link>
</robot>`,
  );
  const meshFile = createRobotFile('vendor_bundle/meshes/base_link.stl', 'mesh');

  assert.equal(isUrdfSelfContainedInImportBundle(urdfFile, [urdfFile, meshFile]), false);
});
