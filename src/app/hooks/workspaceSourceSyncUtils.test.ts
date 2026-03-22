import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { DEFAULT_LINK } from '@/types/constants';
import { GeometryType, JointType, type RobotFile, type RobotState } from '@/types';
import {
  createPreviewRobotState,
  createRobotSourceSnapshot,
  getPreferredUrdfContent,
  shouldUseEmptyRobotForUsdHydration,
} from './workspaceSourceSyncUtils';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser;
}

function createRobotState(): RobotState {
  return {
    name: 'demo',
    rootLinkId: 'base_link',
    selection: { type: 'link', id: 'base_link' },
    materials: {
      blue: { color: '#0088ff' },
    },
    closedLoopConstraints: [
      {
        id: 'loop-1',
        type: 'connect',
        linkAId: 'base_link',
        linkBId: 'tool_link',
        anchorWorld: { x: 0, y: 0, z: 0 },
        anchorLocalA: { x: 0, y: 0, z: 0 },
        anchorLocalB: { x: 0, y: 0, z: 0 },
      },
    ],
    links: {
      tool_link: {
        ...DEFAULT_LINK,
        id: 'tool_link',
        name: 'tool_link',
      },
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
      },
    },
    joints: {
      joint_a: {
        id: 'joint_a',
        name: 'joint_a',
        type: JointType.REVOLUTE,
        parentLinkId: 'base_link',
        childLinkId: 'tool_link',
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        axis: { x: 0, y: 0, z: 1 },
        limit: { lower: -1, upper: 1, effort: 10, velocity: 5 },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
        angle: 0.5,
      },
    },
  };
}

function createUrdfFile(name = 'robots/demo/demo.urdf'): RobotFile {
  return {
    name,
    format: 'urdf',
    content: '<robot name="demo"><link name="base_link" /></robot>',
  };
}

function createUsdFile(name = 'robots/demo/demo.usd'): RobotFile {
  return {
    name,
    format: 'usd',
    content: '',
  };
}

test('createRobotSourceSnapshot ignores transient selection state', () => {
  const left = createRobotState();
  const right = createRobotState();

  right.selection = { type: 'joint', id: 'joint_a' };

  assert.equal(createRobotSourceSnapshot(left), createRobotSourceSnapshot(right));
});

test('createRobotSourceSnapshot is stable across key insertion order', () => {
  const left = createRobotState();
  const right = createRobotState();

  right.links = {
    base_link: right.links.base_link,
    tool_link: right.links.tool_link,
  };

  right.joints = {
    joint_a: right.joints.joint_a,
  };

  assert.equal(createRobotSourceSnapshot(left), createRobotSourceSnapshot(right));
});

test('getPreferredUrdfContent keeps the imported URDF before store edits', () => {
  assert.equal(
    getPreferredUrdfContent({
      fileContent: '<robot name="vendor-original"/>',
      originalContent: '<robot name="fallback-original"/>',
      generatedContent: '<robot name="generated-roundtrip"/>',
      hasStoreEdits: false,
    }),
    '<robot name="vendor-original"/>',
  );
});

test('getPreferredUrdfContent switches to generated URDF after store edits', () => {
  assert.equal(
    getPreferredUrdfContent({
      fileContent: '<robot name="vendor-original"/>',
      originalContent: '<robot name="fallback-original"/>',
      generatedContent: '<robot name="generated-roundtrip"/>',
      hasStoreEdits: true,
    }),
    '<robot name="generated-roundtrip"/>',
  );
});

test('shouldUseEmptyRobotForUsdHydration masks the previous robot during first USD load', () => {
  assert.equal(
    shouldUseEmptyRobotForUsdHydration({
      selectedFileFormat: 'usd',
      selectedFileName: 'robots/demo/demo.usd',
      documentLoadStatus: 'hydrating',
      documentLoadFileName: 'robots/demo/demo.usd',
    }),
    true,
  );
});

test('shouldUseEmptyRobotForUsdHydration stops masking once USD robot data is prepared', () => {
  assert.equal(
    shouldUseEmptyRobotForUsdHydration({
      selectedFileFormat: 'usd',
      selectedFileName: 'robots/demo/demo.usd',
      documentLoadStatus: 'ready',
      documentLoadFileName: 'robots/demo/demo.usd',
    }),
    false,
  );
});

test('shouldUseEmptyRobotForUsdHydration does not affect non-USD files', () => {
  assert.equal(
    shouldUseEmptyRobotForUsdHydration({
      selectedFileFormat: 'urdf',
      selectedFileName: 'robots/demo/demo.urdf',
      documentLoadStatus: 'hydrating',
      documentLoadFileName: 'robots/demo/demo.urdf',
    }),
    false,
  );
});

test('createPreviewRobotState resolves editable files into a selection-free preview robot', () => {
  const previewRobot = createPreviewRobotState(createUrdfFile(), {
    availableFiles: [],
  });

  assert.ok(previewRobot);
  assert.equal(previewRobot?.selection.type, null);
  assert.equal(previewRobot?.selection.id, null);
  assert.equal(previewRobot?.name, 'demo');
});

test('createPreviewRobotState falls back to a USD placeholder when hydration data is unavailable', () => {
  const previewRobot = createPreviewRobotState(createUsdFile('robots/demo/scene.usdz'), {
    availableFiles: [],
  });

  assert.ok(previewRobot);
  assert.equal(previewRobot?.name, 'scene');
  assert.equal(previewRobot?.rootLinkId, 'usd_scene_root');
  assert.equal(previewRobot?.links.usd_scene_root?.visual.type, GeometryType.NONE);
});
