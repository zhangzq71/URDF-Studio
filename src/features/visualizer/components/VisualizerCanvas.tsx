import React, { memo, Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { Theme } from '@/types';
import {
  SceneLighting,
  SnapshotManager,
  ReferenceGrid,
  CanvasResizeSync,
  NeutralStudioEnvironment,
  WORKSPACE_CANVAS_BACKGROUND,
  WorldOriginAxes,
} from '@/shared/components/3d';
import { useEffectiveTheme } from '@/shared/hooks';

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

  return (
    <Canvas
      shadows
      frameloop="demand"
      camera={{ position: [2, 2, 2], up: [0, 0, 1], fov: 60 }}
      onPointerMissed={onPointerMissed}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
    >
      <CanvasResizeSync />
      {sceneRef && <SceneCapture sceneRef={sceneRef} />}
      <color attach="background" args={[effectiveTheme === 'light' ? WORKSPACE_CANVAS_BACKGROUND.light : WORKSPACE_CANVAS_BACKGROUND.dark]} />
      <Suspense fallback={null}>
        <OrbitControls makeDefault enableDamping={false} />
        {/* Pass effective theme to SceneLighting and ReferenceGrid */}
        <SceneLighting theme={effectiveTheme} />
        <NeutralStudioEnvironment intensity={effectiveTheme === 'light' ? 0.38 : 0.46} />
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
  );
});
