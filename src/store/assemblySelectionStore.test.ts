import assert from 'node:assert/strict';
import test from 'node:test';

import { useAssemblySelectionStore } from './assemblySelectionStore.ts';

test('assembly selection store switches between assembly, component, and empty selection', () => {
  const store = useAssemblySelectionStore.getState();

  store.clearSelection();
  assert.deepEqual(useAssemblySelectionStore.getState().selection, { type: null, id: null });

  store.selectAssembly();
  assert.deepEqual(useAssemblySelectionStore.getState().selection, { type: 'assembly', id: '__assembly__' });

  store.selectComponent('comp_demo');
  assert.deepEqual(useAssemblySelectionStore.getState().selection, { type: 'component', id: 'comp_demo' });

  store.clearSelection();
  assert.deepEqual(useAssemblySelectionStore.getState().selection, { type: null, id: null });
});
