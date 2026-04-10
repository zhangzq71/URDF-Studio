import { startTransition, useCallback, useEffect, useRef } from 'react';
import { generateURDF } from '@/core/parsers';
import { type AssemblyState, type RobotFile, type RobotState } from '@/types';
import { createRobotSourceSnapshot } from '../workspaceSourceSyncUtils';

interface DeferredWorkspaceSourceSyncTask {
  cacheKey: string;
  fileName: string;
  sourceRobotState: RobotState;
}

interface UseDeferredWorkspaceSourceSyncParams {
  shouldRenderAssembly: boolean;
  assemblyState: AssemblyState | null;
  isCodeViewerOpen: boolean;
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  allFileContents: Record<string, string>;
  readCachedGeneratedSource: (cacheKey: string, buildSource: () => string) => string;
  syncTextFileContent: (fileName: string, content: string) => void;
  setSelectedFile: (file: RobotFile | null) => void;
  setAvailableFiles: (files: RobotFile[]) => void;
  setAllFileContents: (contents: Record<string, string>) => void;
}

export function useDeferredWorkspaceSourceSync({
  shouldRenderAssembly,
  assemblyState,
  isCodeViewerOpen,
  selectedFile,
  availableFiles,
  allFileContents,
  readCachedGeneratedSource,
  syncTextFileContent,
  setSelectedFile,
  setAvailableFiles,
  setAllFileContents,
}: UseDeferredWorkspaceSourceSyncParams): void {
  const deferredWorkspaceSourceSyncIdleRef = useRef<number | null>(null);
  const deferredWorkspaceSourceSyncTimeoutRef = useRef<number | null>(null);
  const deferredWorkspaceSourceSyncRequestRef = useRef(0);

  const cancelDeferredWorkspaceSourceSync = useCallback(() => {
    deferredWorkspaceSourceSyncRequestRef.current += 1;
    if (
      deferredWorkspaceSourceSyncIdleRef.current !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(deferredWorkspaceSourceSyncIdleRef.current);
    }
    if (deferredWorkspaceSourceSyncTimeoutRef.current !== null) {
      window.clearTimeout(deferredWorkspaceSourceSyncTimeoutRef.current);
    }
    deferredWorkspaceSourceSyncIdleRef.current = null;
    deferredWorkspaceSourceSyncTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (!shouldRenderAssembly || !assemblyState) {
      cancelDeferredWorkspaceSourceSync();
      return;
    }

    cancelDeferredWorkspaceSourceSync();
    const immediateSourceFileName =
      isCodeViewerOpen && selectedFile?.format === 'urdf' ? selectedFile.name : null;
    const deferredSourceSyncTasks: DeferredWorkspaceSourceSyncTask[] = [];

    Object.values(assemblyState.components).forEach((component) => {
      const sourceFile = availableFiles.find((file) => file.name === component.sourceFile);
      if (!sourceFile || sourceFile.format !== 'urdf') {
        return;
      }

      const sourceRobotState: RobotState = {
        ...component.robot,
        selection: { type: null, id: null },
      };
      const componentSnapshot = createRobotSourceSnapshot(sourceRobotState);
      const sourceSyncTask: DeferredWorkspaceSourceSyncTask = {
        fileName: sourceFile.name,
        cacheKey: `component-urdf:${sourceFile.name}:${componentSnapshot}`,
        sourceRobotState,
      };

      if (sourceFile.name === immediateSourceFileName) {
        syncTextFileContent(
          sourceFile.name,
          readCachedGeneratedSource(sourceSyncTask.cacheKey, () =>
            generateURDF(sourceRobotState, { includeHardware: 'auto' }),
          ),
        );
        return;
      }

      deferredSourceSyncTasks.push(sourceSyncTask);
    });

    if (deferredSourceSyncTasks.length === 0) {
      return;
    }

    const requestId = ++deferredWorkspaceSourceSyncRequestRef.current;
    const flushDeferredWorkspaceSourceSync = () => {
      deferredWorkspaceSourceSyncIdleRef.current = null;
      deferredWorkspaceSourceSyncTimeoutRef.current = null;

      if (deferredWorkspaceSourceSyncRequestRef.current !== requestId) {
        return;
      }

      const generatedComponentSources = new Map<string, string>();
      deferredSourceSyncTasks.forEach((task) => {
        generatedComponentSources.set(
          task.fileName,
          readCachedGeneratedSource(task.cacheKey, () =>
            generateURDF(task.sourceRobotState, { includeHardware: 'auto' }),
          ),
        );
      });

      if (deferredWorkspaceSourceSyncRequestRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        if (deferredWorkspaceSourceSyncRequestRef.current !== requestId) {
          return;
        }

        let nextAvailableFiles: RobotFile[] | null = null;
        let nextAllFileContents: Record<string, string> | null = null;
        let nextSelectedFile: RobotFile | null = null;

        for (const [fileName, content] of generatedComponentSources) {
          if (selectedFile?.name === fileName && selectedFile.content !== content) {
            nextSelectedFile = {
              ...selectedFile,
              content,
            };
          }

          if (availableFiles.some((file) => file.name === fileName && file.content !== content)) {
            const baseFiles = nextAvailableFiles ?? availableFiles;
            nextAvailableFiles = baseFiles.map((file) =>
              file.name === fileName ? { ...file, content } : file,
            );
          }

          if (allFileContents[fileName] !== content) {
            nextAllFileContents = {
              ...(nextAllFileContents ?? allFileContents),
              [fileName]: content,
            };
          }
        }

        if (nextSelectedFile) {
          setSelectedFile(nextSelectedFile);
        }

        if (nextAvailableFiles) {
          setAvailableFiles(nextAvailableFiles);
        }

        if (nextAllFileContents) {
          setAllFileContents(nextAllFileContents);
        }
      });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      deferredWorkspaceSourceSyncIdleRef.current = window.requestIdleCallback(
        flushDeferredWorkspaceSourceSync,
        { timeout: 250 },
      );
      return cancelDeferredWorkspaceSourceSync;
    }

    deferredWorkspaceSourceSyncTimeoutRef.current = window.setTimeout(
      flushDeferredWorkspaceSourceSync,
      16,
    );
    return cancelDeferredWorkspaceSourceSync;
  }, [
    allFileContents,
    assemblyState,
    availableFiles,
    cancelDeferredWorkspaceSourceSync,
    isCodeViewerOpen,
    readCachedGeneratedSource,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    shouldRenderAssembly,
    syncTextFileContent,
  ]);

  useEffect(
    () => () => {
      cancelDeferredWorkspaceSourceSync();
    },
    [cancelDeferredWorkspaceSourceSync],
  );
}
