import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { JointsPanel } from './JointsPanel';
import { createJointPanelStore } from '@/shared/utils/jointPanelStore';

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

function renderJointsPanel(root: Root, onHover?: (type: 'link' | 'joint' | null, id: string | null) => void) {
  const jointPanelStore = createJointPanelStore({
    jointAngles: { R_thigh_joint: 0 },
  });

  return act(async () => {
    root.render(
      React.createElement(JointsPanel, {
        showJointPanel: true,
        robot: {
          joints: {
            R_thigh_joint: {
              id: 'R_thigh_joint',
              name: 'R_thigh_joint',
              jointType: 'revolute',
              limit: { lower: -1.57, upper: 3.49, effort: 1, velocity: 1 },
            },
          },
        },
        jointPanelRef: createRef<HTMLDivElement>(),
        jointPanelPos: null,
        defaultPosition: { top: '0px', left: '0px' },
        maxHeight: 320,
        onMouseDown: () => {},
        t: {
          joints: 'Joints',
          resize: 'Resize',
          resetJoints: 'Reset joints',
          advanced: 'Advanced',
          switchUnit: 'Switch unit',
          reset: 'Reset',
        },
        handleResetJoints: () => {},
        angleUnit: 'rad',
        setAngleUnit: () => {},
        isJointsCollapsed: false,
        toggleJointsCollapsed: () => {},
        setShowJointPanel: () => {},
        jointPanelStore,
        setActiveJoint: () => {},
        handleJointAngleChange: () => {},
        handleJointChangeCommit: () => {},
        onSelect: () => {},
        onHover,
        onUpdate: () => {},
      }),
    );
  });
}

test('entering the joints panel clears global hover and joint row hover stays local', async () => {
  const { dom, container, root } = createComponentRoot();
  const hoverCalls: Array<{ type: 'link' | 'joint' | null; id: string | null }> = [];

  await renderJointsPanel(root, (type, id) => {
    hoverCalls.push({ type, id });
  });

  const panelRoot = container.querySelector('.urdf-joint-panel') as HTMLDivElement | null;
  assert.ok(panelRoot, 'joint panel root should render');

  await act(async () => {
    panelRoot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });

  assert.deepEqual(hoverCalls, [{ type: null, id: null }]);

  hoverCalls.length = 0;

  const jointCard = container.querySelector('[data-panel-hovered]') as HTMLDivElement | null;
  assert.ok(jointCard, 'joint card should render');

  await act(async () => {
    jointCard.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });

  assert.equal(jointCard.getAttribute('data-panel-hovered'), 'true');
  assert.ok(
    hoverCalls.every((call) => call.type === null && call.id === null),
    'joint row hover should not write a joint hover back into global selection state',
  );

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
