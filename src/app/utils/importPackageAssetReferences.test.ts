import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStandalonePackageAssetImportWarning,
  extractPackageAssetBundleRoots,
  inferCommonPackageAssetBundleRoot,
} from './importPackageAssetReferences.ts';

test('extractPackageAssetBundleRoots keeps ROS package roots with intermediate model folders', () => {
  const content = `
<robot name="valkyrie">
  <link name="pelvis">
    <visual>
      <geometry>
        <mesh filename="package://val_description/model/meshes/pelvis/pelvis.dae" />
      </geometry>
    </visual>
  </link>
</robot>`;

  assert.deepEqual(
    extractPackageAssetBundleRoots(content),
    ['val_description/model'],
  );
});

test('extractPackageAssetBundleRoots preserves deeper package roots before mesh and texture folders', () => {
  const content = `
<robot name="pointfoot">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://robot_description/pointfoot/PF_P441A/meshes/base_Link.STL" />
      </geometry>
    </visual>
  </link>
</robot>`;

  assert.deepEqual(
    extractPackageAssetBundleRoots(content),
    ['robot_description/pointfoot/PF_P441A'],
  );
});

test('inferCommonPackageAssetBundleRoot derives a shared root from package-dependent robot definitions', () => {
  const sources = [
    {
      format: 'urdf',
      content: '<mesh filename="package://val_description/model/meshes/pelvis/pelvis.dae" />',
    },
    {
      format: 'urdf',
      content: '<mesh filename="package://val_description/model/materials/textures/pelvistexture.png" />',
    },
  ];

  assert.equal(
    inferCommonPackageAssetBundleRoot(sources),
    'val_description/model',
  );
});

test('buildStandalonePackageAssetImportWarning reports package-backed imports with no accompanying assets', () => {
  const warning = buildStandalonePackageAssetImportWarning(
    {
      format: 'urdf',
      content: '<mesh filename="package://val_description/model/meshes/pelvis/pelvis.dae" />',
    },
    [],
  );

  assert.deepEqual(warning, {
    bundleRoots: ['val_description/model'],
    packageNames: ['val_description'],
  });
});

test('buildStandalonePackageAssetImportWarning stays silent once assets are imported together', () => {
  const warning = buildStandalonePackageAssetImportWarning(
    {
      format: 'urdf',
      content: '<mesh filename="package://val_description/model/meshes/pelvis/pelvis.dae" />',
    },
    ['val_description/model/meshes/pelvis/pelvis.dae'],
  );

  assert.equal(warning, null);
});
