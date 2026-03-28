import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { parseEditableRobotSource } from '@/app/utils/parseEditableRobotSource';
import { disposeRobotImportWorker } from '@/app/hooks/robotImportWorkerBridge';
import { DEFAULT_LINK } from '@/types/constants';
import { GeometryType, JointType, type RobotFile, type RobotState } from '@/types';
import {
  createPreviewRobotState,
  createPreviewRobotStateFromImportResult,
  createRobotSourceSnapshot,
  createRobotSourceSnapshotFromUrdfContent,
  getPreferredMjcfContent,
  getPreferredUrdfContent,
  getPreferredXacroContent,
  shouldUseEmptyRobotForUsdHydration,
} from './workspaceSourceSyncUtils.ts';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser;
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

test('getPreferredMjcfContent switches to generated MJCF after viewer edits', () => {
  assert.equal(
    getPreferredMjcfContent({
      sourceContent: '<mujoco model="cassie-source"/>',
      generatedContent: '<mujoco model="cassie-generated"/>',
      hasViewerEdits: true,
    }),
    '<mujoco model="cassie-generated"/>',
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
