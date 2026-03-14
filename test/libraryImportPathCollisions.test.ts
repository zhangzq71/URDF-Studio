import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createImportPathCollisionMap,
  remapImportedPath,
} from '../src/features/file-io/utils/libraryImportPathCollisions.ts';

test('appends a numeric suffix when the top-level folder already exists', () => {
  const importedPaths = [
    'robot/model.urdf',
    'robot/meshes/base.stl',
  ];
  const existingPaths = [
    'robot/original.urdf',
  ];

  const pathMap = createImportPathCollisionMap(importedPaths, existingPaths);

  assert.equal(remapImportedPath('robot/model.urdf', pathMap), 'robot (1)/model.urdf');
  assert.equal(remapImportedPath('robot/meshes/base.stl', pathMap), 'robot (1)/meshes/base.stl');
});

test('increments the suffix when earlier suffixed folders already exist', () => {
  const importedPaths = [
    'robot/model.urdf',
  ];
  const existingPaths = [
    'robot/original.urdf',
    'robot (1)/archived.urdf',
  ];

  const pathMap = createImportPathCollisionMap(importedPaths, existingPaths);

  assert.equal(remapImportedPath('robot/model.urdf', pathMap), 'robot (2)/model.urdf');
});

test('leaves root-level files unchanged', () => {
  const importedPaths = [
    'loose.urdf',
    'loose_mesh.stl',
  ];
  const existingPaths = [
    'robot/original.urdf',
  ];

  const pathMap = createImportPathCollisionMap(importedPaths, existingPaths);

  assert.equal(remapImportedPath('loose.urdf', pathMap), 'loose.urdf');
  assert.equal(remapImportedPath('loose_mesh.stl', pathMap), 'loose_mesh.stl');
});
