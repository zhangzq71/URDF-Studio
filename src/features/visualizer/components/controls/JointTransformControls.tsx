import { memo, useCallback, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { JointType, RobotState } from '@/types';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import { TransformControlsState } from '../../hooks/useTransformControls';
interface JointTransformControlsProps {
  mode: 'skeleton' | 'detail' | 'hardware';
  selectedJointPivot: THREE.Group | null;
  robot: RobotState;
  transformMode: 'translate' | 'rotate' | 'universal';
  transformControlsState: TransformControlsState;
}

/**
 * JointTransformControls - Handles joint TransformControls in skeleton mode
 *
 * Features:
 * - Renders TransformControls for selected joint pivot
 * - Applies drag results immediately
 * - Skips fixed joints (they cannot be transformed)
 * - Only active in skeleton mode
 */
export const JointTransformControls = memo(function JointTransformControls({
  mode,
  selectedJointPivot,
  robot,
  transformMode,
  transformControlsState,
}: JointTransformControlsProps) {
  const {
    transformControlRef,
    rotateTransformControlRef,
    handleObjectChange,
  } = transformControlsState;
  const [translateProxy, setTranslateProxy] = useState<THREE.Group | null>(null);
  const translateProxyRef = useRef<THREE.Group | null>(null);
  const isTranslateDraggingRef = useRef(false);
  const worldPositionRef = useRef(new THREE.Vector3());
  const parentQuaternionRef = useRef(new THREE.Quaternion());
  const localPositionRef = useRef(new THREE.Vector3());

  const jointId = robot.selection.type === 'joint' ? robot.selection.id : null;
  const joint = jointId ? robot.joints[jointId] : null;

  const syncTranslateProxy = useCallback((proxyTarget: THREE.Object3D | null) => {
    if (!selectedJointPivot || !proxyTarget) return;

    selectedJointPivot.updateMatrixWorld(true);
    selectedJointPivot.getWorldPosition(worldPositionRef.current);
    proxyTarget.position.copy(worldPositionRef.current);

    const parent = selectedJointPivot.parent;
    if (parent) {
      parent.getWorldQuaternion(parentQuaternionRef.current);
      proxyTarget.quaternion.copy(parentQuaternionRef.current);
    } else {
      proxyTarget.quaternion.identity();
    }

    proxyTarget.scale.setScalar(1);
    proxyTarget.updateMatrixWorld(true);
  }, [selectedJointPivot]);

  const handleTranslateProxyRef = useCallback((proxy: THREE.Group | null) => {
    translateProxyRef.current = proxy;
    setTranslateProxy(proxy);
    syncTranslateProxy(proxy);
  }, [syncTranslateProxy]);

  const handleTranslateChange = useCallback(() => {
    const proxy = translateProxyRef.current;
    if (proxy && selectedJointPivot) {
      proxy.updateMatrixWorld(true);
      proxy.getWorldPosition(worldPositionRef.current);
      localPositionRef.current.copy(worldPositionRef.current);

      const parent = selectedJointPivot.parent;
      if (parent) {
        parent.worldToLocal(localPositionRef.current);
      }

      selectedJointPivot.position.copy(localPositionRef.current);
      selectedJointPivot.updateMatrixWorld(true);
    }

    handleObjectChange();
  }, [handleObjectChange, selectedJointPivot]);

  const handleDraggingChanged = useCallback(() => {
    const isTranslateDragging = Boolean(transformControlRef.current?.dragging);
    isTranslateDraggingRef.current = isTranslateDragging;

    if (!isTranslateDragging) {
      syncTranslateProxy(translateProxyRef.current);
    }
  }, [syncTranslateProxy, transformControlRef]);

  useFrame(() => {
    if (!isTranslateDraggingRef.current) {
      syncTranslateProxy(translateProxyRef.current);
    }
  });

  if (mode !== 'skeleton') return null;
  if (!selectedJointPivot || !jointId || !joint) return null;

  // Don't show TransformControls for fixed joints
  const jointTypeStr = String(joint.type).toLowerCase();
  if (jointTypeStr === 'fixed' || joint.type === JointType.FIXED) return null;

  const shouldRenderTranslateProxy =
    transformMode === 'translate' || transformMode === 'universal';
  const canRenderControls = transformMode === 'rotate' || Boolean(translateProxy);

  return (
    <>
      {shouldRenderTranslateProxy && <group ref={handleTranslateProxyRef} visible={false} />}

      {/* TransformControls at root Canvas level - not nested in hierarchy */}
      {canRenderControls && (
        <UnifiedTransformControls
          ref={transformControlRef}
          rotateRef={rotateTransformControlRef}
          object={selectedJointPivot}
          translateObject={shouldRenderTranslateProxy ? translateProxy ?? undefined : undefined}
          rotateObject={selectedJointPivot}
          mode={transformMode}
          size={VISUALIZER_UNIFIED_GIZMO_SIZE}
          translateSpace="local"
          rotateSpace="local"
          hoverStyle="single-axis"
          displayStyle="thick-primary"
          onChange={
            transformMode === 'rotate'
              ? handleObjectChange
              : handleTranslateChange
          }
          onRotateChange={handleObjectChange}
          onDraggingChanged={handleDraggingChanged}
        />
      )}
    </>
  );
});
