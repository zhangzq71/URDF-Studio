import assert from 'node:assert/strict';
import test from 'node:test';

import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { context as r3fContext } from '@react-three/fiber';
import { create } from 'zustand';

import { useVisualizationEffects } from './useVisualizationEffects.ts';
import { SnapshotRenderStateProvider } from '@/shared/components/3d/scene/SnapshotRenderContext';

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
  (globalThis as { HTMLDivElement?: typeof HTMLDivElement }).HTMLDivElement =
    dom.window.HTMLDivElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { Event?: typeof Event }).Event = dom.window.Event;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle =
    dom.window.getComputedStyle.bind(dom.window);
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame =
    dom.window.requestAnimationFrame.bind(dom.window);
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame.bind(dom.window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

function createComponentRoot() {
  const dom = installDom();
  const container = dom.window.document.getElementById('root');
  assert.ok(container, 'root container should exist');

  const root = createRoot(container);
  return { dom, root };
}

function createRobotWithCenterOfMassHelper() {
  const robot = new THREE.Group();
  const link = new THREE.Group();
  link.name = 'base_link';
  (link as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink = true;

  const inertiaVisualGroup = new THREE.Group();
  inertiaVisualGroup.name = '__inertia_visual__';
  link.add(inertiaVisualGroup);

  const createHelperRoot = (name: '__com_visual__' | '__inertia_box__') => {
    const helperRoot = new THREE.Group();
    helperRoot.name = name;

    const helperMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      }),
    );
    helperRoot.add(helperMesh);
    inertiaVisualGroup.add(helperRoot);
    return helperRoot;
  };

  const centerOfMassHelperRoot = createHelperRoot('__com_visual__');
  const inertiaHelperRoot = createHelperRoot('__inertia_box__');

  link.userData.__inertiaVisualGroup = inertiaVisualGroup;
  link.userData.__comVisual = centerOfMassHelperRoot;
  link.userData.__inertiaBox = inertiaHelperRoot;
  robot.add(link);

  const robotLinks = {
    base_link: {
      id: 'base_link',
      name: 'base_link',
      visible: true,
      visual: { visible: true },
      collision: { visible: true },
      inertial: {
        mass: 1,
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      },
    },
  } as any;

  return { robot, centerOfMassHelperRoot, inertiaHelperRoot, robotLinks };
}

test('helper-only selection changes still refresh helper interaction state for the same link', async () => {
  const { dom, root } = createComponentRoot();
  const { robot, centerOfMassHelperRoot, inertiaHelperRoot, robotLinks } =
    createRobotWithCenterOfMassHelper();

  await renderHarness(root, robot, {
    robotLinks,
    selection: {
      type: 'link',
      id: 'base_link',
      helperKind: 'center-of-mass',
    },
  });

  assert.ok(centerOfMassHelperRoot.scale.x > 1, 'CoM helper should be selected initially');
  assert.equal(inertiaHelperRoot.scale.x, 1);

  await renderHarness(root, robot, {
    robotLinks,
    selection: {
      type: 'link',
      id: 'base_link',
      helperKind: 'inertia',
    },
  });

  assert.equal(centerOfMassHelperRoot.scale.x, 1, 'previous helper selection should be cleared');
  assert.ok(inertiaHelperRoot.scale.x > 1, 'new helper selection should become active');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

const useR3fStore = create(() => ({
  invalidate: () => {},
}));

function VisualizationEffectsProbe({
  robot,
  selection,
  showCenterOfMass = false,
  showInertia = false,
  robotLinks,
}: {
  robot: THREE.Object3D;
  selection?: {
    type: 'link' | 'joint' | null;
    id: string | null;
    subType?: 'visual' | 'collision';
    objectIndex?: number;
    helperKind?: 'center-of-mass' | 'inertia' | 'origin-axes' | 'joint-axis';
  };
  showCenterOfMass?: boolean;
  showInertia?: boolean;
  robotLinks?: Record<string, any>;
}) {
  const highlightedMeshesRef = useRef(new Map());

  useVisualizationEffects({
    robot,
    robotVersion: 1,
    showCollision: false,
    showVisual: true,
    showCollisionAlwaysOnTop: true,
    showInertia,
    showCenterOfMass,
    showCoMOverlay: true,
    centerOfMassSize: 0.01,
    showOrigins: false,
    showOriginsOverlay: false,
    originSize: 1,
    showJointAxes: false,
    showJointAxesOverlay: true,
    jointAxisSize: 1,
    modelOpacity: 1,
    robotLinks,
    selection,
    highlightGeometry: () => {},
    highlightedMeshesRef,
  });

  return null;
}

function Harness({
  robot,
  selection,
  showCenterOfMass = false,
  showInertia = false,
  robotLinks,
  snapshotRenderActive = false,
}: Parameters<typeof VisualizationEffectsProbe>[0] & { snapshotRenderActive?: boolean }) {
  return React.createElement(
    r3fContext.Provider,
    { value: useR3fStore as unknown as React.ContextType<typeof r3fContext> },
    React.createElement(
      SnapshotRenderStateProvider,
      {
        value: {
          snapshotRenderActive,
          setSnapshotRenderActive: () => {},
        },
      },
      React.createElement(VisualizationEffectsProbe, {
        robot,
        selection,
        showCenterOfMass,
        showInertia,
        robotLinks,
      }),
    ),
  );
}

async function renderHarness(
  root: Root,
  robot: THREE.Object3D,
  options: Omit<Parameters<typeof Harness>[0], 'robot'> = {},
) {
  await act(async () => {
    root.render(React.createElement(Harness, { robot, ...options }));
  });
}

test('snapshot rendering hides URDF helper overlays even when their toggles are enabled', async () => {
  const { dom, root } = createComponentRoot();
  const { robot, centerOfMassHelperRoot, inertiaHelperRoot, robotLinks } =
    createRobotWithCenterOfMassHelper();

  await renderHarness(root, robot, {
    robotLinks,
    showCenterOfMass: true,
    showInertia: true,
  });

  assert.equal(centerOfMassHelperRoot.visible, true);
  assert.equal(inertiaHelperRoot.visible, true);

  await renderHarness(root, robot, {
    robotLinks,
    showCenterOfMass: true,
    showInertia: true,
    snapshotRenderActive: true,
  });

  assert.equal(centerOfMassHelperRoot.visible, false);
  assert.equal(inertiaHelperRoot.visible, false);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});
