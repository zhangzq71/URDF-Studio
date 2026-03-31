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

test('joint card prefers the authored joint name for display when the internal key differs', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root, {
    name: 'joint_1743499999999',
    joint: {
      id: 'joint_1743499999999',
      name: 'joint_1',
      jointType: 'revolute',
      limit: { lower: -1.57, upper: 3.49, effort: 1, velocity: 1 },
    },
  });

  const nameLabel = Array.from(container.querySelectorAll('span')).find(
    (node) => node.textContent === 'joint_1',
  );
  assert.ok(nameLabel, 'joint card should display the authored joint name');
  assert.equal(nameLabel.getAttribute('title'), 'joint_1');

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

test('limit editors reserve column width while editing so the slider cannot overlap them', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root);

  const lowerLimitDisplay = Array.from(container.querySelectorAll('div')).find(
    (node) => node.textContent === '-1.57',
  );
  assert.ok(lowerLimitDisplay, 'lower limit display should render');

  await act(async () => {
    lowerLimitDisplay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  const lowerInput = container.querySelector('input[type="text"]');
  assert.ok(lowerInput, 'lower limit editor should open');
  assert.match(lowerInput.parentElement?.className ?? '', /min-w-\[2\.35rem\]/);

  await act(async () => {
    lowerInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });

  const upperLimitDisplay = Array.from(container.querySelectorAll('div')).find(
    (node) => node.textContent === '3.49',
  );
  assert.ok(upperLimitDisplay, 'upper limit display should render');

  await act(async () => {
    upperLimitDisplay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  const editors = Array.from(container.querySelectorAll('input[type="text"]'));
  const upperInput = editors.at(-1) ?? null;
  assert.ok(upperInput, 'upper limit editor should open');
  assert.match(upperInput.parentElement?.className ?? '', /min-w-\[2\.35rem\]/);

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

test('pseudo-infinite authored bounds fall back to the unbounded slider window', async () => {
  const { dom, container, root } = createComponentRoot();

  await renderJointControlItem(root, {
    name: 'MHS_TopBlades_v16',
    joint: {
      id: 'MHS_TopBlades_v16',
      jointType: 'revolute',
      limit: { lower: -1.79769e308, upper: 1.79769e308, effort: 1, velocity: 1 },
    },
    value: 0,
  });

  const rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement | null;
  assert.ok(rangeInput, 'slider input should render');
  assert.equal(parseFloat(rangeInput.min), -Math.PI);
  assert.equal(parseFloat(rangeInput.max), Math.PI);

  const limitDisplays = Array.from(container.querySelectorAll('div')).map((node) => node.textContent);
  assert.ok(limitDisplays.includes('−∞'), 'lower pseudo-infinite limit should render as negative infinity');
  assert.ok(limitDisplays.includes('∞'), 'upper pseudo-infinite limit should render as infinity');

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

test('dragging from the visible slider shell previews and commits without targeting the hidden range input', async () => {
  const { dom, container, root } = createComponentRoot();
  const previewAngles: number[] = [];
  const committedAngles: number[] = [];
  const activeJointNames: Array<string | null> = [];

  await renderJointControlItem(root, {
    handleJointAngleChange: (_name, angle) => {
      previewAngles.push(angle);
    },
    handleJointChangeCommit: (_name, angle) => {
      committedAngles.push(angle);
    },
    setActiveJoint: (jointName) => {
      activeJointNames.push(jointName);
    },
  });

  const sliderShell = container.querySelector('[data-testid="joint-slider-shell"]') as HTMLDivElement | null;
  assert.ok(sliderShell, 'slider shell should render');

  Object.defineProperty(sliderShell, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 120,
      bottom: 16,
      width: 120,
      height: 16,
      toJSON: () => ({}),
    }),
    configurable: true,
  });

  await act(async () => {
    sliderShell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 84, clientY: 8 }));
  });

  assert.deepEqual(activeJointNames, ['R_thigh_joint']);
  assert.equal(previewAngles.length, 1);
  assert.equal(committedAngles.length, 0);

  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  assert.equal(committedAngles.length, 1);

  await act(async () => {
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
