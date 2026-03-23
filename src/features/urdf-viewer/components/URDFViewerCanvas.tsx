import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import type { Language } from '@/shared/i18n';
import {
  CanvasResizeSync,
  GroundShadowPlane,
  NeutralStudioEnvironment,
  ReferenceGrid,
  SceneLighting,
  SnapshotManager,
  UsageGuide,
  WorkspaceOrbitControls,
  WORKSPACE_CANVAS_BACKGROUND,
  WORKSPACE_DEFAULT_CAMERA_FOV,
  WORKSPACE_DEFAULT_CAMERA_POSITION,
  WORKSPACE_DEFAULT_CAMERA_UP,
  WorldOriginAxes,
} from '@/shared/components/3d';
import { attachContextMenuBlocker } from '@/shared/utils';

interface URDFViewerCanvasProps {
  lang: Language;
  resolvedTheme?: 'light' | 'dark';
  groundOffset?: number;
  snapshotAction?: RefObject<(() => void) | null>;
  robotName?: string;
  orbitEnabled: boolean;
  onOrbitStart?: () => void;
  onOrbitEnd?: () => void;
  onPointerMissed?: () => void;
  contextLostMessage: string;
  showUsageGuide?: boolean;
  children: ReactNode;
}

export const URDFViewerCanvas = memo(function URDFViewerCanvas({
  lang,
  resolvedTheme = 'light',
  groundOffset = 0,
  snapshotAction,
  robotName = 'robot',
  orbitEnabled,
  onOrbitStart,
  onOrbitEnd,
  onPointerMissed,
  contextLostMessage,
  showUsageGuide = true,
  children,
}: URDFViewerCanvasProps) {
  const [contextLost, setContextLost] = useState(false);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContextMenuCleanupRef = useRef<(() => void) | null>(null);
  const environmentIntensity = resolvedTheme === 'light' ? 0.24 : 0.22;

  const handleCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement;
    canvasElementRef.current = canvas;
    canvasContextMenuCleanupRef.current?.();
    canvasContextMenuCleanupRef.current = attachContextMenuBlocker(canvas);

    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      (window as Window & { scene?: THREE.Scene; THREE?: typeof THREE }).scene = state.scene;
      (window as Window & { scene?: THREE.Scene; THREE?: typeof THREE }).THREE = THREE;
    }

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

    (canvas as HTMLCanvasElement & { __urdfViewerCanvasCleanup?: () => void }).__urdfViewerCanvasCleanup = () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      canvasContextMenuCleanupRef.current?.();
      canvasContextMenuCleanupRef.current = null;
    };
  }, []);

  const handleContextMenuCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    return () => {
      const canvas = canvasElementRef.current as
        | (HTMLCanvasElement & { __urdfViewerCanvasCleanup?: () => void })
        | null;
      canvas?.__urdfViewerCanvasCleanup?.();
      canvasContextMenuCleanupRef.current?.();
      canvasContextMenuCleanupRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full" style={{ touchAction: 'none', userSelect: 'none' }} onContextMenuCapture={handleContextMenuCapture}>
      <Canvas
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
          toneMappingExposure: 1.1,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={handleCreated}
        onPointerMissed={() => {
          if (!contextLost) {
            onPointerMissed?.();
          }
        }}
        translate="no"
      >
        <CanvasResizeSync />
        <color
          attach="background"
          args={[resolvedTheme === 'light' ? WORKSPACE_CANVAS_BACKGROUND.light : WORKSPACE_CANVAS_BACKGROUND.dark]}
        />
        <Suspense fallback={null}>
          <NeutralStudioEnvironment intensity={environmentIntensity} />
          <SceneLighting theme={resolvedTheme} cameraFollowPrimary />
          <SnapshotManager actionRef={snapshotAction} robotName={robotName} />
          {children}
          <GroundShadowPlane theme={resolvedTheme} groundOffset={groundOffset} />
          <ReferenceGrid theme={resolvedTheme} groundOffset={groundOffset} />
          <WorldOriginAxes />
          <WorkspaceOrbitControls enabled={orbitEnabled} onStart={onOrbitStart} onEnd={onOrbitEnd} />
          <GizmoHelper alignment="bottom-right" margin={[68, 68]}>
            <GizmoViewport
              axisColors={['#ef4444', '#22c55e', '#3b82f6']}
              labelColor={resolvedTheme === 'light' ? '#0f172a' : 'white'}
              axisHeadScale={0.9}
              scale={34}
            />
          </GizmoHelper>
        </Suspense>
      </Canvas>

      {showUsageGuide ? <UsageGuide lang={lang} /> : null}

      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border-black bg-panel-bg p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-system-blue border-t-transparent" />
            <p className="text-text-secondary">{contextLostMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
});
