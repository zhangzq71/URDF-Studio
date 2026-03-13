import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import { resolveLinkKey } from '@/core/robot';
import type { CollisionTransformControlsProps } from '../types';
import { getObjectRPY } from '../utils/collisionTransformMath';

const COLLISION_TRANSLATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE;
const COLLISION_ROTATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE * 0.84;
const COLLISION_GIZMO_THICKNESS_SCALE = 1.9;

export const CollisionTransformControls: React.FC<CollisionTransformControlsProps> = ({
  robot,
  robotVersion,
  selection,
  transformMode,
  transformReferenceFrame = 'urdf',
  setIsDragging,
  onTransformChange,
  onTransformEnd,
  robotLinks,
  onTransformPending,
}) => {
  const transformRef = useRef<any>(null);
  const rotateTransformRef = useRef<any>(null);
  const { invalidate } = useThree();
  const [targetObject, setTargetObject] = useState<THREE.Object3D | null>(null);

  const originalPositionRef = useRef(new THREE.Vector3());
  const originalRotationRef = useRef(new THREE.Euler());
  const originalQuaternionRef = useRef(new THREE.Quaternion());
  const targetObjectRef = useRef<THREE.Object3D | null>(null);
  const activeSelectionRef = useRef<{ id: string; objectIndex?: number } | null>(null);
  const setIsDraggingRef = useRef(setIsDragging);
  const onTransformChangeRef = useRef(onTransformChange);
  const onTransformEndRef = useRef(onTransformEnd);
  const onTransformPendingRef = useRef(onTransformPending);
  const cancelDragRef = useRef<(() => void) | null>(null);

  const isDraggingRef = useRef(false);
  const activeControlsRef = useRef<any>(null);

  const resolveSelectionLinkId = useCallback((identity: string | null | undefined) => {
    if (!identity) return null;
    return resolveLinkKey(robotLinks || {}, identity) ?? identity;
  }, [robotLinks]);

  const hasTransformChanged = useCallback((object: THREE.Object3D) => {
    const positionChanged = originalPositionRef.current.distanceToSquared(object.position) > 1e-8;
    const rotationChanged = originalQuaternionRef.current.angleTo(object.quaternion) > 1e-4;
    return positionChanged || rotationChanged;
  }, []);

  useEffect(() => {
    targetObjectRef.current = targetObject;
  }, [targetObject]);

  useEffect(() => {
    setIsDraggingRef.current = setIsDragging;
  }, [setIsDragging]);

  useEffect(() => {
    onTransformChangeRef.current = onTransformChange;
  }, [onTransformChange]);

  useEffect(() => {
    onTransformEndRef.current = onTransformEnd;
  }, [onTransformEnd]);

  useEffect(() => {
    onTransformPendingRef.current = onTransformPending;
  }, [onTransformPending]);

  useEffect(() => {
    if (selection?.id && selection.subType === 'collision') {
      const resolvedSelectionId = resolveSelectionLinkId(selection.id);
      if (!resolvedSelectionId) return;

      activeSelectionRef.current = {
        id: resolvedSelectionId,
        objectIndex: selection.objectIndex,
      };
      return;
    }

    if (!isDraggingRef.current) {
      activeSelectionRef.current = null;
    }
  }, [resolveSelectionLinkId, selection?.id, selection?.objectIndex, selection?.subType]);

  const commitTransform = useCallback(() => {
    const activeTargetObject = targetObjectRef.current;
    const activeSelection = activeSelectionRef.current;
    const handleTransformEnd = onTransformEndRef.current;
    if (!activeTargetObject || !activeSelection?.id || !handleTransformEnd) return false;

    activeTargetObject.updateMatrixWorld(true);

    const position = activeTargetObject.position;
    const rotation = getObjectRPY(activeTargetObject);

    handleTransformEnd(
      activeSelection.id,
      { x: position.x, y: position.y, z: position.z },
      rotation,
      activeSelection.objectIndex
    );

    originalPositionRef.current.copy(activeTargetObject.position);
    originalRotationRef.current.copy(activeTargetObject.rotation);
    originalQuaternionRef.current.copy(activeTargetObject.quaternion);
    return true;
  }, []);

  const emitTransformPreview = useCallback((object: THREE.Object3D) => {
    const activeSelection = activeSelectionRef.current;
    const handleTransformChange = onTransformChangeRef.current;
    if (!activeSelection?.id || !handleTransformChange) {
      return;
    }

    object.updateMatrixWorld(true);
    const position = object.position;
    const rotation = getObjectRPY(object);

    handleTransformChange(
      activeSelection.id,
      { x: position.x, y: position.y, z: position.z },
      rotation,
      activeSelection.objectIndex
    );
  }, []);

  const cancelDrag = useCallback(() => {
    if (!isDraggingRef.current) {
      return;
    }

    const activeTargetObject = targetObjectRef.current;

    if (activeTargetObject) {
      activeTargetObject.position.copy(originalPositionRef.current);
      activeTargetObject.quaternion.copy(originalQuaternionRef.current);
      activeTargetObject.updateMatrixWorld(true);
    }

    isDraggingRef.current = false;
    activeControlsRef.current = null;
    setIsDraggingRef.current(false);
    onTransformPendingRef.current?.(false);
    invalidate();
  }, [invalidate]);

  const finishDrag = useCallback(() => {
    const activeTargetObject = targetObjectRef.current;
    if (!activeTargetObject || !isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    activeControlsRef.current = null;
    setIsDraggingRef.current(false);
    onTransformPendingRef.current?.(false);

    if (hasTransformChanged(activeTargetObject)) {
      commitTransform();
    }

    invalidate();
  }, [commitTransform, hasTransformChanged, invalidate]);

  const beginDrag = useCallback((controls?: any) => {
    const activeTargetObject = targetObjectRef.current;
    if (!activeTargetObject || isDraggingRef.current) return;

    let nextSelection = activeSelectionRef.current;
    if (selection?.id) {
      const resolvedSelectionId = resolveSelectionLinkId(selection.id);
      if (!resolvedSelectionId) return;

      nextSelection = {
        id: resolvedSelectionId,
        objectIndex: selection.objectIndex,
      };
    }

    activeSelectionRef.current = nextSelection;
    isDraggingRef.current = true;
    activeControlsRef.current = controls ?? activeControlsRef.current;
    setIsDraggingRef.current(true);
    onTransformPendingRef.current?.(true);

    originalPositionRef.current.copy(activeTargetObject.position);
    originalRotationRef.current.copy(activeTargetObject.rotation);
    originalQuaternionRef.current.copy(activeTargetObject.quaternion);
  }, [resolveSelectionLinkId, selection?.id, selection?.objectIndex]);

  const handleDraggingChanged = useCallback((event: { value: boolean }) => {
    const dragging = Boolean(event.value);

    if (dragging) {
      const translateControls = transformRef.current;
      const rotateControls = rotateTransformRef.current;
      const draggingControls = rotateControls?.dragging
        ? rotateControls
        : translateControls?.dragging
          ? translateControls
          : activeControlsRef.current ?? rotateControls ?? translateControls;

      if (!draggingControls) return;
      if (isDraggingRef.current && activeControlsRef.current !== draggingControls) return;
      beginDrag(draggingControls);
      return;
    }

    if (!isDraggingRef.current) return;
    finishDrag();
  }, [beginDrag, finishDrag]);

  useEffect(() => {
    if (!robot || !selection?.id || selection.subType !== 'collision' || transformMode === 'select') {
      if (isDraggingRef.current) {
        cancelDrag();
      }
      activeControlsRef.current = null;
      setTargetObject((current) => (current === null ? current : null));
      return;
    }

    const runtimeLinks = (robot as any).links as Record<string, THREE.Object3D> | undefined;
    let runtimeLinkKey = selection.id;

    if (!runtimeLinks?.[runtimeLinkKey]) {
      const resolvedLinkId = resolveLinkKey(robotLinks || {}, selection.id);
      const runtimeLinkName = resolvedLinkId ? robotLinks?.[resolvedLinkId]?.name : null;
      if (runtimeLinkName && runtimeLinks?.[runtimeLinkName]) {
        runtimeLinkKey = runtimeLinkName;
      }
    }

    const linkObj = runtimeLinks?.[runtimeLinkKey];
    if (!linkObj) {
      if (isDraggingRef.current) {
        cancelDrag();
      }
      setTargetObject((current) => (current === null ? current : null));
      return;
    }

    const colliders: THREE.Object3D[] = [];
    linkObj.traverse((child: any) => {
      if (child.isURDFCollider && child.parent === linkObj) {
        colliders.push(child);
      }
    });

    if (colliders.length === 0) {
      linkObj.traverse((child: any) => {
        if (child.isURDFCollider) {
          colliders.push(child);
        }
      });
    }

    const collisionGroup = colliders[selection.objectIndex ?? 0] || colliders[0] || null;
    if (!collisionGroup) {
      if (isDraggingRef.current) {
        cancelDrag();
      }
      setTargetObject((current) => (current === null ? current : null));
      return;
    }

    const isSameTarget = targetObjectRef.current === collisionGroup;

    if (isDraggingRef.current && targetObjectRef.current && !isSameTarget) {
      cancelDrag();
    }

    setTargetObject((current) => (current === collisionGroup ? current : collisionGroup));

    if (!isDraggingRef.current) {
      activeControlsRef.current = null;
      originalPositionRef.current.copy(collisionGroup.position);
      originalRotationRef.current.copy(collisionGroup.rotation);
      originalQuaternionRef.current.copy(collisionGroup.quaternion);
    }
  }, [cancelDrag, robot, robotLinks, robotVersion, selection, transformMode]);

  useEffect(() => {
    cancelDragRef.current = cancelDrag;
  }, [cancelDrag]);

  useEffect(() => {
    return () => {
      cancelDragRef.current?.();
    };
  }, []);

  const handleObjectChange = useCallback(() => {
    const translateControls = transformRef.current;
    const rotateControls = rotateTransformRef.current;
    const draggingControls = rotateControls?.dragging
      ? rotateControls
      : translateControls?.dragging
        ? translateControls
        : null;

    if (draggingControls && !isDraggingRef.current) {
      beginDrag(draggingControls);
    }

    const activeTargetObject = targetObjectRef.current;
    if (activeTargetObject && isDraggingRef.current) {
      emitTransformPreview(activeTargetObject);
    }

    invalidate();
  }, [beginDrag, emitTransformPreview, invalidate]);

  useFrame(() => {
    const translateControls = transformRef.current;
    const rotateControls = rotateTransformRef.current;
    const draggingControls = rotateControls?.dragging
      ? rotateControls
      : translateControls?.dragging
        ? translateControls
        : null;

    if (draggingControls) {
      beginDrag(draggingControls);
      invalidate();
      return;
    }

    if (isDraggingRef.current) {
      finishDrag();
    }
  }, 1000);

  const getControlMode = () => {
    if (transformMode === 'translate') return 'translate';
    if (transformMode === 'rotate') return 'rotate';
    if (transformMode === 'universal') return 'universal';
    return 'translate';
  };

  if (!targetObject || transformMode === 'select') {
    return null;
  }

  return (
    <UnifiedTransformControls
      ref={transformRef}
      rotateRef={rotateTransformRef}
      object={targetObject}
      mode={getControlMode()}
      size={COLLISION_TRANSLATE_GIZMO_SIZE}
      rotateSize={COLLISION_ROTATE_GIZMO_SIZE}
      space={transformMode === 'rotate' && transformReferenceFrame === 'local' ? 'local' : 'world'}
      hoverStyle="single-axis"
      displayStyle="thick-primary"
      displayThicknessScale={COLLISION_GIZMO_THICKNESS_SCALE}
      onObjectChange={handleObjectChange}
      onDraggingChanged={handleDraggingChanged}
    />
  );
};
