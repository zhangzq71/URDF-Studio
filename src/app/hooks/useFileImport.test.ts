import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

import { useFileImport } from './useFileImport.ts';
import { disposeImportPreparationWorker } from './importPreparationWorkerBridge.ts';
import { disposeRobotImportWorker } from './robotImportWorkerBridge.ts';
import { hydrateDeferredImportAssets, prepareImportPayload } from '@/app/utils/importPreparation';
import { useAssemblyStore, useAssetsStore, useRobotStore, useUIStore } from '@/store';
import { translations } from '@/shared/i18n';
import { DEFAULT_MOTOR_LIBRARY } from '@/shared/data/motorLibrary';
import type { RobotFile } from '@/types';
import { resolveRobotFileData } from '@/core/parsers';

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

function installDomEnvironment() {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  const originalHTMLElement = globalThis.HTMLElement;
  const originalSVGElement = globalThis.SVGElement;
  const originalNode = globalThis.Node;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const originalDOMParser = globalThis.DOMParser;
  const originalXMLSerializer = globalThis.XMLSerializer;
  const originalAlert = globalThis.alert;

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    writable: true,
    value: dom.window.HTMLElement,
  });
  Object.defineProperty(globalThis, 'SVGElement', {
    configurable: true,
    writable: true,
    value: dom.window.SVGElement,
  });
  Object.defineProperty(globalThis, 'Node', {
    configurable: true,
    writable: true,
    value: dom.window.Node,
  });
  Object.defineProperty(globalThis, 'MutationObserver', {
    configurable: true,
    writable: true,
    value: dom.window.MutationObserver,
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => clearTimeout(handle),
  });
  Object.defineProperty(globalThis, 'DOMParser', {
    configurable: true,
    writable: true,
    value: dom.window.DOMParser,
  });
  Object.defineProperty(globalThis, 'XMLSerializer', {
    configurable: true,
    writable: true,
    value: dom.window.XMLSerializer,
  });
  Object.defineProperty(globalThis, 'alert', {
    configurable: true,
    writable: true,
    value: () => {},
  });

  return {
    restore() {
      dom.window.close();
      restoreGlobalProperty('window', originalWindow);
      restoreGlobalProperty('document', originalDocument);
      restoreGlobalProperty('navigator', originalNavigator);
      restoreGlobalProperty('HTMLElement', originalHTMLElement);
      restoreGlobalProperty('SVGElement', originalSVGElement);
      restoreGlobalProperty('Node', originalNode);
      restoreGlobalProperty('MutationObserver', originalMutationObserver);
      restoreGlobalProperty('requestAnimationFrame', originalRequestAnimationFrame);
      restoreGlobalProperty('cancelAnimationFrame', originalCancelAnimationFrame);
      restoreGlobalProperty('DOMParser', originalDOMParser);
      restoreGlobalProperty('XMLSerializer', originalXMLSerializer);
      restoreGlobalProperty('alert', originalAlert);
    },
  };
}

function resetStoresToBaseline() {
  useUIStore.setState({
    lang: 'en',
    appMode: 'editor',
    sidebarTab: 'structure',
  });

  useAssemblyStore.setState({
    assemblyState: null,
    _history: { past: [], future: [] },
    _activity: [],
  });

  useAssetsStore.setState({
    assets: {},
    availableFiles: [],
    usdSceneSnapshots: {},
    usdPreparedExportCaches: {},
    selectedFile: null,
    documentLoadState: {
      status: 'idle',
      fileName: null,
      format: null,
      error: null,
    },
    allFileContents: {},
    motorLibrary: {},
    originalUrdfContent: '',
    originalFileFormat: null,
  });

  useRobotStore.getState().resetRobot();
}

