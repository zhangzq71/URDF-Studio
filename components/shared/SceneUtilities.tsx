/**
 * Shared Scene Utilities
 * Used by both Visualizer.tsx and URDFViewer.tsx
 */

import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

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
      // 1. Hide Gizmos, Grid and Helpers
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

      // 2. Clear background for transparency
      const originalBackground = scene.background;
      scene.background = null;

      // 3. High Res Render
      const originalPixelRatio = gl.getPixelRatio();
      gl.setPixelRatio(4); // 4x Super Sampling
      
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL('image/png', 1.0);

      // 4. Restore
      gl.setPixelRatio(originalPixelRatio);
      scene.background = originalBackground;
      hiddenObjects.forEach(obj => obj.visible = true);
      gl.render(scene, camera);

      // 5. Download
      const link = document.createElement('a');
      link.download = `${robotName}_snapshot.png`;
      link.href = dataUrl;
      link.click();
    };

    return () => {
      if (actionRef) actionRef.current = null;
    };
  }, [gl, scene, camera, robotName, actionRef]);

  return null;
};

// Scene lighting setup for Z-up coordinate system
export function SceneLighting() {
  const { scene, gl } = useThree();

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.receiveShadow = true;
  }, [scene, gl]);

  return (
    <>
      {/* Enhanced ambient light for better overall illumination */}
      <ambientLight intensity={1.2} />

      {/* Hemisphere light for more realistic environmental lighting */}
      <hemisphereLight
        args={['#ffffff', '#444444', 0.8]}
        position={[0, 0, 10]}
      />

      {/* Main directional light with shadows */}
      <directionalLight
        position={[5, 5, 8]}
        intensity={2.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* Fill lights for reducing harsh shadows */}
      <directionalLight position={[-3, -3, 5]} intensity={0.8} />
      <directionalLight position={[0, 0, -5]} intensity={0.5} />
      <directionalLight position={[3, -5, 3]} intensity={0.6} />
    </>
  );
}
