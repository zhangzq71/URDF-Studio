import { useEffect, useMemo, useRef } from 'react';
import type { RobotFile } from '@/types';

interface UseMjcfViewerEditStateParams {
  selectedFile: RobotFile | null;
  resolvedMjcfContent: string | null;
  generatedMjcfContent: string | null;
  selectedFilePreviewSourceSnapshot: string | null;
  currentRobotSourceSnapshot: string;
}

export function useMjcfViewerEditState({
  selectedFile,
  resolvedMjcfContent,
  generatedMjcfContent,
  selectedFilePreviewSourceSnapshot,
  currentRobotSourceSnapshot,
}: UseMjcfViewerEditStateParams): boolean {
  const mjcfViewerBaselineKeyRef = useRef<string | null>(null);
  const mjcfViewerBaselineContentRef = useRef<string | null>(null);

  const mjcfViewerBaselineKey = useMemo(
    () =>
      selectedFile?.format === 'mjcf'
        ? `${selectedFile.name}\u0000${resolvedMjcfContent ?? selectedFile.content}`
        : null,
    [resolvedMjcfContent, selectedFile],
  );

  useEffect(() => {
    if (!mjcfViewerBaselineKey) {
      mjcfViewerBaselineKeyRef.current = null;
      mjcfViewerBaselineContentRef.current = null;
      return;
    }

    if (mjcfViewerBaselineKeyRef.current !== mjcfViewerBaselineKey) {
      mjcfViewerBaselineKeyRef.current = mjcfViewerBaselineKey;
      mjcfViewerBaselineContentRef.current = null;
    }

    if (
      !generatedMjcfContent ||
      selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot ||
      mjcfViewerBaselineContentRef.current !== null
    ) {
      return;
    }

    mjcfViewerBaselineContentRef.current = generatedMjcfContent;
  }, [
    currentRobotSourceSnapshot,
    generatedMjcfContent,
    mjcfViewerBaselineKey,
    selectedFilePreviewSourceSnapshot,
  ]);

  return useMemo(() => {
    if (!mjcfViewerBaselineKey || !generatedMjcfContent) {
      return false;
    }

    if (mjcfViewerBaselineKeyRef.current !== mjcfViewerBaselineKey) {
      return false;
    }

    if (mjcfViewerBaselineContentRef.current === null) {
      return false;
    }

    return mjcfViewerBaselineContentRef.current !== generatedMjcfContent;
  }, [generatedMjcfContent, mjcfViewerBaselineKey]);
}
