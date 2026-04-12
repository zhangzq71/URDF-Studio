import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAssemblyRootComponentSelectionAvailability } from './assemblyRootComponentSelection.ts';

test('resolveAssemblyRootComponentSelectionAvailability stays disabled without assembly render or source-scene reuse', () => {
  assert.equal(
    resolveAssemblyRootComponentSelectionAvailability({
      shouldRenderAssembly: false,
      sourceSceneAssemblyComponentId: null,
    }),
    false,
  );
});

test('resolveAssemblyRootComponentSelectionAvailability enables root selection when the assembly viewer is rendered', () => {
  assert.equal(
    resolveAssemblyRootComponentSelectionAvailability({
      shouldRenderAssembly: true,
      sourceSceneAssemblyComponentId: null,
    }),
    true,
  );
});

test('resolveAssemblyRootComponentSelectionAvailability enables root selection for single-component source-scene reuse', () => {
  assert.equal(
    resolveAssemblyRootComponentSelectionAvailability({
      shouldRenderAssembly: false,
      sourceSceneAssemblyComponentId: 'component_a',
    }),
    true,
  );
});
