import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { GeometryType, JointType, type AssemblyState } from '@/types';
import { useAssemblySelectionStore } from '@/store/assemblySelectionStore';
import { useSelectionStore } from '@/store/selectionStore';

import { BridgeCreateModal } from './BridgeCreateModal.tsx';

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
  (globalThis as { HTMLSelectElement?: typeof HTMLSelectElement }).HTMLSelectElement = dom.window.HTMLSelectElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = dom.window.PointerEvent ?? dom.window.MouseEvent;
  (globalThis as { KeyboardEvent?: typeof KeyboardEvent }).KeyboardEvent = dom.window.KeyboardEvent;
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

function createAssemblyState(): AssemblyState {
  return {
    name: 'test-assembly',
    components: {
      component_a: {
        id: 'component_a',
        name: 'Component A',
        sourceFile: 'component_a.urdf',
        robot: {
          name: 'robot_a',
          rootLinkId: 'component_a/base_link',
          links: {
            'component_a/base_link': {
              id: 'component_a/base_link',
              name: 'base_link',
              visual: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
            },
            'component_a/tool_link': {
              id: 'component_a/tool_link',
              name: 'tool_link',
              visual: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
            },
          },
          joints: {
            'component_a/tool_joint': {
              id: 'component_a/tool_joint',
              name: 'tool_joint',
              type: JointType.FIXED,
              parentLinkId: 'component_a/base_link',
              childLinkId: 'component_a/tool_link',
              origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              dynamics: { damping: 0, friction: 0 },
              hardware: { armature: 0, motorType: '', motorId: '', motorDirection: 1 },
            },
          },
        },
      },
      component_b: {
        id: 'component_b',
        name: 'Component B',
        sourceFile: 'component_b.urdf',
        robot: {
          name: 'robot_b',
          rootLinkId: 'component_b/base_link',
          links: {
            'component_b/base_link': {
              id: 'component_b/base_link',
              name: 'base_link',
              visual: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.BOX,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#ffffff',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
            },
          },
          joints: {},
        },
      },
    },
    bridges: {},
  };
}

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as HTMLButtonElement | null;
}

function expectFieldGroup(container: ParentNode, fieldKey: string, controlTag: 'input' | 'select') {
  const row = container.querySelector<HTMLElement>(`[data-bridge-field="${fieldKey}"]`);
  assert.ok(row, `expected field group "${fieldKey}" to exist`);
  assert.ok(row.querySelector('label'), `expected field group "${fieldKey}" to keep its label`);
  assert.ok(row.querySelector(controlTag), `expected field group "${fieldKey}" to contain a ${controlTag}`);
}

function expectInlineFieldRow(container: ParentNode, fieldKey: string, controlTag: 'input' | 'select') {
  const row = container.querySelector<HTMLElement>(`[data-bridge-inline-field="${fieldKey}"]`);
  assert.ok(row, `expected inline field row "${fieldKey}" to exist`);
  assert.ok(row.querySelector('label'), `expected inline field row "${fieldKey}" to keep its label`);
  assert.ok(row.querySelector(controlTag), `expected inline field row "${fieldKey}" to contain a ${controlTag}`);
}

function expectSelectSlot(container: ParentNode, fieldKey: string) {
  const row = container.querySelector<HTMLElement>(`[data-bridge-field="${fieldKey}"]`);
  assert.ok(row, `expected select slot "${fieldKey}" to exist`);
  assert.ok(row.querySelector('select'), `expected select slot "${fieldKey}" to contain a select`);
}

