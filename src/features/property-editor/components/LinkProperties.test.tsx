import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import type { AppMode, RobotState, UrdfLink } from '@/types';
import { GeometryType } from '@/types';
import { translations } from '@/shared/i18n';
import { useUIStore } from '@/store';
import { LinkProperties } from './LinkProperties.tsx';

function createLink(): UrdfLink {
  return {
    id: 'base_link',
    name: 'base_link',
    visible: true,
    visual: {
      type: GeometryType.BOX,
      dimensions: { x: 0.4, y: 0.3, z: 0.2 },
      color: '#ff0000',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
    },
    visualBodies: [],
    collision: {
      type: GeometryType.BOX,
      dimensions: { x: 0.4, y: 0.3, z: 0.2 },
      color: '#00ff00',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
    },
    collisionBodies: [],
    inertial: {
      mass: 1,
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
    },
  };
}

function createRobot(link: UrdfLink): RobotState {
  return {
    name: 'demo',
    links: {
      [link.id]: link,
    },
    joints: {},
    rootLinkId: link.id,
    selection: {
      type: 'link',
      id: link.id,
      subType: 'visual',
      objectIndex: 0,
    },
  };
}

function renderLinkProperties(mode: AppMode, detailLinkTab: 'visual' | 'collision' | 'physics' = 'visual') {
  const link = createLink();
  const robot = createRobot(link);
  useUIStore.getState().setDetailLinkTab(detailLinkTab);

  return renderToStaticMarkup(
    React.createElement(LinkProperties, {
      data: link,
      robot,
      mode,
      selection: robot.selection,
      onUpdate: () => {},
      motorLibrary: {},
      assets: {},
      onUploadAsset: () => {},
      t: translations.en,
      lang: 'en',
    }),
  );
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

  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { HTMLInputElement?: typeof HTMLInputElement }).HTMLInputElement = dom.window.HTMLInputElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = dom.window.PointerEvent ?? dom.window.MouseEvent;
  (globalThis as { InputEvent?: typeof InputEvent }).InputEvent = dom.window.InputEvent;
  (globalThis as { FocusEvent?: typeof FocusEvent }).FocusEvent = dom.window.FocusEvent;
  (globalThis as { KeyboardEvent?: typeof KeyboardEvent }).KeyboardEvent = dom.window.KeyboardEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  if (!('attachEvent' in dom.window.HTMLElement.prototype)) {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'attachEvent', {
      value: () => {},
      configurable: true,
    });
  }
  if (!('detachEvent' in dom.window.HTMLElement.prototype)) {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'detachEvent', {
      value: () => {},
      configurable: true,
    });
  }
  if (!('setPointerCapture' in dom.window.HTMLElement.prototype)) {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'setPointerCapture', {
      value: () => {},
      configurable: true,
    });
  }
  if (!('releasePointerCapture' in dom.window.HTMLElement.prototype)) {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'releasePointerCapture', {
      value: () => {},
      configurable: true,
    });
  }
  if (!('hasPointerCapture' in dom.window.HTMLElement.prototype)) {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'hasPointerCapture', {
      value: () => false,
      configurable: true,
    });
  }

  return dom;
}

function createComponentRoot() {
  const dom = installDom();
  const container = dom.window.document.getElementById('root');
  assert.ok(container, 'root container should exist');

  const root = createRoot(container);
  return { dom, container, root };
}

async function destroyComponentRoot(dom: JSDOM, root: Root) {
  await act(async () => {
    root.unmount();
  });
  dom.window.close();
}

for (const mode of ['skeleton', 'detail', 'hardware'] as const) {
  test(`mode \`${mode}\` renders link-only editing layout without embedded joint properties`, () => {
    const markup = renderLinkProperties(mode);

    assert.doesNotMatch(markup, new RegExp(translations.en.selectedJoint));
    assert.match(markup, new RegExp(translations.en.visualGeometry));
    assert.match(markup, new RegExp(translations.en.collisionGeometry));
    assert.match(markup, new RegExp(translations.en.physics));
  });
}

test('physics tab keeps diagonal inertia inline and principal axes in a matrix layout', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    const link = createLink();
    const robot = createRobot(link);

    await act(async () => {
      useUIStore.getState().setDetailLinkTab('physics');
      root.render(
        React.createElement(LinkProperties, {
          data: link,
          robot,
          mode: 'detail',
          selection: robot.selection,
          onUpdate: () => {},
          motorLibrary: {},
          assets: {},
          onUploadAsset: () => {},
          t: translations.en,
          lang: 'en',
        }),
      );
    });

    const i1Label = Array.from(container.querySelectorAll('span'))
      .find((node) => node.textContent === 'I1');
    assert.ok(i1Label, 'I1 label should render');
    assert.equal(i1Label.parentElement?.className.includes('items-center'), true);
    assert.ok(i1Label.parentElement?.querySelector('input'), 'I1 label should share its row with a number input');

    const xHeader = Array.from(container.querySelectorAll('span'))
      .find((node) => node.textContent === 'X');
    assert.ok(xHeader, 'principal axes X header should render');
    assert.equal(xHeader.parentElement?.textContent?.includes('A1'), false);

    const a1Label = Array.from(container.querySelectorAll('div'))
      .find((node) => node.textContent?.trim() === 'A1');
    assert.ok(a1Label, 'principal axes A1 label should render');
    const a1Row = a1Label.parentElement;
    assert.ok(a1Row, 'principal axes A1 label should belong to a row container');
    assert.equal(a1Row.children.length, 4, 'principal axes A1 row should keep one label column plus three value columns');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});
