import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_JOINT, DEFAULT_LINK, JointType, type RobotData, type RobotFile } from '@/types';
import { useAssemblyStore } from './assemblyStore.ts';

function resetAssemblyStore() {
  const state = useAssemblyStore.getState();
  state.clearHistory();
  state.exitAssembly();
  state.setAssembly(null);
}

function createRobot(name: string): RobotData {
  return {
    name,
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
      },
    },
    joints: {},
    materials: {},
    closedLoopConstraints: [],
  };
}

test('updateBridge keeps bridge display name in sync with joint name changes', () => {
  resetAssemblyStore();

  const store = useAssemblyStore.getState();
  store.initAssembly('bridge-sync');

  const leftFile: RobotFile = {
    name: 'robots/left.usd',
    content: '',
    format: 'usd',
  };
  const rightFile: RobotFile = {
    name: 'robots/right.usd',
    content: '',
    format: 'usd',
  };

  const leftComponent = store.addComponent(leftFile, {
    preResolvedRobotData: createRobot('left_robot'),
  });
  const rightComponent = store.addComponent(rightFile, {
    preResolvedRobotData: createRobot('right_robot'),
  });

  assert.ok(leftComponent);
  assert.ok(rightComponent);

  const bridge = store.addBridge({
    name: 'bridge_alpha',
    parentComponentId: leftComponent!.id,
    parentLinkId: 'base_link',
    childComponentId: rightComponent!.id,
    childLinkId: 'base_link',
    joint: {
      ...DEFAULT_JOINT,
      name: 'bridge_alpha',
      type: JointType.FIXED,
      parentLinkId: 'base_link',
      childLinkId: 'base_link',
    },
  });

  useAssemblyStore.getState().updateBridge(bridge.id, {
    joint: {
      ...bridge.joint,
      name: 'bridge_beta',
    },
  });

  const updatedBridge = useAssemblyStore.getState().assemblyState?.bridges[bridge.id];
  assert.equal(updatedBridge?.name, 'bridge_beta');
  assert.equal(updatedBridge?.joint.name, 'bridge_beta');
});
