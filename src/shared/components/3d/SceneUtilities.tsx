/**
 * Shared Scene Utilities
 * Used by both Visualizer.tsx and URDFViewer.tsx
 */

import React, { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Theme } from '@/types';
import { useUIStore } from '@/store';

// Helper component to trigger re-render on pointer move for hover detection (frameloop="demand")
// Optimized to reduce unnecessary invalidations and CPU usage
export const HoverInvalidator = () => {
  const { gl, invalidate } = useThree();
  const isOrbitDragging = useRef(false);
  const lastMoveTime = useRef(0);
  const invalidateThrottle = 50; // Throttle to 20 FPS for hover updates

  useEffect(() => {
    const handlePointerMove = () => {
      // Skip invalidation during orbit dragging to improve performance
      if (isOrbitDragging.current) return;

      // Throttle invalidate calls to reduce CPU usage
      const now = Date.now();
      if (now - lastMoveTime.current > invalidateThrottle) {
        lastMoveTime.current = now;
        invalidate();
      }
    };

    const handlePointerDown = () => {
      isOrbitDragging.current = true;
    };

    const handlePointerUp = () => {
      isOrbitDragging.current = false;
      invalidate();
    };

    gl.domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    gl.domElement.addEventListener('pointerdown', handlePointerDown);
    gl.domElement.addEventListener('pointerup', handlePointerUp);
    gl.domElement.addEventListener('pointerleave', handlePointerUp);

    return () => {
      gl.domElement.removeEventListener('pointermove', handlePointerMove);
      gl.domElement.removeEventListener('pointerdown', handlePointerDown);
      gl.domElement.removeEventListener('pointerup', handlePointerUp);
      gl.domElement.removeEventListener('pointerleave', handlePointerUp);
    };
  }, [gl, invalidate]);

  return null;
};

// Keep Canvas responsive during layout width/height transitions (e.g. sidebar collapse)
export const CanvasResizeSync = ({ transitionMs = 260 }: { transitionMs?: number }) => {
  const { gl, setSize, invalidate, setFrameloop } = useThree();
  const loopFrameRef = useRef<number | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const appliedBufferSizeRef = useRef({ width: 0, height: 0 });
  const pendingBufferSizeRef = useRef<{ width: number; height: number } | null>(null);
  const restoreFrameLoopTimerRef = useRef<number | null>(null);
  const lastResizeAtRef = useRef(0);

  const beginSmoothResize = useCallback(() => {
    setFrameloop('always');
    if (restoreFrameLoopTimerRef.current !== null) {
      clearTimeout(restoreFrameLoopTimerRef.current);
    }
    restoreFrameLoopTimerRef.current = window.setTimeout(() => {
      setFrameloop('demand');
      invalidate();
      restoreFrameLoopTimerRef.current = null;
    }, transitionMs + 120);
  }, [setFrameloop, transitionMs, invalidate]);

  const syncCanvasSize = useCallback(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return false;

    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width <= 0 || height <= 0) return false;

    const canvas = gl.domElement;
    const widthPx = `${width}px`;
    const heightPx = `${height}px`;
    const styleChanged = canvas.style.width !== widthPx || canvas.style.height !== heightPx;
    if (styleChanged) {
      canvas.style.width = widthPx;
      canvas.style.height = heightPx;
    }

    let sizeChanged = false;
    if (width !== lastSizeRef.current.width || height !== lastSizeRef.current.height) {
      lastSizeRef.current = { width, height };
      pendingBufferSizeRef.current = { width, height };
      sizeChanged = true;
    }

    const changed = styleChanged || sizeChanged;
    if (changed) invalidate();
    return changed;
  }, [gl, setSize, invalidate]);

  const flushPendingBufferSize = useCallback(() => {
    const pending = pendingBufferSizeRef.current;
    if (!pending) return false;

    const { width, height } = pending;
    const applied = appliedBufferSizeRef.current;
    if (width === applied.width && height === applied.height) {
      pendingBufferSizeRef.current = null;
      return false;
    }

    gl.setSize(width, height, false);
    setSize(width, height);
    appliedBufferSizeRef.current = { width, height };
    pendingBufferSizeRef.current = null;
    invalidate();
    return true;
  }, [gl, setSize, invalidate]);

  useLayoutEffect(() => {
    syncCanvasSize();
    flushPendingBufferSize();

    const loop = () => {
      const now = performance.now();
      const changed = syncCanvasSize();
      if (changed) {
        lastResizeAtRef.current = now;
        beginSmoothResize();
      } else if (now - lastResizeAtRef.current > 80) {
        flushPendingBufferSize();
      }

      if (now - lastResizeAtRef.current < transitionMs + 80) {
        invalidate();
      }
      loopFrameRef.current = requestAnimationFrame(loop);
    };

    loopFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (loopFrameRef.current !== null) {
        cancelAnimationFrame(loopFrameRef.current);
        loopFrameRef.current = null;
      }
      if (restoreFrameLoopTimerRef.current !== null) {
        clearTimeout(restoreFrameLoopTimerRef.current);
        restoreFrameLoopTimerRef.current = null;
      }
      flushPendingBufferSize();
      setFrameloop('demand');
    };
  }, [syncCanvasSize, flushPendingBufferSize, transitionMs, setFrameloop, beginSmoothResize, invalidate]);

  return null;
};

