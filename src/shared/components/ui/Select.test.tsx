import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { Select } from './Select';

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
  (globalThis as { HTMLSelectElement?: typeof HTMLSelectElement }).HTMLSelectElement =
    dom.window.HTMLSelectElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { KeyboardEvent?: typeof KeyboardEvent }).KeyboardEvent = dom.window.KeyboardEvent;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle =
    dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame =
    dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

test('Select renders a custom listbox while preserving select-compatible change events', async () => {
  const dom = installDom();
  const container = dom.window.document.getElementById('root');
  assert.ok(container, 'root container should exist');

  const root = createRoot(container);
  let lastChangedValue = 'alpha';

  function Wrapper() {
    const [value, setValue] = React.useState('alpha');
    return (
      <Select
        aria-label="Theme"
        data-testid="demo-select"
        title="Select theme preset"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
          { value: 'gamma', label: 'Gamma' },
        ]}
        value={value}
        onChange={(event) => {
          lastChangedValue = event.currentTarget.value;
          setValue(event.currentTarget.value);
        }}
      />
    );
  }

  try {
    await act(async () => {
      root.render(<Wrapper />);
    });

    const hiddenSelect = container.querySelector('select[data-testid="demo-select"]');
    assert.ok(hiddenSelect instanceof dom.window.HTMLSelectElement);

    const trigger = container.querySelector('button[role="combobox"]');
    assert.ok(trigger instanceof dom.window.HTMLButtonElement);
    assert.equal(trigger.textContent?.includes('Alpha'), true);
    assert.equal(trigger.getAttribute('title'), 'Select theme preset');

    await act(async () => {
      trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    const listbox = dom.window.document.querySelector('[role="listbox"]');
    assert.ok(listbox, 'opening the trigger should render a custom listbox menu');

    const betaOption = Array.from(
      dom.window.document.querySelectorAll('button[role="option"]'),
    ).find((node) => node.textContent?.includes('Beta'));
    assert.ok(betaOption instanceof dom.window.HTMLButtonElement);

    await act(async () => {
      betaOption.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    assert.equal(lastChangedValue, 'beta');
    assert.equal(hiddenSelect.value, 'beta');
    assert.equal(trigger.textContent?.includes('Beta'), true);
    assert.equal(dom.window.document.querySelector('[role="listbox"]'), null);
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
});
