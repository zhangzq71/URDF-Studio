import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import type { RobotState, UrdfLink } from '@/types';
import { GeometryType } from '@/types';
import { translations } from '@/shared/i18n';
import { GeometryEditor } from './GeometryEditor.tsx';

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
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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

function createLink(secondaryColor: string): UrdfLink {
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
    visualBodies: [
      {
        type: GeometryType.BOX,
        dimensions: { x: 0.2, y: 0.2, z: 0.2 },
        color: secondaryColor,
        origin: { xyz: { x: 0.1, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
      },
    ],
    collision: {
      type: GeometryType.NONE,
      dimensions: { x: 0, y: 0, z: 0 },
      color: '#ef4444',
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

function createMultiMaterialMeshLink(): UrdfLink {
  const link = createLink('#00ff00');
  link.visual = {
    ...link.visual,
    type: GeometryType.MESH,
    dimensions: { x: 1, y: 1, z: 1 },
    meshPath: 'meshes/base_link.dae',
    authoredMaterials: [
      { name: 'body', color: '#bebebe' },
      { name: 'trim', color: '#ffffff' },
      { name: 'fastener', color: '#000000' },
      { name: 'accent', color: '#000000' },
    ],
  };
  (link.visual as { color?: string }).color = undefined;
  return link;
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
      objectIndex: 1,
    },
  };
}

function getReactProps(node: Element): Record<string, unknown> {
  const reactPropsKey = Object.keys(node).find((key) => key.startsWith('__reactProps$'));
  assert.ok(reactPropsKey, 'React props key should exist on rendered element');
  return (node as unknown as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const prototype = input.ownerDocument.defaultView?.HTMLInputElement.prototype;
  const valueSetter = prototype
    ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    : undefined;

  assert.ok(valueSetter, 'HTMLInputElement value setter should exist');
  valueSetter.call(input, value);
}

function dispatchReactChange(input: HTMLInputElement, value: string) {
  setInputValue(input, value);
  const reactProps = getReactProps(input);
  const onChange = reactProps.onChange;
  assert.equal(typeof onChange, 'function', 'React onChange handler should exist');

  (onChange as (event: { target: HTMLInputElement; currentTarget: HTMLInputElement }) => void)({
    target: input,
    currentTarget: input,
  });
}

function getColorInput(container: Element): HTMLInputElement {
  const input = container.querySelector('input[type="color"][aria-label="Color"]');
  assert.ok(input, 'color input should exist');
  return input as HTMLInputElement;
}

async function renderGeometryEditor(
  root: Root,
  link: UrdfLink,
  onUpdate: (nextLink: UrdfLink) => void,
  robot: RobotState = createRobot(link),
) {
  await act(async () => {
    root.render(
      React.createElement(GeometryEditor, {
        data: link,
        robot,
        category: 'visual',
        onUpdate,
        assets: {},
        onUploadAsset: () => {},
        t: translations.en,
        lang: 'en',
        isTabbed: true,
      }),
    );
  });
}

test('GeometryEditor reads and updates the selected visual objectIndex instead of always using the primary visual', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    const link = createLink('#00ff00');
    const updates: UrdfLink[] = [];

    await renderGeometryEditor(root, link, (nextLink) => {
      updates.push(nextLink);
    });

    const colorInput = getColorInput(container);
    assert.equal(colorInput.value.toLowerCase(), '#00ff00');

    await act(async () => {
      dispatchReactChange(colorInput, '#abcdef');
    });

    const nextLink = updates.at(-1);
    assert.ok(nextLink, 'GeometryEditor should emit an updated link');
    assert.equal(nextLink.visual.color, '#ff0000');
    assert.equal(nextLink.visualBodies?.[0]?.color, '#abcdef');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});

test('GeometryEditor normalizes alpha colors for the picker while preserving alpha on color picker edits', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    const link = createLink('#12345680');
    const updates: UrdfLink[] = [];

    await renderGeometryEditor(root, link, (nextLink) => {
      updates.push(nextLink);
    });

    const colorInput = getColorInput(container);
    assert.equal(colorInput.value.toLowerCase(), '#123456');

    await act(async () => {
      dispatchReactChange(colorInput, '#abcdef');
    });

    const nextLink = updates.at(-1);
    assert.ok(nextLink, 'GeometryEditor should emit an updated link');
    assert.equal(nextLink.visualBodies?.[0]?.color, '#abcdef80');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});

test('GeometryEditor shows authored material colors instead of a white fallback for multi-material mesh visuals', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    const link = createMultiMaterialMeshLink();
    const robot = createRobot(link);
    robot.selection.objectIndex = 0;

    await renderGeometryEditor(root, link, () => {
      throw new Error('multi-material display should not emit updates without user edits');
    }, robot);

    assert.ok(container.textContent?.includes('Multiple Materials'));
    assert.ok(container.textContent?.includes('#bebebe'));
    assert.ok(container.textContent?.includes('#ffffff'));
    assert.ok(container.textContent?.includes('#000000'));
    assert.equal(container.querySelector('input[type="color"][aria-label="Color"]'), null);

    const inputValues = Array.from(container.querySelectorAll('input'))
      .map((input) => (input as HTMLInputElement).value.trim().toLowerCase());
    assert.ok(!inputValues.includes('#ffffff'), 'multi-material meshes should not appear as editable white');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});
