import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { SnapshotDialog } from './SnapshotDialog';

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
  (globalThis as { HTMLButtonElement?: typeof HTMLButtonElement }).HTMLButtonElement =
    dom.window.HTMLButtonElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle =
    dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame =
    dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

test('SnapshotDialog reuses the segmented surface tone for AA choices', async () => {
  const dom = installDom();
  const container = dom.window.document.getElementById('root');
  assert.ok(container, 'root container should exist');

  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        React.createElement(SnapshotDialog, {
          isOpen: true,
          isCapturing: false,
          lang: 'en',
          onClose: () => {},
          onCapture: () => {},
        }),
      );
    });

    const twoXButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '2x',
    ) as HTMLButtonElement | undefined;
    assert.ok(twoXButton, 'AA segmented control should render the default 2x option');
    assert.match(
      twoXButton.className,
      /\bbg-segmented-active\b/,
      'selected AA option should use the same segmented active tone as settings controls',
    );
    assert.match(
      twoXButton.className,
      /\bring-1\b/,
      'selected AA option should keep the shared selected outline treatment',
    );

    const oneXButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '1x',
    ) as HTMLButtonElement | undefined;
    assert.ok(oneXButton, 'AA segmented control should render the 1x option');
    assert.match(
      oneXButton.className,
      /\btext-text-secondary\b/,
      'unselected AA option should keep the shared secondary text tone',
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
});
