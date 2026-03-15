import { useCallback, useEffect } from 'react';
import type { DragEvent } from 'react';
import { getDroppedFiles } from '@/features/file-io';
import type { RobotState } from '@/types';
import { preloadSourceCodeEditor } from '@/app/utils/sourceCodeEditorLoader';
import { useActiveHistory } from './useActiveHistory';

interface LayoutSelection {
  type: 'link' | 'joint' | null;
  id: string | null;
}

interface UseAppLayoutEffectsParams {
  robot: Pick<RobotState, 'links' | 'joints'>;
  selection: LayoutSelection;
  clearSelection: () => void;
  onFileDrop: (files: File[]) => void;
  onDropError: () => void;
}

export function useAppLayoutEffects({
  robot,
  selection,
  clearSelection,
  onFileDrop,
  onDropError,
}: UseAppLayoutEffectsParams) {
  const { undo, redo, canUndo, canRedo } = useActiveHistory();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        if (canUndo) {
          undo();
          event.preventDefault();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && event.shiftKey) {
        if (canRedo) {
          redo();
          event.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedo, canUndo, redo, undo]);

  useEffect(() => {
    const warmup = () => {
      void preloadSourceCodeEditor();
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: typeof window.requestIdleCallback;
      cancelIdleCallback?: typeof window.cancelIdleCallback;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(warmup, { timeout: 1800 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(warmup, 800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selection.id || !selection.type) return;

    const exists = selection.type === 'link'
      ? robot.links[selection.id]
      : robot.joints[selection.id];

    if (!exists) {
      clearSelection();
    }
  }, [clearSelection, robot.joints, robot.links, selection]);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!event.dataTransfer.items) return;

    try {
      const files = await getDroppedFiles(event.dataTransfer.items);
      if (files.length > 0) {
        onFileDrop(files);
      }
    } catch (error) {
      console.error('Failed to process dropped files:', error);
      onDropError();
    }
  }, [onDropError, onFileDrop]);

  const prefetchSourceCodeEditor = useCallback(() => {
    void preloadSourceCodeEditor();
  }, []);

  return {
    handleDragOver,
    handleDrop,
    prefetchSourceCodeEditor,
  };
}