test('bridge create modal keeps the compact grouped layout and removes legacy hint copy', async () => {
  const { dom, container, root } = createComponentRoot();
  const originalConsoleError = console.error;
  useSelectionStore.setState({
    selection: { type: null, id: null },
    interactionGuard: null,
  });

  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === 'string' && arg.includes('not wrapped in act'))) {
      return;
    }

    originalConsoleError(...args);
  };

  try {
    await act(async () => {
      root.render(
        React.createElement(BridgeCreateModal, {
          isOpen: true,
          onClose: () => {},
          onCreate: () => {},
          onPreviewChange: () => {},
          assemblyState: createAssemblyState(),
          lang: 'zh',
        }),
      );
      await Promise.resolve();
    });

    assert.doesNotMatch(container.textContent ?? '', /桥接关节/);
    assert.doesNotMatch(container.textContent ?? '', /保持窗口打开时/);

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_a/tool_link' });
      await Promise.resolve();
    });

    const parentCard = container.querySelector<HTMLElement>('[data-bridge-side="parent"]');
    assert.ok(parentCard, 'parent side card should render');
    assert.equal(parentCard.dataset.bridgeComponentSummary, 'Component A');
    assert.equal(parentCard.dataset.bridgeLinkSummary, 'tool_link');
    assert.doesNotMatch(parentCard.textContent ?? '', /--\s*\/\s*--/);
    const parentHeader = parentCard.querySelector<HTMLElement>('[data-bridge-side-header="parent"]');
    assert.ok(parentHeader, 'parent side header should render');
    assert.match(parentHeader.className, /grid/);
    assert.match(parentHeader.textContent ?? '', /父侧/);
    assert.match(parentHeader.textContent ?? '', /选择父侧/);
    assert.match(parentHeader.textContent ?? '', /父组件/);
    assert.match(parentHeader.textContent ?? '', /父连杆/);
    const parentActions = parentCard.querySelector<HTMLElement>('[data-bridge-side-actions="parent"]');
    assert.ok(parentActions, 'parent side actions should render');
    assert.match(parentActions.className, /justify-self-end/);
    const parentLabelRow = parentCard.querySelector<HTMLElement>('[data-bridge-side-labels="parent"]');
    assert.equal(parentLabelRow, null, 'parent side labels should now share the same header row as the side controls');
    const identityRow = container.querySelector<HTMLElement>('[data-bridge-row="identity"]');
    assert.ok(identityRow, 'identity row should render');
    assert.match(identityRow.className, /grid/);
    assert.match(identityRow.className, /items-center/);
    expectInlineFieldRow(identityRow, 'name', 'input');
    expectInlineFieldRow(identityRow, 'type', 'select');
    const nameRow = identityRow.querySelector<HTMLElement>('[data-bridge-inline-field="name"]');
    assert.ok(nameRow, 'name row should render');
    assert.match(nameRow.className, /contents/);
    const nameLabel = nameRow.querySelector('label');
    assert.ok(nameLabel, 'name row should keep its label');
    assert.match(nameLabel.className, /justify-end/);

    const parentFieldsRow = parentCard.querySelector<HTMLElement>('[data-bridge-side-fields="parent"]');
    assert.ok(parentFieldsRow, 'parent side should keep component and link fields in one row group');
    expectSelectSlot(parentFieldsRow, 'parent-component');
    expectSelectSlot(parentFieldsRow, 'parent-link');

    const originRow = container.querySelector<HTMLElement>('[data-bridge-row="origin"]');
    assert.ok(originRow, 'origin row should render');
    expectInlineFieldRow(originRow, 'origin-x', 'input');
    expectInlineFieldRow(originRow, 'origin-y', 'input');
    expectInlineFieldRow(originRow, 'origin-z', 'input');

    const childButton = findButtonByText(container, '选择子侧');
    assert.ok(childButton, 'child side picker button should render');

    await act(async () => {
      childButton.focus();
      childButton.click();
      await Promise.resolve();
    });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_b/base_link' });
      await Promise.resolve();
    });

    const childCard = container.querySelector<HTMLElement>('[data-bridge-side="child"]');
    assert.ok(childCard, 'child side card should render');
    assert.equal(childCard.dataset.bridgeComponentSummary, 'Component B');
    assert.equal(childCard.dataset.bridgeLinkSummary, 'base_link');
    assert.doesNotMatch(childCard.textContent ?? '', /--\s*\/\s*--/);
    const childHeader = childCard.querySelector<HTMLElement>('[data-bridge-side-header="child"]');
    assert.ok(childHeader, 'child side header should render');
    assert.match(childHeader.textContent ?? '', /子侧/);
    assert.match(childHeader.textContent ?? '', /选择子侧/);
    assert.match(childHeader.textContent ?? '', /子组件/);
    assert.match(childHeader.textContent ?? '', /子连杆/);
    const childActions = childCard.querySelector<HTMLElement>('[data-bridge-side-actions="child"]');
    assert.ok(childActions, 'child side actions should render');
    assert.match(childActions.className, /justify-self-end/);
    const childLabelRow = childCard.querySelector<HTMLElement>('[data-bridge-side-labels="child"]');
    assert.equal(childLabelRow, null, 'child side labels should now share the same header row as the side controls');
    const childFieldsRow = childCard.querySelector<HTMLElement>('[data-bridge-side-fields="child"]');
    assert.ok(childFieldsRow, 'child side should keep component and link fields in one row group');
    expectSelectSlot(childFieldsRow, 'child-component');
    expectSelectSlot(childFieldsRow, 'child-link');
  } finally {
    useSelectionStore.setState({
      selection: { type: null, id: null },
      interactionGuard: null,
    });
    await destroyComponentRoot(dom, root);
    console.error = originalConsoleError;
  }
});

test('bridge create modal lets users switch back to the parent side and repick it', async () => {
  const { dom, container, root } = createComponentRoot();
  const originalConsoleError = console.error;

  useSelectionStore.setState({
    selection: { type: null, id: null },
    interactionGuard: null,
  });

  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === 'string' && arg.includes('not wrapped in act'))) {
      return;
    }

    originalConsoleError(...args);
  };

  try {
    await act(async () => {
      root.render(
        React.createElement(BridgeCreateModal, {
          isOpen: true,
          onClose: () => {},
          onCreate: () => {},
          onPreviewChange: () => {},
          assemblyState: createAssemblyState(),
          lang: 'zh',
        }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_a/tool_link' });
      await Promise.resolve();
    });

    const childButton = findButtonByText(container, '选择子侧');
    assert.ok(childButton, 'child side picker button should render');

    await act(async () => {
      childButton.click();
      await Promise.resolve();
    });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_b/base_link' });
      await Promise.resolve();
    });

    const parentButton = findButtonByText(container, '选择父侧');
    assert.ok(parentButton, 'parent side picker button should render');

    await act(async () => {
      parentButton.click();
      await Promise.resolve();
    });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_a/base_link' });
      await Promise.resolve();
    });

    const parentCard = container.querySelector<HTMLElement>('[data-bridge-side="parent"]');
    assert.ok(parentCard, 'parent side card should render');
    assert.equal(parentCard.dataset.bridgeComponentSummary, 'Component A');
    assert.equal(parentCard.dataset.bridgeLinkSummary, 'base_link');
  } finally {
    useSelectionStore.setState({
      selection: { type: null, id: null },
      interactionGuard: null,
    });
    await destroyComponentRoot(dom, root);
    console.error = originalConsoleError;
  }
});

