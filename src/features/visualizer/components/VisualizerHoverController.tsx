import React from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSelectionStore } from '@/store/selectionStore';
import { findNearestVisualizerHoverTarget } from '../utils/hoverPicking';
import type { VisualizerInteractiveLayer } from '../utils/interactiveLayerPriority';
import {
  measureCanvasPointerPosition,
  normalizeCanvasPointerPosition,
  type CanvasPointerMeasurement,
} from '../utils/pointerNormalization';

interface VisualizerHoverControllerProps {
  robotRootRef: React.RefObject<THREE.Group | null>;
  interactionLayerPriority: readonly VisualizerInteractiveLayer[];
  active?: boolean;
}

export const VisualizerHoverController = React.memo(function VisualizerHoverController({
  robotRootRef,
  interactionLayerPriority,
  active = true,
}: VisualizerHoverControllerProps) {
  const { camera, gl, invalidate } = useThree();
  const setHoveredSelection = useSelectionStore((state) => state.setHoveredSelection);
  const clearHover = useSelectionStore((state) => state.clearHover);
  const raycasterRef = React.useRef(new THREE.Raycaster());
  const pointerRef = React.useRef(new THREE.Vector2());
  const frameRef = React.useRef<number | null>(null);
  const pendingPointerRef = React.useRef<CanvasPointerMeasurement | null>(null);
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

  const resolvePointerLocalPoint = React.useCallback((event: PointerEvent): CanvasPointerMeasurement => {
    return measureCanvasPointerPosition(
      event.clientX,
      event.clientY,
      gl.domElement.getBoundingClientRect(),
    );
  }, [gl.domElement]);

  const updateHoverFromLocalPoint = React.useCallback((pointerMeasurement: CanvasPointerMeasurement) => {
    const root = robotRootRef.current;
    if (!root) {
      commitClearedHover();
      return;
    }

    if (!pointerMeasurement.inside) {
      commitClearedHover();
      return;
    }

    const normalizedPointer = normalizeCanvasPointerPosition(pointerMeasurement);
    if (!normalizedPointer) {
      commitClearedHover();
      return;
    }

    pointerRef.current.set(normalizedPointer.x, normalizedPointer.y);

    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const nextTarget = findNearestVisualizerHoverTarget(root, raycasterRef.current, {
      interactionLayerPriority,
    });

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
  }, [camera, commitClearedHover, gl.domElement, interactionLayerPriority, invalidate, robotRootRef, setHoveredSelection]);

  const scheduleHoverUpdate = React.useCallback((pointerMeasurement: CanvasPointerMeasurement) => {
    pendingPointerRef.current = pointerMeasurement;
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

      updateHoverFromLocalPoint(nextPoint);
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
        clearScheduledHoverUpdate();
        pendingPointerRef.current = null;
        commitClearedHover();
        return;
      }
      const point = resolvePointerLocalPoint(event);
      if (!point.inside) {
        clearScheduledHoverUpdate();
        pendingPointerRef.current = null;
        commitClearedHover();
        return;
      }

      scheduleHoverUpdate(point);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const point = resolvePointerLocalPoint(event);
      if (!point.inside) {
        clearScheduledHoverUpdate();
        pendingPointerRef.current = null;
        commitClearedHover();
        return;
      }

      scheduleHoverUpdate(point);
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
  }, [active, clearScheduledHoverUpdate, commitClearedHover, gl.domElement, resolvePointerLocalPoint, scheduleHoverUpdate]);

  return null;
});
