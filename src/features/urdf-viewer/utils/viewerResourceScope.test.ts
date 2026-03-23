import test from 'node:test';
import assert from 'node:assert/strict';

import { GeometryType, type RobotFile, type UrdfLink } from '@/types';

import {
  createStableViewerResourceScope,
  type ViewerResourceScope,
} from './viewerResourceScope';

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

function scope(
  previous: ViewerResourceScope | null,
  overrides: Partial<Parameters<typeof createStableViewerResourceScope>[1]> = {},
): ViewerResourceScope {
  return createStableViewerResourceScope(previous, {
    assets: {
      'robots/go1/meshes/base.dae': 'blob:go1-base',
      'robots/go1/materials/body.png': 'blob:go1-body',
      'robots/go2/meshes/base.dae': 'blob:go2-base',
    },
    availableFiles: [],
    sourceFile: {
      name: 'robots/go1/urdf/go1.urdf',
      content: '<robot name="go1" />',
      format: 'urdf',
    },
    sourceFilePath: 'robots/go1/urdf/go1.urdf',
    robotLinks: {
      base_link: createMeshLink('robots/go1/meshes/base.dae'),
    },
    ...overrides,
  });
}

test('createStableViewerResourceScope reuses the previous scope when unrelated assets are imported', () => {
  const initial = scope(null);

  const next = scope(initial, {
    assets: {
      'robots/go1/meshes/base.dae': 'blob:go1-base',
      'robots/go1/materials/body.png': 'blob:go1-body',
      'robots/go2/meshes/base.dae': 'blob:go2-base',
      'robots/go2/materials/body.png': 'blob:go2-body',
      'robots/h1/meshes/arm.stl': 'blob:h1-arm',
    },
  });

  assert.equal(next, initial);
  assert.deepEqual(next.assets, {
    'robots/go1/meshes/base.dae': 'blob:go1-base',
    'robots/go1/materials/body.png': 'blob:go1-body',
  });
});

test('createStableViewerResourceScope updates the scope when a relevant asset changes', () => {
  const initial = scope(null);

  const next = scope(initial, {
    assets: {
      'robots/go1/meshes/base.dae': 'blob:go1-base-v2',
      'robots/go1/materials/body.png': 'blob:go1-body',
      'robots/go2/meshes/base.dae': 'blob:go2-base',
    },
  });

  assert.notEqual(next, initial);
  assert.deepEqual(next.assets, {
    'robots/go1/meshes/base.dae': 'blob:go1-base-v2',
    'robots/go1/materials/body.png': 'blob:go1-body',
  });
});

test('createStableViewerResourceScope reuses the previous USD scope when unrelated bundle files are added', () => {
  const sourceFile: RobotFile = {
    name: 'robots/go2/usd/go2.usd',
    content: '',
    format: 'usd',
    blobUrl: 'blob:go2-root',
  };

  const initial = createStableViewerResourceScope(null, {
    assets: {
      'robots/go2/usd/go2.usd': 'blob:go2-root',
      'robots/go2/usd/configuration/base.usd': 'blob:go2-base',
      'robots/h1/usd/h1.usd': 'blob:h1-root',
    },
    availableFiles: [
      sourceFile,
      {
        name: 'robots/go2/usd/configuration/base.usd',
        content: '',
        format: 'usd',
        blobUrl: 'blob:go2-base',
      },
      {
        name: 'robots/h1/usd/h1.usd',
        content: '',
        format: 'usd',
        blobUrl: 'blob:h1-root',
      },
    ],
    sourceFile,
  });

  const next = createStableViewerResourceScope(initial, {
    assets: {
      'robots/go2/usd/go2.usd': 'blob:go2-root',
      'robots/go2/usd/configuration/base.usd': 'blob:go2-base',
      'robots/h1/usd/h1.usd': 'blob:h1-root',
      'robots/h1/usd/configuration/base.usd': 'blob:h1-base',
    },
    availableFiles: [
      sourceFile,
      {
        name: 'robots/go2/usd/configuration/base.usd',
        content: '',
        format: 'usd',
        blobUrl: 'blob:go2-base',
      },
      {
        name: 'robots/h1/usd/h1.usd',
        content: '',
        format: 'usd',
        blobUrl: 'blob:h1-root',
      },
      {
        name: 'robots/h1/usd/configuration/base.usd',
        content: '',
        format: 'usd',
        blobUrl: 'blob:h1-base',
      },
    ],
    sourceFile,
  });

  assert.equal(next, initial);
  assert.deepEqual(
    next.availableFiles.map((file) => file.name),
    [
      'robots/go2/usd/go2.usd',
      'robots/go2/usd/configuration/base.usd',
    ],
  );
});

test('createStableViewerResourceScope includes top-level sibling mesh folders for root-level URDF bundles before robot links stabilize', () => {
  const scoped = createStableViewerResourceScope(null, {
    assets: {
      'urdf/b2w_description.urdf': 'blob:b2w-urdf',
      'meshes/RR_thigh.dae': 'blob:rr-thigh',
      'materials/b2w.png': 'blob:b2w-material',
      'robots/go1/meshes/base.dae': 'blob:go1-base',
    },
    availableFiles: [],
    sourceFile: {
      name: 'urdf/b2w_description.urdf',
      content: '<robot name="b2w" />',
      format: 'urdf',
    },
    sourceFilePath: 'urdf/b2w_description.urdf',
    robotLinks: {},
  });

  assert.deepEqual(scoped.assets, {
    'urdf/b2w_description.urdf': 'blob:b2w-urdf',
    'meshes/RR_thigh.dae': 'blob:rr-thigh',
    'materials/b2w.png': 'blob:b2w-material',
  });
});

test('createStableViewerResourceScope recognizes duplicate-suffixed top-level bundle folders from collision renames', () => {
  const scoped = createStableViewerResourceScope(null, {
    assets: {
      'urdf (1)/b2w_description.urdf': 'blob:b2w-urdf',
      'meshes (1)/RR_thigh.dae': 'blob:rr-thigh',
      'textures (1)/b2w.png': 'blob:b2w-texture',
      'robots/go1/meshes/base.dae': 'blob:go1-base',
    },
    availableFiles: [],
    sourceFile: {
      name: 'urdf (1)/b2w_description.urdf',
      content: '<robot name="b2w" />',
      format: 'urdf',
    },
    sourceFilePath: 'urdf (1)/b2w_description.urdf',
    robotLinks: {},
  });

  assert.deepEqual(scoped.assets, {
    'urdf (1)/b2w_description.urdf': 'blob:b2w-urdf',
    'meshes (1)/RR_thigh.dae': 'blob:rr-thigh',
    'textures (1)/b2w.png': 'blob:b2w-texture',
  });
});
