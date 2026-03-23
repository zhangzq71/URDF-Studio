import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import type { UrdfVisual } from '@/types';
import type { URDFViewerProps } from '../types';
import { getObjectRPY } from '../utils/collisionTransformMath';

const COLLISION_TRANSLATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE;
const COLLISION_ROTATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE * 0.84;
const COLLISION_GIZMO_THICKNESS_SCALE = 1.9;

const DEFAULT_POSITION = { x: 0, y: 0, z: 0 };
const DEFAULT_ROTATION = { r: 0, p: 0, y: 0 };

export interface UsdCollisionTransformTarget {
  linkId: string;
  objectIndex: number;
  getGeometry: () => UrdfVisual | undefined;
  getLinkWorldMatrix: () => THREE.Matrix4 | null;
}

interface UsdCollisionTransformControlsProps {
  mode: 'detail' | 'hardware';
  highlightMode: 'link' | 'collision';
  selection?: URDFViewerProps['selection'];
  transformMode: 'select' | 'translate' | 'rotate' | 'universal';
  setIsDragging: (dragging: boolean) => void;
  resolveTarget: (selection: NonNullable<URDFViewerProps['selection']>) => UsdCollisionTransformTarget | null;
  onTransformChange?: (linkId: string, position: { x: number; y: number; z: number }, rotation: { r: number; p: number; y: number }, objectIndex?: number) => void;
  onTransformEnd?: (linkId: string, position: { x: number; y: number; z: number }, rotation: { r: number; p: number; y: number }, objectIndex?: number) => void;
  onTransformPending?: (pending: boolean) => void;
}