// Snapshot Manager - captures a clean studio-style snapshot using the live canvas pipeline
export const SnapshotManager = ({
  actionRef,
  robotName
}: {
  actionRef?: React.MutableRefObject<(() => void) | null>;
  robotName: string;
}) => {
  const SNAPSHOT_MIN_LONG_EDGE = 3840;
  const { gl, get, invalidate } = useThree();
  const groundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);
  const pendingCaptureRef = useRef<number | null>(null);
  const restoreSnapshotStateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!actionRef) return;

    const clearPendingFrames = () => {
      if (pendingCaptureRef.current !== null) {
        cancelAnimationFrame(pendingCaptureRef.current);
        pendingCaptureRef.current = null;
      }
    };

    const restoreSnapshotState = () => {
      if (!restoreSnapshotStateRef.current) return;
      restoreSnapshotStateRef.current();
      restoreSnapshotStateRef.current = null;
    };

    const shouldHideInSnapshot = (node: THREE.Object3D) => (
      node.name === 'ReferenceGrid'
      || node.type === 'GridHelper'
    );

    const applySnapshotState = (scene: THREE.Scene) => {
      const hiddenNodes: THREE.Object3D[] = [];
      scene.traverse((node) => {
        if (shouldHideInSnapshot(node) && node.visible) {
          hiddenNodes.push(node);
          node.visible = false;
        }
      });

      const hasGround = !!scene.getObjectByName('ReferenceGround');
      let floorGeometry: THREE.PlaneGeometry | null = null;
      let floorMaterial: THREE.MeshStandardMaterial | null = null;
      let floorMesh: THREE.Mesh | null = null;

      if (!hasGround) {
        floorGeometry = new THREE.PlaneGeometry(400, 400);
        floorMaterial = new THREE.MeshStandardMaterial({
          color: '#f4f6f8',
          roughness: 0.97,
          metalness: 0,
          envMapIntensity: 0.2,
        });
        floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.name = 'SnapshotGround';
        floorMesh.rotation.set(Math.PI / 2, 0, 0);
        floorMesh.position.set(0, 0, groundPlaneOffset - 0.002);
        floorMesh.receiveShadow = true;
        floorMesh.renderOrder = -120;
        scene.add(floorMesh);
      }

      return () => {
        hiddenNodes.forEach((node) => { node.visible = true; });
        if (floorMesh && floorGeometry && floorMaterial) {
          scene.remove(floorMesh);
          floorGeometry.dispose();
          floorMaterial.dispose();
        }
      };
    };

    const resolveSnapshotSize = (canvas: HTMLCanvasElement) => {
      const currentSize = gl.getSize(new THREE.Vector2());
      const baseWidth = Math.max(1, Math.round(canvas.clientWidth || currentSize.x || 1));
      const baseHeight = Math.max(1, Math.round(canvas.clientHeight || currentSize.y || 1));
      const longEdge = Math.max(baseWidth, baseHeight);
      const scale = longEdge >= SNAPSHOT_MIN_LONG_EDGE ? 1 : SNAPSHOT_MIN_LONG_EDGE / longEdge;
      return {
        baseWidth,
        baseHeight,
        targetWidth: Math.max(1, Math.round(baseWidth * scale)),
        targetHeight: Math.max(1, Math.round(baseHeight * scale)),
      };
    };

    const downloadCanvas = (canvas: HTMLCanvasElement, onDone?: () => void) => {
      const safeRobotName = (robotName || 'robot').replace(/[\\/:*?"<>|]/g, '_');
      const now = new Date();
      const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '_',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      const filename = `${safeRobotName}_snapshot_${timestamp}.png`;

      const downloadBlob = (blob: Blob | null) => {
        if (!blob) {
          console.error('[Snapshot] Failed to generate PNG blob.');
          onDone?.();
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        onDone?.();
      };

      if (canvas.toBlob) {
        canvas.toBlob(downloadBlob, 'image/png');
        return;
      }

      // Legacy fallback
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onDone?.();
    };

    const renderAndDownloadHighRes = (onDone?: () => void) => {
      const canvas = gl.domElement;
      const { scene, camera } = get();
      const { baseWidth, baseHeight, targetWidth, targetHeight } = resolveSnapshotSize(canvas);
      const originalPixelRatio = gl.getPixelRatio();
      const originalAutoClear = gl.autoClear;
      const originalXREnabled = gl.xr.enabled;

      const restoreRendererState = () => {
        gl.xr.enabled = originalXREnabled;
        gl.autoClear = originalAutoClear;
        gl.setPixelRatio(originalPixelRatio);
        gl.setSize(baseWidth, baseHeight, false);
      };

      try {
        // Render with the exact same live scene/camera/renderer settings, only with higher buffer resolution.
        gl.xr.enabled = false;
        gl.autoClear = true;
        gl.setPixelRatio(1);
        gl.setSize(targetWidth, targetHeight, false);
        gl.clear(true, true, true);
        gl.render(scene, camera);

        downloadCanvas(canvas, () => {
          restoreRendererState();
          onDone?.();
        });
      } catch (e) {
        restoreRendererState();
        throw e;
      }
    };

    const waitFrames = (count: number, onDone: () => void) => {
      if (count <= 0) {
        onDone();
        return;
      }
      pendingCaptureRef.current = requestAnimationFrame(() => {
        pendingCaptureRef.current = null;
        waitFrames(count - 1, onDone);
      });
    };

    actionRef.current = () => {
      try {
        clearPendingFrames();
        // Flush demand-mode updates, then render a high-resolution frame from the same live pipeline.
        invalidate();
        waitFrames(2, () => {
          try {
            const { scene } = get();
            restoreSnapshotState();
            restoreSnapshotStateRef.current = applySnapshotState(scene);
            renderAndDownloadHighRes(() => {
              restoreSnapshotState();
              invalidate();
            });
          } catch (e) {
            console.error('[Snapshot] Failed:', e);
            restoreSnapshotState();
            invalidate();
          }
        });
      } catch (e) {
        console.error('[Snapshot] Failed:', e);
        restoreSnapshotState();
        invalidate();
      }
    };

    return () => {
      clearPendingFrames();
      restoreSnapshotState();
      if (actionRef) actionRef.current = null;
    };
  }, [gl, get, robotName, actionRef, invalidate, groundPlaneOffset]);

  return null;
};

