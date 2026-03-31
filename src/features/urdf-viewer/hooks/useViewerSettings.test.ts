import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { useViewerSettings } from './useViewerSettings.ts';

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

function renderSettings() {
  let hookValue: ReturnType<typeof useViewerSettings> | null = null;

  function Probe() {
    hookValue = useViewerSettings();
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  assert.ok(hookValue, 'hook should render');
  return hookValue;
}

test('origin axes default to depth-occluded rendering when no preference is saved', () => {
  const dom = installDom();
  dom.window.localStorage.removeItem('urdf_viewer_origin_overlay_v2');
  dom.window.localStorage.setItem('urdf_viewer_origin_overlay', 'true');

  const settings = renderSettings();

  assert.equal(settings.showOriginsOverlay, false);

  dom.window.close();
});

test('origin axes overlay preference still restores explicit user opt-in', () => {
  const dom = installDom();
  dom.window.localStorage.setItem('urdf_viewer_origin_overlay_v2', 'true');

  const settings = renderSettings();

  assert.equal(settings.showOriginsOverlay, true);

  dom.window.close();
});

test('viewer visibility toggles and sizing parameters restore from saved preferences', () => {
  const dom = installDom();
  dom.window.localStorage.setItem('urdf_viewer_show_collision', 'true');
  dom.window.localStorage.setItem('urdf_viewer_show_visual', 'false');
  dom.window.localStorage.setItem('urdf_viewer_show_center_of_mass', 'true');
  dom.window.localStorage.setItem('urdf_viewer_com_size', '0.12');
  dom.window.localStorage.setItem('urdf_viewer_show_inertia', 'true');
  dom.window.localStorage.setItem('urdf_viewer_show_origins', 'true');
  dom.window.localStorage.setItem('urdf_viewer_origin_size', '0.18');
  dom.window.localStorage.setItem('urdf_viewer_show_joint_axes', 'true');
  dom.window.localStorage.setItem('urdf_viewer_joint_axis_size', '0.42');

  const settings = renderSettings();

  assert.equal(settings.showCollision, true);
  assert.equal(settings.localShowVisual, false);
  assert.equal(settings.showCenterOfMass, true);
  assert.equal(settings.centerOfMassSize, 0.12);
  assert.equal(settings.showInertia, true);
  assert.equal(settings.showOrigins, true);
  assert.equal(settings.originSize, 0.18);
  assert.equal(settings.showJointAxes, true);
  assert.equal(settings.jointAxisSize, 0.42);

  dom.window.close();
});
