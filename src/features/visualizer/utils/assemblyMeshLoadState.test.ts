import assert from 'node:assert/strict';
import test from 'node:test';

import { GeometryType, type AssemblyState, type RobotData } from '@/types';
import {
  buildAssemblyComponentLinkOwnerMap,
  buildAssemblyComponentMeshLoadKeyMap,
  collectAssemblyMeshLoadKeysForComponents,
  resolveReadyAssemblyMeshComponentIds,
} from './assemblyMeshLoadState.ts';

function createRobotData(componentId: string, linkIds: string[]): RobotData {
  const links: RobotData['links'] = Object.fromEntries(
    linkIds.map((linkId) => [
      `${componentId}_${linkId}`,
      {
        id: `${componentId}_${linkId}`,
        name: `${componentId}_${linkId}`,
        visual: {
          type: GeometryType.BOX,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#888888',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.BOX,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#888888',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
      },
    ]),
  );

  return {
    name: componentId,
    rootLinkId: `${componentId}_${linkIds[0]}`,
    links,
    joints: {},
  };
}

function createAssemblyState(): AssemblyState {
  return {
    name: 'assembly',
    components: {
      comp_alpha: {
        id: 'comp_alpha',
        name: 'Alpha',
        sourceFile: 'robots/alpha.urdf',
        robot: createRobotData('comp_alpha', ['base_link', 'tool_link']),
      },
      comp_beta: {
        id: 'comp_beta',
        name: 'Beta',
        sourceFile: 'robots/beta.urdf',
        robot: createRobotData('comp_beta', ['base_link']),
      },
      comp_hidden: {
        id: 'comp_hidden',
        name: 'Hidden',
        sourceFile: 'robots/hidden.urdf',
        robot: createRobotData('comp_hidden', ['base_link']),
        visible: false,
      },
    },
    bridges: {},
  };
}

test('buildAssemblyComponentMeshLoadKeyMap groups mesh keys by visible component link ownership', () => {
  const assemblyState = createAssemblyState();

  const componentMeshLoadKeyMap = buildAssemblyComponentMeshLoadKeyMap({
    assemblyState,
    meshLoadKeys: [
      'comp_alpha_base_link|collision|primary|0|meshes/base.stl',
      'comp_alpha_tool_link|collision|primary|0|meshes/tool.stl',
      'comp_beta_base_link|collision|primary|0|meshes/beta.stl',
      'comp_hidden_base_link|collision|primary|0|meshes/hidden.stl',
      'orphan_link|collision|primary|0|meshes/orphan.stl',
    ],
  });

  assert.deepEqual(
    Object.fromEntries(
      [...componentMeshLoadKeyMap.entries()].map(([componentId, meshLoadKeys]) => [
        componentId,
        [...meshLoadKeys].sort(),
      ]),
    ),
    {
      comp_alpha: [
        'comp_alpha_base_link|collision|primary|0|meshes/base.stl',
        'comp_alpha_tool_link|collision|primary|0|meshes/tool.stl',
      ],
      comp_beta: ['comp_beta_base_link|collision|primary|0|meshes/beta.stl'],
    },
  );
});

test('buildAssemblyComponentLinkOwnerMap only exposes visible component link ownership', () => {
  const assemblyState = createAssemblyState();

  assert.deepEqual(
    Object.fromEntries(buildAssemblyComponentLinkOwnerMap(assemblyState).entries()),
    {
      comp_alpha_base_link: 'comp_alpha',
      comp_alpha_tool_link: 'comp_alpha',
      comp_beta_base_link: 'comp_beta',
    },
  );
});

test('resolveReadyAssemblyMeshComponentIds only returns visible components whose mesh keys are resolved', () => {
  const assemblyState = createAssemblyState();
  const componentMeshLoadKeyMap = buildAssemblyComponentMeshLoadKeyMap({
    assemblyState,
    meshLoadKeys: [
      'comp_alpha_base_link|collision|primary|0|meshes/base.stl',
      'comp_alpha_tool_link|collision|primary|0|meshes/tool.stl',
      'comp_beta_base_link|collision|primary|0|meshes/beta.stl',
    ],
  });

  assert.deepEqual(
    resolveReadyAssemblyMeshComponentIds({
      assemblyState,
      componentMeshLoadKeyMap,
      resolvedMeshLoadKeys: new Set([
        'comp_alpha_base_link|collision|primary|0|meshes/base.stl',
        'comp_alpha_tool_link|collision|primary|0|meshes/tool.stl',
      ]),
      includeEmptyComponents: false,
    }),
    ['comp_alpha'],
  );
});

test('collectAssemblyMeshLoadKeysForComponents flattens deduplicated keys for revealed components', () => {
  const assemblyState = createAssemblyState();
  const componentMeshLoadKeyMap = buildAssemblyComponentMeshLoadKeyMap({
    assemblyState,
    meshLoadKeys: [
      'comp_alpha_base_link|collision|primary|0|meshes/base.stl',
      'comp_alpha_tool_link|collision|primary|0|meshes/tool.stl',
      'comp_beta_base_link|collision|primary|0|meshes/beta.stl',
    ],
  });

  assert.deepEqual(
    [
      ...collectAssemblyMeshLoadKeysForComponents({
        componentIds: ['comp_beta', 'comp_alpha', 'comp_alpha'],
        componentMeshLoadKeyMap,
      }),
    ].sort(),
    [
      'comp_alpha_base_link|collision|primary|0|meshes/base.stl',
      'comp_alpha_tool_link|collision|primary|0|meshes/tool.stl',
      'comp_beta_base_link|collision|primary|0|meshes/beta.stl',
    ],
  );
});
