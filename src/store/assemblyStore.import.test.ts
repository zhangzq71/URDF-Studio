import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINK, type RobotFile } from '@/types';
import type { RobotImportResult } from '@/core/parsers/importRobotFile';
import { useAssemblyStore } from './assemblyStore.ts';

function assertNearlyEqual(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, received ${actual}`);
}

function resetAssemblyStore() {
  const state = useAssemblyStore.getState();
  state.clearHistory();
  state.exitAssembly();
  state.setAssembly(null);
}

function createReadyImportResult(): RobotImportResult {
  return {
    status: 'ready',
    format: 'urdf',
    robotData: {
      name: 'resolved_demo',
      rootLinkId: 'base_link',
      links: {
        base_link: {
          ...DEFAULT_LINK,
          id: 'base_link',
          name: 'base_link',
          visible: true,
        },
      },
      joints: {},
    },
    resolvedUrdfContent: `<?xml version="1.0"?>
<robot name="resolved_demo">
  <link name="base_link" />
</robot>`,
    resolvedUrdfSourceFilePath: 'robots/demo/broken.urdf',
  };
}

test('addComponent reuses a pre-resolved ready import result for non-USD files', () => {
  resetAssemblyStore();

  useAssemblyStore.getState().initAssembly('pre-resolved-import');

  const invalidUrdfFile: RobotFile = {
    name: 'robots/demo/broken.urdf',
    content: '<robot name="broken">',
    format: 'urdf',
  };

  const preResolvedImportResult = createReadyImportResult();

  const component = useAssemblyStore.getState().addComponent(invalidUrdfFile, {
    preResolvedImportResult,
  });

  assert.ok(component, 'component should be created from the pre-resolved import result');
  assert.equal(component?.name, 'broken');
  assert.equal(component?.sourceFile, 'robots/demo/broken.urdf');
  assert.equal(component?.robot.name, 'resolved_demo');
  assert.ok(component?.robot.links.comp_broken_base_link);
  assert.equal(component?.robot.rootLinkId, 'comp_broken_base_link');
});

test('addComponent records patch-based undo history for incremental assembly updates', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  store.initAssembly('patch-history');
  store.clearHistory();

  const component = store.addComponent(
    {
      name: 'robots/demo/patchy.urdf',
      format: 'urdf',
      content: '<robot name="patchy" />',
    },
    {
      preResolvedImportResult: createReadyImportResult(),
    },
  );

  assert.ok(component, 'component should be created before checking patch history');

  const historyEntry = useAssemblyStore.getState()._history.past[0] as { kind?: string } | undefined;
  assert.equal(historyEntry?.kind, 'patch');

  store.undo();
  assert.equal(
    useAssemblyStore.getState().assemblyState?.components[component.id],
    undefined,
    'undo should remove the incrementally-added component',
  );

  store.redo();
  assert.ok(
    useAssemblyStore.getState().assemblyState?.components[component.id],
    'redo should restore the incrementally-added component',
  );
});

test('updateComponentTransform clones the transform and tracks undo redo history', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  store.initAssembly('transform-history');

  const component = store.addComponent(
    {
      name: 'robots/demo/component.urdf',
      format: 'urdf',
      content: '<robot name="component" />',
    },
    {
      preResolvedImportResult: createReadyImportResult(),
    },
  );

  assert.ok(component, 'component should be created before updating transform');
  store.clearHistory();

  const nextTransform = {
    position: { x: 0.5, y: -1.25, z: 2 },
    rotation: { r: 0.1, p: -0.2, y: 0.3 },
  };

  store.updateComponentTransform(component.id, nextTransform);
  nextTransform.position.x = 999;

  assert.deepEqual(
    useAssemblyStore.getState().assemblyState?.components[component.id]?.transform,
    {
      position: { x: 0.5, y: -1.25, z: 2 },
      rotation: { r: 0.1, p: -0.2, y: 0.3 },
    },
  );
  assert.equal(store.canUndo(), true);

  store.undo();
  assert.deepEqual(
    useAssemblyStore.getState().assemblyState?.components[component.id]?.transform,
    {
      position: { x: 0, y: 0, z: 0 },
      rotation: { r: 0, p: 0, y: 0 },
    },
  );

  store.redo();
  assert.deepEqual(
    useAssemblyStore.getState().assemblyState?.components[component.id]?.transform,
    {
      position: { x: 0.5, y: -1.25, z: 2 },
      rotation: { r: 0.1, p: -0.2, y: 0.3 },
    },
  );
});

test('updateAssemblyTransform clones the transform and tracks undo redo history', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  store.initAssembly('assembly-transform-history');
  store.clearHistory();

  const nextTransform = {
    position: { x: 3, y: 4, z: -2 },
    rotation: { r: -0.15, p: 0.25, y: 0.5 },
  };

  store.updateAssemblyTransform(nextTransform);
  nextTransform.rotation.y = 999;

  assert.deepEqual(useAssemblyStore.getState().assemblyState?.transform, {
    position: { x: 3, y: 4, z: -2 },
    rotation: { r: -0.15, p: 0.25, y: 0.5 },
  });
  assert.equal(store.canUndo(), true);

  store.undo();
  assert.deepEqual(useAssemblyStore.getState().assemblyState?.transform, {
    position: { x: 0, y: 0, z: 0 },
    rotation: { r: 0, p: 0, y: 0 },
  });

  store.redo();
  assert.deepEqual(useAssemblyStore.getState().assemblyState?.transform, {
    position: { x: 3, y: 4, z: -2 },
    rotation: { r: -0.15, p: 0.25, y: 0.5 },
  });
});

test('addComponent falls back to a fresh identity when a prepared component becomes stale', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  store.initAssembly('prepared-component-fallback');

  const file: RobotFile = {
    name: 'robots/demo/component.urdf',
    format: 'urdf',
    content: '<robot name="component" />',
  };

  const existingComponent = store.addComponent(file, {
    preResolvedImportResult: createReadyImportResult(),
  });

  assert.ok(existingComponent, 'existing component should be created first');

  const component = store.addComponent(file, {
    preResolvedImportResult: createReadyImportResult(),
    preparedComponent: {
      componentId: 'comp_component',
      displayName: 'component',
      robotData: {
        name: 'stale_component',
        rootLinkId: 'comp_component_base_link',
        links: {
          comp_component_base_link: {
            ...DEFAULT_LINK,
            id: 'comp_component_base_link',
            name: 'component',
            visible: true,
          },
        },
        joints: {},
      },
    },
  });

  assert.ok(component, 'component should still be added when stale prepared data collides');
  assert.equal(component?.id, 'comp_component_1');
  assert.equal(component?.name, 'component_1');
  assert.ok(component?.robot.links.comp_component_1_base_link);
  assert.equal(component?.robot.rootLinkId, 'comp_component_1_base_link');
});

test('addComponent keeps the first component anchored and places later components beside it on the ground', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  store.initAssembly('default-placement');

  const first = store.addComponent(
    {
      name: 'robots/demo/anchor.urdf',
      format: 'urdf',
      content: '<robot name="anchor" />',
    },
    {
      preResolvedImportResult: createReadyImportResult(),
    },
  );

  const second = store.addComponent(
    {
      name: 'robots/demo/follower.urdf',
      format: 'urdf',
      content: '<robot name="follower" />',
    },
    {
      preResolvedImportResult: createReadyImportResult(),
    },
  );

  assert.ok(first, 'first component should be created');
  assert.ok(second, 'second component should be created');
  assert.deepEqual(first?.transform, {
    position: { x: 0, y: 0, z: 0 },
    rotation: { r: 0, p: 0, y: 0 },
  });
  assert.ok(second?.transform, 'second component should receive an explicit initial transform');
  assertNearlyEqual(second.transform.position.x, 0.22, 'later component x placement should be offset from the anchor');
  assertNearlyEqual(second.transform.position.y, 0, 'later component y placement should stay level with the anchor');
  assertNearlyEqual(second.transform.position.z, 0.25, 'later component should be lifted so its lowest point rests on the ground');
  assert.deepEqual(second.transform.rotation, { r: 0, p: 0, y: 0 });
});
