import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { parseEditableRobotSource } from '@/app/utils/parseEditableRobotSource';
import { disposeRobotImportWorker } from '@/app/hooks/robotImportWorkerBridge';
import { DEFAULT_LINK } from '@/types/constants';
import { GeometryType, JointType, type AssemblyState, type RobotData, type RobotFile, type RobotState } from '@/types';
import {
  buildPreviewSceneSourceFromImportResult,
  buildWorkspaceViewerRobotData,
  createPreviewRobotState,
  createPreviewRobotStateFromImportResult,
  createRobotSourceSnapshot,
  createRobotSourceSnapshotFromUrdfContent,
  getViewerSourceFile,
  getPreferredMjcfContent,
  getPreferredSdfContent,
  getPreferredUrdfContent,
  getPreferredXacroContent,
  getWorkspaceAssemblyViewerRobotData,
  getSingleComponentWorkspaceMjcfViewerSource,
  shouldReseedSingleComponentAssemblyFromActiveFile,
  shouldUseEmptyRobotForUsdHydration,
} from './workspaceSourceSyncUtils.ts';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser;
}

if (!globalThis.XMLSerializer) {
  globalThis.XMLSerializer = window.XMLSerializer;
}

type WorkerEventHandler = (event: { data?: unknown; error?: unknown; message?: string }) => void;

function restoreGlobalProperty<T extends keyof typeof globalThis>(
  key: T,
  originalValue: (typeof globalThis)[T] | undefined,
) {
  if (originalValue === undefined) {
    delete globalThis[key];
    return;
  }

  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: originalValue,
  });
}

