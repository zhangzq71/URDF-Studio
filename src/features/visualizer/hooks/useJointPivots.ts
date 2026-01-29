import { useState, useCallback } from 'react';
import * as THREE from 'three';

export interface JointPivotsState {
  jointPivots: Record<string, THREE.Group | null>;
  handleRegisterJointPivot: (jointId: string, pivot: THREE.Group | null) => void;
  selectedJointPivot: THREE.Group | null;
}

/**
 * Custom hook to manage joint pivot references
 * Used for TransformControls to manipulate joint positions
 */
export function useJointPivots(
  selectionType?: 'link' | 'joint',
  selectionId?: string
): JointPivotsState {
  const [jointPivots, setJointPivots] = useState<Record<string, THREE.Group | null>>({});

  // Memoized callback to avoid triggering re-renders when value hasn't changed
  const handleRegisterJointPivot = useCallback((jointId: string, pivot: THREE.Group | null) => {
    setJointPivots((prev) => {
      if (prev[jointId] === pivot) return prev; // No change, return same object
      return { ...prev, [jointId]: pivot };
    });
  }, []);

  const selectedJointPivot =
    selectionType === 'joint' && selectionId ? jointPivots[selectionId] : null;

  return {
    jointPivots,
    handleRegisterJointPivot,
    selectedJointPivot,
  };
}
