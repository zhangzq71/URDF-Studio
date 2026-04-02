import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { useDraggablePanel } from './useDraggablePanel.ts';

function createRect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  };
}

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
  (globalThis as { HTMLDivElement?: typeof HTMLDivElement }).HTMLDivElement = dom.window.HTMLDivElement;
  (globalThis as { HTMLButtonElement?: typeof HTMLButtonElement }).HTMLButtonElement = dom.window.HTMLButtonElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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

function Harness() {
  const drag = useDraggablePanel();

  useLayoutEffect(() => {
    const containerElement = drag.containerRef.current;
    const panelElement = drag.optionsPanelRef.current;

    if (!containerElement || !panelElement) {
      return;
    }

    const committedPos = drag.optionsPanelPos ?? { x: 20, y: 30 };

    Object.defineProperty(containerElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(0, 0, 600, 400),
    });

    Object.defineProperty(panelElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const liveX = Number.parseFloat(panelElement.style.left || `${committedPos.x}`);
        const liveY = Number.parseFloat(panelElement.style.top || `${committedPos.y}`);
        return createRect(
          Number.isFinite(liveX) ? liveX : committedPos.x,
          Number.isFinite(liveY) ? liveY : committedPos.y,
          200,
          100,
        );
      },
    });
  }, [drag.containerRef, drag.optionsPanelPos, drag.optionsPanelRef]);

  return React.createElement(
    'div',
    {
      ref: drag.containerRef,
      onMouseMove: drag.handleMouseMove,
      onMouseUp: drag.handleMouseUp,
    },
    React.createElement(
      'div',
      { ref: drag.optionsPanelRef },
      React.createElement(
        'button',
        {
          id: 'options-header',
          onMouseDown: (event: React.MouseEvent) => drag.handleMouseDown(event),
        },
        'drag',
      ),
    ),
    React.createElement(
      'output',
      { id: 'options-pos' },
      drag.optionsPanelPos ? `${drag.optionsPanelPos.x},${drag.optionsPanelPos.y}` : 'null',
    ),
  );
}

async function renderHarness(root: Root) {
  await act(async () => {
    root.render(React.createElement(Harness));
  });
}

test('visualizer options panel dragging keeps updating when the mousemove happens on document', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderHarness(root);

  const header = container.querySelector('#options-header');
  const optionsPanel = header?.parentElement as HTMLDivElement | null;
  const positionOutput = container.querySelector('#options-pos');
  assert.ok(header, 'options drag header should render');
  assert.ok(optionsPanel, 'options panel should render');
  assert.ok(positionOutput, 'position output should render');

  assert.equal(positionOutput.textContent, 'null');

  await act(async () => {
    header.dispatchEvent(new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 60,
    }));
  });

  await act(async () => {
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 170,
      clientY: 190,
      buttons: 1,
    }));
  });

  assert.equal(optionsPanel.style.left, '140px');
  assert.equal(optionsPanel.style.top, '160px');
  assert.equal(positionOutput.textContent, 'null');

  await act(async () => {
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 210,
      clientY: 230,
      buttons: 1,
    }));
  });

  assert.equal(optionsPanel.style.left, '180px');
  assert.equal(optionsPanel.style.top, '200px');
  assert.equal(positionOutput.textContent, 'null');

  await act(async () => {
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: 210,
      clientY: 230,
    }));
  });

  assert.equal(positionOutput.textContent, '180,200');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
