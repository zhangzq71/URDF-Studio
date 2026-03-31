import test from 'node:test';
import assert from 'node:assert/strict';

import type { URDFViewerController } from '../hooks/useURDFViewerController';
import { buildURDFViewerSceneProps } from './viewerSceneProps';

function createControllerStub(overrides: Partial<URDFViewerController> = {}): URDFViewerController {
  return {
    groundPlaneOffset: 1.25,
    toolMode: 'measure',
    ...overrides,
  } as URDFViewerController;
}

test('buildURDFViewerSceneProps uses controller-owned defaults for viewer scene wiring', () => {
  const controller = createControllerStub();

  const sceneProps = buildURDFViewerSceneProps({
    controller,
    availableFiles: [],
    urdfContent: '<robot name="go2" />',
    assets: {},
    mode: 'detail',
  });

  assert.equal(sceneProps.controller, controller);
  assert.equal(sceneProps.groundPlaneOffset, 1.25);
  assert.equal(sceneProps.toolMode, 'measure');
  assert.equal(sceneProps.active, true);
  assert.equal(sceneProps.hoverSelectionEnabled, true);
  assert.equal(sceneProps.isMeshPreview, false);
  assert.equal(sceneProps.runtimeInstanceKey, 0);
});

test('buildURDFViewerSceneProps preserves explicit overrides for preview and handoff flows', () => {
  const controller = createControllerStub({
    groundPlaneOffset: 0.5,
    toolMode: 'select',
  });
  const onHover = () => {};
  const onMeshSelect = () => {};

  const sceneProps = buildURDFViewerSceneProps({
    controller,
    active: false,
    sourceFile: {
      name: 'robots/go2/urdf/go2.urdf',
      content: '<robot name="go2" />',
      format: 'urdf',
    },
    availableFiles: [],
    urdfContent: '<robot name="go2" />',
    assets: { 'robots/go2/meshes/base.dae': 'blob:base' },
    sourceFilePath: 'robots/go2/urdf/go2.urdf',
    groundPlaneOffset: 3.5,
    mode: 'detail',
    hoveredSelection: { type: 'link', id: 'base_link' },
    hoverSelectionEnabled: false,
    onHover,
    onMeshSelect,
    isMeshPreview: true,
    runtimeInstanceKey: 7,
  });

  assert.equal(sceneProps.active, false);
  assert.equal(sceneProps.mode, 'detail');
  assert.equal(sceneProps.groundPlaneOffset, 3.5);
  assert.equal(sceneProps.toolMode, 'select');
  assert.equal(sceneProps.hoverSelectionEnabled, false);
  assert.equal(sceneProps.onHover, onHover);
  assert.equal(sceneProps.onMeshSelect, onMeshSelect);
  assert.equal(sceneProps.isMeshPreview, true);
  assert.equal(sceneProps.runtimeInstanceKey, 7);
});
