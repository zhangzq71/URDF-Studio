import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_JOINT, DEFAULT_LINK, GeometryType, JointType, type RobotData } from '@/types';

import { computeRobotRenderableBoundsFromAssets } from './assemblyRenderableBounds.ts';

function assertNearlyEqual(actual: number, expected: number, message: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function createMeshFallbackRobot(): RobotData {
  return {
    name: 'mesh_fallback_demo',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.BOX,
          dimensions: { x: 0.2, y: 0.2, z: 0.2 },
          origin: {
            xyz: { x: 0, y: 0, z: 0.05 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
      },
      foot_link: {
        ...DEFAULT_LINK,
        id: 'foot_link',
        name: 'foot_link',
        visible: true,
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          meshPath: 'robots/demo/missing-foot.stl',
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.BOX,
          dimensions: { x: 0.2, y: 0.2, z: 0.2 },
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
      },
    },
    joints: {
      foot_joint: {
        ...DEFAULT_JOINT,
        id: 'foot_joint',
        name: 'foot_joint',
        type: JointType.FIXED,
        parentLinkId: 'base_link',
        childLinkId: 'foot_link',
        origin: {
          xyz: { x: 0, y: 0, z: -0.8 },
          rpy: { r: 0, p: 0, y: 0 },
        },
      },
    },
  };
}

test('computeRobotRenderableBoundsFromAssets falls back to per-link collision bounds when a mesh visual cannot resolve', async () => {
  const renderableBounds = await computeRobotRenderableBoundsFromAssets(createMeshFallbackRobot(), {
    'robots/demo/placeholder.txt': 'data:text/plain,noop',
  });

  assert.ok(renderableBounds, 'expected renderable bounds even when one mesh visual is unresolved');
  assertNearlyEqual(
    renderableBounds.min.z,
    -0.9,
    'unresolved mesh links should contribute collision min.z',
  );
  assertNearlyEqual(
    renderableBounds.max.z,
    0.15,
    'resolved primitive visuals should still contribute visual max.z',
  );
});
