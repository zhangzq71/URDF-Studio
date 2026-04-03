import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { useFileImport } from './useFileImport.ts';
import { disposeRobotImportWorker } from './robotImportWorkerBridge.ts';
import { useAssemblyStore, useAssetsStore, useRobotStore, useUIStore } from '@/store';
import { translations } from '@/shared/i18n';
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

function installRobotImportWorkerMock() {
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
          const robotFiles = (
            await Promise.all(
              descriptors.map(async (descriptor: { file?: File; relativePath?: string }) => {
                const file = descriptor.file;
                if (!(file instanceof File)) {
                  return null;
                }

                const name = descriptor.relativePath || file.webkitRelativePath || file.name;
                if (!name.toLowerCase().endsWith('.urdf')) {
                  return null;
                }

                return {
                  name,
                  format: 'urdf' as const,
                  content: await file.text(),
                };
              }),
            )
          ).filter(Boolean);

          this.listeners.get('message')?.forEach((handler) => {
            handler({
              data: {
                type: 'prepare-import-result',
                requestId: message.requestId,
                payload: {
                  robotFiles,
                  assetFiles: [],
                  usdSourceFiles: [],
                  libraryFiles: [],
                  textFiles: [],
                  preferredFileName: robotFiles[0]?.name ?? null,
                  preResolvedImports: [],
                },
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
      const options = {
        ...context,
        ...message.options,
        availableFiles: message.options?.availableFiles ?? context?.availableFiles,
        assets: message.options?.assets ?? context?.assets,
        allFileContents: message.options?.allFileContents ?? context?.allFileContents,
      };

      queueMicrotask(() => {
        const result = resolveRobotFileData(message.file, options);
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
        progress: 0.34,
        statusLabel: '1/2',
        stageLabel: translations.en.importPreparationLoadingTitle,
      },
      {
        label: translations.en.importPreparationLoadingTitle,
        detail: translations.en.loadingRobotPreparing,
        progress: 0.72,
        statusLabel: '2/2',
        stageLabel: translations.en.loadingRobotPreparing,
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

test('useFileImport keeps editor mode when importing a project archive', async () => {
  resetStoresToBaseline();
  useUIStore.setState({ appMode: 'editor' });
  const domEnvironment = installDomEnvironment();
  const workerMock = installRobotImportWorkerMock();
  let importerCallCount = 0;

  const projectFile = new File(['unused'], 'project.usp', { type: 'application/octet-stream' });

  const rendered = renderHook({
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
        motorLibrary: {},
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
  } finally {
    rendered.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    workerMock.restore();
    domEnvironment.restore();
    resetStoresToBaseline();
  }
});
