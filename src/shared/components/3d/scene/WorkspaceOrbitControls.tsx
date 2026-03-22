import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  DEFAULT_WORKSPACE_ORBIT_CLIPPING,
  syncWorkspacePerspectiveClipPlanes,
} from './workspaceOrbitClipping';

const WORKSPACE_ORBIT_CONTROL_TUNING = {
  dampingFactor: 0.08,
  rotateSpeed: 0.85,
  panSpeed: 0.9,
  zoomSpeed: 1.15,
  zoomToCursor: true,
  enableDamping: true,
  ...DEFAULT_WORKSPACE_ORBIT_CLIPPING,
} as const;

export interface WorkspaceOrbitControlsProps {
  enabled?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  enableDamping?: boolean;
  dampingFactor?: number;
  rotateSpeed?: number;
  panSpeed?: number;
  zoomSpeed?: number;
  zoomToCursor?: boolean;
  minDistance?: number;
  maxDistance?: number;
}

export function WorkspaceOrbitControls({
  enabled = true,
  onStart,
  onEnd,
  enableDamping = WORKSPACE_ORBIT_CONTROL_TUNING.enableDamping,
  dampingFactor = WORKSPACE_ORBIT_CONTROL_TUNING.dampingFactor,
  rotateSpeed = WORKSPACE_ORBIT_CONTROL_TUNING.rotateSpeed,
  panSpeed = WORKSPACE_ORBIT_CONTROL_TUNING.panSpeed,
  zoomSpeed = WORKSPACE_ORBIT_CONTROL_TUNING.zoomSpeed,
  zoomToCursor = WORKSPACE_ORBIT_CONTROL_TUNING.zoomToCursor,
  minDistance = WORKSPACE_ORBIT_CONTROL_TUNING.minDistance,
  maxDistance,
}: WorkspaceOrbitControlsProps) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useFrame(() => {
    if (!controlsRef.current) {
      return;
    }

    // `zoomToCursor` can place the camera very close to one surface while the
    // orbit target remains deeper in the model. Keep the near plane
    // conservative so dense robot geometry does not clip away while zooming.
    syncWorkspacePerspectiveClipPlanes(camera, controlsRef.current, { minDistance });
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={enabled}
      enableDamping={enableDamping}
      dampingFactor={dampingFactor}
      rotateSpeed={rotateSpeed}
      panSpeed={panSpeed}
      zoomSpeed={zoomSpeed}
      zoomToCursor={zoomToCursor}
      minDistance={minDistance}
      maxDistance={maxDistance}
      onStart={onStart}
      onEnd={onEnd}
    />
  );
}
