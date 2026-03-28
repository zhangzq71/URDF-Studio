import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { useFileImport } from './useFileImport.ts';
import { disposeRobotImportWorker } from './robotImportWorkerBridge.ts';
import { useAssemblyStore, useAssetsStore, useRobotStore, useUIStore } from '@/store';
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
    },
  };
}

function resetStoresToBaseline() {
  useUIStore.setState({
    lang: 'en',
    appMode: 'detail',
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

function renderHook() {
  let hookValue: ReturnType<typeof useFileImport> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);

  function Probe() {
    hookValue = useFileImport();
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

  class FakeRobotImportWorker {
    private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

    private readonly contextSnapshots = new Map<string, {
      availableFiles?: RobotFile[];
      assets?: Record<string, string>;
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

      if (message?.type !== 'resolve-robot-file') {
        return;
      }

      resolveRequestCount += 1;
      const context = message.contextId
        ? this.contextSnapshots.get(message.contextId)
        : undefined;
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
