import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { translations } from '@/shared/i18n';
import { useSelectionStore } from '@/store/selectionStore';
import { DEFAULT_LINK, GeometryType, type RobotState } from '@/types';
import { TreeNode } from './TreeNode.tsx';

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

async function destroyComponentRoot(dom: JSDOM, root: Root) {
  await act(async () => {
    root.unmount();
  });
  dom.window.close();
}

function createRobotWithCollision(): RobotState {
  return {
    name: 'test-robot',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    joints: {},
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.BOX,
          dimensions: { x: 0.2, y: 0.2, z: 0.2 },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.BOX,
          dimensions: { x: 0.18, y: 0.18, z: 0.18 },
        },
        collisionBodies: [],
      },
    },
    materials: {},
    closedLoopConstraints: [],
  };
}

function findButtonByText(text: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll('button')).find((button) => (
    button.textContent?.includes(text)
  )) as HTMLButtonElement | null;
}

test('TreeNode link context menu is portaled and exposes collision add/delete actions', async () => {
  const { dom, container, root } = createComponentRoot();

  try {
    useSelectionStore.setState({
      selection: { type: null, id: null },
      hoveredSelection: { type: null, id: null },
      deferredHoveredSelection: { type: null, id: null },
      hoverFrozen: false,
      attentionSelection: { type: null, id: null },
      focusTarget: null,
    });

    const robot = createRobotWithCollision();
    const addedCollisionTargets: string[] = [];

    await act(async () => {
      root.render(
        <div style={{ containIntrinsicSize: '320px', contentVisibility: 'auto' }}>
          <TreeNode
            linkId="base_link"
            robot={robot}
            onSelect={() => {}}
            onAddChild={() => {}}
            onAddCollisionBody={(parentId) => {
              addedCollisionTargets.push(parentId);
            }}
            onDelete={() => {}}
            onUpdate={() => {}}
            mode="detail"
            t={translations.en}
          />
        </div>,
      );
    });

    const linkRow = container.querySelector('[title="base_link"]') as HTMLDivElement | null;
    assert.ok(linkRow, 'link row should render');

    await act(async () => {
      linkRow.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 120,
        clientY: 80,
      }));
    });

    const addCollisionButton = findButtonByText(translations.en.addCollisionBody);
    const deleteCollisionButton = findButtonByText(translations.en.deleteCollisionGeometry);

    assert.ok(addCollisionButton, 'right-clicking a link should expose add collision body');
    assert.ok(deleteCollisionButton, 'right-clicking a link with collisions should expose delete collision geometry');
    assert.equal(container.contains(addCollisionButton), false, 'context menu should render outside the tree container');
    assert.equal(document.body.contains(addCollisionButton), true, 'context menu should be portaled to document.body');

    await act(async () => {
      addCollisionButton.dispatchEvent(new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }));
    });

    assert.deepEqual(addedCollisionTargets, ['base_link']);
  } finally {
    await destroyComponentRoot(dom, root);
  }
});
