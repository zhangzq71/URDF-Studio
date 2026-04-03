import test from 'node:test';
import assert from 'node:assert/strict';

import { GeometryType, type RobotFile, type UrdfLink } from '@/types';
import { buildUnifiedViewerResourceScopes } from './unifiedViewerResourceScopes';

function createMeshLink(meshPath: string): UrdfLink {
  return {
    id: 'base_link',
    name: 'base_link',
    visual: {
      type: GeometryType.MESH,
      meshPath,
      color: '#ffffff',
      dimensions: { x: 1, y: 1, z: 1 },
      origin: undefined,
    },
    collision: {
      type: GeometryType.MESH,
      meshPath,
      color: '#ffffff',
      dimensions: { x: 1, y: 1, z: 1 },
      origin: undefined,
    },
    inertial: undefined,
    visible: true,
    collisionBodies: [],
  };
}

function createSourceFile(): RobotFile {
  return {
    name: 'robots/go2/urdf/go2.urdf',
    content: '<robot name="go2" />',
    format: 'urdf',
  };
}

test('buildUnifiedViewerResourceScopes preserves live viewer and visualizer scope state without preview', () => {
  const sourceFile = createSourceFile();
  const state = buildUnifiedViewerResourceScopes({
    urdfContent: '<robot name="go2" />',
    sourceFilePath: 'robots/go2/urdf/go2.urdf',
    sourceFile,
    assets: {
      'robots/go2/meshes/base.dae': 'blob:go2-base',
      'meshes/preview.stl': 'blob:preview',
    },
    availableFiles: [],
    viewerRobotLinks: {
      base_link: createMeshLink('robots/go2/meshes/base.dae'),
    },
    visualizerRobotLinks: {
      base_link: createMeshLink('robots/go2/meshes/base.dae'),
    },
    previousViewerResourceScope: null,
    previousVisualizerResourceScope: null,
  });

  assert.equal(state.effectiveUrdfContent, '<robot name="go2" />');
  assert.equal(state.effectiveSourceFilePath, 'robots/go2/urdf/go2.urdf');
  assert.equal(state.effectiveSourceFile, sourceFile);
  assert.equal(state.activeViewportFileName, 'robots/go2/urdf/go2.urdf');
  assert.deepEqual(state.viewerResourceScope.assets, {
    'robots/go2/meshes/base.dae': 'blob:go2-base',
  });
  assert.deepEqual(state.visualizerResourceScope.assets, {
    'robots/go2/meshes/base.dae': 'blob:go2-base',
  });

  const repeated = buildUnifiedViewerResourceScopes({
    activePreview: undefined,
    urdfContent: '<robot name="go2" />',
    sourceFilePath: 'robots/go2/urdf/go2.urdf',
    sourceFile,
    assets: {
      'robots/go2/meshes/base.dae': 'blob:go2-base',
      'meshes/preview.stl': 'blob:preview',
    },
    availableFiles: [],
    viewerRobotLinks: {
      base_link: createMeshLink('robots/go2/meshes/base.dae'),
    },
    visualizerRobotLinks: {
      base_link: createMeshLink('robots/go2/meshes/base.dae'),
    },
    previousViewerResourceScope: state.viewerResourceScope,
    previousVisualizerResourceScope: state.visualizerResourceScope,
  });

  assert.equal(repeated.viewerResourceScope, state.viewerResourceScope);
  assert.equal(repeated.visualizerResourceScope, state.visualizerResourceScope);
});

test('buildUnifiedViewerResourceScopes swaps viewer scope to preview resources without disturbing visualizer scope', () => {
  const sourceFile = createSourceFile();

  const state = buildUnifiedViewerResourceScopes({
    activePreview: {
      urdfContent: '<robot name="preview" />',
      fileName: 'meshes/preview.stl',
    },
    urdfContent: '<robot name="go2" />',
    sourceFilePath: 'robots/go2/urdf/go2.urdf',
    sourceFile,
    assets: {
      'robots/go2/meshes/base.dae': 'blob:go2-base',
      'meshes/preview.stl': 'blob:preview',
    },
    availableFiles: [],
    viewerRobotLinks: undefined,
    visualizerRobotLinks: {
      base_link: createMeshLink('robots/go2/meshes/base.dae'),
    },
    previousViewerResourceScope: null,
    previousVisualizerResourceScope: null,
  });

  assert.equal(state.effectiveUrdfContent, '<robot name="preview" />');
  assert.equal(state.effectiveSourceFilePath, 'meshes/preview.stl');
  assert.equal(state.effectiveSourceFile, null);
  assert.equal(state.activeViewportFileName, 'meshes/preview.stl');
  assert.deepEqual(state.viewerResourceScope.assets, {
    'meshes/preview.stl': 'blob:preview',
  });
  assert.deepEqual(state.visualizerResourceScope.assets, {
    'robots/go2/meshes/base.dae': 'blob:go2-base',
  });
});