// Neutral studio environment to provide non-yellow reflections.
// Useful when we want nicer material response without HDR color cast.
export function NeutralStudioEnvironment({
  enabled = true,
  intensity = 0.35,
}: {
  enabled?: boolean;
  intensity?: number;
}) {
  const { scene, gl } = useThree();

  useEffect(() => {
    if (!enabled) return;

    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = (scene as any).environmentIntensity;
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const renderTarget = pmremGenerator.fromScene(envScene, 0.05);
    scene.environment = renderTarget.texture;
    (scene as any).environmentIntensity = intensity;

    return () => {
      scene.environment = previousEnvironment;
      (scene as any).environmentIntensity = previousEnvironmentIntensity;
      renderTarget.dispose();
      envScene.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: THREE.Material) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      pmremGenerator.dispose();
    };
  }, [scene, gl, enabled, intensity]);

  return null;
}

// ============================================================
// SCENE LIGHTING CONFIGURATION
// 5-Point Lighting System for comprehensive robot illumination
// ============================================================
export const LIGHTING_CONFIG = {
  // Ambient: increased for softer look
  ambientIntensity: 0.5,

  // Hemisphere: softer sky/ground blend
  hemisphereIntensity: 0.4,
  hemisphereSky: '#ffffff',
  hemisphereGround: '#d4d4d8', // Light gray ground

  // Main front light: reduced intensity, balanced
  mainLightIntensity: 0.5,
  mainLightPosition: [5, 5, 5] as [number, number, number],

  // Left front fill light: left-front to balance main light
  leftFillIntensity: 0.4,
  leftFillPosition: [-5, 5, 5] as [number, number, number],

  // Pure left side light: directly from left to illuminate left side
  leftSideIntensity: 0.3,
  leftSidePosition: [-6, 3, 0] as [number, number, number],

  // Right side fill light
  rightFillIntensity: 0.3,
  rightFillPosition: [5, 3, -3] as [number, number, number],

  // Back rim light: edge highlighting
  rimLightIntensity: 0.3,
  rimLightPosition: [0, 5, -5] as [number, number, number],

  // Camera-following key light: keeps the currently viewed face readable
  cameraKeyIntensityLight: 0.45,
  cameraKeyIntensityDark: 0.35,
  cameraKeyPriorityIntensityLight: 0.9,
  cameraKeyPriorityIntensityDark: 0.82,
  cameraFillIntensityLight: 0.32,
  cameraFillIntensityDark: 0.28,
  cameraSoftFrontIntensityLight: 0.48,
  cameraSoftFrontIntensityDark: 0.42,
} as const;