function installEditableRobotSourceWorkerMock() {
  const originalWorker = globalThis.Worker;
  let parseRequestCount = 0;

  class FakeRobotImportWorker {
    private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

    addEventListener(type: string, handler: WorkerEventHandler): void {
      const handlers = this.listeners.get(type) ?? new Set<WorkerEventHandler>();
      handlers.add(handler);
      this.listeners.set(type, handlers);
    }

    removeEventListener(type: string, handler: WorkerEventHandler): void {
      this.listeners.get(type)?.delete(handler);
    }

    postMessage(message: any): void {
      if (message?.type !== 'parse-editable-robot-source') {
        return;
      }

      parseRequestCount += 1;

      queueMicrotask(() => {
        try {
          const result = parseEditableRobotSource(message.options);
          this.listeners.get('message')?.forEach((handler) => {
            handler({
              data: {
                type: 'parse-editable-robot-source-result',
                requestId: message.requestId,
                result,
              },
            });
          });
        } catch (error) {
          this.listeners.get('message')?.forEach((handler) => {
            handler({
              data: {
                type: 'parse-editable-robot-source-error',
                requestId: message.requestId,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          });
        }
      });
    }

    terminate(): void {}
  }

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: FakeRobotImportWorker as unknown as typeof Worker,
  });

  return {
    get parseRequestCount() {
      return parseRequestCount;
    },
    restore() {
      disposeRobotImportWorker();
      restoreGlobalProperty('Worker', originalWorker);
    },
  };
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

function createXacroFile(name = 'robots/demo/demo.urdf.xacro'): RobotFile {
  return {
    name,
    format: 'xacro',
    content: `
      <robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="demo">
        <xacro:property name="size" value="0.1"/>
        <link name="base_link">
          <visual>
            <geometry>
              <box size="\${size} \${size} \${size}" />
            </geometry>
          </visual>
        </link>
      </robot>
    `,
  };
}

function createMjcfFile(name = 'robots/demo/demo.xml'): RobotFile {
  return {
    name,
    format: 'mjcf',
    content: `
      <mujoco model="demo">
        <worldbody>
          <body name="base_link" />
        </worldbody>
      </mujoco>
    `,
  };
}

function createAssemblyState(sourceFile = 'robots/demo/demo.xml'): AssemblyState {
  return {
    name: 'demo_project',
    components: {
      comp_demo: {
        id: 'comp_demo',
        name: 'demo',
        sourceFile,
        robot: {
          name: 'demo',
          rootLinkId: 'base_link',
          links: {
            base_link: {
              ...DEFAULT_LINK,
              id: 'base_link',
              name: 'base_link',
            },
          },
          joints: {},
        },
        visible: true,
      },
    },
    bridges: {},
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

test('createRobotSourceSnapshotFromUrdfContent normalizes mesh paths relative to the source file', async () => {
  const workerMock = installEditableRobotSourceWorkerMock();

  try {
    const snapshot = await createRobotSourceSnapshotFromUrdfContent(`
      <robot name="demo">
        <link name="base_link">
          <visual>
            <geometry>
              <mesh filename="meshes/base.stl" />
            </geometry>
          </visual>
        </link>
      </robot>
    `, {
      sourcePath: 'robots/demo/demo.urdf',
    });

    assert.ok(snapshot);
    assert.match(snapshot ?? '', /robots\/demo\/meshes\/base\.stl/);
  } finally {
    workerMock.restore();
  }
});

test('createRobotSourceSnapshotFromUrdfContent uses the editable source worker when Worker is available', async () => {
  const workerMock = installEditableRobotSourceWorkerMock();

  try {
    const snapshot = await createRobotSourceSnapshotFromUrdfContent(`
      <robot name="demo">
        <link name="base_link" />
      </robot>
    `, {
      sourcePath: 'robots/demo/demo.urdf',
    });

    assert.equal(workerMock.parseRequestCount, 1);
    assert.ok(snapshot);
    assert.match(snapshot ?? '', /"name":"demo"/);
  } finally {
    workerMock.restore();
  }
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

test('getViewerSourceFile clears the source file while rendering an assembly view', () => {
  assert.equal(
    getViewerSourceFile({
      selectedFile: createMjcfFile(),
      shouldRenderAssembly: true,
    }),
    null,
  );
});

test('getViewerSourceFile keeps the selected file outside assembly rendering', () => {
  const selectedFile = createMjcfFile();

  assert.equal(
    getViewerSourceFile({
      selectedFile,
      shouldRenderAssembly: false,
    }),
    selectedFile,
  );
});

test('getViewerSourceFile keeps an explicit workspace source file while rendering an assembly view', () => {
  const workspaceSourceFile = createMjcfFile('robots/demo/workspace.xml');

  assert.equal(
    getViewerSourceFile({
      selectedFile: createMjcfFile('robots/demo/selected.xml'),
      shouldRenderAssembly: true,
      workspaceSourceFile,
    }),
    workspaceSourceFile,
  );
});

test('getSingleComponentWorkspaceMjcfViewerSource returns the lone visible MJCF component source', () => {
  const sourceFile = createMjcfFile('robots/demo/workspace.xml');

  assert.equal(
    getSingleComponentWorkspaceMjcfViewerSource({
      assemblyState: createAssemblyState(sourceFile.name),
      availableFiles: [sourceFile],
    }),
    sourceFile,
  );
});

test('getSingleComponentWorkspaceMjcfViewerSource ignores assemblies that need the merged workspace viewer path', () => {
  const sourceFile = createMjcfFile('robots/demo/workspace.xml');
  const secondSourceFile = createMjcfFile('robots/demo/other.xml');
  const multiComponentAssembly = createAssemblyState(sourceFile.name);
  multiComponentAssembly.components.comp_other = {
    id: 'comp_other',
    name: 'other',
    sourceFile: secondSourceFile.name,
    robot: {
      name: 'other',
      rootLinkId: 'other_root',
      links: {
        other_root: {
          ...DEFAULT_LINK,
          id: 'other_root',
          name: 'other_root',
        },
      },
      joints: {},
    },
    visible: true,
  };

  assert.equal(
    getSingleComponentWorkspaceMjcfViewerSource({
      assemblyState: multiComponentAssembly,
      availableFiles: [sourceFile, secondSourceFile],
    }),
    null,
  );

  const bridgedAssembly = createAssemblyState(sourceFile.name);
  bridgedAssembly.bridges.bridge_1 = {
    id: 'bridge_1',
    name: 'bridge_1',
    parentComponentId: 'comp_demo',
    parentLinkId: 'base_link',
    childComponentId: 'comp_demo',
    childLinkId: 'base_link',
    joint: {
      id: 'bridge_joint',
      name: 'bridge_joint',
      type: JointType.FIXED,
      parentLinkId: 'base_link',
      childLinkId: 'base_link',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
      axis: { x: 0, y: 0, z: 1 },
      limit: { lower: 0, upper: 0, effort: 0, velocity: 0 },
      dynamics: { damping: 0, friction: 0 },
      hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
    },
  };

  assert.equal(
    getSingleComponentWorkspaceMjcfViewerSource({
      assemblyState: bridgedAssembly,
      availableFiles: [sourceFile],
    }),
    null,
  );

  const urdfSourceFile = createUrdfFile('robots/demo/workspace.urdf');

  assert.equal(
    getSingleComponentWorkspaceMjcfViewerSource({
      assemblyState: createAssemblyState(urdfSourceFile.name),
      availableFiles: [urdfSourceFile],
    }),
    null,
  );
});

test('getWorkspaceAssemblyViewerRobotData injects a transient bridge preview without mutating persisted bridges', () => {
  const assemblyState = createAssemblyState('robots/demo/left.xml');
  assemblyState.components.comp_demo.robot.rootLinkId = 'comp_demo_base_link';
  assemblyState.components.comp_demo.robot.links = {
    comp_demo_base_link: {
      ...DEFAULT_LINK,
      id: 'comp_demo_base_link',
      name: 'base_link',
    },
  };
  assemblyState.components.comp_other = {
    id: 'comp_other',
    name: 'other',
    sourceFile: 'robots/demo/right.xml',
    robot: {
      name: 'other',
      rootLinkId: 'comp_other_other_root',
      links: {
        comp_other_other_root: {
          ...DEFAULT_LINK,
          id: 'comp_other_other_root',
          name: 'other_root',
        },
      },
      joints: {},
    },
    visible: true,
  };

  const previewRobot = getWorkspaceAssemblyViewerRobotData({
    assemblyState,
    bridgePreview: {
      id: '__bridge_preview__',
      name: '__bridge_preview__',
      parentComponentId: 'comp_demo',
      parentLinkId: 'comp_demo_base_link',
      childComponentId: 'comp_other',
      childLinkId: 'comp_other_other_root',
      joint: {
        id: '__bridge_preview__',
        name: '__bridge_preview__',
        type: JointType.FIXED,
        parentLinkId: 'comp_demo_base_link',
        childLinkId: 'comp_other_other_root',
        origin: { xyz: { x: 0.1, y: -0.2, z: 0.3 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
    },
  });

  assert.ok(previewRobot);
  assert.equal(previewRobot?.joints.__bridge_preview__?.parentLinkId, 'comp_demo_base_link');
  assert.equal(previewRobot?.joints.__bridge_preview__?.childLinkId, 'comp_other_other_root');
  assert.equal(previewRobot?.joints.__bridge_preview__?.origin.xyz.x, 0.1);
  assert.equal(Object.keys(assemblyState.bridges).length, 0);
});

test('getWorkspaceAssemblyViewerRobotData skips transient previews for hidden components', () => {
  const assemblyState = createAssemblyState('robots/demo/left.xml');
  assemblyState.components.comp_demo.robot.rootLinkId = 'comp_demo_base_link';
  assemblyState.components.comp_demo.robot.links = {
    comp_demo_base_link: {
      ...DEFAULT_LINK,
      id: 'comp_demo_base_link',
      name: 'base_link',
    },
  };
  assemblyState.components.comp_other = {
    id: 'comp_other',
    name: 'other',
    sourceFile: 'robots/demo/right.xml',
    robot: {
      name: 'other',
      rootLinkId: 'comp_other_other_root',
      links: {
        comp_other_other_root: {
          ...DEFAULT_LINK,
          id: 'comp_other_other_root',
          name: 'other_root',
        },
      },
      joints: {},
    },
    visible: false,
  };

  const previewRobot = getWorkspaceAssemblyViewerRobotData({
    assemblyState,
    bridgePreview: {
      id: '__bridge_preview__',
      name: '__bridge_preview__',
      parentComponentId: 'comp_demo',
      parentLinkId: 'comp_demo_base_link',
      childComponentId: 'comp_other',
      childLinkId: 'comp_other_other_root',
      joint: {
        id: '__bridge_preview__',
        name: '__bridge_preview__',
        type: JointType.FIXED,
        parentLinkId: 'comp_demo_base_link',
        childLinkId: 'comp_other_other_root',
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
    },
  });

  assert.ok(previewRobot);
  assert.equal(previewRobot?.joints.__bridge_preview__, undefined);
});

test('shouldReseedSingleComponentAssemblyFromActiveFile detects a stale single-component assembly seed', () => {
  assert.equal(
    shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState: createAssemblyState('robots/demo/left_hand.xml'),
      activeFile: createMjcfFile('robots/demo/scene_left.xml'),
    }),
    true,
  );
});

test('shouldReseedSingleComponentAssemblyFromActiveFile seeds initial and empty assemblies', () => {
  assert.equal(
    shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState: null,
      activeFile: createMjcfFile('robots/demo/left_hand.xml'),
    }),
    true,
  );

  assert.equal(
    shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState: {
        name: 'demo_project',
        components: {},
        bridges: {},
      },
      activeFile: createMjcfFile('robots/demo/left_hand.xml'),
    }),
    true,
  );
});

test('shouldReseedSingleComponentAssemblyFromActiveFile ignores matching sources and non-editable files', () => {
  assert.equal(
    shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState: createAssemblyState('robots/demo/scene_left.xml'),
      activeFile: createMjcfFile('robots/demo/scene_left.xml'),
    }),
    false,
  );

  assert.equal(
    shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState: createAssemblyState('robots/demo/scene_left.xml'),
      activeFile: {
        name: 'robots/demo/hand_mesh.obj',
        format: 'mesh',
        content: '',
      },
    }),
    false,
  );
});

