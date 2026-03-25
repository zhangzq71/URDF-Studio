import test from 'node:test';
import assert from 'node:assert/strict';

test('file-io utils barrel exposes import path collision helpers', async () => {
  const moduleUnderTest = await import('./index.ts');

  assert.equal(typeof moduleUnderTest.createImportPathCollisionMap, 'function');
  assert.equal(typeof moduleUnderTest.remapImportedPath, 'function');
});
