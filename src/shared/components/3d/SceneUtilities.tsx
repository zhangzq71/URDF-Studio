/**
 * Shared Scene Utilities
 * Used by both Visualizer.tsx and URDFViewer.tsx
 */

import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { Theme } from '@/types';

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

// Snapshot Manager - captures high-quality snapshot
export const SnapshotManager = ({
  actionRef,
  robotName
}: {
  actionRef?: React.MutableRefObject<(() => void) | null>;
  robotName: string;
}) => {
  // Use 'get' to access real-time state in callbacks (refs don't update when camera moves)
  const { gl, get, invalidate } = useThree();

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = () => {
      try {
        // Get real-time scene and camera from R3F store
        const { scene: currentScene, camera: currentCamera } = get();

        // 1. Determine Dimensions (High Resolution)
        const maxTextureSize = gl.capabilities.maxTextureSize || 4096;
        const scale = 2; // 2x resolution is usually sufficient and stable
        
        let width = gl.domElement.width;
        let height = gl.domElement.height;

        // Handle high-DPI displays where domElement size might be different from CSS size
        if (width === 0 || height === 0) {
            width = gl.domElement.clientWidth * gl.getPixelRatio();
            height = gl.domElement.clientHeight * gl.getPixelRatio();
        }

        // Clamp to safe limits
        width = Math.max(width, 1024);
        height = Math.max(height, 768);

        let renderWidth = width * scale;
        let renderHeight = height * scale;

        // Prevent exceeding GPU limits
        if (renderWidth > maxTextureSize || renderHeight > maxTextureSize) {
            const aspect = width / height;
            if (renderWidth > renderHeight) {
                renderWidth = maxTextureSize;
                renderHeight = Math.floor(maxTextureSize / aspect);
            } else {
                renderHeight = maxTextureSize;
                renderWidth = Math.floor(maxTextureSize * aspect);
            }
        }

        console.log(`[Snapshot] Capture size: ${renderWidth}x${renderHeight}`);

        // 2. Hide Grid and Helpers
        const hiddenNodes: THREE.Object3D[] = [];
        currentScene.traverse((node) => {
          if (
            (node.name === 'ReferenceGrid' || 
             node.type === 'AxesHelper' || 
             node.type === 'GridHelper' ||
             node.name?.includes('Gizmo') ||
             node.name?.includes('axis') ||
             node.userData?.isGizmo
            ) && node.visible
          ) {
            hiddenNodes.push(node);
            node.visible = false;
          }
        });

        // 3. Prepare for Transparent Capture
        const originalBackground = currentScene.background;
        currentScene.background = null; // Transparent background

        // 4. Create Off-screen Render Target
        const renderTarget = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          samples: 4, // MSAA
          colorSpace: THREE.SRGBColorSpace,
        });

        // Save Renderer State
        const originalRenderTarget = gl.getRenderTarget();
        const originalClearAlpha = gl.getClearAlpha();
        const originalClearColor = new THREE.Color();
        gl.getClearColor(originalClearColor);

        // 5. Render
        gl.setRenderTarget(renderTarget);
        gl.setClearColor(0x000000, 0); // Transparent clear

        // Force update matrices (fixes camera position not syncing in frameloop="demand" mode)
        currentCamera.updateMatrixWorld(true);
        currentScene.updateMatrixWorld(true);

        gl.render(currentScene, currentCamera);

        // 6. Read Pixels & Create Image
        const pixels = new Uint8Array(renderWidth * renderHeight * 4);
        gl.readRenderTargetPixels(renderTarget, 0, 0, renderWidth, renderHeight, pixels);

        // Flip Y (WebGL reads bottom-up) and draw to canvas
        const canvas = document.createElement('canvas');
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(renderWidth, renderHeight);
        
        // Optimize pixel flip
        const data = imageData.data;
        for (let y = 0; y < renderHeight; y++) {
          const srcRow = (renderHeight - 1 - y) * renderWidth * 4;
          const dstRow = y * renderWidth * 4;
          data.set(pixels.subarray(srcRow, srcRow + renderWidth * 4), dstRow);
        }
        ctx.putImageData(imageData, 0, 0);

        // 7. Download
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${robotName}_snapshot.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }, 'image/png');

        // 8. Restore State
        gl.setRenderTarget(originalRenderTarget);
        gl.setClearColor(originalClearColor, originalClearAlpha);
        renderTarget.dispose();
        
        currentScene.background = originalBackground;
        hiddenNodes.forEach(node => node.visible = true);
        
        // Force a re-render to ensure UI is back to normal
        invalidate();

      } catch (e) {
        console.error('[Snapshot] Failed:', e);
        // Emergency cleanup
        const { scene: errorScene } = get();
        const grid = errorScene.getObjectByName('ReferenceGrid');
        if (grid) grid.visible = true;
      }
    };

    return () => {
      if (actionRef) actionRef.current = null;
    };
  }, [gl, get, robotName, actionRef, invalidate]);

  return null;
};

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
} as const;

// Scene lighting setup for Z-up coordinate system
// 5-Point lighting for comprehensive robot illumination
export function SceneLighting({ theme = 'system' }: { theme?: Theme }) {
  const { scene, gl } = useThree();

  const effectiveTheme = theme === 'system' 
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  useEffect(() => {
    // Enable high-quality soft shadows
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.receiveShadow = true;

    // Configure tone mapping: ACESFilmicToneMapping for realistic color reproduction
    // Prevents overexposure on white parts while revealing detail in dark areas
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = effectiveTheme === 'light' ? 1.0 : 1.1; // Reduced exposure for light mode

    // Ensure proper sRGB output color space
    gl.outputColorSpace = THREE.SRGBColorSpace;

  }, [scene, gl, effectiveTheme]);

  return (
    <>
      {/* Ambient light - base global fill (prevents pure black shadows) */}
      <ambientLight intensity={effectiveTheme === 'light' ? 0.6 : LIGHTING_CONFIG.ambientIntensity} color="#ffffff" />

      {/* Hemisphere light - critical for 360° visibility
          White sky + grey ground ensures bottom surfaces are visible */}
      <hemisphereLight
        args={[
          LIGHTING_CONFIG.hemisphereSky,
          effectiveTheme === 'light' ? '#ffffff' : LIGHTING_CONFIG.hemisphereGround,
          effectiveTheme === 'light' ? 0.4 : LIGHTING_CONFIG.hemisphereIntensity
        ]}
        position={[0, 1, 0]}
      />

      {/* 1. Main front light - right-front 45° with shadows */}
      <directionalLight
        name="MainLight"
        position={LIGHTING_CONFIG.mainLightPosition}
        intensity={effectiveTheme === 'light' ? 0.5 : LIGHTING_CONFIG.mainLightIntensity}
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
        intensity={LIGHTING_CONFIG.leftFillIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* 3. Pure left side light - directly illuminates left side */}
      <directionalLight
        name="FillLightLeftSide"
        position={LIGHTING_CONFIG.leftSidePosition}
        intensity={LIGHTING_CONFIG.leftSideIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* 4. Right side fill light */}
      <directionalLight
        name="FillLightRight"
        position={LIGHTING_CONFIG.rightFillPosition}
        intensity={LIGHTING_CONFIG.rightFillIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* 5. Back rim light - edge highlighting */}
      <directionalLight
        name="RimLight"
        position={LIGHTING_CONFIG.rimLightPosition}
        intensity={LIGHTING_CONFIG.rimLightIntensity}
        color="#ffffff"
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
      position={[0, 0, -0.001]}
      receiveShadow={false}
    />
  );
}
