import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SNAPSHOT_MIN_LONG_EDGE,
  resolveSnapshotRenderPlan,
} from './snapshotResolution.ts';

test('resolveSnapshotRenderPlan keeps native size when the drawing buffer already meets the target', () => {
  assert.deepEqual(
    resolveSnapshotRenderPlan({
      baseWidth: 4200,
      baseHeight: 2363,
      basePixelRatio: 2,
      maxRenderbufferSize: 8192,
      maxTextureSize: 8192,
    }),
    {
      baseWidth: 4200,
      baseHeight: 2363,
      basePixelRatio: 2,
      scale: 1,
      targetWidth: 4200,
      targetHeight: 2363,
      targetPixelRatio: 2,
    },
  );
});

test('resolveSnapshotRenderPlan raises the render scale up to the snapshot long-edge floor', () => {
  const plan = resolveSnapshotRenderPlan({
    baseWidth: 1680,
    baseHeight: 945,
    basePixelRatio: 1.75,
    maxRenderbufferSize: 8192,
    maxTextureSize: 16384,
  });

  assert.equal(plan.targetWidth, SNAPSHOT_MIN_LONG_EDGE);
  assert.equal(plan.targetHeight, 2160);
  assert.equal(plan.scale, SNAPSHOT_MIN_LONG_EDGE / 1680);
  assert.equal(plan.targetPixelRatio, 4);
});

test('resolveSnapshotRenderPlan respects GPU limits instead of oversizing the capture', () => {
  const plan = resolveSnapshotRenderPlan({
    baseWidth: 1920,
    baseHeight: 1080,
    basePixelRatio: 2,
    maxRenderbufferSize: 3000,
    maxTextureSize: 4096,
  });

  assert.equal(plan.targetWidth, 3000);
  assert.equal(plan.targetHeight, 1688);
  assert.equal(plan.targetPixelRatio, 3.125);
});

test('resolveSnapshotRenderPlan honors an explicit long-edge target when provided', () => {
  const plan = resolveSnapshotRenderPlan({
    baseWidth: 3840,
    baseHeight: 2160,
    basePixelRatio: 2,
    targetLongEdge: 2560,
    maxRenderbufferSize: 8192,
    maxTextureSize: 8192,
  });

  assert.equal(plan.targetWidth, 2560);
  assert.equal(plan.targetHeight, 1440);
  assert.equal(plan.scale, 2560 / 3840);
  assert.equal(plan.targetPixelRatio, (2560 / 3840) * 2);
});
