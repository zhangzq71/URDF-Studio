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
