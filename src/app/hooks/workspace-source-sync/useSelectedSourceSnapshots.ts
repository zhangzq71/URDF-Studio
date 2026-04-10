import { useEffect, useRef, useState } from 'react';
import { scheduleFailFastInDev } from '@/core/utils/runtimeDiagnostics';
import type { RobotData, RobotFile } from '@/types';
import { resolveRobotFileDataWithWorker } from '../robotImportWorkerBridge';
import {
  createPreviewRobotStateFromImportResult,
  createRobotSourceSnapshot,
  createRobotSourceSnapshotFromUrdfContent,
} from '../workspaceSourceSyncUtils';

export type SourceSnapshotStatus = 'idle' | 'pending' | 'ready' | 'failed';

interface UseSelectedSourceSnapshotsParams {
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  assets: Record<string, string>;
  allFileContents: Record<string, string>;
  shouldRenderAssembly: boolean;
  originalUrdfContent: string | null;
  selectedXacroResolvedSourceFilePath: string | null;
  getUsdPreparedExportCache: (path: string) => { robotData?: RobotData } | null;
}

export interface SelectedSourceSnapshotsState {
  selectedFilePreviewSourceSnapshot: string | null;
  selectedXacroBaselineSourceSnapshot: string | null;
  selectedFilePreviewSourceSnapshotStatus: SourceSnapshotStatus;
  selectedXacroBaselineSourceSnapshotStatus: SourceSnapshotStatus;
}

export function useSelectedSourceSnapshots({
  selectedFile,
  availableFiles,
  assets,
  allFileContents,
  shouldRenderAssembly,
  originalUrdfContent,
  selectedXacroResolvedSourceFilePath,
  getUsdPreparedExportCache,
}: UseSelectedSourceSnapshotsParams): SelectedSourceSnapshotsState {
  const [selectedFilePreviewSourceSnapshot, setSelectedFilePreviewSourceSnapshot] = useState<
    string | null
  >(null);
  const [selectedFilePreviewSourceSnapshotStatus, setSelectedFilePreviewSourceSnapshotStatus] =
    useState<SourceSnapshotStatus>('idle');
  const [selectedXacroBaselineSourceSnapshot, setSelectedXacroBaselineSourceSnapshot] = useState<
    string | null
  >(null);
  const [selectedXacroBaselineSourceSnapshotStatus, setSelectedXacroBaselineSourceSnapshotStatus] =
    useState<SourceSnapshotStatus>('idle');
  const selectedFilePreviewRequestRef = useRef(0);
  const selectedXacroBaselineRequestRef = useRef(0);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || selectedFile.format === 'xacro') {
      setSelectedFilePreviewSourceSnapshot(null);
      setSelectedFilePreviewSourceSnapshotStatus('idle');
      return;
    }

    const requestId = ++selectedFilePreviewRequestRef.current;
    setSelectedFilePreviewSourceSnapshot(null);
    setSelectedFilePreviewSourceSnapshotStatus('pending');

    void resolveRobotFileDataWithWorker(selectedFile, {
      availableFiles,
      assets,
      allFileContents,
      usdRobotData: getUsdPreparedExportCache(selectedFile.name)?.robotData ?? null,
    })
      .then((result) => {
        if (requestId !== selectedFilePreviewRequestRef.current) {
          return;
        }

        const previewRobotState = createPreviewRobotStateFromImportResult(selectedFile, result);
        if (!previewRobotState) {
          setSelectedFilePreviewSourceSnapshot(null);
          setSelectedFilePreviewSourceSnapshotStatus('failed');
          scheduleFailFastInDev(
            'useSelectedSourceSnapshots:selectedFilePreviewSourceSnapshot',
            new Error(
              `Failed to build preview snapshot for "${selectedFile.name}": import result status was "${result.status}".`,
            ),
          );
          return;
        }

        setSelectedFilePreviewSourceSnapshot(createRobotSourceSnapshot(previewRobotState));
        setSelectedFilePreviewSourceSnapshotStatus('ready');
      })
      .catch((error) => {
        if (requestId !== selectedFilePreviewRequestRef.current) {
          return;
        }

        setSelectedFilePreviewSourceSnapshot(null);
        setSelectedFilePreviewSourceSnapshotStatus('failed');
        scheduleFailFastInDev(
          'useSelectedSourceSnapshots:selectedFilePreviewSourceSnapshot',
          new Error(`Failed to build preview snapshot for "${selectedFile.name}".`, {
            cause: error,
          }),
        );
      });
  }, [
    allFileContents,
    assets,
    availableFiles,
    getUsdPreparedExportCache,
    selectedFile,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || selectedFile?.format !== 'xacro' || !originalUrdfContent) {
      setSelectedXacroBaselineSourceSnapshot(null);
      setSelectedXacroBaselineSourceSnapshotStatus('idle');
      return;
    }

    const requestId = ++selectedXacroBaselineRequestRef.current;
    const sourcePath = selectedXacroResolvedSourceFilePath ?? selectedFile.name;
    setSelectedXacroBaselineSourceSnapshot(null);
    setSelectedXacroBaselineSourceSnapshotStatus('pending');

    void createRobotSourceSnapshotFromUrdfContent(originalUrdfContent, {
      sourcePath,
    })
      .then((snapshot) => {
        if (requestId !== selectedXacroBaselineRequestRef.current) {
          return;
        }

        setSelectedXacroBaselineSourceSnapshot(snapshot);
        setSelectedXacroBaselineSourceSnapshotStatus('ready');
      })
      .catch((error) => {
        if (requestId !== selectedXacroBaselineRequestRef.current) {
          return;
        }

        setSelectedXacroBaselineSourceSnapshot(null);
        setSelectedXacroBaselineSourceSnapshotStatus('failed');
        scheduleFailFastInDev(
          'useSelectedSourceSnapshots:selectedXacroBaselineSourceSnapshot',
          new Error(`Failed to build Xacro baseline snapshot for "${selectedFile.name}".`, {
            cause: error,
          }),
        );
      });
  }, [
    originalUrdfContent,
    selectedFile,
    selectedXacroResolvedSourceFilePath,
    shouldRenderAssembly,
  ]);

  return {
    selectedFilePreviewSourceSnapshot,
    selectedXacroBaselineSourceSnapshot,
    selectedFilePreviewSourceSnapshotStatus,
    selectedXacroBaselineSourceSnapshotStatus,
  };
}
