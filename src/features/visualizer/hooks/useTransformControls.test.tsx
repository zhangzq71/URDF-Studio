import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';

import { DEFAULT_JOINT, DEFAULT_LINK } from '@/types';
import { useRobotStore } from '@/store/robotStore';
import { useSelectionStore } from '@/store/selectionStore';

import { useTransformControls, type TransformControlsState } from './useTransformControls.ts';

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
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { MouseEvent?: typeof MouseEvent }).MouseEvent = dom.window.MouseEvent;
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

class FakeTransformControls extends THREE.EventDispatcher {
  axis: string | null = null;
  dragging = false;
  enabled = true;
}

function createRobotSelectionFixture() {
  const baseLinkId = 'base_link';
  const childLinkId = 'child_link';
  const jointId = 'joint_1';

  return {
    robot: {
      name: 'fixture',
      links: {
        [baseLinkId]: {
          ...DEFAULT_LINK,
          id: baseLinkId,
          name: baseLinkId,
        },
        [childLinkId]: {
          ...DEFAULT_LINK,
          id: childLinkId,
          name: childLinkId,
        },
      },
      joints: {
        [jointId]: {
          ...DEFAULT_JOINT,
          id: jointId,
          name: jointId,
          parentLinkId: baseLinkId,
          childLinkId,
          angle: 0,
          origin: {
            xyz: { x: 0, y: 0, z: 0.5 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
      },
      rootLinkId: baseLinkId,
      selection: { type: 'joint' as const, id: jointId },
    },
    jointId,
  };
}

test('editor rotate controls persist joint origin rotation when rotating the pivot directly', async () => {
  const dom = installDom();
  const container = dom.window.document.getElementById('root');
  assert.ok(container, 'root container should exist');

  const { robot, jointId } = createRobotSelectionFixture();
  useRobotStore.getState().resetRobot({
    name: robot.name,
    links: robot.links,
    joints: robot.joints,
    rootLinkId: robot.rootLinkId,
  });
  useSelectionStore.getState().setSelection(robot.selection);

  const selectedPivot = new THREE.Group();
  const translateControls = new FakeTransformControls();
  const rotateControls = new FakeTransformControls();
  const onUpdateCalls: Array<{ type: 'link' | 'joint'; id: string; data: unknown }> = [];
  let latestHookState: TransformControlsState | null = null;

  function Harness() {
    const hookState = useTransformControls(
      selectedPivot,
      'universal',
      robot,
      (type, id, data) => {
        onUpdateCalls.push({ type, id, data });
      },
      'editor',
    );

    hookState.transformControlRef.current = translateControls;
    hookState.rotateTransformControlRef.current = rotateControls;
    latestHookState = hookState;
    return null;
  }

  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(React.createElement(Harness));
    });

    assert.ok(latestHookState, 'hook state should be available after render');

    const expectedEuler = new THREE.Euler(0.42, -0.13, 0.31, 'ZYX');

    await act(async () => {
      rotateControls.dragging = true;
      rotateControls.dispatchEvent({ type: 'dragging-changed', value: true });
      selectedPivot.quaternion.setFromEuler(expectedEuler);
      selectedPivot.updateMatrixWorld(true);
    });

    await act(async () => {
      rotateControls.dragging = false;
      rotateControls.dispatchEvent({ type: 'dragging-changed', value: false });
    });

    assert.equal(onUpdateCalls.length, 1, 'rotate commit should persist a joint origin update');
    assert.equal(onUpdateCalls[0]?.type, 'joint');
    assert.equal(onUpdateCalls[0]?.id, jointId);

    const update = onUpdateCalls[0]?.data as { origin?: { rpy?: { r?: number; p?: number; y?: number } } };
    assert.ok(update.origin?.rpy, 'joint update should include origin rotation');
    assert.ok(Math.abs((update.origin?.rpy?.r ?? 0) - expectedEuler.x) < 1e-6);
    assert.ok(Math.abs((update.origin?.rpy?.p ?? 0) - expectedEuler.y) < 1e-6);
    assert.ok(Math.abs((update.origin?.rpy?.y ?? 0) - expectedEuler.z) < 1e-6);
    assert.equal(useRobotStore.getState().joints[jointId]?.angle ?? 0, 0, 'pivot rotation should not mutate the joint angle path');
  } finally {
    await act(async () => {
      root.unmount();
    });
    useSelectionStore.getState().clearSelection();
    dom.window.close();
  }
});
