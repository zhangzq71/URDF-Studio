import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { Slider } from './Slider';

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

function renderSlider(root: Root, props: Partial<React.ComponentProps<typeof Slider>> = {}) {
  return act(async () => {
    root.render(
      React.createElement(Slider, {
        value: 0,
        min: 0,
        max: 100,
        step: 1,
        onChange: () => {},
        ...props,
      }),
    );
  });
}

test('pointer dragging emits continuous slider updates before release', async () => {
  const { dom, container, root } = createComponentRoot();
  const changes: number[] = [];
  let dragStarts = 0;
  let dragEnds = 0;

  await renderSlider(root, {
    onChange: (nextValue) => changes.push(nextValue),
    onChangeStart: () => {
      dragStarts += 1;
    },
    onChangeEnd: () => {
      dragEnds += 1;
    },
  });

  const track = container.querySelector('[data-testid="ui-slider-track"]') as HTMLDivElement | null;
  assert.ok(track, 'slider track should render');

  Object.defineProperty(track, 'getBoundingClientRect', {
    value: () => ({
      bottom: 24,
      height: 24,
      left: 0,
      right: 100,
      toJSON: () => ({}),
      top: 0,
      width: 100,
      x: 0,
      y: 0,
    }),
    configurable: true,
  });

  await act(async () => {
    track.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: 20,
      clientY: 12,
    }));
  });

  assert.equal(dragStarts, 1);
  assert.deepEqual(changes, [20]);

  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 78,
      clientY: 12,
    }));
  });

  assert.deepEqual(changes, [20, 78]);

  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  assert.equal(dragEnds, 1);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('snapToMarks locks dragging to the nearest mark', async () => {
  const { dom, container, root } = createComponentRoot();
  const changes: number[] = [];

  await renderSlider(root, {
    min: 0,
    max: 2,
    step: 1,
    snapToMarks: true,
    marks: [
      { value: 0, label: '1x' },
      { value: 1, label: '2x' },
      { value: 2, label: '4x' },
    ],
    onChange: (nextValue) => changes.push(nextValue),
  });

  const track = container.querySelector('[data-testid="ui-slider-track"]') as HTMLDivElement | null;
  assert.ok(track, 'slider track should render');

  Object.defineProperty(track, 'getBoundingClientRect', {
    value: () => ({
      bottom: 24,
      height: 24,
      left: 0,
      right: 200,
      toJSON: () => ({}),
      top: 0,
      width: 200,
      x: 0,
      y: 0,
    }),
    configurable: true,
  });

  await act(async () => {
    track.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: 130,
      clientY: 12,
    }));
  });

  assert.deepEqual(changes, [1], 'dragging should snap to the nearest discrete mark');
  assert.ok(container.querySelector('[data-testid="ui-slider-marks"]'), 'marks should render');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('solidThumb adds an opaque panel halo without changing the default slider thumb styling', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderSlider(root, {
    solidThumb: true,
  });

  const emphasizedThumb = container.querySelector('[data-testid="ui-slider-thumb"]') as HTMLDivElement | null;
  assert.ok(emphasizedThumb, 'slider thumb should render');
  const emphasizedStyle = emphasizedThumb.getAttribute('style') ?? '';
  assert.match(emphasizedStyle, /0 0 0 2px var\(--ui-panel-bg\)/, 'solid thumb should render an opaque halo');

  await renderSlider(root, {
    solidThumb: false,
  });

  const defaultThumb = container.querySelector('[data-testid="ui-slider-thumb"]') as HTMLDivElement | null;
  assert.ok(defaultThumb, 'default slider thumb should still render');
  const defaultStyle = defaultThumb.getAttribute('style') ?? '';
  assert.doesNotMatch(defaultStyle, /0 0 0 2px var\(--ui-panel-bg\)/, 'default slider thumb should keep the shared styling');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
