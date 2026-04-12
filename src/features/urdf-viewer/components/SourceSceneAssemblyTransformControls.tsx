import { memo, useCallback, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import { HELPER_RENDER_ORDER } from '@/shared/components/3d/unified-transform-controls/gizmoCore';
import { computeVisibleMeshBounds } from '@/shared/utils/threeBounds';
import { useSelectionStore } from '@/store/selectionStore';
import type { AssemblyTransform } from '@/types';

const DEFAULT_SELECTION_BOUNDS_COLOR = '#fbbf24';

interface SourceSceneSelectionBoundsProps {
  object: THREE.Object3D | null;
  color?: string;
}

const SourceSceneSelectionBounds = memo(function SourceSceneSelectionBounds({
  object,
  color = DEFAULT_SELECTION_BOUNDS_COLOR,
}: SourceSceneSelectionBoundsProps) {
  const bounds = useMemo(() => new THREE.Box3(), []);
  const helper = useMemo(() => {
    const next = new THREE.Box3Helper(bounds, color);
    const material = next.material as THREE.LineBasicMaterial;

    next.name = 'SourceSceneAssemblySelectionBounds';
    next.frustumCulled = false;
    next.renderOrder = HELPER_RENDER_ORDER;
    next.visible = false;
    next.userData.isHelper = true;
    next.userData.excludeFromSceneBounds = true;

    material.depthTest = false;
    material.transparent = true;
    material.opacity = 0.95;
    material.toneMapped = false;

    return next;
  }, [bounds, color]);

  useFrame(() => {
    if (!object) {
      helper.visible = false;
      return;
    }

    const visibleBounds = computeVisibleMeshBounds(object, {
      includeInvisible: false,
    });
    if (!visibleBounds || visibleBounds.isEmpty()) {
      helper.visible = false;
      return;
    }

    bounds.copy(visibleBounds);
    helper.visible = true;
    helper.updateMatrixWorld(true);
  }, 1100);

  useEffect(
    () => () => {
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
    },
    [helper],
  );

  return <primitive object={helper} />;
});

function decomposeTransformMatrix(matrix: THREE.Matrix4): AssemblyTransform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'ZYX');

  matrix.decompose(position, quaternion, scale);
  euler.setFromQuaternion(quaternion, 'ZYX');

  return {
    position: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    rotation: {
      r: euler.x,
      p: euler.y,
      y: euler.z,
    },
  };
}

interface SourceSceneAssemblyTransformControlsProps {
  object: THREE.Object3D | null;
  componentId: string | null;
  transformMode: 'select' | 'translate' | 'rotate' | 'universal';
  onComponentTransform?: (componentId: string, transform: AssemblyTransform) => void;
  onTransformPending?: (pending: boolean) => void;
}

export const SourceSceneAssemblyTransformControls = memo(
  function SourceSceneAssemblyTransformControls({
    object,
    componentId,
    transformMode,
    onComponentTransform,
    onTransformPending,
  }: SourceSceneAssemblyTransformControlsProps) {
    const setHoverFrozen = useSelectionStore((state) => state.setHoverFrozen);
    const controlMode = transformMode === 'select' ? 'translate' : transformMode;

    const handleDraggingChanged = useCallback(
      (event?: { value?: boolean }) => {
        const dragging = Boolean(event?.value);
        setHoverFrozen(dragging);
        onTransformPending?.(dragging);

        if (dragging || !object || !componentId || !onComponentTransform) {
          return;
        }

        object.updateMatrix();
        onComponentTransform(componentId, decomposeTransformMatrix(object.matrix));
      },
      [componentId, object, onComponentTransform, onTransformPending, setHoverFrozen],
    );

    useEffect(
      () => () => {
        setHoverFrozen(false);
        onTransformPending?.(false);
      },
      [onTransformPending, setHoverFrozen],
    );

    if (!object || !componentId) {
      return null;
    }

    return (
      <>
        <SourceSceneSelectionBounds object={object} />
        <UnifiedTransformControls
          object={object}
          mode={controlMode}
          size={VISUALIZER_UNIFIED_GIZMO_SIZE}
          translateSpace="world"
          rotateSpace="local"
          hoverStyle="single-axis"
          displayStyle="thick-primary"
          onDraggingChanged={handleDraggingChanged}
        />
      </>
    );
  },
);
