import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ScanSearch } from 'lucide-react';

import { translations } from '@/shared/i18n';
import { ToolboxMenu } from './ToolboxMenu';
import type { ToolboxItem } from './types';

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

function makeTestItems(overrides?: {
  onIkTool?: () => void;
  onRobogoClick?: () => void;
}): ToolboxItem[] {
  return [
    {
      key: 'ai-inspection',
      title: translations.en.aiInspection,
      description: translations.en.aiInspectionDesc,
      icon: <ScanSearch className="h-[18px] w-[18px]" />,
      onClick: () => {},
      tone: 'primary',
    },
    {
      key: 'ik-tool',
      title: translations.en.ikTool,
      description: translations.en.ikToolboxDesc,
      icon: <ScanSearch className="h-[18px] w-[18px]" />,
      onClick: overrides?.onIkTool ?? (() => {}),
      tone: 'primary',
    },
    {
      key: 'robogo',
      title: translations.en.robogo,
      description: translations.en.robogoDesc,
      icon: <img src="/logos/d-robotics-logo.jpg" alt="" className="h-5 w-5" />,
      onClick: overrides?.onRobogoClick ?? (() => {}),
      external: true,
      tone: 'logo',
    },
  ];
}

test('Toolbox menu exposes the IK entry and triggers its action', async () => {
  const { dom, container, root } = createComponentRoot();
  let closed = false;
  let openIk = false;

  const items = makeTestItems({
    onIkTool: () => {
      openIk = true;
    },
  });

  await act(async () => {
    root.render(
      <ToolboxMenu
        t={translations.en}
        onClose={() => {
          closed = true;
        }}
        items={items}
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
  const items = makeTestItems();

  await act(async () => {
    root.render(<ToolboxMenu t={translations.en} onClose={() => {}} items={items} />);
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

test('Toolbox menu exposes the RoboGo external entry and closes on click', async () => {
  const { dom, container, root } = createComponentRoot();
  let closed = false;
  let robogoClicked = false;

  const items = makeTestItems({
    onRobogoClick: () => {
      robogoClicked = true;
    },
  });

  await act(async () => {
    root.render(
      <ToolboxMenu
        t={translations.en}
        onClose={() => {
          closed = true;
        }}
        items={items}
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
  assert.equal(robogoClicked, true);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
