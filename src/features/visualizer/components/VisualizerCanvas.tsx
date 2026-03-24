import React, { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type RootState, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { Theme } from '@/types';
import {
  SceneLighting,
  SnapshotManager,
  ReferenceGrid,
  CanvasResizeSync,
  NeutralStudioEnvironment,
  WorkspaceOrbitControls,
  WORKSPACE_CANVAS_BACKGROUND,
  WORKSPACE_DEFAULT_CAMERA_FOV,
  WORKSPACE_DEFAULT_CAMERA_POSITION,
  WORKSPACE_DEFAULT_CAMERA_UP,
  WorldOriginAxes,
} from '@/shared/components/3d';
import { useEffectiveTheme } from '@/shared/hooks';
import { attachContextMenuBlocker } from '@/shared/utils';

const INTERACTION_RECOVERY_DELAY_MS = 180;
const RESTING_DPR_CAP = 1.75;
// Keep the same DPR while orbiting; dropping to 1.0 makes the whole scene,
// especially the reference grid, look blurry on HiDPI displays.
const INTERACTION_DPR_CAP = RESTING_DPR_CAP;

function useAdaptiveInteractionQuality() {
  const [isInteracting, setIsInteracting] = useState(false);
  const interactionTimeoutRef = useRef<number | null>(null);

  const clearInteractionTimeout = useCallback(() => {
    if (typeof window === 'undefined' || interactionTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = null;
  }, []);

  const beginInteraction = useCallback(() => {
    clearInteractionTimeout();
    setIsInteracting(true);
  }, [clearInteractionTimeout]);

  const endInteraction = useCallback(
    (delay = INTERACTION_RECOVERY_DELAY_MS) => {
      if (typeof window === 'undefined') {
        setIsInteracting(false);
        return;
      }

      clearInteractionTimeout();
      interactionTimeoutRef.current = window.setTimeout(() => {
        interactionTimeoutRef.current = null;
        setIsInteracting(false);
      }, delay);
    },
    [clearInteractionTimeout]
  );

  const pulseInteraction = useCallback(
    (delay = INTERACTION_RECOVERY_DELAY_MS) => {
      beginInteraction();
      endInteraction(delay);
    },
    [beginInteraction, endInteraction]
  );

  useEffect(() => () => clearInteractionTimeout(), [clearInteractionTimeout]);

  const dpr = useMemo(() => {
    if (typeof window === 'undefined') {
      return isInteracting ? INTERACTION_DPR_CAP : RESTING_DPR_CAP;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    return Math.min(devicePixelRatio, isInteracting ? INTERACTION_DPR_CAP : RESTING_DPR_CAP);
  }, [isInteracting]);

  return {
    dpr,
    isInteracting,
    beginInteraction,
    endInteraction,
    pulseInteraction,
  };
}

interface VisualizerCanvasProps {
  theme: Theme;
  snapshotAction?: React.RefObject<(() => void) | null>;
  sceneRef?: React.RefObject<THREE.Scene | null>;
  robotName?: string;
  onPointerMissed?: () => void;
  children: React.ReactNode;
}

/** Captures Three.js scene into an external ref */
function SceneCapture({ sceneRef }: { sceneRef: React.RefObject<THREE.Scene | null> }) {
  const { scene } = useThree();
  useEffect(() => { sceneRef.current = scene; }, [scene, sceneRef]);
  return null;
}

/**
 * VisualizerCanvas - Wraps the Three.js Canvas with standard scene setup
 *
 * Features:
 * - Configures Canvas with shadows, tone mapping, and camera
 * - Sets up OrbitControls with Z-up orientation
 * - Provides scene lighting and environment
 * - Renders reference grid and gizmo
 * - Manages snapshot functionality
 */
export const VisualizerCanvas = memo(function VisualizerCanvas({
  snapshotAction,
  robotName = 'robot',
  sceneRef,
  onPointerMissed,
  children,
}: VisualizerCanvasProps) {
  // Use the hook to get the effective theme (light/dark)
  // This handles the 'system' case correctly
  const effectiveTheme = useEffectiveTheme();
  const canvasCleanupRef = useRef<(() => void) | null>(null);
  const {
    dpr,
    isInteracting,
    beginInteraction,
    endInteraction,
    pulseInteraction,
  } = useAdaptiveInteractionQuality();

  const handleCreated = useCallback((state: RootState) => {
    canvasCleanupRef.current?.();
    canvasCleanupRef.current = attachContextMenuBlocker(state.gl.domElement);
  }, []);

  const handleContextMenuCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    return () => {
      canvasCleanupRef.current?.();
      canvasCleanupRef.current = null;
    };
  }, []);

  return (
    <div
      className="h-full w-full"
      style={{ touchAction: 'none', userSelect: 'none' }}
      onPointerDownCapture={() => beginInteraction()}
      onPointerUpCapture={() => endInteraction()}
      onPointerLeave={() => endInteraction(0)}
      onMouseMove={(event) => {
        if (event.buttons !== 0) {
          beginInteraction();
        }
      }}
      onWheelCapture={() => pulseInteraction()}
      onContextMenuCapture={handleContextMenuCapture}
    >
      <Canvas
        dpr={dpr}
        shadows
        frameloop="demand"
        camera={{
          position: WORKSPACE_DEFAULT_CAMERA_POSITION,
          up: WORKSPACE_DEFAULT_CAMERA_UP,
          fov: WORKSPACE_DEFAULT_CAMERA_FOV,
        }}
        onCreated={handleCreated}
        onPointerMissed={onPointerMissed}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        translate="no"
      >
        <CanvasResizeSync />
        {sceneRef && <SceneCapture sceneRef={sceneRef} />}
        <color attach="background" args={[effectiveTheme === 'light' ? WORKSPACE_CANVAS_BACKGROUND.light : WORKSPACE_CANVAS_BACKGROUND.dark]} />
        <Suspense fallback={null}>
          <WorkspaceOrbitControls onStart={beginInteraction} onEnd={() => endInteraction()} />
          {/* Pass effective theme to SceneLighting and ReferenceGrid */}
          <SceneLighting theme={effectiveTheme} enableShadows={!isInteracting} />
          <NeutralStudioEnvironment intensity={effectiveTheme === 'light' ? 0.46 : 0.46} />
          <SnapshotManager actionRef={snapshotAction} robotName={robotName} />

          {/* Render robot and controls passed as children */}
          {children}

          {/* Reference Grid */}
          <ReferenceGrid theme={effectiveTheme} />
          <WorldOriginAxes />

          {/* Axis Gizmo */}
          <GizmoHelper alignment="bottom-right" margin={[68, 68]}>
            <GizmoViewport
              axisColors={['#ef4444', '#22c55e', '#3b82f6']}
              labelColor={effectiveTheme === 'light' ? '#0f172a' : 'white'}
              axisHeadScale={0.9}
              scale={34}
            />
          </GizmoHelper>
        </Suspense>
      </Canvas>
    </div>
  );
});
