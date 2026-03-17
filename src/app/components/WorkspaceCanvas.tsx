import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { Environment, GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Theme } from '@/types';
import type { Language } from '@/shared/i18n';
import {
  CanvasResizeSync,
  NeutralStudioEnvironment,
  ReferenceGrid,
  SceneLighting,
  SnapshotManager,
  UsageGuide,
  WORKSPACE_CANVAS_BACKGROUND,
  WorldOriginAxes,
} from '@/shared/components/3d';
import { useEffectiveTheme } from '@/shared/hooks';

type OrbitControlProps = React.ComponentProps<typeof OrbitControls>;

interface WorkspaceCanvasProps {
  theme: Theme;
  lang?: Language;
  robotName?: string;
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  sceneRef?: React.RefObject<THREE.Scene | null>;
  snapshotAction?: React.RefObject<(() => void) | null>;
  children: React.ReactNode;
  overlays?: React.ReactNode;
  onPointerMissed?: () => void;
  onCreated?: (state: RootState) => void;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  environment?: 'hdr' | 'studio' | 'none';
  environmentIntensity?: number;
  cameraFollowPrimary?: boolean;
  orbitControlsProps?: Partial<OrbitControlProps>;
  controlLayerKey?: string;
  background?: {
    light: string;
    dark: string;
  };
  contextLostMessage?: string;
}

export const WorkspaceCanvas = ({
  lang,
  robotName = 'robot',
  className = 'relative w-full h-full',
  containerRef,
  sceneRef,
  snapshotAction,
  children,
  overlays,
  onPointerMissed,
  onCreated,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  environment = 'none',
  environmentIntensity = 0.36,
  cameraFollowPrimary = false,
  orbitControlsProps,
  controlLayerKey = 'default',
  background = WORKSPACE_CANVAS_BACKGROUND,
  contextLostMessage,
}: WorkspaceCanvasProps) => {
  const effectiveTheme = useEffectiveTheme();
  const [contextLost, setContextLost] = useState(false);

  const finalOrbitControlsProps = useMemo<Partial<OrbitControlProps>>(
    () => ({
      makeDefault: true,
      enableDamping: false,
      ...orbitControlsProps,
    }),
    [orbitControlsProps]
  );

  const handleCreated = useCallback(
    (state: RootState) => {
      sceneRef && (sceneRef.current = state.scene);

      if (typeof window !== 'undefined' && import.meta.env.DEV) {
        (window as Window & { scene?: THREE.Scene; THREE?: typeof THREE }).scene = state.scene;
        (window as Window & { scene?: THREE.Scene; THREE?: typeof THREE }).THREE = THREE;
      }

      const canvas = state.gl.domElement;

      const handleContextLost = (event: Event) => {
        event.preventDefault();
        setContextLost(true);
      };

      const handleContextRestored = () => {
        setContextLost(false);
        state.invalidate();
      };

      canvas.addEventListener('webglcontextlost', handleContextLost, false);
      canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

      (canvas as HTMLCanvasElement & {
        __workspaceCanvasCleanup?: () => void;
      }).__workspaceCanvasCleanup = () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      };

      onCreated?.(state);
    },
    [onCreated, sceneRef]
  );

  useEffect(() => {
    return () => {
      const node = containerRef?.current?.querySelector('canvas') as
        | (HTMLCanvasElement & { __workspaceCanvasCleanup?: () => void })
        | null;
      node?.__workspaceCanvasCleanup?.();
    };
  }, [containerRef]);

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {overlays}
      <Canvas
        shadows
        frameloop="demand"
        camera={{ position: [2, 2, 2], up: [0, 0, 1], fov: 60 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: environment === 'hdr' ? 1.0 : 1.1,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={handleCreated}
        onPointerMissed={onPointerMissed}
      >
        <CanvasResizeSync />
        <color attach="background" args={[effectiveTheme === 'light' ? background.light : background.dark]} />
        <Suspense fallback={null}>
          {environment === 'hdr' && (
            <Environment files="/potsdamer_platz_1k.hdr" environmentIntensity={effectiveTheme === 'light' ? 0.8 : 1.0} />
          )}
          {environment === 'studio' && <NeutralStudioEnvironment intensity={environmentIntensity} />}
          <SceneLighting theme={effectiveTheme} cameraFollowPrimary={cameraFollowPrimary} />
          <SnapshotManager actionRef={snapshotAction} robotName={robotName} />
          {children}
          <ReferenceGrid theme={effectiveTheme} />
          <WorldOriginAxes />
          <OrbitControls key={`orbit-${controlLayerKey}`} {...finalOrbitControlsProps} />
          <GizmoHelper key={`gizmo-${controlLayerKey}`} alignment="bottom-right" margin={[68, 68]}>
            <GizmoViewport
              axisColors={['#ef4444', '#22c55e', '#3b82f6']}
              labelColor={effectiveTheme === 'light' ? '#0f172a' : 'white'}
              axisHeadScale={0.9}
              scale={34}
            />
          </GizmoHelper>
        </Suspense>
      </Canvas>

      {lang && <UsageGuide lang={lang} />}

      {contextLost && contextLostMessage && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border-black bg-panel-bg p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-system-blue border-t-transparent" />
            <p className="text-text-secondary">{contextLostMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
};
