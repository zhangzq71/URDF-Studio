import test from 'node:test';
import assert from 'node:assert/strict';

import { createJointDragStoreSync } from './jointDragStoreSync.ts';

test('emits every drag change immediately when throttling is disabled', () => {
  const changes: Array<[string, number]> = [];
  const commits: Array<[string, number]> = [];
  const sync = createJointDragStoreSync({
    onDragChange: (jointName, angle) => {
      changes.push([jointName, angle]);
    },
    onDragCommit: (jointName, angle) => {
      commits.push([jointName, angle]);
    },
    throttleChanges: false,
    intervalMs: 20,
  });

  sync.emit('hip', 0.1);
  sync.emit('hip', 0.2);
  sync.commit('hip', 0.3);
  sync.dispose();

  assert.deepEqual(changes, [
    ['hip', 0.1],
    ['hip', 0.2],
  ]);
  assert.deepEqual(commits, [['hip', 0.3]]);
});

test('throttles drag change propagation and cancels pending trailing updates on commit', async () => {
  const changes: Array<[string, number]> = [];
  const commits: Array<[string, number]> = [];
  const sync = createJointDragStoreSync({
    onDragChange: (jointName, angle) => {
      changes.push([jointName, angle]);
    },
    onDragCommit: (jointName, angle) => {
      commits.push([jointName, angle]);
    },
    throttleChanges: true,
    intervalMs: 20,
  });

  sync.emit('knee', 0.1);
  sync.emit('knee', 0.2);

  assert.deepEqual(changes, [['knee', 0.1]]);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(changes, [
    ['knee', 0.1],
    ['knee', 0.2],
  ]);

  sync.emit('knee', 0.3);
  sync.emit('knee', 0.4);
  sync.commit('knee', 0.5);

  await new Promise((resolve) => setTimeout(resolve, 30));

  sync.dispose();

  assert.deepEqual(changes, [
    ['knee', 0.1],
    ['knee', 0.2],
  ]);
  assert.deepEqual(commits, [['knee', 0.5]]);
});
