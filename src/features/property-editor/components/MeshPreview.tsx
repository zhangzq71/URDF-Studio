/**
 * MeshPreview - Inline 3D preview for mesh files in the property editor
 * Shows a small Canvas with the selected mesh, auto-rotating for inspection
 */
import React, { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STLRenderer, OBJRenderer, DAERenderer } from '@/shared/components/3d';
import { findAssetByPath } from '@/core/loaders/meshLoader';

interface MeshPreviewProps {
  meshPath: string;
  assets: Record<string, string>;
}

/** Auto-fit camera to mesh bounding box */
function AutoFitCamera() {
  const { scene, camera } = useThree();

  useEffect(() => {
    // Wait a frame for mesh to load
    const timer = setTimeout(() => {
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim * 2;

      camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }, 100);

    return () => clearTimeout(timer);
  }, [scene, camera]);

  return null;
}

/** Auto-rotate the mesh group */
function RotatingGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });
  return <group ref={ref}>{children}</group>;
}

/** Render the appropriate mesh based on file extension */
function MeshContent({ meshPath, assetUrl, assets }: { meshPath: string; assetUrl: string; assets: Record<string, string> }) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6b9bd2', metalness: 0.1, roughness: 0.6 }),
    []
  );
  const ext = meshPath.split('.').pop()?.toLowerCase();

  if (ext === 'stl') {
    return <STLRenderer url={assetUrl} material={material} />;
  } else if (ext === 'obj') {
    return <OBJRenderer url={assetUrl} material={material} color="#6b9bd2" assets={assets} />;
  } else if (ext === 'dae') {
    return <DAERenderer url={assetUrl} material={material} assets={assets} />;
  }
  return (
    <mesh>
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      <meshStandardMaterial color="gray" wireframe />
    </mesh>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshStandardMaterial color="#aaa" wireframe />
    </mesh>
  );
}

export const MeshPreview: React.FC<MeshPreviewProps> = React.memo(({ meshPath, assets }) => {
  const assetUrl = findAssetByPath(meshPath, assets);

  if (!assetUrl) {
    return (
      <div className="h-[140px] flex items-center justify-center bg-slate-50 dark:bg-google-dark-bg rounded border border-slate-200 dark:border-google-dark-border">
        <span className="text-[10px] text-slate-400">Mesh not found</span>
      </div>
    );
  }

  return (
    <div className="h-[140px] rounded border border-slate-200 dark:border-google-dark-border overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 dark:from-[#1a1a1c] dark:to-[#222224]">
      <Canvas
        camera={{ fov: 45, near: 0.001, far: 100, position: [0.5, 0.3, 0.5] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={0.8} />
        <directionalLight position={[-1, -1, -1]} intensity={0.3} />
        <Suspense fallback={<LoadingFallback />}>
          <RotatingGroup>
            <MeshContent meshPath={meshPath} assetUrl={assetUrl} assets={assets} />
          </RotatingGroup>
        </Suspense>
        <AutoFitCamera />
      </Canvas>
    </div>
  );
});
