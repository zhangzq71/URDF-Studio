import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { Environment, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import type { Theme } from '@/types';
import type { Language } from '@/shared/i18n';
import {
  CanvasResizeSync,
  AdaptiveGroundPlane,
  NeutralStudioEnvironment,
  SceneLighting,
  SnapshotManager,
  useAdaptiveInteractionQuality,
  UsageGuide,
  WorkspaceOrbitControls,
  WORKSPACE_CANVAS_BACKGROUND,
  WORKSPACE_DEFAULT_CAMERA_FOV,
  WORKSPACE_DEFAULT_CAMERA_POSITION,
  WORKSPACE_DEFAULT_CAMERA_UP,
  WorldOriginAxes,
} from '@/shared/components/3d';
import type { WorkspaceOrbitControlsProps } from '@/shared/components/3d/scene/WorkspaceOrbitControls';
import { useEffectiveTheme } from '@/shared/hooks';
import { attachContextMenuBlocker } from '@/shared/utils';

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
  onPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>;
  onCreated?: (state: RootState) => void;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  environment?: 'hdr' | 'studio' | 'none';
  environmentIntensity?: number;
  cameraFollowPrimary?: boolean;
  orbitControlsProps?: Partial<WorkspaceOrbitControlsProps>;
  controlLayerKey?: string;
  background?: {
    light: string;
    dark: string;
  };
  contextLostMessage?: string;
  showWorldOriginAxes?: boolean;
  showUsageGuide?: boolean;
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
  onPointerDownCapture,
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
  showWorldOriginAxes = true,
  showUsageGuide = true,
}: WorkspaceCanvasProps) => {
  const effectiveTheme = useEffectiveTheme();
  const [contextLost, setContextLost] = useState(false);
  const contextMenuCleanupRef = useRef<(() => void) | null>(null);
  const {
    dpr,
    isInteracting,
    beginInteraction,
    endInteraction,
    pulseInteraction,
  } = useAdaptiveInteractionQuality();

  const finalOrbitControlsProps = useMemo<Partial<WorkspaceOrbitControlsProps>>(
    () => ({
      enableDamping: false,
      ...orbitControlsProps,
      onStart: () => {
        beginInteraction();
        orbitControlsProps?.onStart?.();
      },
      onEnd: () => {
        endInteraction();
        orbitControlsProps?.onEnd?.();
      },
    }),
    [beginInteraction, endInteraction, orbitControlsProps]
  );

  const handleCreated = useCallback(
    (state: RootState) => {
      sceneRef && (sceneRef.current = state.scene);

      if (typeof window !== 'undefined' && import.meta.env.DEV) {
        (window as Window & { scene?: THREE.Scene; THREE?: typeof THREE }).scene = state.scene;
        (window as Window & { scene?: THREE.Scene; THREE?: typeof THREE }).THREE = THREE;
      }

      const canvas = state.gl.domElement;
      const surfaceEventTarget = canvas.parentElement ?? canvas;

      contextMenuCleanupRef.current?.();
      const cleanupCanvasBlocker = attachContextMenuBlocker(canvas);
      const cleanupSurfaceBlocker = surfaceEventTarget === canvas
        ? () => {}
        : attachContextMenuBlocker(surfaceEventTarget);
      contextMenuCleanupRef.current = () => {
        cleanupSurfaceBlocker();
        cleanupCanvasBlocker();
      };

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
        contextMenuCleanupRef.current?.();
        contextMenuCleanupRef.current = null;
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
      contextMenuCleanupRef.current?.();
      contextMenuCleanupRef.current = null;
    };
  }, [containerRef]);

  const handlePointerDownCapture = useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      beginInteraction();
      onPointerDownCapture?.(event);
    },
    [beginInteraction, onPointerDownCapture]
  );

  const handleMouseMove = useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.buttons !== 0) {
        beginInteraction();
      }
      onMouseMove?.(event);
    },
    [beginInteraction, onMouseMove]
  );

  const handleMouseUp = useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (event) => {
      endInteraction();
      onMouseUp?.(event);
    },
    [endInteraction, onMouseUp]
  );

  const handleMouseLeave = useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (event) => {
      endInteraction(0);
      onMouseLeave?.(event);
    },
    [endInteraction, onMouseLeave]
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: 'none', userSelect: 'none' }}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={() => endInteraction()}
      onPointerLeave={() => endInteraction(0)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheelCapture={() => pulseInteraction()}
      onContextMenuCapture={(event) => event.preventDefault()}
    >
      {overlays}
      <Canvas
        dpr={dpr}
        shadows
        frameloop="demand"
        camera={{
          position: WORKSPACE_DEFAULT_CAMERA_POSITION,
          up: WORKSPACE_DEFAULT_CAMERA_UP,
          fov: WORKSPACE_DEFAULT_CAMERA_FOV,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: environment === 'hdr' ? 1.0 : 1.1,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={handleCreated}
        onPointerMissed={onPointerMissed}
        translate="no"
      >
        <CanvasResizeSync />
        <color attach="background" args={[effectiveTheme === 'light' ? background.light : background.dark]} />
        <Suspense fallback={null}>
          {environment === 'hdr' && (
            <Environment files="/potsdamer_platz_1k.hdr" environmentIntensity={effectiveTheme === 'light' ? 0.8 : 1.0} />
          )}
          {environment === 'studio' && <NeutralStudioEnvironment intensity={environmentIntensity} />}
          <SceneLighting
            theme={effectiveTheme}
            cameraFollowPrimary={cameraFollowPrimary}
            // Viewer orbiting should not toggle shadows on/off. The delayed
            // re-enable causes a visible flash on dense models like Unitree B2.
            enableShadows={cameraFollowPrimary ? true : !isInteracting}
          />
          <SnapshotManager actionRef={snapshotAction} robotName={robotName} />
          {children}
          <AdaptiveGroundPlane theme={effectiveTheme} />
          {showWorldOriginAxes && <WorldOriginAxes />}
          <WorkspaceOrbitControls key={`orbit-${controlLayerKey}`} {...finalOrbitControlsProps} />
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

      {lang && showUsageGuide ? <UsageGuide lang={lang} /> : null}

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