export const UsdCollisionTransformControls: React.FC<UsdCollisionTransformControlsProps> = ({
  mode,
  highlightMode,
  selection,
  transformMode,
  setIsDragging,
  resolveTarget,
  onTransformChange,
  onTransformEnd,
  onTransformPending,
}) => {
  const transformRef = useRef<any>(null);
  const rotateTransformRef = useRef<any>(null);
  const linkFrameRef = useRef<THREE.Group | null>(null);
  const proxyObjectRef = useRef<THREE.Group | null>(null);
  const translateProxyRef = useRef<THREE.Group | null>(null);
  const { invalidate } = useThree();

  const [proxyObject, setProxyObject] = useState<THREE.Group | null>(null);
  const [translateProxy, setTranslateProxy] = useState<THREE.Group | null>(null);
  const [hasActiveTarget, setHasActiveTarget] = useState(false);

  const activeTargetRef = useRef<UsdCollisionTransformTarget | null>(null);
  const activeSelectionRef = useRef<{ id: string; objectIndex: number } | null>(null);
  const activeControlsRef = useRef<any>(null);
  const originalPositionRef = useRef(new THREE.Vector3());
  const originalQuaternionRef = useRef(new THREE.Quaternion());
  const setIsDraggingRef = useRef(setIsDragging);
  const onTransformChangeRef = useRef(onTransformChange);
  const onTransformEndRef = useRef(onTransformEnd);
  const onTransformPendingRef = useRef(onTransformPending);
  const isDraggingRef = useRef(false);

  const shouldUseTranslateProxy = transformMode === 'translate' || transformMode === 'universal';

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

  const syncLinkFrame = useCallback((target = activeTargetRef.current) => {
    const linkFrame = linkFrameRef.current;
    const linkWorldMatrix = target?.getLinkWorldMatrix();
    if (!linkFrame || !linkWorldMatrix) {
      return false;
    }

    linkFrame.matrixAutoUpdate = false;
    linkFrame.matrix.copy(linkWorldMatrix);
    linkFrame.matrixWorldNeedsUpdate = true;
    linkFrame.updateMatrixWorld(true);
    return true;
  }, []);

  const syncTranslateProxy = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    const nextTranslateProxy = translateProxyRef.current;
    if (!nextProxyObject || !nextTranslateProxy) {
      return;
    }

    nextTranslateProxy.position.copy(nextProxyObject.position);
    nextTranslateProxy.quaternion.identity();
    nextTranslateProxy.scale.setScalar(1);
    nextTranslateProxy.updateMatrixWorld(true);
  }, []);

  const syncProxyFromTarget = useCallback((target = activeTargetRef.current) => {
    const nextProxyObject = proxyObjectRef.current;
    if (!nextProxyObject || !target || !syncLinkFrame(target)) {
      return;
    }

    const geometry = target.getGeometry();
    const xyz = geometry?.origin?.xyz || DEFAULT_POSITION;
    const rpy = geometry?.origin?.rpy || DEFAULT_ROTATION;

    nextProxyObject.position.set(xyz.x, xyz.y, xyz.z);
    nextProxyObject.quaternion.setFromEuler(new THREE.Euler(rpy.r, rpy.p, rpy.y, 'ZYX'));
    nextProxyObject.scale.setScalar(1);
    nextProxyObject.updateMatrixWorld(true);
    syncTranslateProxy();
  }, [syncLinkFrame, syncTranslateProxy]);

  const applyTranslateProxyToTarget = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    const nextTranslateProxy = translateProxyRef.current;
    if (!nextProxyObject || !nextTranslateProxy) {
      return;
    }

    nextProxyObject.position.copy(nextTranslateProxy.position);
    nextProxyObject.updateMatrixWorld(true);
  }, []);

  const hasTransformChanged = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    if (!nextProxyObject) {
      return false;
    }

    const positionChanged = originalPositionRef.current.distanceToSquared(nextProxyObject.position) > 1e-8;
    const rotationChanged = originalQuaternionRef.current.angleTo(nextProxyObject.quaternion) > 1e-4;
    return positionChanged || rotationChanged;
  }, []);

  const emitTransformPreview = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    const activeSelection = activeSelectionRef.current;
    const handleTransformChange = onTransformChangeRef.current;
    if (!nextProxyObject || !activeSelection || !handleTransformChange) {
      return;
    }

    handleTransformChange(
      activeSelection.id,
      {
        x: nextProxyObject.position.x,
        y: nextProxyObject.position.y,
        z: nextProxyObject.position.z,
      },
      getObjectRPY(nextProxyObject),
      activeSelection.objectIndex,
    );
  }, []);

  const commitTransform = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    const activeSelection = activeSelectionRef.current;
    const handleTransformEnd = onTransformEndRef.current;
    if (!nextProxyObject || !activeSelection || !handleTransformEnd) {
      return false;
    }

    handleTransformEnd(
      activeSelection.id,
      {
        x: nextProxyObject.position.x,
        y: nextProxyObject.position.y,
        z: nextProxyObject.position.z,
      },
      getObjectRPY(nextProxyObject),
      activeSelection.objectIndex,
    );

    originalPositionRef.current.copy(nextProxyObject.position);
    originalQuaternionRef.current.copy(nextProxyObject.quaternion);
    return true;
  }, []);

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) {
      return;
    }

    if (shouldUseTranslateProxy) {
      applyTranslateProxyToTarget();
    }

    if (hasTransformChanged()) {
      commitTransform();
    }

    isDraggingRef.current = false;
    activeControlsRef.current = null;
    setIsDraggingRef.current(false);
    onTransformPendingRef.current?.(false);
    syncTranslateProxy();
    invalidate();
  }, [applyTranslateProxyToTarget, commitTransform, hasTransformChanged, invalidate, shouldUseTranslateProxy, syncTranslateProxy]);

  const cancelDrag = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    if (!nextProxyObject || !isDraggingRef.current) {
      return;
    }

    nextProxyObject.position.copy(originalPositionRef.current);
    nextProxyObject.quaternion.copy(originalQuaternionRef.current);
    nextProxyObject.updateMatrixWorld(true);

    isDraggingRef.current = false;
    activeControlsRef.current = null;
    setIsDraggingRef.current(false);
    onTransformPendingRef.current?.(false);
    syncTranslateProxy();
    invalidate();
  }, [invalidate, syncTranslateProxy]);

  const beginDrag = useCallback((controls?: any) => {
    const nextProxyObject = proxyObjectRef.current;
    const activeTarget = activeTargetRef.current;
    if (!nextProxyObject || !activeTarget || isDraggingRef.current) {
      return;
    }

    activeSelectionRef.current = {
      id: activeTarget.linkId,
      objectIndex: activeTarget.objectIndex,
    };
    originalPositionRef.current.copy(nextProxyObject.position);
    originalQuaternionRef.current.copy(nextProxyObject.quaternion);
    isDraggingRef.current = true;
    activeControlsRef.current = controls ?? activeControlsRef.current;
    setIsDraggingRef.current(true);
    onTransformPendingRef.current?.(true);
  }, []);

  const handleDraggingChanged = useCallback((event: { value: boolean }) => {
    if (event.value) {
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

    if (shouldUseTranslateProxy && Boolean(translateControls?.dragging)) {
      applyTranslateProxyToTarget();
    }

    if (isDraggingRef.current) {
      emitTransformPreview();
    }

    invalidate();
  }, [applyTranslateProxyToTarget, beginDrag, emitTransformPreview, invalidate, shouldUseTranslateProxy]);

  useEffect(() => {
    if (
      mode !== 'detail'
      || highlightMode !== 'collision'
      || transformMode === 'select'
      || selection?.type !== 'link'
      || !selection?.id
      || selection.subType !== 'collision'
    ) {
      if (isDraggingRef.current) {
        cancelDrag();
      }
      activeTargetRef.current = null;
      activeSelectionRef.current = null;
      setHasActiveTarget(false);
      return;
    }

    const resolvedTarget = resolveTarget(selection);
    if (!resolvedTarget) {
      if (isDraggingRef.current) {
        cancelDrag();
      }
      activeTargetRef.current = null;
      activeSelectionRef.current = null;
      setHasActiveTarget(false);
      return;
    }

    const isSameTarget = activeTargetRef.current?.linkId === resolvedTarget.linkId
      && activeTargetRef.current?.objectIndex === resolvedTarget.objectIndex;

    if (isDraggingRef.current && !isSameTarget) {
      cancelDrag();
    }

    activeTargetRef.current = resolvedTarget;
    activeSelectionRef.current = {
      id: resolvedTarget.linkId,
      objectIndex: resolvedTarget.objectIndex,
    };
    setHasActiveTarget(true);

    if (!isDraggingRef.current) {
      activeControlsRef.current = null;
      syncProxyFromTarget(resolvedTarget);
    }
  }, [
    cancelDrag,
    highlightMode,
    mode,
    resolveTarget,
    selection,
    syncProxyFromTarget,
    transformMode,
  ]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      syncProxyFromTarget();
    }
  }, [proxyObject, syncProxyFromTarget, translateProxy]);

  useEffect(() => () => {
    if (isDraggingRef.current) {
      cancelDrag();
    }
  }, [cancelDrag]);

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
      if (shouldUseTranslateProxy && Boolean(translateControls?.dragging)) {
        applyTranslateProxyToTarget();
      }
      invalidate();
      return;
    }

    if (isDraggingRef.current) {
      finishDrag();
      return;
    }

    if (activeTargetRef.current) {
      syncProxyFromTarget(activeTargetRef.current);
    }
  }, 1000);

  const handleProxyRef = useCallback((group: THREE.Group | null) => {
    proxyObjectRef.current = group;
    setProxyObject(group);
    if (group && activeTargetRef.current && !isDraggingRef.current) {
      syncProxyFromTarget(activeTargetRef.current);
    }
  }, [syncProxyFromTarget]);

  const handleTranslateProxyRef = useCallback((group: THREE.Group | null) => {
    translateProxyRef.current = group;
    setTranslateProxy(group);
    if (group && !isDraggingRef.current) {
      syncTranslateProxy();
    }
  }, [syncTranslateProxy]);

  const getControlMode = () => {
    if (transformMode === 'translate') return 'translate';
    if (transformMode === 'rotate') return 'rotate';
    if (transformMode === 'universal') return 'universal';
    return 'translate';
  };

  const canRenderControls = proxyObject && (transformMode === 'rotate' || !shouldUseTranslateProxy || Boolean(translateProxy));

  return (
    <>
      <group ref={linkFrameRef}>
        <group ref={handleProxyRef} />
        {shouldUseTranslateProxy && <group ref={handleTranslateProxyRef} />}
      </group>

      {hasActiveTarget && proxyObject && transformMode !== 'select' && canRenderControls && (
        <UnifiedTransformControls
          ref={transformRef}
          rotateRef={rotateTransformRef}
          object={proxyObject}
          translateObject={shouldUseTranslateProxy ? translateProxy ?? undefined : undefined}
          mode={getControlMode()}
          size={COLLISION_TRANSLATE_GIZMO_SIZE}
          rotateSize={COLLISION_ROTATE_GIZMO_SIZE}
          translateSpace="local"
          rotateSpace="local"
          hoverStyle="single-axis"
          displayStyle="thick-primary"
          displayThicknessScale={COLLISION_GIZMO_THICKNESS_SCALE}
          onObjectChange={handleObjectChange}
          onDraggingChanged={handleDraggingChanged}
        />
      )}
    </>
  );
};
