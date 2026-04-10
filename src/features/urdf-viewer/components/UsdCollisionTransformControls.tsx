import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import type { UrdfVisual } from '@/types';
import type { ViewerProps } from '../types';
import { useCollisionTransformDragLifecycle } from '../hooks/useCollisionTransformDragLifecycle';
import { getObjectRPY } from '../utils/collisionTransformMath';
import {
  canRenderCollisionTransformControls,
  resolveCurrentCollisionDraggingControls,
} from '../utils/collisionTransformControlsShared';
import {
  extractUsdGeometryTransformFromWorldMatrix,
  extractUsdProxyLocalTransformFromWorldMatrices,
} from '../utils/usdCollisionTransform';

const COLLISION_TRANSLATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE;
const COLLISION_ROTATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE * 0.84;
const COLLISION_GIZMO_THICKNESS_SCALE = 1.9;

const DEFAULT_POSITION = { x: 0, y: 0, z: 0 };
const DEFAULT_ROTATION = { r: 0, p: 0, y: 0 };

function cloneGeometryForBaseline(geometry?: UrdfVisual): UrdfVisual | null {
  if (!geometry) {
    return null;
  }

  return {
    ...geometry,
    origin: {
      xyz: {
        ...DEFAULT_POSITION,
        ...(geometry.origin?.xyz ?? {}),
      },
      rpy: {
        ...DEFAULT_ROTATION,
        ...(geometry.origin?.rpy ?? {}),
      },
    },
    dimensions: geometry.dimensions ? { ...geometry.dimensions } : geometry.dimensions,
  };
}

export interface UsdCollisionTransformTarget {
  linkId: string;
  objectIndex: number;
  getGeometry: () => UrdfVisual | undefined;
  getLinkWorldMatrix: () => THREE.Matrix4 | null;
  getMeshWorldMatrix?: () => THREE.Matrix4 | null;
}