test('bridge create modal adds compact +/-90 degree rotation shortcuts for each Euler axis', async () => {
  const { dom, container, root } = createComponentRoot();
  const previewUpdates: Array<number | undefined> = [];
  const originalConsoleError = console.error;

  useSelectionStore.setState({
    selection: { type: null, id: null },
    interactionGuard: null,
  });

  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === 'string' && arg.includes('not wrapped in act'))) {
      return;
    }

    originalConsoleError(...args);
  };

  try {
    await act(async () => {
      root.render(
        React.createElement(BridgeCreateModal, {
          isOpen: true,
          onClose: () => {},
          onCreate: () => {},
          onPreviewChange: (bridge) => {
            previewUpdates.push(bridge?.joint.origin?.rpy.r);
          },
          assemblyState: createAssemblyState(),
          lang: 'zh',
        }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_a/tool_link' });
      await Promise.resolve();
    });

    const childButton = findButtonByText(container, '选择子侧');
    assert.ok(childButton, 'child side picker button should render');

    await act(async () => {
      childButton.click();
      await Promise.resolve();
    });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_b/base_link' });
      await Promise.resolve();
    });

    const rollDecreaseButton = container.querySelector('button[aria-label="横滚 减少 90°"]');
    const rollIncreaseButton = container.querySelector('button[aria-label="横滚 增加 90°"]');
    assert.ok(rollDecreaseButton, 'roll decrease shortcut button should exist');
    assert.ok(rollIncreaseButton, 'roll increase shortcut button should exist');
    assert.equal(container.textContent?.includes('-90'), true);
    assert.equal(container.textContent?.includes('+90'), true);

    await act(async () => {
      rollIncreaseButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    assert.equal(previewUpdates.at(-1), Math.PI / 2);

    await act(async () => {
      rollDecreaseButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    assert.equal(previewUpdates.at(-1), 0);
  } finally {
    useSelectionStore.setState({
      selection: { type: null, id: null },
      interactionGuard: null,
    });
    await destroyComponentRoot(dom, root);
    console.error = originalConsoleError;
  }
});

test('bridge create modal clears stale selection state on open so picking starts from a clean slate', async () => {
  const { dom, container, root } = createComponentRoot();
  const originalConsoleError = console.error;

  useSelectionStore.setState({
    selection: { type: 'link', id: 'component_a/tool_link' },
    hoveredSelection: { type: 'link', id: 'component_a/tool_link' },
    interactionGuard: null,
  });
  useAssemblySelectionStore.setState({
    selection: { type: 'component', id: 'component_a' },
  });

  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === 'string' && arg.includes('not wrapped in act'))) {
      return;
    }

    originalConsoleError(...args);
  };

  try {
    await act(async () => {
      root.render(
        React.createElement(BridgeCreateModal, {
          isOpen: true,
          onClose: () => {},
          onCreate: () => {},
          onPreviewChange: () => {},
          assemblyState: createAssemblyState(),
          lang: 'zh',
        }),
      );
      await Promise.resolve();
    });

    const parentCard = container.querySelector<HTMLElement>('[data-bridge-side="parent"]');
    assert.ok(parentCard, 'parent side card should render');
    assert.equal(parentCard.dataset.bridgeComponentSummary, '--');
    assert.equal(parentCard.dataset.bridgeLinkSummary, '--');
    assert.deepEqual(useSelectionStore.getState().selection, { type: null, id: null });
    assert.deepEqual(useSelectionStore.getState().hoveredSelection, { type: null, id: null });
    assert.deepEqual(useAssemblySelectionStore.getState().selection, { type: null, id: null });

    await act(async () => {
      useSelectionStore.getState().setSelection({ type: 'link', id: 'component_a/tool_link' });
      await Promise.resolve();
    });

    assert.equal(parentCard.dataset.bridgeComponentSummary, 'Component A');
    assert.equal(parentCard.dataset.bridgeLinkSummary, 'tool_link');
  } finally {
    useSelectionStore.setState({
      selection: { type: null, id: null },
      hoveredSelection: { type: null, id: null },
      interactionGuard: null,
    });
    useAssemblySelectionStore.setState({
      selection: { type: null, id: null },
    });
    await destroyComponentRoot(dom, root);
    console.error = originalConsoleError;
  }
});
