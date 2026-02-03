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
      // Studio Color: Pure white for Fusion 360 style clean look
      const studioColor = new THREE.Color('#ffffff');
      const fogColor = new THREE.Color('#ffffff');
      
      scene.background = studioColor;
      // Soft fog to blend floor into background (infinite studio look)
      scene.fog = new THREE.Fog(fogColor, 5, 50);

      // Create Infinite-looking Floor (Fusion 360 style)
      const groundGeo = new THREE.PlaneGeometry(1000, 1000);
      const groundMat = new THREE.MeshStandardMaterial({
        color: studioColor,
        roughness: 0.45, // Semi-gloss floor
        metalness: 0.1,  // Slight reflectivity
        envMapIntensity: 1.0,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      // Align with Z-up system (XY plane is floor)
      ground.position.set(0, 0, -0.02);
      ground.receiveShadow = true;
      scene.add(ground);

      // 4. Enhance Lighting for Snapshot (Enable Shadows)
      // Only enable shadows for the main light to avoid multi-shadow artifacts and VRAM issues
      const modifiedLights: { light: THREE.Light, originalCastShadow: boolean, originalBias: number, originalMapSize: THREE.Vector2 }[] = [];
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && obj.intensity > 0) {
          // Heuristic to identify Main Light (pos: 5,5,5) or similar key lights
          // Avoid enabling shadows on fill lights (negative X or Z)
          const isMainLight = obj.position.x > 1 && obj.position.y > 0 && obj.position.z > 0;

          if (isMainLight) {
            modifiedLights.push({
              light: obj,
              originalCastShadow: obj.castShadow,
              originalBias: obj.shadow.bias,
              originalMapSize: obj.shadow.mapSize.clone()
            });
            
            obj.castShadow = true;
            obj.shadow.mapSize.width = 2048; // Standard high quality
            obj.shadow.mapSize.height = 2048;
            obj.shadow.bias = -0.00005;
            obj.shadow.radius = 4; // Soft shadows
            
            // Force update shadow map
            if (obj.shadow.map) {
              obj.shadow.map.dispose();
              obj.shadow.map = null;
            }
          }
        }
      });

      // 5. High Res Render Configuration
      const snapshotScale = 2; // 2x scale (Retina quality) is safe and high-res
      gl.setPixelRatio(snapshotScale);
      gl.setSize(width, height, false);

      // Define restore function
      const restoreState = () => {
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
        console.log('[Snapshot] State restored');
      };

      // 6. Render & Download
      try {
        console.log('[Snapshot] Rendering scene...');
        gl.render(scene, camera);
        
        console.log('[Snapshot] Generating blob...');
        gl.domElement.toBlob((blob) => {
          if (blob) {
            console.log(`[Snapshot] Blob generated: ${blob.size} bytes`);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${robotName}_snapshot.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
          } else {
            console.error('[Snapshot] Blob is null, attempting DataURL fallback');
            try {
              const dataUrl = gl.domElement.toDataURL('image/png', 1.0);
              const link = document.createElement('a');
              link.download = `${robotName}_snapshot.png`;
              link.href = dataUrl;
              link.click();
            } catch (fallbackErr) {
              console.error('[Snapshot] Fallback failed:', fallbackErr);
            }
          }
          restoreState();
        }, 'image/png', 1.0);
      } catch (e) {
        console.error('[Snapshot] Render error:', e);
        restoreState();
      }
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