function renderHook(options?: Parameters<typeof useFileImport>[0]) {
  let hookValue: ReturnType<typeof useFileImport> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);

  function Probe() {
    hookValue = useFileImport(options);
    return null;
  }

  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(Probe));
  });

  assert.ok(hookValue, 'hook should render');

  return {
    hook: hookValue,
    cleanup() {
      flushSync(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

type WorkerEventHandler = (event: { data?: unknown; error?: unknown; message?: string }) => void;

function installRobotImportWorkerMock(options: { failHydrate?: boolean } = {}) {
  const originalWorker = globalThis.Worker;
  let resolveRequestCount = 0;
  let prepareRequestCount = 0;

  class FakeRobotImportWorker {
    private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

    private readonly contextSnapshots = new Map<
      string,
      {
        availableFiles?: RobotFile[];
        assets?: Record<string, string>;
        allFileContents?: Record<string, string>;
      }
    >();

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

      if (message?.type === 'prepare-import') {
        prepareRequestCount += 1;
        const descriptors = Array.isArray(message.files) ? message.files : [];

        queueMicrotask(async () => {
          this.listeners.get('message')?.forEach((handler) => {
            handler({
              data: {
                type: 'prepare-import-progress',
                requestId: message.requestId,
                progress: {
                  phase: 'extracting-files',
                  progressPercent: 48,
                  processedEntries: 1,
                  totalEntries: 2,
                  processedBytes: 128,
                  totalBytes: 256,
                },
              },
            });
          });

          const payload = await prepareImportPayload({
            files: descriptors,
            existingPaths: Array.isArray(message.existingPaths) ? message.existingPaths : [],
            preResolvePreferredImport: message.preResolvePreferredImport,
          });

          this.listeners.get('message')?.forEach((handler) => {
            handler({
              data: {
                type: 'prepare-import-result',
                requestId: message.requestId,
                payload,
              },
            });
          });
        });
        return;
      }

      if (message?.type === 'hydrate-deferred-import-assets') {
        queueMicrotask(async () => {
          if (options.failHydrate) {
            this.listeners.get('message')?.forEach((handler) => {
              handler({
                data: {
                  type: 'hydrate-deferred-import-assets-error',
                  requestId: message.requestId,
                  error: 'Deferred asset hydration failed',
                },
              });
            });
            return;
          }

          const assetFiles = await hydrateDeferredImportAssets(
            message.archiveFile,
            message.assetFiles,
          );

          this.listeners.get('message')?.forEach((handler) => {
            handler({
              data: {
                type: 'hydrate-deferred-import-assets-result',
                requestId: message.requestId,
                assetFiles,
              },
            });
          });
        });
        return;
      }

      if (message?.type !== 'resolve-robot-file') {
        return;
      }

      resolveRequestCount += 1;
      const context = message.contextId ? this.contextSnapshots.get(message.contextId) : undefined;
      const resolveOptions = {
        ...context,
        ...message.options,
        availableFiles: message.options?.availableFiles ?? context?.availableFiles,
        assets: message.options?.assets ?? context?.assets,
        allFileContents: message.options?.allFileContents ?? context?.allFileContents,
      };

      queueMicrotask(() => {
        const result = resolveRobotFileData(message.file, resolveOptions);
        this.listeners.get('message')?.forEach((handler) => {
          handler({
            data: {
              type: 'resolve-robot-file-result',
              requestId: message.requestId,
              result,
            },
          });
        });
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
    get resolveRequestCount() {
      return resolveRequestCount;
    },
    get prepareRequestCount() {
      return prepareRequestCount;
    },
    restore() {
      disposeImportPreparationWorker();
      disposeRobotImportWorker();
      restoreGlobalProperty('Worker', originalWorker);
    },
  };
}

test('useFileImport loadRobot resolves files through the import worker', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const sourceFile: RobotFile = {
    name: 'robots/demo/demo.urdf',
    format: 'urdf',
    content: '<robot name="demo"><link name="base_link" /></robot>',
  };

  useAssetsStore.getState().setAvailableFiles([sourceFile]);

  const rendered = renderHook();

  try {
    const result = await rendered.hook.loadRobot(sourceFile, [sourceFile], {}, {});

    assert.equal(workerMock.resolveRequestCount, 1);
    assert.equal(result.status, 'ready');
    if (result.status !== 'ready') {
      assert.fail('expected worker import result to be ready');
    }
    assert.equal(result.robotData.name, 'demo');
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport reports folder preparation state before handing off the first imported robot', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const existingFile: RobotFile = {
    name: 'library/existing.urdf',
    format: 'urdf',
    content: '<robot name="existing"><link name="base_link" /></robot>',
  };
  const importedFile = new File(
    ['<robot name="demo"><link name="base_link" /></robot>'],
    'demo.urdf',
    { type: 'text/xml' },
  );
  Object.defineProperty(importedFile, 'webkitRelativePath', {
    configurable: true,
    value: 'big_bundle/demo.urdf',
  });

  useAssetsStore.getState().setAvailableFiles([existingFile]);

  const overlayStates: Array<{
    label: string;
    detail?: string;
    progress?: number | null;
    statusLabel?: string | null;
    stageLabel?: string | null;
  } | null> = [];
  const loadCalls: RobotFile[] = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
    onImportPreparationStateChange: (state) => {
      overlayStates.push(state);
    },
  });

  try {
    await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(workerMock.prepareRequestCount, 1);
    assert.equal(workerMock.resolveRequestCount, 0);
    assert.equal(loadCalls.length, 1);
    assert.equal(loadCalls[0]?.name, 'big_bundle/demo.urdf');
    assert.deepEqual(overlayStates, [
      {
        label: translations.en.importPreparationLoadingTitle,
        detail: translations.en.importPreparationLoadingDetail,
        progress: null,
        statusLabel: null,
        stageLabel: translations.en.importPreparationReadingArchive,
      },
      {
        label: translations.en.importPreparationLoadingTitle,
        detail: '128 B / 256 B',
        progress: 0.48,
        statusLabel: '1 / 2',
        stageLabel: translations.en.importPreparationExtractingFiles,
      },
      null,
    ]);
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport keeps editor mode active after importing the first robot', async () => {
  resetStoresToBaseline();
  useUIStore.setState({ appMode: 'editor' });
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const importedFile = new File(
    ['<robot name="demo"><link name="base_link" /></robot>'],
    'demo.urdf',
    { type: 'text/xml' },
  );

  const rendered = renderHook({
    onLoadRobot: () => {},
  });

  try {
    const result = await rendered.hook.handleImport([importedFile]);

    assert.equal(result.status, 'completed');
    assert.equal(useAssetsStore.getState().availableFiles[0]?.name, 'demo.urdf');
    assert.equal(useUIStore.getState().appMode, 'editor');
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport keeps editor mode active across repeated imports', async () => {
  resetStoresToBaseline();
  useUIStore.setState({ appMode: 'editor' });
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const importedFile = new File(
    ['<robot name="demo"><link name="base_link" /></robot>'],
    'demo.urdf',
    { type: 'text/xml' },
  );

  const rendered = renderHook({
    onLoadRobot: () => {},
  });

  try {
    await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(useAssetsStore.getState().availableFiles[0]?.name, 'demo.urdf');
    assert.equal(useUIStore.getState().appMode, 'editor');
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport blocks standalone package-backed URDF files from auto-opening without matching assets', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const importedFile = new File(
    [
      `<robot name="aliengo">
        <link name="base">
          <visual>
            <geometry>
              <mesh filename="package://aliengo_description/meshes/trunk.dae" />
            </geometry>
          </visual>
        </link>
      </robot>`,
    ],
    'aliengo.urdf',
    { type: 'text/xml' },
  );

  const loadCalls: RobotFile[] = [];
  const toastCalls: Array<{ message: string; type?: 'info' | 'success' }> = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
    onShowToast: (message, type) => {
      toastCalls.push({ message, type });
    },
  });

  try {
    await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(loadCalls.length, 0);
    assert.equal(useAssetsStore.getState().selectedFile, null);
    assert.equal(useAssetsStore.getState().availableFiles[0]?.name, 'aliengo.urdf');
    assert.match(
      toastCalls.map((entry) => entry.message).join('\n'),
      /Import the full folder or archive so meshes and textures are available/i,
    );
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport blocks standalone MJCF files from auto-opening without matching mesh assets', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const importedFile = new File(
    [
      `<mujoco model="dynamixel_2r">
        <compiler meshdir="assets" />
        <asset>
          <mesh name="nut_2_5" file="nut_2_5.stl" />
        </asset>
        <worldbody>
          <body name="base_link">
            <geom type="mesh" mesh="nut_2_5" />
          </body>
        </worldbody>
      </mujoco>`,
    ],
    'dynamixel_2r.xml',
    { type: 'text/xml' },
  );

  const loadCalls: RobotFile[] = [];
  const toastCalls: Array<{ message: string; type?: 'info' | 'success' }> = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
    onShowToast: (message, type) => {
      toastCalls.push({ message, type });
    },
  });

  try {
    await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(loadCalls.length, 0);
    assert.equal(useAssetsStore.getState().selectedFile, null);
    assert.match(
      toastCalls.map((entry) => entry.message).join('\n'),
      /Import the full folder or archive so meshes and textures are available/i,
    );
    assert.match(toastCalls.map((entry) => entry.message).join('\n'), /assets\/nut_2_5\.stl/i);
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport does not warn when an archive already contains deferred MJCF assets', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const zip = new JSZip();
  zip.file(
    'demo/demo.xml',
    `<mujoco model="demo_bundle">
      <compiler meshdir="assets" texturedir="assets" />
      <asset>
        <mesh name="body_mesh" file="body.obj" />
      </asset>
      <worldbody>
        <body name="base_link">
          <geom type="mesh" mesh="body_mesh" />
        </body>
      </worldbody>
    </mujoco>`,
  );
  zip.file('demo/assets/body.obj', 'o Mesh');
  zip.file('demo/assets/unused.png', new Uint8Array([137, 80, 78, 71]));

  const importedFile = new File([await zip.generateAsync({ type: 'uint8array' })], 'bundle.zip', {
    type: 'application/zip',
  });

  const loadCalls: RobotFile[] = [];
  const toastCalls: Array<{ message: string; type?: 'info' | 'success' }> = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
    onShowToast: (message, type) => {
      toastCalls.push({ message, type });
    },
  });

  try {
    await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(loadCalls.length, 1);
    assert.equal(loadCalls[0]?.name, 'demo/demo.xml');
    assert.ok(
      toastCalls.every(
        (entry) =>
          !/Import the full folder or archive so meshes and textures are available/i.test(
            entry.message,
          ),
      ),
    );
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport fails the archive import when deferred asset hydration fails', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock({ failHydrate: true });

  let alertMessage = '';
  Object.defineProperty(globalThis, 'alert', {
    configurable: true,
    writable: true,
    value: (message?: unknown) => {
      alertMessage = String(message ?? '');
    },
  });

  const zip = new JSZip();
  zip.file(
    'demo/demo.xml',
    `<mujoco model="demo_bundle">
      <compiler meshdir="assets" texturedir="assets" />
      <asset>
        <mesh name="body_mesh" file="body.obj" />
        <texture name="body_orm" type="2d" file="body_orm.png" />
      </asset>
      <worldbody>
        <body name="base_link">
          <geom type="mesh" mesh="body_mesh" />
        </body>
      </worldbody>
    </mujoco>`,
  );
  zip.file('demo/assets/body.obj', 'o Mesh');
  zip.file('demo/assets/body_orm.png', new Uint8Array([137, 80, 78, 71]));

  const importedFile = new File([await zip.generateAsync({ type: 'uint8array' })], 'bundle.zip', {
    type: 'application/zip',
  });

  const loadCalls: RobotFile[] = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
  });

  try {
    const result = await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(result.status, 'failed');
    assert.equal(loadCalls.length, 0);
    assert.equal(useAssetsStore.getState().availableFiles.length, 0);
    assert.equal(Object.keys(useAssetsStore.getState().assets).length, 0);
    assert.match(alertMessage, /Deferred asset hydration failed/i);
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport imports supported zip archives into the asset library without alerting', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  let alertCallCount = 0;
  Object.defineProperty(globalThis, 'alert', {
    configurable: true,
    writable: true,
    value: () => {
      alertCallCount += 1;
    },
  });

  const importedFile = new File([fs.readFileSync('test/xuebao.zip')], 'xuebao.zip', {
    type: 'application/zip',
  });

  const rendered = renderHook();

  try {
    await rendered.hook.handleImport([importedFile] as unknown as FileList);

    assert.equal(alertCallCount, 0);
    assert.ok(useAssetsStore.getState().availableFiles.length > 0);
    assert.ok(
      useAssetsStore
        .getState()
        .availableFiles.some((file) => file.name.endsWith('/xuebao_unified.xml')),
    );
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport seeds a multi-component workspace from the first imported archive', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const zip = new JSZip();
  zip.file('demo_bundle/base/base.urdf', '<robot name="base"><link name="base_link" /></robot>');
  zip.file('demo_bundle/tool/tool.urdf', '<robot name="tool"><link name="tool_link" /></robot>');

  const importedFile = new File(
    [await zip.generateAsync({ type: 'uint8array' })],
    'demo_bundle.zip',
    { type: 'application/zip' },
  );

  const rendered = renderHook();

  try {
    const result = await rendered.hook.handleImport([importedFile] as unknown as FileList);
    const assemblyState = useAssemblyStore.getState().assemblyState;
    const assemblySourceFiles = Object.values(assemblyState?.components ?? {}).map(
      (component) => component.sourceFile,
    );

    assert.equal(result.status, 'completed');
    assert.equal(useUIStore.getState().sidebarTab, 'workspace');
    assert.deepEqual(
      assemblySourceFiles.sort((left, right) => left.localeCompare(right)),
      ['demo_bundle/base/base.urdf', 'demo_bundle/tool/tool.urdf'],
    );
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport imports loose mesh and image files into the asset library', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const loadCalls: RobotFile[] = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
  });

  try {
    await rendered.hook.handleImport([
      new File(['solid demo'], 'body.stl', { type: 'model/stl' }),
      new File([new Uint8Array([137, 80, 78, 71])], 'poster.png', {
        type: 'image/png',
      }),
    ] as unknown as FileList);

    assert.equal(loadCalls.length, 1);
    assert.equal(loadCalls[0]?.name, 'body.stl');
    assert.ok(
      useAssetsStore
        .getState()
        .availableFiles.some((file) => file.name === 'body.stl' && file.format === 'mesh'),
    );
    assert.ok(
      useAssetsStore
        .getState()
        .availableFiles.some((file) => file.name === 'poster.png' && file.format === 'mesh'),
    );
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport reports unsupported loose files with an info toast and leaves the library untouched', async () => {
  resetStoresToBaseline();
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();

  const loadCalls: RobotFile[] = [];
  const toastCalls: Array<{ message: string; type?: 'info' | 'success' }> = [];
  const rendered = renderHook({
    onLoadRobot: (file) => {
      loadCalls.push(file);
    },
    onShowToast: (message, type) => {
      toastCalls.push({ message, type });
    },
  });

  try {
    await rendered.hook.handleImport([
      new File(['# Notes'], 'README.md', { type: 'text/markdown' }),
      new File([new Uint8Array([1, 2, 3, 4])], 'payload.dat', {
        type: 'application/octet-stream',
      }),
    ] as unknown as FileList);

    assert.equal(loadCalls.length, 0);
    assert.deepEqual(useAssetsStore.getState().availableFiles, []);
    assert.deepEqual(Object.keys(useAssetsStore.getState().assets), []);
    assert.equal(useAssetsStore.getState().allFileContents['README.md'], undefined);
    assert.deepEqual(toastCalls, [
      {
        message: translations.en.noSupportedImportFilesFound,
        type: 'info',
      },
    ]);
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});

test('useFileImport keeps editor mode when importing a project archive', async () => {
  resetStoresToBaseline();
  useUIStore.setState({ appMode: 'editor' });
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();
  let importerCallCount = 0;
  const projectImportSelections: Array<RobotFile | null> = [];

  const projectFile = new File(['unused'], 'project.usp', { type: 'application/octet-stream' });

  const rendered = renderHook({
    onProjectImported: (selectedFile) => {
      projectImportSelections.push(selectedFile);
    },
    projectImporter: async () => {
      importerCallCount += 1;
      return {
        manifest: {
          name: 'project',
          version: '1.0',
          createdAt: '2026-03-30T00:00:00.000Z',
          lastModified: '2026-03-30T00:00:00.000Z',
          assets: {
            logicalPaths: [],
            assetEntries: [],
          },
          files: [
            {
              name: 'robots/demo.urdf',
              format: 'urdf',
            },
          ],
          selectedFileName: 'robots/demo.urdf',
          ui: {},
          robotState: null,
          assemblyState: null,
        },
        assets: {},
        availableFiles: [
          {
            name: 'robots/demo.urdf',
            format: 'urdf',
            content: '<robot name="demo"><link name="base_link" /></robot>',
          },
        ],
        allFileContents: {},
        motorLibrary: DEFAULT_MOTOR_LIBRARY,
        selectedFileName: 'robots/demo.urdf',
        originalUrdfContent: '<robot name="demo"><link name="base_link" /></robot>',
        originalFileFormat: 'urdf',
        usdPreparedExportCaches: {},
        robotState: null,
        assemblyState: null,
        robotHistory: { past: [], future: [] },
        robotActivity: [],
        assemblyHistory: { past: [], future: [] },
        assemblyActivity: [],
      } as any;
    },
  });

  try {
    await rendered.hook.handleImport([projectFile] as unknown as FileList);

    assert.equal(importerCallCount, 1);
    assert.equal(useAssetsStore.getState().availableFiles[0]?.name, 'robots/demo.urdf');
    assert.equal(useUIStore.getState().appMode, 'editor');
    assert.equal(projectImportSelections.length, 1);
    assert.equal(projectImportSelections[0]?.name, 'robots/demo.urdf');
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});
