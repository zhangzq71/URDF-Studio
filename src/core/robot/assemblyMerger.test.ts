import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_JOINT, DEFAULT_LINK, JointType, type AssemblyState } from '@/types';
import { mergeAssembly } from './assemblyMerger.ts';

function createAssemblyState(): AssemblyState {
  return {
    name: 'merge-test',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { r: 0, p: 0, y: 0 },
    },
    components: {
      comp_left: {
        id: 'comp_left',
        name: 'left',
        sourceFile: 'robots/left.urdf',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
        robot: {
          name: 'left_robot',
          rootLinkId: 'comp_left_base_link',
          links: {
            comp_left_base_link: {
              ...DEFAULT_LINK,
              id: 'comp_left_base_link',
              name: 'left_base_link',
            },
          },
          joints: {
            comp_left_joint: {
              ...DEFAULT_JOINT,
              id: 'comp_left_joint',
              name: 'comp_left_joint',
              type: JointType.FIXED,
              parentLinkId: 'comp_left_base_link',
              childLinkId: 'comp_left_base_link',
            },
          },
        },
      },
      comp_right: {
        id: 'comp_right',
        name: 'right',
        sourceFile: 'robots/right.urdf',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
        robot: {
          name: 'right_robot',
          rootLinkId: 'comp_right_base_link',
          links: {
            comp_right_base_link: {
              ...DEFAULT_LINK,
              id: 'comp_right_base_link',
              name: 'right_base_link',
            },
          },
          joints: {},
        },
      },
    },
    bridges: {
      bridge_join: {
        id: 'bridge_join',
        name: 'bridge_join',
        parentComponentId: 'comp_left',
        parentLinkId: 'comp_left_base_link',
        childComponentId: 'comp_right',
        childLinkId: 'comp_right_base_link',
        joint: {
          ...DEFAULT_JOINT,
          id: 'bridge_join',
          name: 'bridge_join',
          type: JointType.FIXED,
          parentLinkId: 'comp_left_base_link',
          childLinkId: 'comp_right_base_link',
        },
      },
    },
  };
}

test('mergeAssembly reuses component links and joints while synthesizing bridge joints', () => {
  const assemblyState = createAssemblyState();

  const merged = mergeAssembly(assemblyState);

  assert.equal(
    merged.links.comp_left_base_link,
    assemblyState.components.comp_left.robot.links.comp_left_base_link,
  );
  assert.equal(
    merged.joints.comp_left_joint,
    assemblyState.components.comp_left.robot.joints.comp_left_joint,
  );
  assert.notEqual(merged.joints.bridge_join, assemblyState.bridges.bridge_join.joint);
  assert.equal(merged.joints.bridge_join.parentLinkId, 'comp_left_base_link');
  assert.equal(merged.joints.bridge_join.childLinkId, 'comp_right_base_link');
});
