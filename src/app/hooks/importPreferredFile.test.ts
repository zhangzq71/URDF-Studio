import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import type { RobotFile } from '@/types';
import { detectImportFormat } from '@/app/utils/importPreparation';
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

function loadImportableRobotFilesFromDirectory(relativeDir: string): RobotFile[] {
  const rootDir = path.join(process.cwd(), relativeDir);

  const walk = (currentDir: string): string[] => fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(currentDir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });

  return walk(rootDir)
    .sort()
    .flatMap((fullPath) => {
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      const lowerPath = relativePath.toLowerCase();
      if (
        lowerPath.endsWith('.urdf')
        || lowerPath.endsWith('.xml')
        || lowerPath.endsWith('.xacro')
        || lowerPath.endsWith('.urdf.xacro')
      ) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const format = detectImportFormat(content, relativePath);
        return format ? [createRobotFile(relativePath, format, content)] : [];
      }
      if (lowerPath.endsWith('.stl') || lowerPath.endsWith('.obj') || lowerPath.endsWith('.dae')) {
        return [createRobotFile(relativePath, 'mesh')];
      }
      return [];
    });
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

test('isUrdfSelfContainedInImportBundle accepts folder imports whose repo root differs from the package name', () => {
  const urdfFile = createRobotFile(
    'talos-data/urdf/talos_left_arm.urdf',
    'urdf',
    `<?xml version="1.0"?>
<robot name="talos">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://talos_data/meshes/arm/arm_1_collision.STL" />
      </geometry>
    </visual>
  </link>
</robot>`,
  );
  const meshFile = createRobotFile('talos-data/meshes/arm/arm_1_collision.STL', 'mesh');

  assert.equal(isUrdfSelfContainedInImportBundle(urdfFile, [urdfFile, meshFile]), true);
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

test('pickPreferredImportFile prefers the richer MJCF source-of-truth over a self-contained convenience URDF', () => {
  const files = loadImportableRobotFilesFromDirectory('test/mujoco_menagerie-main/google_barkour_vb');

  const preferredFile = pickPreferredImportFile(files, files);

  assert.equal(preferredFile?.name, 'test/mujoco_menagerie-main/google_barkour_vb/barkour_vb.xml');
});

test('pickPreferredImportFile prefers the richest self-contained URDF over helper subassemblies in talos-data', () => {
  const files = loadImportableRobotFilesFromDirectory('test/awesome_robot_descriptions_repos/talos-data');

  const preferredFile = pickPreferredImportFile(files, files);

  assert.equal(
    preferredFile?.name,
    'test/awesome_robot_descriptions_repos/talos-data/urdf/talos_full.urdf',
  );
});
