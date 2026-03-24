import { useCallback, type RefObject } from 'react';
import { useSelectionStore, useUIStore } from '@/store';
import type { RobotState } from '@/types';
import {
  resolveDetailLinkTabAfterGeometrySelection,
  resolveDetailLinkTabAfterViewerMeshSelect,
} from '@/features/property-editor/utils/detailLinkTab';

interface UseViewerOrchestrationOptions {
  setSelection: (selection: RobotState['selection']) => void;
  pulseSelection: (selection: RobotState['selection'], durationMs?: number) => void;
  setHoveredSelection: (selection: RobotState['selection']) => void;
  focusOn: (id: string) => void;
  transformPendingRef: RefObject<boolean>;
}

export function useViewerOrchestration({
  setSelection,
  pulseSelection,
  setHoveredSelection,
  focusOn,
  transformPendingRef,
}: UseViewerOrchestrationOptions) {
  const preserveCollisionObjectIndex = useCallback((selection: RobotState['selection']) => {
    if (selection.type !== 'link' || selection.subType !== 'collision' || selection.objectIndex !== undefined) {
      return selection;
    }

    const currentSelection = useSelectionStore.getState().selection;
    if (
      currentSelection.type === 'link'
      && currentSelection.id === selection.id
      && currentSelection.subType === 'collision'
      && currentSelection.objectIndex !== undefined
    ) {
      return {
        ...selection,
        objectIndex: currentSelection.objectIndex,
      };
    }

    return selection;
  }, []);

  const handleSelect = useCallback((type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    setSelection(preserveCollisionObjectIndex({ type, id, subType }));
  }, [preserveCollisionObjectIndex, setSelection, transformPendingRef]);

  const handleSelectGeometry = useCallback((linkId: string, subType: 'visual' | 'collision', objectIndex = 0) => {
    if (transformPendingRef.current) return;
    setSelection({ type: 'link', id: linkId, subType, objectIndex });
    const uiState = useUIStore.getState();
    const nextTab = resolveDetailLinkTabAfterGeometrySelection(subType);
    if (uiState.detailLinkTab !== nextTab) {
      uiState.setDetailLinkTab(nextTab);
    }
  }, [setSelection, transformPendingRef]);

  const handleViewerSelect = useCallback((type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    const nextSelection = preserveCollisionObjectIndex({ type, id, subType } as const);
    setSelection(nextSelection);
    pulseSelection(nextSelection);
  }, [preserveCollisionObjectIndex, pulseSelection, setSelection, transformPendingRef]);

  const handleViewerMeshSelect = useCallback((linkId: string, _jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    const nextSelection = { type: 'link' as const, id: linkId, subType: objectType, objectIndex };
    setSelection(nextSelection);
    const uiState = useUIStore.getState();
    const nextTab = resolveDetailLinkTabAfterViewerMeshSelect(uiState.detailLinkTab, objectType);
    if (uiState.detailLinkTab !== nextTab) {
      uiState.setDetailLinkTab(nextTab);
    }
    pulseSelection(nextSelection);
  }, [pulseSelection, setSelection, transformPendingRef]);

  const handleTransformPendingChange = useCallback((pending: boolean) => {
    transformPendingRef.current = pending;
  }, [transformPendingRef]);

  const handleHover = useCallback((
    type: 'link' | 'joint' | null,
    id: string | null,
    subType?: 'visual' | 'collision',
    objectIndex?: number
  ) => {
    const current = useSelectionStore.getState().hoveredSelection;
    if (
      current.type === type
      && current.id === id
      && current.subType === subType
      && (current.objectIndex ?? 0) === (objectIndex ?? 0)
    ) {
      return;
    }

    setHoveredSelection({ type, id, subType, objectIndex });
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
