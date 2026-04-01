import { useCallback, type RefObject } from 'react';
import { useSelectionStore, useUIStore } from '@/store';
import type { InteractionSelection, RobotState } from '@/types';
import type { ViewerHelperKind } from '@/features/urdf-viewer';
import { normalizeMergedAppMode } from '@/shared/utils/appMode';
import {
  resolveDetailLinkTabAfterGeometrySelection,
  resolveDetailLinkTabAfterViewerMeshSelect,
} from '@/features/property-editor/utils';

interface UseViewerOrchestrationOptions {
  setSelection: (selection: RobotState['selection']) => void;
  pulseSelection: (selection: RobotState['selection'], durationMs?: number) => void;
  setHoveredSelection: (selection: InteractionSelection) => void;
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
  const isInteractionAllowed = useCallback((selection: RobotState['selection']) => (
    useSelectionStore.getState().isInteractionAllowed(selection)
  ), []);

  const applyHelperSelectionUiState = useCallback((helperKind?: ViewerHelperKind) => {
    if (!helperKind) {
      return;
    }

    const uiState = useUIStore.getState();

    if (helperKind === 'center-of-mass' || helperKind === 'inertia') {
      if (uiState.detailLinkTab !== 'physics') {
        uiState.setDetailLinkTab('physics');
      }
      uiState.setPanelSection('property_editor_link_inertial', false);
      return;
    }

    if (helperKind === 'origin-axes' || helperKind === 'joint-axis') {
      uiState.setPanelSection('kinematics', false);
    }
  }, []);

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
    const nextSelection = preserveCollisionObjectIndex({ type, id, subType });
    if (!isInteractionAllowed(nextSelection)) {
      return;
    }

    setSelection(nextSelection);
  }, [isInteractionAllowed, preserveCollisionObjectIndex, setSelection, transformPendingRef]);

  const handleSelectGeometry = useCallback((linkId: string, subType: 'visual' | 'collision', objectIndex = 0) => {
    if (transformPendingRef.current) return;
    const nextSelection = { type: 'link' as const, id: linkId, subType, objectIndex };
    if (!isInteractionAllowed(nextSelection)) {
      return;
    }

    setSelection(nextSelection);
    const uiState = useUIStore.getState();
    const nextTab = resolveDetailLinkTabAfterGeometrySelection(subType);
    if (uiState.detailLinkTab !== nextTab) {
      uiState.setDetailLinkTab(nextTab);
    }
  }, [isInteractionAllowed, setSelection, transformPendingRef]);

  const handleViewerSelect = useCallback((
    type: 'link' | 'joint',
    id: string,
    subType?: 'visual' | 'collision',
    helperKind?: ViewerHelperKind
  ) => {
    if (transformPendingRef.current) return;
    const nextSelection = preserveCollisionObjectIndex({ type, id, subType } as const);
    if (!isInteractionAllowed(nextSelection)) {
      return;
    }

    setSelection(nextSelection);
    if (helperKind) {
      setHoveredSelection({ type: null, id: null });
      applyHelperSelectionUiState(helperKind);
    } else {
      setHoveredSelection(nextSelection);
    }
    pulseSelection(nextSelection);
  }, [
    applyHelperSelectionUiState,
    preserveCollisionObjectIndex,
    pulseSelection,
    isInteractionAllowed,
    setHoveredSelection,
    setSelection,
    transformPendingRef
  ]);

  const handleViewerMeshSelect = useCallback((linkId: string, _jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    const nextSelection = { type: 'link' as const, id: linkId, subType: objectType, objectIndex };
    if (!isInteractionAllowed(nextSelection)) {
      return;
    }

    setSelection(nextSelection);
    setHoveredSelection(nextSelection);
    const uiState = useUIStore.getState();
    const nextTab = resolveDetailLinkTabAfterViewerMeshSelect(
      normalizeMergedAppMode(uiState.appMode),
      uiState.detailLinkTab,
      objectType,
    );
    if (uiState.detailLinkTab !== nextTab) {
      uiState.setDetailLinkTab(nextTab);
    }
    pulseSelection(nextSelection);
  }, [isInteractionAllowed, pulseSelection, setHoveredSelection, setSelection, transformPendingRef]);

  const handleTransformPendingChange = useCallback((pending: boolean) => {
    transformPendingRef.current = pending;
  }, [transformPendingRef]);

  const handleHover = useCallback((
    type: 'link' | 'joint' | null,
    id: string | null,
    subType?: 'visual' | 'collision',
    objectIndex?: number,
    helperKind?: ViewerHelperKind,
  ) => {
    const current = useSelectionStore.getState().hoveredSelection;
    if (
      current.type === type
      && current.id === id
      && current.subType === subType
      && (current.objectIndex ?? 0) === (objectIndex ?? 0)
      && current.helperKind === helperKind
    ) {
      return;
    }

    const nextSelection = { type, id, subType, objectIndex, helperKind };
    if (!isInteractionAllowed(nextSelection)) {
      setHoveredSelection({ type: null, id: null });
      return;
    }

    setHoveredSelection(nextSelection);
  }, [isInteractionAllowed, setHoveredSelection]);

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
