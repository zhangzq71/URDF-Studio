import assert from 'node:assert/strict';
import test from 'node:test';

import { GeometryType, JointType, type AssemblyState } from '@/types';
import type { Selection } from '@/store/selectionStore';

import {
  filterSelectableBridgeComponents,
  isAssemblySelectionAllowedForBridge,
  resolveAssemblySelection,
  resolveBlockedBridgeComponentId,
} from './bridgeSelection.ts';

function createAssemblyState(): AssemblyState {
  return {
    name: 'test-assembly',
    components: {
      component_a: {
        id: 'component_a',
        name: 'Component A',
        sourceFile: 'component_a.urdf',
        robot: {
          name: 'robot_a',
          rootLinkId: 'component_a/base_link',
          links: {
            'component_a/base_link': {
              id: 'component_a/base_link',
              name: 'base_link',
              visual: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
            },
            'component_a/tool_link': {
              id: 'component_a/tool_link',
              name: 'tool_link',
              visual: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
            },
          },
          joints: {
            'component_a/tool_joint': {
              id: 'component_a/tool_joint',
              name: 'tool_joint',
              type: JointType.FIXED,
              parentLinkId: 'component_a/base_link',
              childLinkId: 'component_a/tool_link',
              origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              dynamics: { damping: 0, friction: 0 },
              hardware: { armature: 0, motorType: '', motorId: '', motorDirection: 1 },
            },
          },
        },
      },
      component_b: {
        id: 'component_b',
        name: 'Component B',
        sourceFile: 'component_b.urdf',
        robot: {
          name: 'robot_b',
          rootLinkId: 'component_b/base_link',
          links: {
            'component_b/base_link': {
              id: 'component_b/base_link',
              name: 'base_link',
              visual: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
            },
          },
          joints: {},
        },
      },
    },
    bridges: {},
  };
}

test('resolveAssemblySelection maps both link and joint picks back to their component and link', () => {
  const assemblyState = createAssemblyState();

  assert.deepEqual(
    resolveAssemblySelection(assemblyState, { type: 'link', id: 'component_a/tool_link' }),
    {
      componentId: 'component_a',
      componentName: 'Component A',
      linkId: 'component_a/tool_link',
      linkName: 'tool_link',
    },
  );

  assert.deepEqual(
    resolveAssemblySelection(assemblyState, { type: 'joint', id: 'component_a/tool_joint' }),
    {
      componentId: 'component_a',
      componentName: 'Component A',
      linkId: 'component_a/tool_link',
      linkName: 'tool_link',
    },
  );
});

test('resolveBlockedBridgeComponentId blocks the opposite side component for the active pick target', () => {
  assert.equal(resolveBlockedBridgeComponentId({
    pickTarget: 'child',
    parentComponentId: 'component_a',
    childComponentId: '',
  }), 'component_a');

  assert.equal(resolveBlockedBridgeComponentId({
    pickTarget: 'parent',
    parentComponentId: '',
    childComponentId: 'component_b',
  }), 'component_b');
});

test('bridge selection rules reject picks from the blocked component and trim dropdown options', () => {
  const assemblyState = createAssemblyState();
  const blockedComponentId = 'component_a';

  assert.equal(
    isAssemblySelectionAllowedForBridge(
      assemblyState,
      { type: 'link', id: 'component_a/base_link' } satisfies Selection,
      blockedComponentId,
    ),
    false,
  );

  assert.equal(
    isAssemblySelectionAllowedForBridge(
      assemblyState,
      { type: 'link', id: 'component_b/base_link' } satisfies Selection,
      blockedComponentId,
    ),
    true,
  );

  assert.deepEqual(
    filterSelectableBridgeComponents(Object.values(assemblyState.components), blockedComponentId).map((component) => component.id),
    ['component_b'],
  );
});