interface UsdCollisionTransformControlsProps {
  selection?: ViewerProps['selection'];
  transformMode: 'select' | 'translate' | 'rotate' | 'universal';
  setIsDragging: (dragging: boolean) => void;
  resolveTarget: (
    selection: NonNullable<ViewerProps['selection']>,
  ) => UsdCollisionTransformTarget | null;
  onTransformChange?: (
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => void;
  onTransformEnd?: (
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => void;
  onTransformPending?: (pending: boolean) => void;
}

export const UsdCollisionTransformControls: React.FC<UsdCollisionTransformControlsProps> = ({
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
  const originalPositionRef = useRef(new THREE.Vector3());
  const originalQuaternionRef = useRef(new THREE.Quaternion());
  const originalScaleRef = useRef(new THREE.Vector3(1, 1, 1));
  const baselineGeometryRef = useRef<UrdfVisual | null>(null);
  const baselineMeshWorldMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const onTransformChangeRef = useRef(onTransformChange);
  const onTransformEndRef = useRef(onTransformEnd);

  useEffect(() => {
    onTransformChangeRef.current = onTransformChange;
  }, [onTransformChange]);

  useEffect(() => {
    onTransformEndRef.current = onTransformEnd;
  }, [onTransformEnd]);

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

  const captureBaseline = useCallback((target = activeTargetRef.current) => {
    baselineGeometryRef.current = cloneGeometryForBaseline(target?.getGeometry());
    baselineMeshWorldMatrixRef.current = target?.getMeshWorldMatrix?.()?.clone() ?? null;
  }, []);

  const resolveGeometryTransformFromProxy = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    const activeTarget = activeTargetRef.current;
    if (!nextProxyObject || !activeTarget) {
      return null;
    }

    const currentGeometry =
      baselineGeometryRef.current ?? cloneGeometryForBaseline(activeTarget.getGeometry());
    const currentMeshWorldMatrix =
      baselineMeshWorldMatrixRef.current?.clone() ?? activeTarget.getMeshWorldMatrix?.() ?? null;
    const linkWorldMatrix = activeTarget.getLinkWorldMatrix();

    if (!currentGeometry || !currentMeshWorldMatrix || !linkWorldMatrix) {
      return {
        position: {
          x: nextProxyObject.position.x,
          y: nextProxyObject.position.y,
          z: nextProxyObject.position.z,
        },
        rotation: getObjectRPY(nextProxyObject),
      };
    }

    nextProxyObject.updateMatrixWorld(true);
    const extractedTransform = extractUsdGeometryTransformFromWorldMatrix({
      currentGeometry,
      currentMeshWorldMatrix,
      nextMeshWorldMatrix: nextProxyObject.matrixWorld.clone(),
      linkWorldMatrix,
    });

    return {
      position: extractedTransform.position,
      rotation: extractedTransform.rotation,
    };
  }, []);

  const syncProxyFromTarget = useCallback(
    (target = activeTargetRef.current) => {
      const nextProxyObject = proxyObjectRef.current;
      if (!nextProxyObject || !target || !syncLinkFrame(target)) {
        return;
      }

      captureBaseline(target);

      const geometry = target.getGeometry();
      const xyz = geometry?.origin?.xyz || DEFAULT_POSITION;
      const rpy = geometry?.origin?.rpy || DEFAULT_ROTATION;
      const meshWorldMatrix = baselineMeshWorldMatrixRef.current;
      const linkWorldMatrix = target.getLinkWorldMatrix();

      if (meshWorldMatrix && linkWorldMatrix) {
        const proxyLocalTransform = extractUsdProxyLocalTransformFromWorldMatrices({
          linkWorldMatrix,
          meshWorldMatrix,
        });

        nextProxyObject.position.set(
          proxyLocalTransform.position.x,
          proxyLocalTransform.position.y,
          proxyLocalTransform.position.z,
        );
        nextProxyObject.quaternion.setFromEuler(
          new THREE.Euler(
            proxyLocalTransform.rotation.r,
            proxyLocalTransform.rotation.p,
            proxyLocalTransform.rotation.y,
            'ZYX',
          ),
        );
        nextProxyObject.scale.set(
          proxyLocalTransform.scale.x,
          proxyLocalTransform.scale.y,
          proxyLocalTransform.scale.z,
        );
      } else {
        nextProxyObject.position.set(xyz.x, xyz.y, xyz.z);
        nextProxyObject.quaternion.setFromEuler(new THREE.Euler(rpy.r, rpy.p, rpy.y, 'ZYX'));
        nextProxyObject.scale.setScalar(1);
      }

      nextProxyObject.updateMatrixWorld(true);
      syncTranslateProxy();
    },
    [captureBaseline, syncLinkFrame, syncTranslateProxy],
  );

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

    const positionChanged =
      originalPositionRef.current.distanceToSquared(nextProxyObject.position) > 1e-8;
    const rotationChanged =
      originalQuaternionRef.current.angleTo(nextProxyObject.quaternion) > 1e-4;
    return positionChanged || rotationChanged;
  }, []);

  const emitTransformPreview = useCallback(() => {
    const activeSelection = activeSelectionRef.current;
    const handleTransformChange = onTransformChangeRef.current;
    const transformedGeometry = resolveGeometryTransformFromProxy();
    if (!activeSelection || !handleTransformChange || !transformedGeometry) {
      return;
    }

    handleTransformChange(
      activeSelection.id,
      transformedGeometry.position,
      transformedGeometry.rotation,
      activeSelection.objectIndex,
    );
  }, [resolveGeometryTransformFromProxy]);

  const commitTransform = useCallback(() => {
    const activeSelection = activeSelectionRef.current;
    const handleTransformEnd = onTransformEndRef.current;
    const transformedGeometry = resolveGeometryTransformFromProxy();
    if (!activeSelection || !handleTransformEnd || !transformedGeometry) {
      return false;
    }

    handleTransformEnd(
      activeSelection.id,
      transformedGeometry.position,
      transformedGeometry.rotation,
      activeSelection.objectIndex,
    );

    const nextProxyObject = proxyObjectRef.current;
    if (nextProxyObject) {
      originalPositionRef.current.copy(nextProxyObject.position);
      originalQuaternionRef.current.copy(nextProxyObject.quaternion);
      originalScaleRef.current.copy(nextProxyObject.scale);
    }
    return true;
  }, [resolveGeometryTransformFromProxy]);

  const handleFinishDrag = useCallback(() => {
    if (transformMode === 'translate' || transformMode === 'universal') {
      applyTranslateProxyToTarget();
    }

    if (hasTransformChanged()) {
      commitTransform();
    }

    syncTranslateProxy();
  }, [
    applyTranslateProxyToTarget,
    commitTransform,
    hasTransformChanged,
    syncTranslateProxy,
    transformMode,
  ]);

  const handleCancelDrag = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    if (!nextProxyObject) {
      return;
    }

    nextProxyObject.position.copy(originalPositionRef.current);
    nextProxyObject.quaternion.copy(originalQuaternionRef.current);
    nextProxyObject.scale.copy(originalScaleRef.current);
    nextProxyObject.updateMatrixWorld(true);
    syncTranslateProxy();
  }, [syncTranslateProxy]);

  const handleBeginDrag = useCallback(() => {
    const nextProxyObject = proxyObjectRef.current;
    const activeTarget = activeTargetRef.current;
    if (!nextProxyObject || !activeTarget) {
      return false;
    }

    captureBaseline(activeTarget);
    activeSelectionRef.current = {
      id: activeTarget.linkId,
      objectIndex: activeTarget.objectIndex,
    };
    originalPositionRef.current.copy(nextProxyObject.position);
    originalQuaternionRef.current.copy(nextProxyObject.quaternion);
    originalScaleRef.current.copy(nextProxyObject.scale);
    return true;
  }, [captureBaseline]);

  const {
    activeControlsRef,
    beginActiveDrag,
    cancelActiveDrag,
    controlMode,
    finishActiveDrag,
    handleDraggingChanged,
    handleObjectChange,
    isDraggingRef,
    shouldUseTranslateProxy,
  } = useCollisionTransformDragLifecycle({
    transformMode,
    transformRef,
    rotateTransformRef,
    invalidate,
    setIsDragging,
    onTransformPending,
    onBeginDrag: handleBeginDrag,
    onFinishDrag: handleFinishDrag,
    onCancelDrag: handleCancelDrag,
    onObjectChange: ({ isDragging, isTranslateDragging }) => {
      if (shouldUseTranslateProxy && isTranslateDragging) {
        applyTranslateProxyToTarget();
      }

      if (isDragging) {
        emitTransformPreview();
      }
    },
  });

  useEffect(() => {
    if (
      transformMode === 'select' ||
      selection?.type !== 'link' ||
      !selection?.id ||
      selection.subType !== 'collision'
    ) {
      if (isDraggingRef.current) {
        cancelActiveDrag();
      }
      activeTargetRef.current = null;
      activeSelectionRef.current = null;
      setHasActiveTarget(false);
      return;
    }

    const resolvedTarget = resolveTarget(selection);
    if (!resolvedTarget) {
      if (isDraggingRef.current) {
        cancelActiveDrag();
      }
      activeTargetRef.current = null;
      activeSelectionRef.current = null;
      setHasActiveTarget(false);
      return;
    }

    const isSameTarget =
      activeTargetRef.current?.linkId === resolvedTarget.linkId &&
      activeTargetRef.current?.objectIndex === resolvedTarget.objectIndex;

    if (isDraggingRef.current && !isSameTarget) {
      cancelActiveDrag();
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
  }, [cancelActiveDrag, resolveTarget, selection, syncProxyFromTarget, transformMode]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      syncProxyFromTarget();
    }
  }, [proxyObject, syncProxyFromTarget, translateProxy]);

  useFrame(() => {
    const translateControls = transformRef.current;
    const draggingControls = resolveCurrentCollisionDraggingControls(
      translateControls,
      rotateTransformRef.current,
    );

    if (draggingControls) {
      beginActiveDrag(draggingControls);
      if (shouldUseTranslateProxy && Boolean(translateControls?.dragging)) {
        applyTranslateProxyToTarget();
      }
      invalidate();
      return;
    }

    if (isDraggingRef.current) {
      finishActiveDrag();
      return;
    }

    if (activeTargetRef.current) {
      syncProxyFromTarget(activeTargetRef.current);
    }
  }, 1000);

  const handleProxyRef = useCallback(
    (group: THREE.Group | null) => {
      proxyObjectRef.current = group;
      setProxyObject(group);
      if (group && activeTargetRef.current && !isDraggingRef.current) {
        syncProxyFromTarget(activeTargetRef.current);
      }
    },
    [syncProxyFromTarget],
  );

  const handleTranslateProxyRef = useCallback(
    (group: THREE.Group | null) => {
      translateProxyRef.current = group;
      setTranslateProxy(group);
      if (group && !isDraggingRef.current) {
        syncTranslateProxy();
      }
    },
    [syncTranslateProxy],
  );

  const canRenderControls =
    Boolean(proxyObject) &&
    canRenderCollisionTransformControls(transformMode, shouldUseTranslateProxy, translateProxy);

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
          translateObject={shouldUseTranslateProxy ? (translateProxy ?? undefined) : undefined}
          mode={controlMode}
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
