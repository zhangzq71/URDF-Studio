import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import type { RobotFile } from '@/types';
import {
  isUrdfSelfContainedInImportBundle,
  pickPreferredMjcfImportFile,
  pickPreferredImportFile,
} from './importPreferredFile';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser;
}

if (!globalThis.XMLSerializer) {
  globalThis.XMLSerializer = window.XMLSerializer as typeof XMLSerializer;
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

test('pickPreferredMjcfImportFile prefers direct robot definitions over wrapper scenes without relying on names', () => {
  const robotFile = createRobotFile(
    'demo_bundle/robot_model.xml',
    'mjcf',
    `<?xml version="1.0"?>
<mujoco model="robot">
  <worldbody>
    <body name="base_link">
      <geom name="base_geom" type="box" size="0.1 0.1 0.1" />
    </body>
  </worldbody>
</mujoco>`,
  );
  const wrapperFile = createRobotFile(
    'demo_bundle/a.xml',
    'mjcf',
    `<?xml version="1.0"?>
<mujoco model="launcher">
  <include file="robot_model.xml" />
  <worldbody>
    <geom name="floor" type="plane" size="0 0 1" />
  </worldbody>
</mujoco>`,
  );

  const preferredFile = pickPreferredMjcfImportFile([wrapperFile, robotFile], [wrapperFile, robotFile]);

  assert.equal(preferredFile?.name, 'demo_bundle/robot_model.xml');
});

test('pickPreferredImportFile does not prefer MJCF solely because the bundle path mentions mujoco', () => {
  const urdfFile = createRobotFile(
    'demo_mujoco/urdf/demo.urdf',
    'urdf',
    `<?xml version="1.0"?>
<robot name="demo_mujoco">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_mujoco/meshes/base_link.stl" />
      </geometry>
    </visual>
  </link>
</robot>`,
  );
  const mjcfFile = createRobotFile(
    'demo_mujoco/xml/demo.xml',
    'mjcf',
    `<?xml version="1.0"?>
<mujoco model="demo">
  <worldbody>
    <body name="base_link" />
  </worldbody>
</mujoco>`,
  );
  const meshFile = createRobotFile('demo_mujoco/meshes/base_link.stl', 'mesh');

  const preferredFile = pickPreferredImportFile(
    [urdfFile, mjcfFile, meshFile],
    [urdfFile, mjcfFile, meshFile],
  );

  assert.equal(preferredFile?.name, 'demo_mujoco/urdf/demo.urdf');
});