test('shouldReseedSingleComponentAssemblyFromActiveFile preserves real assemblies', () => {
  const assemblyState = createAssemblyState('robots/demo/left_hand.xml');
  assemblyState.bridges.bridge_1 = {
    id: 'bridge_1',
    name: 'bridge_1',
    parentComponentId: 'comp_demo',
    parentLinkId: 'base_link',
    childComponentId: 'comp_demo',
    childLinkId: 'base_link',
    joint: {
      id: 'joint_1',
      name: 'joint_1',
      type: JointType.FIXED,
      parentLinkId: 'base_link',
      childLinkId: 'base_link',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
      dynamics: { damping: 0, friction: 0 },
      hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
    },
  };

  assert.equal(
    shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState,
      activeFile: createMjcfFile('robots/demo/scene_left.xml'),
    }),
    false,
  );
});

test('buildWorkspaceViewerRobotData keeps single-root robots unchanged', () => {
  const robot: RobotData = {
    name: 'single-root',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
      },
    },
    joints: {},
  };

  assert.equal(buildWorkspaceViewerRobotData(robot), robot);
});

test('buildWorkspaceViewerRobotData adds a synthetic world root for disconnected models', () => {
  const robot: RobotData = {
    name: 'merged',
    rootLinkId: 'left_base',
    links: {
      left_base: {
        ...DEFAULT_LINK,
        id: 'left_base',
        name: 'left_base',
      },
      left_tool: {
        ...DEFAULT_LINK,
        id: 'left_tool',
        name: 'left_tool',
      },
      right_base: {
        ...DEFAULT_LINK,
        id: 'right_base',
        name: 'right_base',
      },
    },
    joints: {
      left_fixed: {
        id: 'left_fixed',
        name: 'left_fixed',
        type: JointType.FIXED,
        parentLinkId: 'left_base',
        childLinkId: 'left_tool',
        origin: { xyz: { x: 0.25, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
    },
  };

  const viewerRobot = buildWorkspaceViewerRobotData(robot);

  assert.equal(viewerRobot.rootLinkId, '__workspace_world__');
  assert.equal(viewerRobot.links.__workspace_world__?.name, 'world');
  assert.equal(viewerRobot.links.__workspace_world__?.visual.type, GeometryType.NONE);
  assert.equal(viewerRobot.links.__workspace_world__?.collision.type, GeometryType.NONE);

  const syntheticJoints = Object.values(viewerRobot.joints)
    .filter((joint) => joint.parentLinkId === '__workspace_world__');

  assert.equal(syntheticJoints.length, 2);
  assert.deepEqual(
    syntheticJoints.map((joint) => joint.childLinkId).sort(),
    ['left_base', 'right_base'],
  );

  const rootOffsets = syntheticJoints
    .map((joint) => joint.origin.xyz.x)
    .sort((left, right) => left - right);

  assert.ok(rootOffsets[0] < 0);
  assert.ok(rootOffsets[1] > 0);
  assert.ok(Math.abs(rootOffsets[0] + 0.675) < 0.001);
  assert.ok(Math.abs(rootOffsets[1] - 0.75) < 0.001);
  assert.ok(rootOffsets[1] - rootOffsets[0] < 1.6);
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

test('createPreviewRobotState resolves xacro files into a selection-free preview robot', () => {
  const file = createXacroFile();
  const previewRobot = createPreviewRobotState(file, {
    availableFiles: [file],
  });

  assert.ok(previewRobot);
  assert.equal(previewRobot?.selection.type, null);
  assert.equal(previewRobot?.selection.id, null);
  assert.equal(previewRobot?.name, 'demo');
  assert.ok(previewRobot?.links.base_link);
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

test('createPreviewRobotStateFromImportResult converts ready worker results into preview state', () => {
  const previewRobot = createPreviewRobotStateFromImportResult(createUrdfFile(), {
    status: 'ready',
    format: 'urdf',
    robotData: {
      name: 'demo',
      rootLinkId: 'base_link',
      links: {
        base_link: {
          ...DEFAULT_LINK,
          id: 'base_link',
          name: 'base_link',
        },
      },
      joints: {},
    },
    resolvedUrdfContent: '<robot name="demo"><link name="base_link" /></robot>',
    resolvedUrdfSourceFilePath: 'robots/demo/demo.urdf',
  });

  assert.ok(previewRobot);
  assert.equal(previewRobot?.selection.type, null);
  assert.equal(previewRobot?.selection.id, null);
  assert.equal(previewRobot?.name, 'demo');
});

test('buildPreviewSceneSourceFromImportResult keeps MJCF source only after a successful import result', () => {
  const mjcfFile = createMjcfFile();
  const previewSource = buildPreviewSceneSourceFromImportResult(mjcfFile, {
    availableFiles: [mjcfFile],
    previewRobot: null,
    importResult: {
      status: 'ready',
      format: 'mjcf',
      robotData: {
        name: 'demo',
        rootLinkId: 'base_link',
        links: {
          base_link: {
            ...DEFAULT_LINK,
            id: 'base_link',
            name: 'base_link',
          },
        },
        joints: {},
      },
      resolvedUrdfContent: null,
      resolvedUrdfSourceFilePath: null,
    },
  });

  assert.ok(previewSource);
  assert.match(previewSource, /<mujoco model="demo">/);
  assert.match(previewSource, /<body name="base_link"\s*\/>/);
});

test('buildPreviewSceneSourceFromImportResult returns an empty preview for MJCF parse failures', () => {
  const mjcfFile = createMjcfFile();

  assert.equal(
    buildPreviewSceneSourceFromImportResult(mjcfFile, {
      availableFiles: [mjcfFile],
      previewRobot: null,
      importResult: {
        status: 'error',
        format: 'mjcf',
        reason: 'parse_failed',
      },
    }),
    '',
  );
});

test('buildPreviewSceneSourceFromImportResult suppresses viewer preview for source-only MJCF fragments', () => {
  const mjcfFile = createMjcfFile('robots/demo/keyframes.xml');

  assert.equal(
    buildPreviewSceneSourceFromImportResult(mjcfFile, {
      availableFiles: [mjcfFile],
      previewRobot: null,
      importResult: {
        status: 'error',
        format: 'mjcf',
        reason: 'source_only_fragment',
      },
    }),
    null,
  );
});

test('getPreferredMjcfContent keeps the imported MJCF before viewer edits', () => {
  assert.equal(
    getPreferredMjcfContent({
      sourceContent: '<mujoco model="cassie-source"/>',
      generatedContent: '<mujoco model="cassie-generated"/>',
      hasViewerEdits: false,
    }),
    '<mujoco model="cassie-source"/>',
  );
});

test('getPreferredMjcfContent keeps the imported MJCF after viewer edits when source is available', () => {
  assert.equal(
    getPreferredMjcfContent({
      sourceContent: '<mujoco model="cassie-source"/>',
      generatedContent: '<mujoco model="cassie-generated"/>',
      hasViewerEdits: true,
    }),
    '<mujoco model="cassie-source"/>',
  );
});

test('getPreferredSdfContent keeps the imported SDF before store edits', () => {
  assert.equal(
    getPreferredSdfContent({
      fileContent: '<sdf version="1.7"><model name="source"/></sdf>',
      generatedContent: '<sdf version="1.7"><model name="generated"/></sdf>',
      hasStoreEdits: false,
    }),
    '<sdf version="1.7"><model name="source"/></sdf>',
  );
});

test('getPreferredSdfContent switches to generated SDF after store edits', () => {
  assert.equal(
    getPreferredSdfContent({
      fileContent: '<sdf version="1.7"><model name="source"/></sdf>',
      generatedContent: '<sdf version="1.7"><model name="generated"/></sdf>',
      hasStoreEdits: true,
    }),
    '<sdf version="1.7"><model name="generated"/></sdf>',
  );
});

test('getPreferredXacroContent keeps the imported xacro before store edits', () => {
  assert.equal(
    getPreferredXacroContent({
      fileContent: '<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="source"/>',
      originalContent: '<robot name="fallback"/>',
      generatedContent: '<robot name="generated"/>',
      hasStoreEdits: false,
    }),
    '<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="source"/>',
  );
});

test('getPreferredXacroContent switches to generated XML after store edits', () => {
  assert.equal(
    getPreferredXacroContent({
      fileContent: '<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="source"/>',
      originalContent: '<robot name="fallback"/>',
      generatedContent: '<robot name="generated"/>',
      hasStoreEdits: true,
    }),
    '<robot name="generated"/>',
  );
});
