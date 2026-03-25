import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  prepareImportPayload,
  type ImportPreparationFileDescriptor,
} from './importPreparation';
import { pickPreferredImportFile } from '@/app/hooks/importPreferredFile';

function createLooseFile(
  name: string,
  content: BlobPart,
  relativePath?: string,
  options?: FilePropertyBag,
): File {
  const file = new File([content], name, options);

  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      configurable: true,
    });
  }

  return file;
}

test('prepareImportPayload renames colliding loose imports while preserving file classifications', async () => {
  const files = [
    createLooseFile(
      'demo.urdf',
      `<?xml version="1.0"?>
<robot name="demo">
  <link name="base_link" />
</robot>`,
      'robot/demo.urdf',
    ),
    createLooseFile('base.stl', 'solid demo', 'robot/meshes/base.stl'),
    createLooseFile('M1.txt', '{"name":"M1"}', 'robot/motor library/Acme/M1.txt'),
  ];

  const result = await prepareImportPayload({
    files,
    existingPaths: ['robot/existing.urdf'],
  });

  assert.deepEqual(
    result.robotFiles.map((file) => ({ name: file.name, format: file.format })).sort((left, right) => left.name.localeCompare(right.name)),
    [
      { name: 'robot (1)/demo.urdf', format: 'urdf' },
      { name: 'robot (1)/meshes/base.stl', format: 'mesh' },
    ],
  );
  assert.deepEqual(
    result.assetFiles.map((file) => file.name),
    ['robot (1)/meshes/base.stl'],
  );
  assert.deepEqual(
    result.libraryFiles.map((file) => file.path),
    ['robot (1)/motor library/Acme/M1.txt'],
  );
});

test('prepareImportPayload scans zip bundles off the main classification path and skips hidden entries', async () => {
  const zip = new JSZip();
  zip.file('.hidden/ignored.urdf', '<robot name="ignored" />');
  zip.file(
    'robot/demo.urdf',
    `<?xml version="1.0"?>
<robot name="demo">
  <link name="base_link" />
</robot>`,
  );
  zip.file('robot/meshes/base.obj', 'o Mesh');
  zip.file('robot/textures/albedo.png', new Uint8Array([137, 80, 78, 71]));
  zip.file('robot/motor library/Acme/M1.txt', '{"name":"M1"}');
  zip.file('robot/scene.usdc', new Uint8Array([80, 88, 82, 45, 85, 83, 68, 67, 1, 2, 3]));

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });
  const zipFile = new File([zipBytes], 'bundle.zip', { type: 'application/zip' });

  const result = await prepareImportPayload({
    files: [zipFile],
    existingPaths: [],
  });

  assert.equal(
    result.robotFiles.some((file) => file.name.includes('.hidden')),
    false,
  );
  assert.deepEqual(
    result.robotFiles.map((file) => ({ name: file.name, format: file.format, content: file.content })).sort((left, right) => left.name.localeCompare(right.name)),
    [
      { name: 'robot/demo.urdf', format: 'urdf', content: `<?xml version="1.0"?>
<robot name="demo">
  <link name="base_link" />
</robot>` },
      { name: 'robot/meshes/base.obj', format: 'mesh', content: '' },
      { name: 'robot/scene.usdc', format: 'usd', content: '' },
    ],
  );
  assert.deepEqual(
    result.assetFiles.map((file) => file.name).sort(),
    ['robot/meshes/base.obj', 'robot/textures/albedo.png'],
  );
  assert.deepEqual(
    result.libraryFiles.map((file) => file.path),
    ['robot/motor library/Acme/M1.txt'],
  );
  assert.deepEqual(
    result.usdSourceFiles.map((file) => file.name),
    ['robot/scene.usdc'],
  );
  assert.equal(result.usdSourceFiles[0].blob.size > 0, true);
});

test('prepareImportPayload keeps textual usd content available for downstream hydration', async () => {
  const usdText = `#usda 1.0
def Xform "robot"
{
}`;
  const usdFile = createLooseFile('scene.usd', usdText, 'scene/scene.usd');

  const result = await prepareImportPayload({
    files: [usdFile],
    existingPaths: [],
  });

  assert.equal(result.robotFiles.length, 1);
  assert.equal(result.robotFiles[0].name, 'scene/scene.usd');
  assert.equal(result.robotFiles[0].format, 'usd');
  assert.equal(result.robotFiles[0].content, usdText);
  assert.equal(result.usdSourceFiles.length, 1);
  assert.equal(await result.usdSourceFiles[0].blob.text(), usdText);
});

test('prepareImportPayload synthesizes a bundle root when loose robot folders arrive without their outer directory', async () => {
  const files = [
    createLooseFile(
      'demo.urdf',
      `<?xml version="1.0"?>
<robot name="demo_pkg">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_pkg/meshes/base.stl" />
      </geometry>
    </visual>
  </link>
</robot>`,
      'urdf/demo.urdf',
    ),
    createLooseFile(
      'mjmodel.xml',
      `<?xml version="1.0"?>
<mujoco model="demo_pkg">
  <compiler meshdir="../meshes" />
  <asset>
    <mesh name="base_mesh" file="base.stl" />
  </asset>
</mujoco>`,
      'mjcf/mjmodel.xml',
    ),
    createLooseFile('base.stl', 'solid demo', 'meshes/base.stl'),
  ];

  const result = await prepareImportPayload({
    files,
    existingPaths: [],
  });

  assert.deepEqual(
    result.robotFiles.map((file) => ({ name: file.name, format: file.format })).sort((left, right) => left.name.localeCompare(right.name)),
    [
      { name: 'demo_pkg/meshes/base.stl', format: 'mesh' },
      { name: 'demo_pkg/mjcf/mjmodel.xml', format: 'mjcf' },
      { name: 'demo_pkg/urdf/demo.urdf', format: 'urdf' },
    ],
  );
  assert.deepEqual(
    result.assetFiles.map((file) => file.name),
    ['demo_pkg/meshes/base.stl'],
  );
  assert.equal(
    pickPreferredImportFile(result.robotFiles, result.robotFiles)?.name,
    'demo_pkg/urdf/demo.urdf',
  );
});

test('prepareImportPayload preserves explicit relativePath metadata when files are worker-cloned', async () => {
  const files: ImportPreparationFileDescriptor[] = [
    {
      file: createLooseFile('mjmodel.xml', '<mujoco model="demo_pkg" />'),
      relativePath: 'casbot mini/mjcf/mjmodel.xml',
    },
    {
      file: createLooseFile('pelvis_link.STL', 'solid demo'),
      relativePath: 'casbot mini/meshes/pelvis_link.STL',
    },
  ];

  const result = await prepareImportPayload({
    files,
    existingPaths: [],
  });

  assert.deepEqual(
    result.robotFiles.map((file) => file.name).sort(),
    ['casbot mini/meshes/pelvis_link.STL', 'casbot mini/mjcf/mjmodel.xml'],
  );
  assert.deepEqual(
    result.assetFiles.map((file) => file.name),
    ['casbot mini/meshes/pelvis_link.STL'],
  );
});
