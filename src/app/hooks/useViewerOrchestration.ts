import { useCallback, type MutableRefObject } from 'react';
import { useSelectionStore } from '@/store';
import type { RobotState } from '@/types';

interface UseViewerOrchestrationOptions {
  setSelection: (selection: RobotState['selection']) => void;
  pulseSelection: (selection: RobotState['selection'], durationMs?: number) => void;
  setHoveredSelection: (selection: RobotState['selection']) => void;
  focusOn: (id: string) => void;
  transformPendingRef: MutableRefObject<boolean>;
}

export function useViewerOrchestration({
  setSelection,
  pulseSelection,
  setHoveredSelection,
  focusOn,
  transformPendingRef,
}: UseViewerOrchestrationOptions) {
  const handleSelect = useCallback((type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    setSelection({ type, id, subType });
  }, [setSelection, transformPendingRef]);

  const handleSelectGeometry = useCallback((linkId: string, subType: 'visual' | 'collision', objectIndex = 0) => {
    if (transformPendingRef.current) return;
    setSelection({ type: 'link', id: linkId, subType, objectIndex });
  }, [setSelection, transformPendingRef]);

  const handleViewerSelect = useCallback((type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    const nextSelection = { type, id, subType } as const;
    setSelection(nextSelection);
    pulseSelection(nextSelection);
  }, [pulseSelection, setSelection, transformPendingRef]);

  const handleViewerMeshSelect = useCallback((linkId: string, _jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    const nextSelection = { type: 'link' as const, id: linkId, subType: objectType, objectIndex };
    setSelection(nextSelection);
    pulseSelection(nextSelection);
  }, [pulseSelection, setSelection, transformPendingRef]);

  const handleTransformPendingChange = useCallback((pending: boolean) => {
    transformPendingRef.current = pending;
  }, [transformPendingRef]);

  const handleHover = useCallback((type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => {
    const current = useSelectionStore.getState().hoveredSelection;
    if (current.type === type && current.id === id && current.subType === subType) {
      return;
    }

    setHoveredSelection({ type, id, subType });
  }, [setHoveredSelection]);

  const handleFocus = useCallback((id: string) => {
    focusOn(id);
  }, [focusOn]);

  return {
    handleSelect,
    handleSelectGeometry,
    handleViewerSelect,
    handleViewerMeshSelect,
    handleTransformPendingChange,
    handleHover,
    handleFocus,
  };
}
