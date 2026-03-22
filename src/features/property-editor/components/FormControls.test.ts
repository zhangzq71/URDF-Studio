import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { useUIStore } from '@/store';
import { NumberInput, ReadonlyVectorStatRow } from './FormControls.tsx';
import { TransformFields } from './TransformFields.tsx';

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

function NumberInputHarness({
  initialValue,
  label,
  min,
  step = 0.1,
}: {
  initialValue: number;
  label: string;
  min?: number;
  step?: number;
}) {
  const [value, setValue] = React.useState(initialValue);

  return React.createElement(
    'div',
    null,
    React.createElement(NumberInput, {
      value,
      onChange: setValue,
      label,
      min,
      step,
    }),
    React.createElement('output', { 'data-testid': 'committed-value' }, String(value)),
  );
}

async function renderHarness(
  root: Root,
  props: {
    initialValue: number;
    label: string;
    min?: number;
    step?: number;
  },
) {
  await act(async () => {
    root.render(React.createElement(NumberInputHarness, props));
  });
}

function getCommittedValue(container: Element): string {
  const output = container.querySelector('[data-testid="committed-value"]');
  assert.ok(output, 'committed value output should exist');
  return output.textContent ?? '';
}

function getTextInput(container: Element): HTMLInputElement {
  const input = container.querySelector('input[type="text"]');
  assert.ok(input, 'text input should exist');
  return input as HTMLInputElement;
}

function getStepperButton(container: Element, label: string): HTMLButtonElement {
  const button = container.querySelector(`button[aria-label="${label}"]`);
  assert.ok(button, `button "${label}" should exist`);
  return button as HTMLButtonElement;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const prototype = input.ownerDocument.defaultView?.HTMLInputElement.prototype;
  const valueSetter = prototype
    ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    : undefined;

  assert.ok(valueSetter, 'HTMLInputElement value setter should exist');
  valueSetter.call(input, value);
}

function getReactProps(node: Element): Record<string, unknown> {
  const reactPropsKey = Object.keys(node).find((key) => key.startsWith('__reactProps$'));
  assert.ok(reactPropsKey, 'React props key should exist on rendered element');
  return (node as unknown as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>;
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

test('pointer down applies the first step immediately before pointer up', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    await renderHarness(root, {
      initialValue: 1,
      label: 'Radius',
      step: 0.1,
    });

    const increaseButton = getStepperButton(container, 'Increase Radius');

    await act(async () => {
      increaseButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
      }));
    });

    assert.equal(getCommittedValue(container), '1.1');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});

test('typing a parseable value updates the committed value before blur', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    await renderHarness(root, {
      initialValue: 1,
      label: 'Radius',
    });

    const input = getTextInput(container);

    await act(async () => {
      input.focus();
      dispatchReactChange(input, '2.5');
    });

    assert.equal(getCommittedValue(container), '2.5');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});

test('min clamps positive-only values during stepper and typed edits', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    await renderHarness(root, {
      initialValue: 0.05,
      label: 'Radius',
      min: 0,
      step: 0.1,
    });

    const decreaseButton = getStepperButton(container, 'Decrease Radius');

    await act(async () => {
      decreaseButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
      }));
    });

    assert.equal(getCommittedValue(container), '0');

    const input = getTextInput(container);
    await act(async () => {
      input.focus();
      dispatchReactChange(input, '-3');
    });

    assert.equal(getCommittedValue(container), '0');
  } finally {
    await destroyComponentRoot(dom, root);
  }
});

test('TransformFields defaults to inline axis labels for position and rotation rows', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    await act(async () => {
      useUIStore.setState({ rotationDisplayMode: 'euler_deg' });
      root.render(
        React.createElement(TransformFields, {
          lang: 'en',
          positionValue: { x: 1, y: 2, z: 3 },
          rotationValue: { r: 0.1, p: 0.2, y: 0.3 },
          onPositionChange: () => {},
          onRotationChange: () => {},
        }),
      );
    });

    const xLabel = Array.from(container.querySelectorAll('span'))
      .find((node) => node.textContent === 'X');
    assert.ok(xLabel, 'position X label should render');
    assert.match(
      (xLabel.parentElement as HTMLElement).style.gridTemplateColumns,
      /max-content/,
      'position labels should share the same row as their inputs',
    );

    const rollLabel = Array.from(container.querySelectorAll('span'))
      .find((node) => node.textContent === 'Roll');
    assert.ok(rollLabel, 'rotation roll label should render');
    assert.match(
      (rollLabel.parentElement as HTMLElement).style.gridTemplateColumns,
      /max-content/,
      'rotation labels should share the same row as their inputs',
    );
  } finally {
    await destroyComponentRoot(dom, root);
  }
});

test('ReadonlyVectorStatRow renders aligned value cells without repeated axis subtitles', async () => {
  const { dom, container, root } = createComponentRoot();
  try {
    await act(async () => {
      root.render(
        React.createElement(ReadonlyVectorStatRow, {
          label: 'A1',
          values: ['1.0', '0.0', '0.0'],
        }),
      );
    });

    assert.equal(container.textContent?.includes('A1'), true);
    assert.equal(container.textContent?.includes('X'), false);
    assert.equal(container.textContent?.includes('Y'), false);
    assert.equal(container.textContent?.includes('Z'), false);
  } finally {
    await destroyComponentRoot(dom, root);
  }
});