// Scene lighting setup for Z-up coordinate system
// 5-Point lighting for comprehensive robot illumination
export function SceneLighting({
  theme = 'system',
  cameraFollowPrimary = false,
}: {
  theme?: Theme;
  cameraFollowPrimary?: boolean;
}) {
  const { scene, gl } = useThree();
  const cameraKeyLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraSoftFrontLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraFillRightLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraFillLeftLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraDirectionRef = useRef(new THREE.Vector3());
  const cameraTargetRef = useRef(new THREE.Vector3());
  const cameraRightRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());

  const effectiveTheme = theme === 'system' 
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  const staticDirectionalScale = cameraFollowPrimary ? 0.72 : 1;
  const rimDirectionalScale = cameraFollowPrimary ? 0.18 : staticDirectionalScale;
  const ambientIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light' ? 0.3 : 0.34)
    : (effectiveTheme === 'light' ? 0.6 : LIGHTING_CONFIG.ambientIntensity);
  const hemisphereIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light' ? 0.3 : 0.34)
    : (effectiveTheme === 'light' ? 0.4 : LIGHTING_CONFIG.hemisphereIntensity);
  const cameraKeyIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light'
      ? LIGHTING_CONFIG.cameraKeyPriorityIntensityLight
      : LIGHTING_CONFIG.cameraKeyPriorityIntensityDark)
    : (effectiveTheme === 'light'
      ? LIGHTING_CONFIG.cameraKeyIntensityLight
      : LIGHTING_CONFIG.cameraKeyIntensityDark);
  const cameraFillIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light'
      ? LIGHTING_CONFIG.cameraFillIntensityLight
      : LIGHTING_CONFIG.cameraFillIntensityDark)
    : 0;
  const cameraSoftFrontIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light'
      ? LIGHTING_CONFIG.cameraSoftFrontIntensityLight
      : LIGHTING_CONFIG.cameraSoftFrontIntensityDark)
    : 0;

  useEffect(() => {
    // Enable high-quality soft shadows
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.receiveShadow = true;

    // Configure tone mapping: ACESFilmicToneMapping for realistic color reproduction
    // Prevents overexposure on white parts while revealing detail in dark areas
    gl.toneMapping = cameraFollowPrimary ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = cameraFollowPrimary
      ? (effectiveTheme === 'light' ? 1.02 : 1.06)
      : (effectiveTheme === 'light' ? 1.0 : 1.1);

    // Ensure proper sRGB output color space
    gl.outputColorSpace = THREE.SRGBColorSpace;

  }, [scene, gl, effectiveTheme, cameraFollowPrimary]);

  useEffect(() => {
    const keyLight = cameraKeyLightRef.current;
    const softFrontLight = cameraSoftFrontLightRef.current;
    const fillRightLight = cameraFillRightLightRef.current;
    const fillLeftLight = cameraFillLeftLightRef.current;
    if (!keyLight || !softFrontLight || !fillRightLight || !fillLeftLight) return;

    scene.add(keyLight.target);
    scene.add(softFrontLight.target);
    scene.add(fillRightLight.target);
    scene.add(fillLeftLight.target);
    return () => {
      scene.remove(keyLight.target);
      scene.remove(softFrontLight.target);
      scene.remove(fillRightLight.target);
      scene.remove(fillLeftLight.target);
    };
  }, [scene]);

  useFrame(({ camera }) => {
    const keyLight = cameraKeyLightRef.current;
    const softFrontLight = cameraSoftFrontLightRef.current;
    const fillRightLight = cameraFillRightLightRef.current;
    const fillLeftLight = cameraFillLeftLightRef.current;
    if (!keyLight || !softFrontLight || !fillRightLight || !fillLeftLight) return;

    camera.getWorldDirection(cameraDirectionRef.current);
    cameraTargetRef.current.copy(camera.position).addScaledVector(cameraDirectionRef.current, 10);

    keyLight.position.copy(camera.position);
    keyLight.target.position.copy(cameraTargetRef.current);
    keyLight.target.updateMatrixWorld();
    softFrontLight.position.copy(camera.position).addScaledVector(
      cameraUpRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion),
      0.9,
    );
    softFrontLight.target.position.copy(cameraTargetRef.current);
    softFrontLight.target.updateMatrixWorld();

    cameraRightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    cameraUpRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    fillRightLight.position.copy(camera.position)
      .addScaledVector(cameraRightRef.current, 3.0)
      .addScaledVector(cameraUpRef.current, 1.6);
    fillRightLight.target.position.copy(cameraTargetRef.current);
    fillRightLight.target.updateMatrixWorld();

    fillLeftLight.position.copy(camera.position)
      .addScaledVector(cameraRightRef.current, -3.0)
      .addScaledVector(cameraUpRef.current, 1.6);
    fillLeftLight.target.position.copy(cameraTargetRef.current);
    fillLeftLight.target.updateMatrixWorld();
  });

  return (
    <>
      {/* Ambient light - base global fill (prevents pure black shadows) */}
      <ambientLight intensity={ambientIntensity} color="#ffffff" />

      {/* Hemisphere light - critical for 360° visibility
          White sky + grey ground ensures bottom surfaces are visible */}
      <hemisphereLight
        args={[
          LIGHTING_CONFIG.hemisphereSky,
          effectiveTheme === 'light' ? '#ffffff' : LIGHTING_CONFIG.hemisphereGround,
          hemisphereIntensity
        ]}
        position={[0, 1, 0]}
      />

      {/* 1. Main front light - right-front 45° with shadows */}
      <directionalLight
        name="MainLight"
        position={LIGHTING_CONFIG.mainLightPosition}
        intensity={(effectiveTheme === 'light' ? 0.5 : LIGHTING_CONFIG.mainLightIntensity) * staticDirectionalScale}
        color="#ffffff"
        castShadow={effectiveTheme !== 'light'} // Disable shadows in light mode to fix artifacts
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />

      {/* 2. Left front fill light */}
      <directionalLight
        name="FillLightLeft"
        position={LIGHTING_CONFIG.leftFillPosition}
        intensity={LIGHTING_CONFIG.leftFillIntensity * staticDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      {/* 3. Pure left side light - directly illuminates left side */}
      <directionalLight
        name="FillLightLeftSide"
        position={LIGHTING_CONFIG.leftSidePosition}
        intensity={LIGHTING_CONFIG.leftSideIntensity * staticDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      {/* 4. Right side fill light */}
      <directionalLight
        name="FillLightRight"
        position={LIGHTING_CONFIG.rightFillPosition}
        intensity={LIGHTING_CONFIG.rightFillIntensity * staticDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      {/* 5. Back rim light - edge highlighting */}
      <directionalLight
        name="RimLight"
        position={LIGHTING_CONFIG.rimLightPosition}
        intensity={LIGHTING_CONFIG.rimLightIntensity * rimDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      {/* Camera-following key light for detail readability */}
      <directionalLight
        ref={cameraKeyLightRef}
        name="CameraKeyLight"
        position={[0, 0, 0]}
        intensity={cameraKeyIntensity}
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight
        ref={cameraSoftFrontLightRef}
        name="CameraSoftFrontLight"
        position={[0, 0, 0]}
        intensity={cameraSoftFrontIntensity}
        color="#f7f9ff"
        castShadow={false}
      />
      <directionalLight
        ref={cameraFillRightLightRef}
        name="CameraFillLightRight"
        position={[0, 0, 0]}
        intensity={cameraFillIntensity}
        color="#f5f7ff"
        castShadow={false}
      />
      <directionalLight
        ref={cameraFillLeftLightRef}
        name="CameraFillLightLeft"
        position={[0, 0, 0]}
        intensity={cameraFillIntensity}
        color="#f5f7ff"
        castShadow={false}
      />
    </>
  );
}

// ============================================================
// REFERENCE GRID WITH LOW RENDER ORDER
// Ensures grid renders before transparent collision meshes
// ============================================================
interface ReferenceGridProps {
  theme: Theme;
}

export function ReferenceGrid({ theme }: ReferenceGridProps) {
  const gridRef = useRef<THREE.Object3D>(null);
  const groundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);

  const effectiveTheme = theme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  useEffect(() => {
    if (gridRef.current) {
      // Set low renderOrder so grid renders before collision meshes (renderOrder=999)
      gridRef.current.renderOrder = -100;

      // Ensure all children also inherit this
      gridRef.current.traverse((child) => {
        child.renderOrder = -100;
      });
    }
  }, []);

  return (
    <Grid
      ref={gridRef as any}
      name="ReferenceGrid"
      infiniteGrid
      fadeDistance={100}
      sectionSize={1}
      cellSize={0.1}
      sectionThickness={1.5}
      cellThickness={0.5}
      cellColor={effectiveTheme === 'light' ? '#e2e8f0' : '#444444'}
      sectionColor={effectiveTheme === 'light' ? '#cbd5e1' : '#555555'}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, groundPlaneOffset - 0.001]}
      receiveShadow={false}
    />
  );
}
