import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { useVisualizerState } from './useVisualizerState.ts';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  (globalThis as { window?: Window }).window = dom.window as unknown as Window;
  (globalThis as { document?: Document }).document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: dom.window.localStorage,
    configurable: true,
  });

  return dom;
}

function renderState() {
  let hookValue: ReturnType<typeof useVisualizerState> | null = null;

  function Probe() {
    hookValue = useVisualizerState();
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  assert.ok(hookValue, 'hook should render');
  return hookValue;
}

test('visualizer options restore saved toggles and parameters', () => {
  const dom = installDom();
  dom.window.localStorage.setItem('urdf_visualizer_show_geometry', 'true');
  dom.window.localStorage.setItem('urdf_visualizer_show_origin', 'false');
  dom.window.localStorage.setItem('urdf_visualizer_show_labels', 'true');
  dom.window.localStorage.setItem('urdf_visualizer_show_joint_axes', 'true');
  dom.window.localStorage.setItem('urdf_visualizer_joint_axis_size', '0.75');
  dom.window.localStorage.setItem('urdf_viewer_origin_size', '0.24');
  dom.window.localStorage.setItem('urdf_visualizer_label_scale', '1.4');
  dom.window.localStorage.setItem('urdf_visualizer_show_collision', 'true');
  dom.window.localStorage.setItem('urdf_visualizer_show_inertia', 'true');
  dom.window.localStorage.setItem('urdf_visualizer_show_center_of_mass', 'true');

  const state = renderState();

  assert.equal(state.showGeometry, true);
  assert.equal(state.showOrigin, false);
  assert.equal(state.showLabels, true);
  assert.equal(state.showJointAxes, true);
  assert.equal(state.jointAxisSize, 0.75);
  assert.equal(state.frameSize, 0.24);
  assert.equal(state.labelScale, 1.4);
  assert.equal(state.showCollision, true);
  assert.equal(state.showInertia, true);
  assert.equal(state.showCenterOfMass, true);

  dom.window.close();
});
