import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { JointControlItem } from './JointControlItem';

type RenderOverrides = Partial<React.ComponentProps<typeof JointControlItem>>;

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
  (globalThis as { FocusEvent?: typeof FocusEvent }).FocusEvent = dom.window.FocusEvent;
  (globalThis as { KeyboardEvent?: typeof KeyboardEvent }).KeyboardEvent = dom.window.KeyboardEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  // React's old input-event polyfill expects these IE-only methods to exist.
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

function renderJointControlItem(root: Root, overrides: RenderOverrides = {}) {
  return act(async () => {
    root.render(
      React.createElement(JointControlItem, {
        name: 'R_thigh_joint',
        joint: {
          id: 'R_thigh_joint',
          jointType: 'revolute',
          limit: { lower: -1.57, upper: 3.49, effort: 1, velocity: 1 },
        },
        value: 0,
        angleUnit: 'rad',
        isActive: false,
        setActiveJoint: () => {},
        handleJointAngleChange: () => {},
        handleJointChangeCommit: () => {},
        onUpdate: () => {},
        ...overrides,
      }),
    );
  });
}

test('clicking elsewhere in the joint card exits the upper limit edit mode', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root);

  const upperLimitDisplay = Array.from(container.querySelectorAll('div')).find(
    (node) => node.textContent === '3.49',
  );
  assert.ok(upperLimitDisplay, 'upper limit display should render');

  await act(async () => {
    upperLimitDisplay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  assert.equal(container.querySelectorAll('input[type="text"]').length, 1);

  const nameLabel = container.querySelector('span[title="R_thigh_joint"]');
  assert.ok(nameLabel, 'joint name label should render');

  await act(async () => {
    nameLabel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    nameLabel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    nameLabel.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    nameLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  assert.equal(container.querySelectorAll('input[type="text"]').length, 0);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('the main joint value editor uses the compact width and font sizing', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root);

  const currentValueDisplay = Array.from(container.querySelectorAll('div')).find(
    (node) => node.textContent === '0.00',
  );
  assert.ok(currentValueDisplay, 'current value display should render');

  const valueWrapper = currentValueDisplay.closest('div.w-\\[2\\.35rem\\]');
  assert.ok(valueWrapper, 'value display wrapper should use the compact width');

  await act(async () => {
    currentValueDisplay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  const editorInput = container.querySelector('input[type="text"]');
  assert.ok(editorInput, 'value editor should open');
  assert.match(editorInput.className, /text-\[9px\]/);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('finite-limit sliders keep imported out-of-range poses visible instead of clamping them', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root, {
    name: 'FL_calf_joint',
    joint: {
      id: 'FL_calf_joint',
      jointType: 'revolute',
      limit: { lower: -2.82, upper: -0.43, effort: 1, velocity: 1 },
    },
    value: 0,
  });

  const rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should render');
  assert.equal(parseFloat(rangeInput.min), -2.82);
  assert.equal(parseFloat(rangeInput.max), 0);
  assert.equal(parseFloat(rangeInput.value), 0);

  const upperLimitDisplay = Array.from(container.querySelectorAll('div')).find(
    (node) => node.textContent === '-0.43',
  );
  assert.ok(upperLimitDisplay, 'joint limit label should still show the authored upper bound');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('joint slider keeps a visible track shell around the native range input', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root);

  const rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should render');

  const sliderShell = container.querySelector('[data-testid="joint-slider-shell"]');
  const sliderFill = container.querySelector('[data-testid="joint-slider-fill"]') as HTMLDivElement | null;
  const sliderThumb = container.querySelector('[data-testid="joint-slider-thumb"]') as HTMLDivElement | null;

  assert.ok(sliderShell, 'joint slider should keep the visible shell');
  assert.ok(sliderFill, 'joint slider should render the filled track');
  assert.ok(sliderThumb, 'joint slider should render the thumb');
  assert.match(sliderFill.getAttribute('style') ?? '', /width:/);
  assert.match(sliderThumb.getAttribute('style') ?? '', /left:/);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('slider drag previews locally and only commits on pointer release', async () => {
  const { dom, container, root } = createComponentRoot();
  const previewAngles: number[] = [];
  const committedAngles: number[] = [];

  await renderJointControlItem(root, {
    handleJointAngleChange: (_name, angle) => {
      previewAngles.push(angle);
    },
    handleJointChangeCommit: (_name, angle) => {
      committedAngles.push(angle);
    },
  });

  const rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should render');

  await act(async () => {
    rangeInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    rangeInput.value = '0.5';
    rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  assert.deepEqual(committedAngles, []);
  assert.deepEqual(previewAngles, [0.5]);

  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  assert.deepEqual(committedAngles, [0.5]);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('starting a slider drag activates and selects the current joint', async () => {
  const { dom, container, root } = createComponentRoot();
  const activeJointNames: Array<string | null> = [];
  const selectedJoints: Array<{ type: 'link' | 'joint'; id: string }> = [];

  await renderJointControlItem(root, {
    setActiveJoint: (jointName) => {
      activeJointNames.push(jointName);
    },
    onSelect: (type, id) => {
      selectedJoints.push({ type, id });
    },
  });

  const rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should render');

  await act(async () => {
    rangeInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 12, clientY: 6 }));
  });

  assert.deepEqual(activeJointNames, ['R_thigh_joint']);
  assert.deepEqual(selectedJoints, [{ type: 'joint', id: 'R_thigh_joint' }]);

  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    root.unmount();
  });
  dom.window.close();
});

test('slider drag ignores transient external echoes until the drag finishes', async () => {
  const { dom, container, root } = createComponentRoot();
  const previewAngles: number[] = [];
  const committedAngles: number[] = [];

  const handleJointAngleChange = (_name: string, angle: number) => {
    previewAngles.push(angle);
  };
  const handleJointChangeCommit = (_name: string, angle: number) => {
    committedAngles.push(angle);
  };

  await renderJointControlItem(root, {
    value: 0,
    handleJointAngleChange,
    handleJointChangeCommit,
  });

  let rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should render');

  await act(async () => {
    rangeInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    rangeInput.value = '0.5';
    rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await renderJointControlItem(root, {
    value: 12,
    handleJointAngleChange,
    handleJointChangeCommit,
  });

  rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should stay mounted after rerender');
  assert.equal(parseFloat(rangeInput.max), 3.49);
  assert.ok(container.textContent?.includes('0.50'), 'value display should keep the local drag preview');

  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  assert.deepEqual(previewAngles, [0.5]);
  assert.deepEqual(committedAngles, [0.5]);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
