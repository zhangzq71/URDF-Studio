import { create } from 'zustand';

export const ASSEMBLY_SELECTION_ID = '__assembly__';

export interface AssemblySelection {
  type: 'assembly' | 'component' | null;
  id: string | null;
}

interface AssemblySelectionState {
  selection: AssemblySelection;
  setSelection: (selection: AssemblySelection) => void;
  selectAssembly: () => void;
  selectComponent: (componentId: string) => void;
  clearSelection: () => void;
}

const EMPTY_ASSEMBLY_SELECTION: AssemblySelection = { type: null, id: null };

export const useAssemblySelectionStore = create<AssemblySelectionState>()((set) => ({
  selection: EMPTY_ASSEMBLY_SELECTION,
  setSelection: (selection) => set((state) => (
    state.selection.type === selection.type && state.selection.id === selection.id
      ? state
      : { selection }
  )),
  selectAssembly: () => set((state) => (
    state.selection.type === 'assembly' && state.selection.id === ASSEMBLY_SELECTION_ID
      ? state
      : { selection: { type: 'assembly', id: ASSEMBLY_SELECTION_ID } }
  )),
  selectComponent: (componentId) => set((state) => (
    state.selection.type === 'component' && state.selection.id === componentId
      ? state
      : { selection: { type: 'component', id: componentId } }
  )),
  clearSelection: () => set((state) => (
    state.selection.type === null && state.selection.id === null
      ? state
      : { selection: EMPTY_ASSEMBLY_SELECTION }
  )),
}));
