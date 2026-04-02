import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINK, type RobotData, type RobotFile } from '@/types';
import { useAssemblyStore } from './assemblyStore.ts';

function resetAssemblyStore() {
  const state = useAssemblyStore.getState();
  state.clearHistory();
  state.exitAssembly();
  state.setAssembly(null);
}

test('assemblyRevision increments for assembly mutations and undo/redo', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  const initialRevision = store.assemblyRevision;

  store.initAssembly('revision-bench');
  const afterInitRevision = useAssemblyStore.getState().assemblyRevision;
  assert.ok(afterInitRevision > initialRevision);

  const file: RobotFile = {
    name: 'robots/demo/revision.usd',
    content: '',
    format: 'usd',
  };

  const robotData: RobotData = {
    name: 'revision_demo',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
      },
    },
    joints: {},
  };

  const component = useAssemblyStore.getState().addComponent(file, {
    preResolvedRobotData: robotData,
  });

  assert.ok(component);
  const afterAddRevision = useAssemblyStore.getState().assemblyRevision;
  assert.ok(afterAddRevision > afterInitRevision);

  useAssemblyStore.getState().updateComponentName(component!.id, 'renamed_component');
  const afterRenameRevision = useAssemblyStore.getState().assemblyRevision;
  assert.ok(afterRenameRevision > afterAddRevision);

  useAssemblyStore.getState().undo();
  const afterUndoRevision = useAssemblyStore.getState().assemblyRevision;
  assert.ok(afterUndoRevision > afterRenameRevision);

  useAssemblyStore.getState().redo();
  const afterRedoRevision = useAssemblyStore.getState().assemblyRevision;
  assert.ok(afterRedoRevision > afterUndoRevision);
});
