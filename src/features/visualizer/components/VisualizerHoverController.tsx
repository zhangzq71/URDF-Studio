import React from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSelectionStore } from '@/store/selectionStore';
import { findNearestVisualizerHoverTarget } from '../utils/hoverPicking';

interface VisualizerHoverControllerProps {
  robotRootRef: React.RefObject<THREE.Group | null>;
  active?: boolean;
}

export const VisualizerHoverController = React.memo(function VisualizerHoverController({
  robotRootRef,
  active = true,
}: VisualizerHoverControllerProps) {
  const { camera, gl, invalidate } = useThree();
  const setHoveredSelection = useSelectionStore((state) => state.setHoveredSelection);
  const clearHover = useSelectionStore((state) => state.clearHover);
  const raycasterRef = React.useRef(new THREE.Raycaster());
  const pointerRef = React.useRef(new THREE.Vector2());
  const frameRef = React.useRef<number | null>(null);
  const pendingPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const lastHoverKeyRef = React.useRef<string | null>(null);

  const clearScheduledHoverUpdate = React.useCallback(() => {
    if (frameRef.current === null) {
      return;
    }

    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const commitClearedHover = React.useCallback(() => {
    if (lastHoverKeyRef.current === null) {
      return;
    }

    lastHoverKeyRef.current = null;
    clearHover();
    invalidate();
  }, [clearHover, invalidate]);

  const updateHoverFromLocalPoint = React.useCallback((localX: number, localY: number) => {
    const root = robotRootRef.current;
    if (!root) {
      commitClearedHover();
      return;
    }

    const width = gl.domElement.clientWidth;
    const height = gl.domElement.clientHeight;
    if (width <= 0 || height <= 0) {
      commitClearedHover();
      return;
    }

    pointerRef.current.set(
      (localX / width) * 2 - 1,
      -(localY / height) * 2 + 1,
    );

    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const nextTarget = findNearestVisualizerHoverTarget(root, raycasterRef.current);

    if (nextTarget) {
      const nextHoverKey = `${nextTarget.type}:${nextTarget.id}:${nextTarget.subType}:${nextTarget.objectIndex}`;
      if (lastHoverKeyRef.current === nextHoverKey) {
        return;
      }

      lastHoverKeyRef.current = nextHoverKey;
      setHoveredSelection(nextTarget);
      invalidate();
      return;
    }

    commitClearedHover();
  }, [camera, commitClearedHover, gl.domElement, invalidate, robotRootRef, setHoveredSelection]);

  const scheduleHoverUpdate = React.useCallback((localX: number, localY: number) => {
    pendingPointerRef.current = { x: localX, y: localY };
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const nextPoint = pendingPointerRef.current;
      pendingPointerRef.current = null;
      if (!nextPoint) {
        return;
      }

      updateHoverFromLocalPoint(nextPoint.x, nextPoint.y);
    });
  }, [updateHoverFromLocalPoint]);

  React.useEffect(() => {
    if (!active) {
      clearScheduledHoverUpdate();
      pendingPointerRef.current = null;
      commitClearedHover();
      return;
    }

    const domElement = gl.domElement;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) {
        return;
      }

      scheduleHoverUpdate(event.offsetX, event.offsetY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      scheduleHoverUpdate(event.offsetX, event.offsetY);
    };

    const handlePointerLeave = () => {
      clearScheduledHoverUpdate();
      pendingPointerRef.current = null;
      commitClearedHover();
    };

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('pointerleave', handlePointerLeave);
    domElement.addEventListener('pointercancel', handlePointerLeave);

    return () => {
      clearScheduledHoverUpdate();
      pendingPointerRef.current = null;
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('pointerleave', handlePointerLeave);
      domElement.removeEventListener('pointercancel', handlePointerLeave);
    };
  }, [active, clearScheduledHoverUpdate, commitClearedHover, gl.domElement, scheduleHoverUpdate]);

  return null;
});
