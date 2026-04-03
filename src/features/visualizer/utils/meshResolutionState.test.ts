import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeResolvedMeshLoadKeys } from './meshResolutionState.ts';

test('mergeResolvedMeshLoadKeys deduplicates pending keys and ignores unrelated entries', () => {
  const nextState = mergeResolvedMeshLoadKeys({
    currentResolvedKeys: new Set(['base|visual|primary|0|visual.stl']),
    currentSignature: 'scene-a',
    expectedMeshLoadKeySet: new Set([
      'base|visual|primary|0|visual.stl',
      'base|collision|primary|0|collision.stl',
      'arm|collision|primary|0|arm-collision.stl',
    ]),
    expectedSignature: 'scene-a',
    pendingResolvedKeys: [
      'base|collision|primary|0|collision.stl',
      'base|collision|primary|0|collision.stl',
      'unexpected|collision|primary|0|ignored.stl',
    ],
  });

  assert.ok(nextState, 'expected pending mesh keys to update state');
  assert.equal(nextState?.signature, 'scene-a');
  assert.deepEqual(Array.from(nextState?.resolvedKeys ?? []).sort(), [
    'base|collision|primary|0|collision.stl',
    'base|visual|primary|0|visual.stl',
  ]);
});

test('mergeResolvedMeshLoadKeys resets stale signatures before applying the new batch', () => {
  const nextState = mergeResolvedMeshLoadKeys({
    currentResolvedKeys: new Set(['old|collision|primary|0|old.stl']),
    currentSignature: 'scene-old',
    expectedMeshLoadKeySet: new Set(['base|collision|primary|0|collision.stl']),
    expectedSignature: 'scene-new',
    pendingResolvedKeys: ['base|collision|primary|0|collision.stl'],
  });

  assert.ok(nextState, 'expected a stale signature reset to produce a new state');
  assert.equal(nextState?.signature, 'scene-new');
  assert.deepEqual(Array.from(nextState?.resolvedKeys ?? []), [
    'base|collision|primary|0|collision.stl',
  ]);
});

test('mergeResolvedMeshLoadKeys returns null when the batch adds no new expected keys', () => {
  const nextState = mergeResolvedMeshLoadKeys({
    currentResolvedKeys: new Set(['base|collision|primary|0|collision.stl']),
    currentSignature: 'scene-a',
    expectedMeshLoadKeySet: new Set(['base|collision|primary|0|collision.stl']),
    expectedSignature: 'scene-a',
    pendingResolvedKeys: [
      'base|collision|primary|0|collision.stl',
      'unexpected|collision|primary|0|ignored.stl',
    ],
  });

  assert.equal(nextState, null);
});
