import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveMergedVisualizerJointPresentation,
  shouldEnableMergedVisualizerJointTransformControls,
  shouldRenderMergedVisualizerConstraintOverlay,
} from './mergedVisualizerSceneMode.ts';

test('merged visualizer scene no longer shows the legacy constraint overlay', () => {
  assert.equal(shouldRenderMergedVisualizerConstraintOverlay('editor'), false);
});

test('merged visualizer scene keeps the joint transform gizmo enabled in editor mode', () => {
  assert.equal(shouldEnableMergedVisualizerJointTransformControls('editor'), true);
});

test('merged visualizer scene disables joint transform gizmos while assembly workspace transforms are active', () => {
  assert.equal(
    shouldEnableMergedVisualizerJointTransformControls('editor', { assemblyWorkspaceActive: true }),
    false,
  );
});

test('joint presentation keeps the shared solid helper styling', () => {
  assert.deepEqual(resolveMergedVisualizerJointPresentation({
    mode: 'editor',
    showGeometry: true,
    showJointLabel: false,
    showOrigin: true,
    showJointAxes: false,
  }), {
    showConnectorLine: false,
    connectorDashed: false,
    showHelperSphere: false,
  });
});

test('joint presentation still renders the shared solid connector when labels are visible', () => {
  assert.deepEqual(resolveMergedVisualizerJointPresentation({
    mode: 'editor',
    showGeometry: false,
    showJointLabel: true,
    showOrigin: false,
    showJointAxes: false,
  }), {
    showConnectorLine: true,
    connectorDashed: false,
    showHelperSphere: false,
  });
});

test('joint presentation falls back to a visible helper dot when no other affordance is shown', () => {
  assert.deepEqual(resolveMergedVisualizerJointPresentation({
    mode: 'editor',
    showGeometry: false,
    showJointLabel: false,
    showOrigin: false,
    showJointAxes: false,
  }), {
    showConnectorLine: false,
    connectorDashed: false,
    showHelperSphere: true,
  });
});
