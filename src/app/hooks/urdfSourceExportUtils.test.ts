import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

import { parseURDF, generateURDF } from '@/core/parsers';
import { parseEditableRobotSource } from '@/app/utils/parseEditableRobotSource';
import { disposeRobotImportWorker } from './robotImportWorkerBridge';
import type { RobotFile } from '@/types';
import { resolveUrdfSourceExportContent } from './urdfSourceExportUtils';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;

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

type WorkerEventHandler = (event: { data?: unknown; error?: unknown; message?: string }) => void;

function installEditableSourceWorkerMock() {
  const originalWorker = globalThis.Worker;
  let parseRequestCount = 0;

  class FakeRobotImportWorker {
    private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

    private readonly contextSnapshots = new Map<string, {
      availableFiles?: RobotFile[];
      allFileContents?: Record<string, string>;
    }>();

    addEventListener(type: string, handler: WorkerEventHandler): void {
      const handlers = this.listeners.get(type) ?? new Set<WorkerEventHandler>();
      handlers.add(handler);
      this.listeners.set(type, handlers);
    }

    removeEventListener(type: string, handler: WorkerEventHandler): void {
      this.listeners.get(type)?.delete(handler);
    }

    postMessage(message: any): void {
      if (message?.type === 'sync-context') {
        this.contextSnapshots.set(message.contextId, message.context ?? {});
        return;
      }

      if (message?.type !== 'parse-editable-robot-source') {
        return;
      }

      parseRequestCount += 1;
      const context = message.contextId
        ? this.contextSnapshots.get(message.contextId)
        : undefined;
      const options = {
        ...context,
        ...message.options,
        availableFiles: message.options?.availableFiles ?? context?.availableFiles,
        allFileContents: message.options?.allFileContents ?? context?.allFileContents,
      };

      queueMicrotask(() => {
        try {
          const result = parseEditableRobotSource(options);
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

function getVisualMaterialCount(urdfContent: string, linkName: string): number {
  const linkBlock = urdfContent.match(new RegExp(`<link name="${linkName}">([\\s\\S]*?)<\\/link>`))?.[1] || '';
  const visualBlock = linkBlock.match(/<visual>([\s\S]*?)<\/visual>/)?.[1] || '';
  return (visualBlock.match(/<material\b/g) || []).length;
}

test('resolveUrdfSourceExportContent prefers the original go2 URDF source when it still matches the current robot state', async () => {
  const workerMock = installEditableSourceWorkerMock();
  const sourceFilePath = 'test/unitree_ros/robots/go2_description/urdf/go2_description.urdf';
  const originalUrdfContent = fs.readFileSync(sourceFilePath, 'utf8');
  const currentRobot = parseURDF(originalUrdfContent);

  assert.ok(currentRobot);

  const generatedContent = generateURDF({
    ...currentRobot,
    selection: { type: null, id: null },
  });

  try {
    const exportedContent = await resolveUrdfSourceExportContent({
      currentRobot: {
        ...currentRobot,
        selection: { type: null, id: null },
      },
      exportRobotName: currentRobot.name,
      selectedFileName: sourceFilePath,
      selectedFileContent: generatedContent,
      originalUrdfContent,
    });

    assert.equal(workerMock.parseRequestCount, 1);
    assert.ok(exportedContent);
    assert.match(exportedContent, /<mesh filename="package:\/\/go2_description\/meshes\/dae\/base\.dae" \/>/);
    assert.equal(getVisualMaterialCount(exportedContent, 'base'), 5);
    assert.equal(getVisualMaterialCount(exportedContent, 'FR_hip'), 2);
  } finally {
    workerMock.restore();
  }
});

test('resolveUrdfSourceExportContent falls back to the selected URDF text when the original source no longer matches the current robot state', async () => {
  const workerMock = installEditableSourceWorkerMock();
  const originalUrdfContent = `<?xml version="1.0"?>
<robot name="demo_description">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_description/meshes/base.stl" />
      </geometry>
      <material name="base_link_mat">
        <color rgba="1 0 0 1" />
      </material>
    </visual>
  </link>
</robot>`;

  const selectedFileContent = `<?xml version="1.0"?>
<robot name="demo_description">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_description/meshes/base.stl" />
      </geometry>
      <material name="base_link_mat">
        <color rgba="0 0 1 1" />
      </material>
    </visual>
  </link>
</robot>`;

  const currentRobot = parseURDF(selectedFileContent);

  assert.ok(currentRobot);

  try {
    const exportedContent = await resolveUrdfSourceExportContent({
      currentRobot: {
        ...currentRobot,
        selection: { type: null, id: null },
      },
      exportRobotName: currentRobot.name,
      selectedFileName: 'demo_description/urdf/demo_description.urdf',
      selectedFileContent,
      originalUrdfContent,
    });

    assert.equal(workerMock.parseRequestCount, 2);
    assert.ok(exportedContent);
    assert.match(exportedContent, /<color rgba="0 0 1 1" \/>/);
    assert.doesNotMatch(exportedContent, /<color rgba="1 0 0 1" \/>/);
  } finally {
    workerMock.restore();
  }
});

test('resolveUrdfSourceExportContent can opt out of reusing original go2 visual mesh sources', async () => {
  const sourceFilePath = 'test/unitree_ros/robots/go2_description/urdf/go2_description.urdf';
  const originalUrdfContent = fs.readFileSync(sourceFilePath, 'utf8');
  const currentRobot = parseURDF(originalUrdfContent);

  assert.ok(currentRobot);

  const exportedContent = await resolveUrdfSourceExportContent({
    currentRobot: {
      ...currentRobot,
      selection: { type: null, id: null },
    },
    exportRobotName: currentRobot.name,
    selectedFileName: sourceFilePath,
    selectedFileContent: originalUrdfContent,
    originalUrdfContent,
    preferSourceVisualMeshes: false,
  });

  assert.equal(exportedContent, null);
});
