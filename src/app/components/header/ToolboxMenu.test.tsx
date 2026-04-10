import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { translations } from '@/shared/i18n';
import { ToolboxMenu } from './ToolboxMenu';

type TestRoot = {
  dom: JSDOM;
  container: HTMLDivElement;
  root: Root;
};

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

  const matchMediaStub = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  (globalThis as { matchMedia?: typeof window.matchMedia }).matchMedia = matchMediaStub;
  dom.window.matchMedia = matchMediaStub;

  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent =
    dom.window.PointerEvent ?? dom.window.MouseEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle =
    dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame =
    dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

function createComponentRoot(): TestRoot {
  const dom = installDom();
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  return { dom, container, root };
}

test('Toolbox menu exposes the IK entry and triggers its action', async () => {
  const { dom, container, root } = createComponentRoot();
  let closed = false;
  let openIk = false;

  await act(async () => {
    root.render(
      <ToolboxMenu
        t={translations.en}
        onClose={() => {
          closed = true;
        }}
        onOpenAIInspection={() => {}}
        onOpenAIConversation={() => {}}
        onOpenIkTool={() => {
          openIk = true;
        }}
        onOpenCollisionOptimizer={() => {}}
      />,
    );
  });

  const ikButton = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${translations.en.ikTool}"]`,
  );
  assert.ok(ikButton, 'IK toolbox entry should render');

  await act(async () => {
    ikButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

  assert.equal(openIk, true);
  assert.equal(closed, true);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('Toolbox menu no longer renders the measure entry', async () => {
  const { dom, container, root } = createComponentRoot();

  await act(async () => {
    root.render(
      <ToolboxMenu
        t={translations.en}
        onClose={() => {}}
        onOpenAIInspection={() => {}}
        onOpenAIConversation={() => {}}
        onOpenIkTool={() => {}}
        onOpenCollisionOptimizer={() => {}}
      />,
    );
  });

  const measureButton = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${translations.en.measureMode}"]`,
  );
  assert.equal(measureButton, null);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('Toolbox menu exposes the RoboGo external entry and opens the official site', async () => {
  const { dom, container, root } = createComponentRoot();
  let closed = false;
  const openCalls: Array<[string, string | undefined, string | undefined]> = [];
  const openStub = ((url?: string | URL, target?: string, features?: string) => {
    openCalls.push([String(url), target, features]);
    return null;
  }) as typeof window.open;

  dom.window.open = openStub;
  globalThis.window.open = openStub;

  await act(async () => {
    root.render(
      <ToolboxMenu
        t={translations.en}
        onClose={() => {
          closed = true;
        }}
        onOpenAIInspection={() => {}}
        onOpenAIConversation={() => {}}
        onOpenIkTool={() => {}}
        onOpenCollisionOptimizer={() => {}}
      />,
    );
  });

  const robogoButton = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${translations.en.robogo}"]`,
  );
  assert.ok(robogoButton, 'RoboGo toolbox entry should render');

  await act(async () => {
    robogoButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

  assert.equal(closed, true);
  assert.deepEqual(openCalls, [['https://robogo.d-robotics.cc/', '_blank', 'noopener,noreferrer']]);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
