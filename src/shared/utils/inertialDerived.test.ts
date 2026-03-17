import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeGeometryVolume,
  computeInertialDerivedValues,
  computeLinkDensity,
} from './inertialDerived.ts';

test('computes primitive geometry volume', () => {
  assert.equal(
    computeGeometryVolume({
      type: 'box',
      dimensions: { x: 2, y: 3, z: 4 },
    }),
    24,
  );
});

test('computes density from summed collision primitive volumes', () => {
  const density = computeLinkDensity({
    visual: {
      type: 'none',
      dimensions: { x: 0, y: 0, z: 0 },
    },
    collision: {
      type: 'box',
      dimensions: { x: 1, y: 1, z: 1 },
    },
    collisionBodies: [
      {
        type: 'cylinder',
        dimensions: { x: 0.5, y: 2, z: 0.5 },
      },
    ],
    inertial: {
      mass: 10,
    },
  });

  assert.equal(density.source, 'collision');
  assert.ok(density.value !== null);
  assert.ok(Math.abs(density.value - (10 / (1 + Math.PI * 0.5 * 0.5 * 2))) < 1e-9);
});

test('does not compute density for mesh-based collision geometry', () => {
  const density = computeLinkDensity({
    visual: {
      type: 'box',
      dimensions: { x: 1, y: 1, z: 1 },
    },
    collision: {
      type: 'mesh',
      dimensions: { x: 1, y: 1, z: 1 },
    },
    collisionBodies: [],
    inertial: {
      mass: 10,
    },
  });

  assert.equal(density.source, 'collision');
  assert.equal(density.value, null);
});

test('computes principal moments and principal axes from inertia tensor', () => {
  const derived = computeInertialDerivedValues({
    mass: 5,
    inertia: {
      ixx: 5,
      ixy: 1,
      ixz: 0,
      iyy: 3,
      iyz: 0,
      izz: 2,
    },
  });

  assert.ok(derived);
  assert.deepEqual(
    derived.diagonalInertia.map((value) => Number(value.toFixed(6))),
    [2, 2.585786, 5.414214],
  );

  derived.principalAxes.forEach((axis) => {
    const length = Math.hypot(axis.x, axis.y, axis.z);
    assert.ok(Math.abs(length - 1) < 1e-6);
  });
});
