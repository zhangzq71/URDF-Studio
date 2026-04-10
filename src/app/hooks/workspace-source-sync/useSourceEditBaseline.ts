import { useEffect, useMemo, useRef } from 'react';
import type { RobotFile } from '@/types';
import type { SourceSnapshotStatus } from './useSelectedSourceSnapshots';

interface UseSourceEditBaselineParams {
  shouldRenderAssembly: boolean;
  selectedFile: RobotFile | null;
  currentRobotSourceSnapshot: string;
  selectedFilePreviewSourceSnapshot: string | null;
  selectedXacroBaselineSourceSnapshot: string | null;
  selectedFilePreviewSourceSnapshotStatus: SourceSnapshotStatus;
  selectedXacroBaselineSourceSnapshotStatus: SourceSnapshotStatus;
}

export interface SourceEditBaselineState {
  hasSourceStoreEdits: boolean;
  isSelectedUrdfSource: boolean;
  isSelectedXacroSource: boolean;
  isSelectedSdfSource: boolean;
}

export function useSourceEditBaseline({
  shouldRenderAssembly,
  selectedFile,
  currentRobotSourceSnapshot,
  selectedFilePreviewSourceSnapshot,
  selectedXacroBaselineSourceSnapshot,
  selectedFilePreviewSourceSnapshotStatus,
  selectedXacroBaselineSourceSnapshotStatus,
}: UseSourceEditBaselineParams): SourceEditBaselineState {
  const sourceBaselineRef = useRef<{ fileName: string | null; snapshot: string | null }>({
    fileName: null,
    snapshot: null,
  });

  const isSelectedUrdfSource = selectedFile?.format === 'urdf';
  const isSelectedXacroSource = selectedFile?.format === 'xacro';
  const isSelectedSdfSource = selectedFile?.format === 'sdf';

  useEffect(() => {
    if (
      shouldRenderAssembly ||
      !selectedFile ||
      (!isSelectedUrdfSource && !isSelectedXacroSource && !isSelectedSdfSource)
    ) {
      sourceBaselineRef.current = { fileName: null, snapshot: null };
      return;
    }
  }, [
    isSelectedSdfSource,
    isSelectedUrdfSource,
    isSelectedXacroSource,
    selectedFile,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedUrdfSource) {
      return;
    }

    if (selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name &&
      sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    sourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isSelectedUrdfSource,
    selectedFile,
    selectedFilePreviewSourceSnapshot,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedXacroSource) {
      return;
    }

    if (selectedXacroBaselineSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name &&
      sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    sourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isSelectedXacroSource,
    selectedFile,
    selectedXacroBaselineSourceSnapshot,
    shouldRenderAssembly,
  ]);

  useEffect(() => {
    if (shouldRenderAssembly || !selectedFile || !isSelectedSdfSource) {
      return;
    }

    if (selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      sourceBaselineRef.current.fileName === selectedFile.name &&
      sourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    sourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isSelectedSdfSource,
    selectedFile,
    selectedFilePreviewSourceSnapshot,
    shouldRenderAssembly,
  ]);

  const hasSourceStoreEdits = useMemo(() => {
    if (
      shouldRenderAssembly ||
      !selectedFile ||
      (!isSelectedUrdfSource && !isSelectedXacroSource && !isSelectedSdfSource)
    ) {
      return false;
    }

    if (
      (isSelectedUrdfSource || isSelectedSdfSource) &&
      selectedFilePreviewSourceSnapshotStatus === 'failed'
    ) {
      return true;
    }

    if (isSelectedXacroSource && selectedXacroBaselineSourceSnapshotStatus === 'failed') {
      return true;
    }

    const baseline = sourceBaselineRef.current;
    if (!baseline.fileName || baseline.fileName !== selectedFile.name) {
      return false;
    }

    return baseline.snapshot !== currentRobotSourceSnapshot;
  }, [
    currentRobotSourceSnapshot,
    isSelectedSdfSource,
    isSelectedUrdfSource,
    isSelectedXacroSource,
    selectedFile,
    selectedFilePreviewSourceSnapshotStatus,
    selectedXacroBaselineSourceSnapshotStatus,
    shouldRenderAssembly,
  ]);

  return {
    hasSourceStoreEdits,
    isSelectedUrdfSource,
    isSelectedXacroSource,
    isSelectedSdfSource,
  };
}
