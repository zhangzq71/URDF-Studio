import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearUsdHoverPointerState,
  markUsdHoverRaycastDirty,
  setUsdHoverPointerState,
  type UsdHoverPointerStateRefs,
} from './usdHoverPointerState.ts';

function createHoverRefs(): UsdHoverPointerStateRefs {
  return {
    hoverPointerClientRef: { current: null },
    hoverPointerInsideRef: { current: false },
    hoverNeedsRaycastRef: { current: false },
  };
}

test('setUsdHoverPointerState marks hover refs and requests a render frame', () => {
  const refs = createHoverRefs();
  let frameRequests = 0;

  setUsdHoverPointerState(refs, { x: 12, y: 34 }, () => {
    frameRequests += 1;
  });

  assert.deepEqual(refs.hoverPointerClientRef.current, { x: 12, y: 34 });
  assert.equal(refs.hoverPointerInsideRef.current, true);
  assert.equal(refs.hoverNeedsRaycastRef.current, true);
  assert.equal(frameRequests, 1);
});

test('clearUsdHoverPointerState clears hover refs and requests a render frame', () => {
  const refs = createHoverRefs();
  refs.hoverPointerClientRef.current = { x: 99, y: 77 };
  refs.hoverPointerInsideRef.current = true;
  refs.hoverNeedsRaycastRef.current = true;

  let frameRequests = 0;

  clearUsdHoverPointerState(refs, () => {
    frameRequests += 1;
  });

  assert.equal(refs.hoverPointerClientRef.current, null);
  assert.equal(refs.hoverPointerInsideRef.current, false);
  assert.equal(refs.hoverNeedsRaycastRef.current, false);
  assert.equal(frameRequests, 1);
});

test('markUsdHoverRaycastDirty marks raycast work and requests a render frame', () => {
  const refs = createHoverRefs();
  let frameRequests = 0;

  markUsdHoverRaycastDirty(refs.hoverNeedsRaycastRef, () => {
    frameRequests += 1;
  });

  assert.equal(refs.hoverNeedsRaycastRef.current, true);
  assert.equal(frameRequests, 1);
});
