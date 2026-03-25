/**
 * Selection Store - Manages selection state for robot elements
 * Handles link/joint selection and hover state for synchronized highlighting
 */
import { create } from 'zustand';

// Selection type matching RobotState['selection']
export interface Selection {
  type: 'link' | 'joint' | null;
  id: string | null;
  subType?: 'visual' | 'collision';
  objectIndex?: number;
}

interface SelectionState {
  // Current selection
  selection: Selection;
  setSelection: (selection: Selection) => void;
  selectLink: (id: string, subType?: 'visual' | 'collision', objectIndex?: number) => void;
  selectJoint: (id: string) => void;
  clearSelection: () => void;

  // Hover state for synchronized highlighting across components
  hoveredSelection: Selection;
  deferredHoveredSelection: Selection;
  hoverFrozen: boolean;
  setHoverFrozen: (frozen: boolean) => void;
  setHoveredSelection: (selection: Selection) => void;
  hoverLink: (id: string) => void;
  hoverJoint: (id: string) => void;
  clearHover: () => void;

  // Transient emphasis for auto-jumped tree rows
  attentionSelection: Selection;
  setAttentionSelection: (selection: Selection) => void;
  pulseSelection: (selection: Selection, durationMs?: number) => void;
  clearAttentionSelection: () => void;

  // Focus target for camera focusing
  focusTarget: string | null;
  setFocusTarget: (id: string | null) => void;
  focusOn: (id: string) => void;
}

const emptySelection: Selection = { type: null, id: null };

export function matchesSelection(
  selection: Selection,
  target: Selection,
  options: {
    ignoreSubType?: boolean;
    ignoreObjectIndex?: boolean;
  } = {}
): boolean {
  if (selection.type !== target.type || selection.id !== target.id) {
    return false;
  }

  if (!options.ignoreSubType && selection.subType !== target.subType) {
    return false;
  }

  if (!options.ignoreObjectIndex && (selection.objectIndex ?? 0) !== (target.objectIndex ?? 0)) {
    return false;
  }

  return true;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  // Current selection
  selection: emptySelection,
  setSelection: (selection) => set({ selection }),
  selectLink: (id, subType, objectIndex) => set({ selection: { type: 'link', id, subType, objectIndex } }),
  selectJoint: (id) => set({ selection: { type: 'joint', id } }),
  clearSelection: () => set({ selection: emptySelection }),

  // Hover state
  hoveredSelection: emptySelection,
  deferredHoveredSelection: emptySelection,
  hoverFrozen: false,
  setHoverFrozen: (frozen) => set((state) => {
    if (state.hoverFrozen === frozen) {
      if (
        !frozen
        || (
          matchesSelection(state.hoveredSelection, emptySelection)
          && matchesSelection(state.deferredHoveredSelection, state.hoveredSelection)
        )
      ) {
        return state;
      }
    }

    return frozen
      ? {
          hoverFrozen: true,
          hoveredSelection: emptySelection,
          deferredHoveredSelection: state.hoveredSelection,
        }
      : {
          hoverFrozen: false,
          hoveredSelection: state.deferredHoveredSelection,
          deferredHoveredSelection: emptySelection,
        };
  }),
  setHoveredSelection: (selection) => set((state) => (
    state.hoverFrozen
      ? matchesSelection(state.deferredHoveredSelection, selection)
        ? state
        : { deferredHoveredSelection: selection }
      : matchesSelection(state.hoveredSelection, selection)
      ? state
      : { hoveredSelection: selection }
  )),
  hoverLink: (id) => set((state) => (
    state.hoverFrozen
      ? matchesSelection(state.deferredHoveredSelection, { type: 'link', id })
        ? state
        : { deferredHoveredSelection: { type: 'link', id } }
      : matchesSelection(state.hoveredSelection, { type: 'link', id })
      ? state
      : { hoveredSelection: { type: 'link', id } }
  )),
  hoverJoint: (id) => set((state) => (
    state.hoverFrozen
      ? matchesSelection(state.deferredHoveredSelection, { type: 'joint', id })
        ? state
        : { deferredHoveredSelection: { type: 'joint', id } }
      : matchesSelection(state.hoveredSelection, { type: 'joint', id })
      ? state
      : { hoveredSelection: { type: 'joint', id } }
  )),
  clearHover: () => set((state) => (
    state.hoverFrozen
      ? matchesSelection(state.deferredHoveredSelection, emptySelection)
        ? state
        : { deferredHoveredSelection: emptySelection }
      : matchesSelection(state.hoveredSelection, emptySelection)
        ? state
        : { hoveredSelection: emptySelection }
  )),

  // Transient emphasis
  attentionSelection: emptySelection,
  setAttentionSelection: (selection) => set({ attentionSelection: selection }),
  pulseSelection: (() => {
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    return (selection: Selection, durationMs = 2600) => {
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);

      if (!selection.type || !selection.id) {
        pendingTimeout = null;
        set({ attentionSelection: emptySelection });
        return;
      }

      set({ attentionSelection: selection });
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        set({ attentionSelection: emptySelection });
      }, durationMs);
    };
  })(),
  clearAttentionSelection: () => set({ attentionSelection: emptySelection }),

  // Focus target
  focusTarget: null,
  setFocusTarget: (id) => set({ focusTarget: id }),
  focusOn: (() => {
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    return (id: string) => {
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      set({ focusTarget: id });
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        set({ focusTarget: null });
      }, 100);
    };
  })(),
}));

// Helper to check if selection exists in data
export function validateSelection(
  selection: Selection,
  links: Record<string, unknown>,
  joints: Record<string, unknown>
): boolean {
  if (!selection.id || !selection.type) return true; // Empty selection is valid

  if (selection.type === 'link') {
    return !!links[selection.id];
  }
  if (selection.type === 'joint') {
    return !!joints[selection.id];
  }
  return false;
}
