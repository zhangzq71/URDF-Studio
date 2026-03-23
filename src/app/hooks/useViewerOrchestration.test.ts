import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useViewerOrchestration } from './useViewerOrchestration.ts';
import { useSelectionStore } from '@/store';
import type { RobotState } from '@/types';

function resetSelectionStore() {
  const store = useSelectionStore.getState();
  store.setSelection({ type: null, id: null });
  store.setHoveredSelection({ type: null, id: null });
  store.setAttentionSelection({ type: null, id: null });
  store.setFocusTarget(null);
}

function renderHook(options: {
  setSelection: (selection: RobotState['selection']) => void;
  pulseSelection: (selection: RobotState['selection'], durationMs?: number) => void;
  setHoveredSelection: (selection: RobotState['selection']) => void;
  focusOn: (id: string) => void;
  transformPendingRef: { current: boolean };
}) {
  let hookValue: ReturnType<typeof useViewerOrchestration> | null = null;

  function Probe() {
    hookValue = useViewerOrchestration(options);
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  assert.ok(hookValue, 'hook should render');
  return hookValue;
}

test('handleSelect preserves the selected collision body index for the same link', () => {
  resetSelectionStore();
  useSelectionStore.getState().setSelection({
    type: 'link',
    id: 'arm_link',
    subType: 'collision',
    objectIndex: 2,
  });

  let nextSelection: RobotState['selection'] | null = null;
  const hook = renderHook({
    setSelection: (selection) => {
      nextSelection = selection;
    },
    pulseSelection: () => {},
    setHoveredSelection: () => {},
    focusOn: () => {},
    transformPendingRef: { current: false },
  });

  hook.handleSelect('link', 'arm_link', 'collision');

  assert.deepEqual(nextSelection, {
    type: 'link',
    id: 'arm_link',
    subType: 'collision',
    objectIndex: 2,
  });
});

test('handleViewerSelect preserves collision objectIndex when re-selecting the same link', () => {
  resetSelectionStore();
  useSelectionStore.getState().setSelection({
    type: 'link',
    id: 'arm_link',
    subType: 'collision',
    objectIndex: 1,
  });

  let nextSelection: RobotState['selection'] | null = null;
  let pulsedSelection: RobotState['selection'] | null = null;
  const hook = renderHook({
    setSelection: (selection) => {
      nextSelection = selection;
    },
    pulseSelection: (selection) => {
      pulsedSelection = selection;
    },
    setHoveredSelection: () => {},
    focusOn: () => {},
    transformPendingRef: { current: false },
  });

  hook.handleViewerSelect('link', 'arm_link', 'collision');

  assert.deepEqual(nextSelection, {
    type: 'link',
    id: 'arm_link',
    subType: 'collision',
    objectIndex: 1,
  });
  assert.deepEqual(pulsedSelection, nextSelection);
});

test('handleSelect does not carry collision objectIndex across different links', () => {
  resetSelectionStore();
  useSelectionStore.getState().setSelection({
    type: 'link',
    id: 'arm_link',
    subType: 'collision',
    objectIndex: 2,
  });

  let nextSelection: RobotState['selection'] | null = null;
  const hook = renderHook({
    setSelection: (selection) => {
      nextSelection = selection;
    },
    pulseSelection: () => {},
    setHoveredSelection: () => {},
    focusOn: () => {},
    transformPendingRef: { current: false },
  });

  hook.handleSelect('link', 'forearm_link', 'collision');

  assert.deepEqual(nextSelection, {
    type: 'link',
    id: 'forearm_link',
    subType: 'collision',
  });
});
