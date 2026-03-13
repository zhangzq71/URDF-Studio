import { useMemo } from 'react';
import {
  useAssemblyCanRedo,
  useAssemblyCanUndo,
  useAssemblyStore,
  useCanRedo,
  useCanUndo,
  useRobotStore,
  useUIStore,
} from '@/store';
import { flushPendingHistory } from '../utils/pendingHistory';

export function useActiveHistory() {
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const hasAssembly = useAssemblyStore((state) => state.assemblyState !== null);

  const robotUndo = useRobotStore((state) => state.undo);
  const robotRedo = useRobotStore((state) => state.redo);
  const robotCanUndo = useCanUndo();
  const robotCanRedo = useCanRedo();

  const assemblyUndo = useAssemblyStore((state) => state.undo);
  const assemblyRedo = useAssemblyStore((state) => state.redo);
  const assemblyCanUndo = useAssemblyCanUndo();
  const assemblyCanRedo = useAssemblyCanRedo();

  const useAssemblyHistory = sidebarTab === 'workspace' && hasAssembly;

  return useMemo(
    () => ({
      undo: () => {
        flushPendingHistory();
        (useAssemblyHistory ? assemblyUndo : robotUndo)();
      },
      redo: () => {
        flushPendingHistory();
        (useAssemblyHistory ? assemblyRedo : robotRedo)();
      },
      canUndo: useAssemblyHistory ? assemblyCanUndo : robotCanUndo,
      canRedo: useAssemblyHistory ? assemblyCanRedo : robotCanRedo,
    }),
    [
      assemblyCanRedo,
      assemblyCanUndo,
      assemblyRedo,
      assemblyUndo,
      robotCanRedo,
      robotCanUndo,
      robotRedo,
      robotUndo,
      useAssemblyHistory,
    ]
  );
}
