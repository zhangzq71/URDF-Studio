import test from 'node:test';
import assert from 'node:assert/strict';

import { useRobotStore } from './robotStore.ts';
import { GeometryType } from '@/types';
import { updateCollisionGeometryByObjectIndex } from '@/core/robot';

function resetRobotStore() {
  const state = useRobotStore.getState();
  state.resetRobot({
    name: 'robot_a',
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: 'none' as any,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#808080',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: 'none' as any,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 0,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
        },
      },
    },
    joints: {},
    rootLinkId: 'base_link',
  });
  state.clearHistory();
}

function createRobotData(name: string) {
  return {
    name,
    links: {
      base_link: {
        ...useRobotStore.getState().links.base_link,
        id: 'base_link',
        name: 'base_link',
      },
    },
    joints: {},
    rootLinkId: 'base_link',
  };
}

test('setRobot can replace USD load state without appending undo history', () => {
  resetRobotStore();

  const state = useRobotStore.getState();
  state.setName('edited_robot');
  assert.equal(useRobotStore.getState()._history.past.length, 1);

  state.setRobot(createRobotData('usd_runtime_robot'), {
    skipHistory: true,
  });

  assert.equal(useRobotStore.getState().name, 'usd_runtime_robot');
  assert.equal(useRobotStore.getState()._history.past.length, 1);
});

test('setRobot can reset undo history for a fresh USD file load', () => {
  resetRobotStore();

  const state = useRobotStore.getState();
  state.setName('edited_robot');
  assert.equal(useRobotStore.getState()._history.past.length, 1);

  state.setRobot(createRobotData('fresh_usd_robot'), {
    resetHistory: true,
    label: 'Load USD stage',
  });

  const nextState = useRobotStore.getState();
  assert.equal(nextState.name, 'fresh_usd_robot');
  assert.deepEqual(nextState._history, { past: [], future: [] });
  assert.equal(nextState._activity.at(-1)?.label, 'Load USD stage');
});

test('updateLink keeps robot materials in sync with visual color edits', () => {
  resetRobotStore();

  const state = useRobotStore.getState();
  state.updateLink('base_link', {
    visual: {
      ...state.links.base_link.visual,
      type: GeometryType.BOX,
      color: '#12ab34',
    },
  });

  const nextState = useRobotStore.getState();
  assert.equal(nextState.links.base_link.visual.color, '#12ab34');
  assert.equal(nextState.materials?.base_link?.color, '#12ab34');
});

test('updateLink persists collision body transform edits in robot state', () => {
  resetRobotStore();

  const state = useRobotStore.getState();
  const linkWithCollisionBodies = {
    ...state.links.base_link,
    collision: {
      ...state.links.base_link.collision,
      type: GeometryType.BOX,
      dimensions: { x: 0.2, y: 0.2, z: 0.2 },
      origin: {
        xyz: { x: 0, y: 0, z: 0 },
        rpy: { r: 0, p: 0, y: 0 },
      },
    },
    collisionBodies: [
      {
        ...state.links.base_link.collision,
        type: GeometryType.BOX,
        dimensions: { x: 0.1, y: 0.1, z: 0.1 },
        origin: {
          xyz: { x: 0.1, y: 0.2, z: 0.3 },
          rpy: { r: 0.1, p: 0.2, y: 0.3 },
        },
      },
    ],
  };

  state.updateLink('base_link', linkWithCollisionBodies);

  const movedCollisionLink = updateCollisionGeometryByObjectIndex(
    useRobotStore.getState().links.base_link,
    1,
    {
      origin: {
        xyz: { x: 0.4, y: 0.5, z: 0.6 },
        rpy: { r: 0.4, p: 0.5, y: 0.6 },
      },
    },
  );

  useRobotStore.getState().updateLink('base_link', movedCollisionLink);

  const nextState = useRobotStore.getState();
  assert.deepEqual(nextState.links.base_link.collisionBodies?.[0]?.origin?.xyz, {
    x: 0.4,
    y: 0.5,
    z: 0.6,
  });
  assert.deepEqual(nextState.links.base_link.collisionBodies?.[0]?.origin?.rpy, {
    r: 0.4,
    p: 0.5,
    y: 0.6,
  });
});
