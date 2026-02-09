/**
 * MeshPreview - Inline 3D preview for mesh files in the property editor
 * Shows a small Canvas with the selected mesh, auto-rotating for inspection
 */
import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STLRenderer, OBJRenderer, DAERenderer } from '@/shared/components/3d';
import { findAssetByPath } from '@/core/loaders/meshLoader';

interface MeshPreviewProps {
  meshPath: string;
  assets: Record<string, string>;
}

/** Auto-fit camera using frustum projection to guarantee the full mesh is visible and centered */
function AutoFitCamera() {
  const { scene, camera, gl } = useThree();
  const fitted = useRef(false);
  const frameCount = useRef(0);

  useFrame(() => {
    if (fitted.current) return;
    // Wait a few frames for RotatingGroup centering + matrix propagation
    frameCount.current++;
    if (frameCount.current < 3) return;

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 1e-6) return;

    const perspCamera = camera as THREE.PerspectiveCamera;
    const vFovHalf = (perspCamera.fov * Math.PI) / 360; // half vertical FOV in radians
    const aspect = gl.domElement.clientWidth / gl.domElement.clientHeight;
    const hFovHalf = Math.atan(Math.tan(vFovHalf) * aspect); // half horizontal FOV

    // Camera viewing direction — slightly elevated front 3/4 view
    const dir = new THREE.Vector3(0.3, 0.25, 0.92).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();

    // Project AABB half-extents onto camera up/right to get visible extent
    const hs = size.clone().multiplyScalar(0.5);
    const projUp = Math.abs(up.x) * hs.x + Math.abs(up.y) * hs.y + Math.abs(up.z) * hs.z;
    const projRight = Math.abs(right.x) * hs.x + Math.abs(right.y) * hs.y + Math.abs(right.z) * hs.z;

    // Required distance for each axis — like tracing rays from bbox edges to the focal point
    const distV = projUp / Math.tan(vFovHalf);
    const distH = projRight / Math.tan(hFovHalf);
    const dist = Math.max(distV, distH) * 1.05;

    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center);

    perspCamera.near = maxDim * 0.01;
    perspCamera.far = dist * 3;
    perspCamera.updateProjectionMatrix();

    fitted.current = true;
  });

  return null;
}

/** Auto-rotate the mesh group, centered on the mesh's own bounding box center */
function RotatingGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const centered = useRef(false);

  useFrame((_, delta) => {
    if (!groupRef.current || !innerRef.current) return;

    // Center once on the first valid frame — before any rotation is applied
    if (!centered.current) {
      innerRef.current.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(innerRef.current);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        innerRef.current.position.set(-center.x, -center.y, -center.z);
        innerRef.current.updateMatrixWorld(true);
        centered.current = true;
      }
    }

    groupRef.current.rotation.y += delta * 0.5;
  });

  return (
    <group ref={groupRef}>
      <group ref={innerRef}>{children}</group>
    </group>
  );
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
          <AutoFitCamera />
        </Suspense>
      </Canvas>
    </div>
  );
});
