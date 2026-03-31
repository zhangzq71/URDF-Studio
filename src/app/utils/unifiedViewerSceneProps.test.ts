import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  URDFViewerController,
  URDFViewerProps,
  ViewerResourceScope,
} from '@/features/urdf-viewer';
import type { RobotState } from '@/types';
import {
  buildUnifiedViewerSceneProps,
  EMPTY_VIEWER_SELECTION,
} from './unifiedViewerSceneProps';

function createControllerStub(overrides: Partial<URDFViewerController> = {}): URDFViewerController {
  return {
    groundPlaneOffset: 2,
    toolMode: 'measure',
    ...overrides,
  } as URDFViewerController;
}

function createRobotStub(): RobotState {
  return {
    name: 'go2',
    rootLinkId: 'base_link',
    links: { base_link: {} as RobotState['links'][string] },
    joints: { hip_joint: {} as RobotState['joints'][string] },
    selection: { type: null, id: null },
  };
}

function createScopeStub(): ViewerResourceScope {
  return {
    assets: { 'robots/go2/meshes/base.dae': 'blob:base' },
    availableFiles: [],
    signature: 'viewer-scope',
  };
}

test('buildUnifiedViewerSceneProps preserves live interaction wiring without preview', () => {
  const controller = createControllerStub();
  const selection: NonNullable<URDFViewerProps['selection']> = { type: 'link', id: 'base_link' };
  const hoveredSelection: NonNullable<URDFViewerProps['hoveredSelection']> = { type: 'joint', id: 'hip_joint' };
  const onHover = () => {};
  const onMeshSelect = () => {};

  const sceneProps = buildUnifiedViewerSceneProps({
    controller,
    active: true,
    hasActivePreview: false,
    hoveredSelection,
    viewerResourceScope: createScopeStub(),
    effectiveSourceFile: null,
    effectiveUrdfContent: '<robot name="go2" />',
    mode: 'hardware',
    selection,
    onHover,
    onMeshSelect,
    robot: createRobotStub(),
    focusTarget: 'base_link',
    isMeshPreview: true,
    viewerReloadKey: 9,
  });

  assert.equal(sceneProps.mode, 'hardware');
  assert.equal(sceneProps.selection, selection);
  assert.equal(sceneProps.hoveredSelection, hoveredSelection);
  assert.equal(sceneProps.hoverSelectionEnabled, true);
  assert.equal(sceneProps.onHover, onHover);
  assert.equal(sceneProps.onMeshSelect, onMeshSelect);
  assert.equal(sceneProps.robotLinks?.base_link !== undefined, true);
  assert.equal(sceneProps.robotJoints?.hip_joint !== undefined, true);
  assert.equal(sceneProps.focusTarget, 'base_link');
  assert.equal(sceneProps.isMeshPreview, true);
  assert.equal(sceneProps.runtimeInstanceKey, 9);
});

test('buildUnifiedViewerSceneProps clamps preview sessions to a read-only detail scene', () => {
  const controller = createControllerStub();
  const onHover = () => {};
  const onMeshSelect = () => {};
  const onCollisionTransformPreview = () => {};
  const onCollisionTransform = () => {};

  const sceneProps = buildUnifiedViewerSceneProps({
    controller,
    active: true,
    hasActivePreview: true,
    hoveredSelection: { type: 'link', id: 'base_link' },
    viewerResourceScope: createScopeStub(),
    effectiveSourceFile: null,
    effectiveUrdfContent: '<robot name="go2" />',
    mode: 'hardware',
    selection: { type: 'joint', id: 'hip_joint' },
    onHover,
    onMeshSelect,
    robot: createRobotStub(),
    focusTarget: 'base_link',
    onCollisionTransformPreview,
    onCollisionTransform,
    isMeshPreview: true,
    viewerReloadKey: 3,
  });

  assert.equal(sceneProps.mode, 'detail');
  assert.deepEqual(sceneProps.selection, EMPTY_VIEWER_SELECTION);
  assert.equal(sceneProps.hoveredSelection, undefined);
  assert.equal(sceneProps.hoverSelectionEnabled, false);
  assert.equal(sceneProps.onHover, undefined);
  assert.equal(sceneProps.onMeshSelect, undefined);
  assert.equal(sceneProps.robotLinks, undefined);
  assert.equal(sceneProps.robotJoints, undefined);
  assert.equal(sceneProps.focusTarget, undefined);
  assert.equal(sceneProps.onCollisionTransformPreview, undefined);
  assert.equal(sceneProps.onCollisionTransform, undefined);
  assert.equal(sceneProps.isMeshPreview, false);
  assert.equal(sceneProps.runtimeInstanceKey, 3);
});

test('buildUnifiedViewerSceneProps disables hover interaction for inactive retained scenes without dropping selection', () => {
  const controller = createControllerStub();
  const selection: NonNullable<URDFViewerProps['selection']> = { type: 'link', id: 'base_link' };
  const hoveredSelection: NonNullable<URDFViewerProps['hoveredSelection']> = { type: 'joint', id: 'hip_joint' };
  const onHover = () => {};
  const onMeshSelect = () => {};

  const sceneProps = buildUnifiedViewerSceneProps({
    controller,
    active: false,
    hasActivePreview: false,
    hoveredSelection,
    viewerResourceScope: createScopeStub(),
    effectiveSourceFile: null,
    effectiveUrdfContent: '<robot name="go2" />',
    mode: 'detail',
    selection,
    onHover,
    onMeshSelect,
    robot: createRobotStub(),
  });

  assert.equal(sceneProps.selection, selection);
  assert.equal(sceneProps.hoveredSelection, hoveredSelection);
  assert.equal(sceneProps.hoverSelectionEnabled, false);
  assert.equal(sceneProps.onHover, undefined);
  assert.equal(sceneProps.onMeshSelect, undefined);
  assert.equal(sceneProps.robotLinks?.base_link !== undefined, true);
});
