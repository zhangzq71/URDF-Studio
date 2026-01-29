import { useState, useCallback } from 'react';
import * as THREE from 'three';

export interface CollisionRefsState {
  collisionRefs: Record<string, THREE.Group | null>;
  handleRegisterCollisionRef: (linkId: string, ref: THREE.Group | null) => void;
  selectedCollisionRef: THREE.Group | null;
}

/**
 * Custom hook to manage collision geometry references
 * Used for TransformControls to manipulate collision geometry in Detail mode
 */
export function useCollisionRefs(
  selectionType?: 'link' | 'joint',
  selectionId?: string,
  selectionSubType?: 'visual' | 'collision'
): CollisionRefsState {
  const [collisionRefs, setCollisionRefs] = useState<Record<string, THREE.Group | null>>({});

  const handleRegisterCollisionRef = useCallback((linkId: string, ref: THREE.Group | null) => {
    setCollisionRefs((prev) => ({ ...prev, [linkId]: ref }));
  }, []);

  const selectedCollisionRef =
    selectionType === 'link' && selectionId && selectionSubType === 'collision'
      ? collisionRefs[selectionId]
      : null;

  return {
    collisionRefs,
    handleRegisterCollisionRef,
    selectedCollisionRef,
  };
}
