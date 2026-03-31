import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { UnifiedVisualizerOptionsPanel } from './UnifiedVisualizerOptionsPanel';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
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

  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { HTMLInputElement?: typeof HTMLInputElement }).HTMLInputElement = dom.window.HTMLInputElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = dom.window.PointerEvent ?? dom.window.MouseEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

function createComponentRoot() {
  const dom = installDom();
  const container = dom.window.document.getElementById('root');
  assert.ok(container, 'root container should exist');

  const root = createRoot(container);
  return { dom, container, root };
}

function renderPanel(root: Root) {
  return act(async () => {
    root.render(
      React.createElement(UnifiedVisualizerOptionsPanel, {
        lang: 'zh',
        showGeometry: true,
        setShowGeometry: () => {},
        showOrigin: false,
        setShowOrigin: () => {},
        frameSize: 0.15,
        setFrameSize: () => {},
        showLabels: false,
        setShowLabels: () => {},
        labelScale: 1,
        setLabelScale: () => {},
        showJointAxes: false,
        setShowJointAxes: () => {},
        jointAxisSize: 0.35,
        setJointAxisSize: () => {},
        showCollision: false,
        setShowCollision: () => {},
        showInertia: false,
        setShowInertia: () => {},
        showCenterOfMass: false,
        setShowCenterOfMass: () => {},
        modelOpacity: 0.42,
        setModelOpacity: () => {},
        isCollapsed: false,
        toggleCollapsed: () => {},
        onMouseDown: () => {},
        onResetPosition: () => {},
        optionsPanelPos: null,
        groundPlaneOffset: 0,
        setGroundPlaneOffset: () => {},
      }),
    );
  });
}

test('visualizer options panel exposes the shared model opacity control', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderPanel(root);

  assert.match(container.textContent ?? '', /模型不透明度/);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
