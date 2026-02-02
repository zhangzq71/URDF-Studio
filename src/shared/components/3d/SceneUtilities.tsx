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

// Snapshot Manager for high-res capture without gizmos
export const SnapshotManager = ({
  actionRef,
  robotName
}: {
  actionRef?: React.MutableRefObject<(() => void) | null>;
  robotName: string;
}) => {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = () => {
      // 1. Capture current state
      const width = gl.domElement.clientWidth;
      const height = gl.domElement.clientHeight;
      const originalPixelRatio = gl.getPixelRatio();
      const originalSize = new THREE.Vector2();
      gl.getSize(originalSize);
      const originalBackground = scene.background;
      const originalFog = scene.fog;

      // 2. Hide Gizmos, Grid and Helpers
      const hiddenObjects: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if (obj.userData.isGizmo ||
          obj.name === 'ReferenceGrid' ||
          obj.type.includes('Grid') ||
          obj.type.includes('Helper') ||
          obj.type === 'AxesHelper' ||
          (obj as any).isTransformControls) {
          if (obj.visible) {
            obj.visible = false;
            hiddenObjects.push(obj);
          }
        }
      });

      // 3. Setup Studio Environment (Horizon & Ground)
      // Studio Color: Neutral soft grey for professional look
      const studioColor = new THREE.Color('#f5f5f7');
      
      scene.background = studioColor;
      scene.fog = new THREE.Fog(studioColor, 20, 100);

      // Create Infinite-looking Floor
      const groundGeo = new THREE.PlaneGeometry(1000, 1000);
      const groundMat = new THREE.MeshStandardMaterial({
        color: studioColor,
        roughness: 0.8,
        metalness: 0.1,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      // Align with Z-up system (XY plane is floor)
      ground.position.set(0, 0, -0.02);
      ground.receiveShadow = true;
      scene.add(ground);

      // 4. Enhance Lighting for Snapshot (Enable Shadows)
      const modifiedLights: { light: THREE.Light, originalCastShadow: boolean, originalBias: number, originalMapSize: THREE.Vector2 }[] = [];
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && obj.intensity > 0) {
          modifiedLights.push({
            light: obj,
            originalCastShadow: obj.castShadow,
            originalBias: obj.shadow.bias,
            originalMapSize: obj.shadow.mapSize.clone()
          });
          
          obj.castShadow = true;
          obj.shadow.mapSize.width = 4096; // High quality shadows
          obj.shadow.mapSize.height = 4096;
          obj.shadow.bias = -0.00005;
          // Update shadow map
          if (obj.shadow.map) obj.shadow.map.dispose();
          obj.shadow.map = null;
        }
      });

      // 5. High Res Render Configuration
      const scale = 3; // 3x resolution for high quality
      gl.setPixelRatio(1); // Reset pixel ratio to 1 for explicit sizing
      gl.setSize(width * scale, height * scale, false); // false = don't update style

      // 6. Render
      try {
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL('image/png', 1.0);

        // 7. Download
        const link = document.createElement('a');
        link.download = `${robotName}_snapshot.png`;
        link.href = dataUrl;
        link.click();
      } catch (e) {
        console.error('Snapshot render failed:', e);
      }

      // 8. Restore State
      // Restore Scene
      scene.remove(ground);
      groundGeo.dispose();
      groundMat.dispose();
      scene.background = originalBackground;
      scene.fog = originalFog;
      hiddenObjects.forEach(obj => obj.visible = true);

      // Restore Lights
      modifiedLights.forEach(({ light, originalCastShadow, originalBias, originalMapSize }) => {
        light.castShadow = originalCastShadow;
        light.shadow.bias = originalBias;
        light.shadow.mapSize.copy(originalMapSize);
        if (light.shadow.map) light.shadow.map.dispose();
        light.shadow.map = null;
      });

      // Restore Renderer
      gl.setPixelRatio(originalPixelRatio);
      gl.setSize(originalSize.x, originalSize.y, false);
      
      // Trigger a re-render to ensure UI is back to normal
      gl.render(scene, camera);
    };

    return () => {
      if (actionRef) actionRef.current = null;
    };
  }, [gl, scene, camera, robotName, actionRef]);

  return null;
};

// ============================================================
// SCENE LIGHTING CONFIGURATION
// 5-Point Lighting System for comprehensive robot illumination
// ============================================================
export const LIGHTING_CONFIG = {
  // Ambient: base global illumination (prevents pure black)
  ambientIntensity: 0.4,

  // Hemisphere: sky/ground color blend for natural ambient
  hemisphereIntensity: 0.35,
  hemisphereSky: '#ffffff',
  hemisphereGround: '#888888',

  // Main front light: front-right, reduced intensity to avoid overexposure
  mainLightIntensity: 0.4,
  mainLightPosition: [5, 5, 5] as [number, number, number],

  // Left front fill light: left-front to balance main light
  leftFillIntensity: 0.4,
  leftFillPosition: [-5, 5, 5] as [number, number, number],

  // Pure left side light: directly from left to illuminate left side
  leftSideIntensity: 0.35,
  leftSidePosition: [-6, 3, 0] as [number, number, number],

  // Right side fill light
  rightFillIntensity: 0.25,
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

    console.log(`[SceneLighting] Configured: ACESFilmic tone mapping, exposure ${gl.toneMappingExposure}, sRGB output`);
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
        position={LIGHTING_CONFIG.leftFillPosition}
        intensity={LIGHTING_CONFIG.leftFillIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* 3. Pure left side light - directly illuminates left side */}
      <directionalLight
        position={LIGHTING_CONFIG.leftSidePosition}
        intensity={LIGHTING_CONFIG.leftSideIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* 4. Right side fill light */}
      <directionalLight
        position={LIGHTING_CONFIG.rightFillPosition}
        intensity={LIGHTING_CONFIG.rightFillIntensity}
        color="#ffffff"
        castShadow={false}
      />

      {/* 5. Back rim light - edge highlighting */}
      <directionalLight
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
// ... existing code ...
      // Set low renderOrder so grid renders before collision meshes (renderOrder=999)
      gridRef.current.renderOrder = -100;
// ... existing code ...
      gridRef.current.traverse((child) => {
// ... existing code ...
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
