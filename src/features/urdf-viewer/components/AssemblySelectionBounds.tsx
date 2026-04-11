import { memo, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HELPER_RENDER_ORDER } from '@/shared/components/3d/unified-transform-controls/gizmoCore';
import { computeVisibleMeshBounds } from '@/shared/utils/threeBounds';

const DEFAULT_SELECTION_BOUNDS_COLOR = '#fbbf24';

interface AssemblySelectionBoundsProps {
  object: THREE.Object3D | null;
  color?: string;
}

export const AssemblySelectionBounds = memo(function AssemblySelectionBounds({
  object,
  color = DEFAULT_SELECTION_BOUNDS_COLOR,
}: AssemblySelectionBoundsProps) {
  const bounds = useMemo(() => new THREE.Box3(), []);
  const helper = useMemo(() => {
    const next = new THREE.Box3Helper(bounds, color);
    const material = next.material as THREE.LineBasicMaterial;

    next.name = 'AssemblySelectionBounds';
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
