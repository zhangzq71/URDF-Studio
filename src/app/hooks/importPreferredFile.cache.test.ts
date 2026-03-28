import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import type { RobotFile } from '@/types';
import { resolveRobotFileData } from '@/core/parsers';
import { pickPreferredImportFile, pickPreferredMjcfImportFile } from './importPreferredFile';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser;
}

if (!globalThis.XMLSerializer) {
  globalThis.XMLSerializer = window.XMLSerializer as typeof XMLSerializer;
}

function createRobotFile(name: string, format: RobotFile['format'], content = ''): RobotFile {
  return {
    name,
    format,
    content,
  };
}

test('pickPreferredImportFile reuses a provided resolver across MJCF preference checks', () => {
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
    `<?xml version="1.0"?>
<mujoco model="demo">
  <worldbody>
    <body name="base_link">
      <geom name="base_geom" type="box" size="0.1 0.1 0.1" />
    </body>
  </worldbody>
</mujoco>`,
  );
  const meshFile = createRobotFile('demo_description/meshes/base_link.stl', 'mesh');
  const filePool = [urdfFile, mjcfFile, meshFile];
  const resolveCounts = new Map<string, number>();

  const preferredFile = pickPreferredImportFile(
    filePool,
    filePool,
    (file) => {
      resolveCounts.set(file.name, (resolveCounts.get(file.name) ?? 0) + 1);
      return resolveRobotFileData(file, { availableFiles: filePool });
    },
  );

  assert.equal(preferredFile?.name, 'demo_description/urdf/demo.urdf');
  assert.equal(resolveCounts.get('demo_description/urdf/demo.urdf'), 1);
  assert.equal(resolveCounts.get('demo_description/xml/demo.xml'), 1);
});

test('pickPreferredMjcfImportFile stops resolving once the best-ranked parseable candidate is found', () => {
  const sceneMjcf = createRobotFile(
    'demo_description/xml/scene.xml',
    'mjcf',
    `<?xml version="1.0"?>
<mujoco model="demo_scene">
  <worldbody>
    <light name="key" pos="0 0 1" />
  </worldbody>
</mujoco>`,
  );
  const primaryMjcf = createRobotFile(
    'demo_description/xml/demo.xml',
    'mjcf',
    `<?xml version="1.0"?>
<mujoco model="demo_robot">
  <worldbody>
    <body name="base_link">
      <geom name="base_geom" type="box" size="0.1 0.1 0.1" />
    </body>
  </worldbody>
  <actuator>
    <motor name="hip_motor" joint="hip_joint" />
  </actuator>
</mujoco>`,
  );
  const fallbackMjcf = createRobotFile(
    'demo_description/xml/fallback.xml',
    'mjcf',
    `<?xml version="1.0"?>
<mujoco model="fallback_robot">
  <worldbody>
    <body name="fallback_link">
      <geom name="fallback_geom" type="sphere" size="0.05" />
    </body>
  </worldbody>
</mujoco>`,
  );
  const filePool = [sceneMjcf, primaryMjcf, fallbackMjcf];
  const resolveCounts = new Map<string, number>();

  const preferredFile = pickPreferredMjcfImportFile(
    filePool,
    filePool,
    (file) => {
      resolveCounts.set(file.name, (resolveCounts.get(file.name) ?? 0) + 1);
      return resolveRobotFileData(file, { availableFiles: filePool });
    },
  );

  assert.equal(preferredFile?.name, 'demo_description/xml/demo.xml');
  assert.equal(resolveCounts.get('demo_description/xml/demo.xml'), 1);
  assert.equal(resolveCounts.get('demo_description/xml/scene.xml'), undefined);
  assert.equal(resolveCounts.get('demo_description/xml/fallback.xml'), undefined);
});
