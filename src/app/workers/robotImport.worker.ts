/// <reference lib="webworker" />

import { resolveRobotFileData } from '@/core/parsers/importRobotFile';
import { prepareAssemblyRobotData } from '@/core/robot/assemblyComponentPreparation';
import { parseEditableRobotSource } from '@/app/utils/parseEditableRobotSource';
import type {
  PrepareAssemblyComponentWorkerResponse,
  RobotImportWorkerContextSnapshot,
  ResolveRobotImportWorkerResponse,
  ParseEditableRobotSourceWorkerResponse,
  RobotImportWorkerRequest,
} from '@/app/utils/robotImportWorker';
import { ensureWorkerXmlDomApis } from './ensureWorkerXmlDomApis';

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
const workerContextSnapshots = new Map<string, RobotImportWorkerContextSnapshot>();
const workerContextOrder: string[] = [];
const WORKER_CONTEXT_CACHE_LIMIT = 24;

ensureWorkerXmlDomApis(workerScope as typeof globalThis);

function syncWorkerContextSnapshot(
  contextId: string,
  context: RobotImportWorkerContextSnapshot,
): void {
  if (!contextId) {
    return;
  }

  workerContextSnapshots.set(contextId, context);
  const existingIndex = workerContextOrder.indexOf(contextId);
  if (existingIndex >= 0) {
    workerContextOrder.splice(existingIndex, 1);
  }
  workerContextOrder.push(contextId);

  while (workerContextOrder.length > WORKER_CONTEXT_CACHE_LIMIT) {
    const oldestContextId = workerContextOrder.shift();
    if (oldestContextId) {
      workerContextSnapshots.delete(oldestContextId);
    }
  }
}

function applyWorkerContextSnapshot<T extends Record<string, unknown>>(
  options: T,
  contextId?: string,
): T {
  if (!contextId) {
    return options;
  }

  const context = workerContextSnapshots.get(contextId);
  if (!context) {
    return options;
  }

  return {
    ...context,
    ...options,
    availableFiles: options.availableFiles ?? context.availableFiles,
    assets: options.assets ?? context.assets,
    allFileContents: options.allFileContents ?? context.allFileContents,
  } as T;
}

workerScope.addEventListener('message', (event: MessageEvent<RobotImportWorkerRequest>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  try {
    if (message.type === 'sync-context') {
      syncWorkerContextSnapshot(message.contextId, message.context);
      return;
    }

    if (message.type === 'resolve-robot-file') {
      const result = resolveRobotFileData(
        message.file,
        applyWorkerContextSnapshot(message.options, message.contextId),
      );
      const response: ResolveRobotImportWorkerResponse = {
        type: 'resolve-robot-file-result',
        requestId: message.requestId,
        result,
      };
      workerScope.postMessage(response);
      return;
    }

    if (message.type === 'prepare-assembly-component') {
      const resolvedImportResult = resolveRobotFileData(
        message.file,
        applyWorkerContextSnapshot(message.options, message.contextId),
      );

      if (resolvedImportResult.status !== 'ready') {
        const response: PrepareAssemblyComponentWorkerResponse = {
          type: 'prepare-assembly-component-error',
          requestId: message.requestId,
          error: `Failed to prepare assembly component from "${message.file.name}".`,
        };
        workerScope.postMessage(response);
        return;
      }

      const response: PrepareAssemblyComponentWorkerResponse = {
        type: 'prepare-assembly-component-result',
        requestId: message.requestId,
        result: {
          componentId: message.componentId,
          displayName: message.rootName,
          robotData: prepareAssemblyRobotData(resolvedImportResult.robotData, {
            componentId: message.componentId,
            rootName: message.rootName,
            sourceFilePath: message.file.name,
            sourceFormat: message.file.format,
          }),
          resolvedUrdfContent: resolvedImportResult.resolvedUrdfContent,
          resolvedUrdfSourceFilePath: resolvedImportResult.resolvedUrdfSourceFilePath,
        },
      };
      workerScope.postMessage(response);
      return;
    }

    if (message.type === 'parse-editable-robot-source') {
      const result = parseEditableRobotSource(
        applyWorkerContextSnapshot(message.options, message.contextId),
      );
      const response: ParseEditableRobotSourceWorkerResponse = {
        type: 'parse-editable-robot-source-result',
        requestId: message.requestId,
        result,
      };
      workerScope.postMessage(response);
    }
  } catch (error) {
    if (message.type === 'sync-context') {
      return;
    }

    const response: ResolveRobotImportWorkerResponse | ParseEditableRobotSourceWorkerResponse | PrepareAssemblyComponentWorkerResponse =
      message.type === 'parse-editable-robot-source'
        ? {
          type: 'parse-editable-robot-source-error',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : 'Editable source parse worker failed',
        }
        : message.type === 'prepare-assembly-component'
          ? {
            type: 'prepare-assembly-component-error',
            requestId: message.requestId,
            error: error instanceof Error ? error.message : 'Assembly component worker failed',
          }
        : {
          type: 'resolve-robot-file-error',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : 'Robot import worker failed',
        };
    workerScope.postMessage(response);
  }
});

export {};
