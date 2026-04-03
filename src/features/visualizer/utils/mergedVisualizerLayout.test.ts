import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LINK, JointType, type RobotData } from '@/types';

import {
  collectMergedVisualizerRootLinkIds,
  resolveMergedVisualizerRootPlacements,
} from './mergedVisualizerLayout.ts';

function createLink(id: string) {
  return {
    ...DEFAULT_LINK,
    id,
    name: id,
  };
}

test('collectMergedVisualizerRootLinkIds keeps disconnected roots visible in merged scenes', () => {
  const robot: RobotData = {
    name: 'assembly',
    rootLinkId: 'root_a',
    links: {
      root_a: createLink('root_a'),
      child_a: createLink('child_a'),
      root_b: createLink('root_b'),
    },
    joints: {
      joint_a: {
        id: 'joint_a',
        name: 'joint_a',
        type: JointType.FIXED,
        parentLinkId: 'root_a',
        childLinkId: 'child_a',
        origin: {
          xyz: { x: 0.6, y: 0, z: 0 },
          rpy: { r: 0, p: 0, y: 0 },
        },
        dynamics: { damping: 0, friction: 0 },
        hardware: {
          armature: 0,
          motorType: '',
          motorId: '',
          motorDirection: 1,
        },
      },
    },
  };

  assert.deepEqual(collectMergedVisualizerRootLinkIds(robot), ['root_a', 'root_b']);
});

test('resolveMergedVisualizerRootPlacements spreads disconnected roots without pushing them too far apart', () => {
  const robot: RobotData = {
    name: 'assembly',
    rootLinkId: 'root_a',
    links: {
      root_a: createLink('root_a'),
      child_a: createLink('child_a'),
      root_b: createLink('root_b'),
    },
    joints: {
      joint_a: {
        id: 'joint_a',
        name: 'joint_a',
        type: JointType.FIXED,
        parentLinkId: 'root_a',
        childLinkId: 'child_a',
        origin: {
          xyz: { x: 1.2, y: 0, z: 0 },
          rpy: { r: 0, p: 0, y: 0 },
        },
        dynamics: { damping: 0, friction: 0 },
        hardware: {
          armature: 0,
          motorType: '',
          motorId: '',
          motorDirection: 1,
        },
      },
    },
  };

  const placements = resolveMergedVisualizerRootPlacements(robot);
  assert.equal(placements.length, 2);
  assert.equal(placements[0]?.linkId, 'root_a');
  assert.equal(placements[1]?.linkId, 'root_b');
  assert.equal(placements[0]?.position[1], 0);
  assert.equal(placements[1]?.position[1], 0);
  assert.equal(placements[0]?.position[2], 0);
  assert.equal(placements[1]?.position[2], 0);
  assert.ok((placements[0]?.position[0] ?? 0) < 0);
  assert.ok((placements[1]?.position[0] ?? 0) > 0);

  const separation = (placements[1]?.position[0] ?? 0) - (placements[0]?.position[0] ?? 0);
  assert.ok(separation >= 1.2, `expected visible separation, got ${separation}`);
  assert.ok(separation <= 3.1, `expected compact separation, got ${separation}`);
});

test('resolveMergedVisualizerRootPlacements keeps a single-root robot anchored at the origin', () => {
  const robot: RobotData = {
    name: 'single',
    rootLinkId: 'root',
    links: {
      root: createLink('root'),
    },
    joints: {},
  };

  assert.deepEqual(resolveMergedVisualizerRootPlacements(robot), [
    { linkId: 'root', position: [0, 0, 0] },
  ]);
});
