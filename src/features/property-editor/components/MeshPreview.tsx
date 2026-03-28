/**
 * MeshPreview - Inline 3D preview for mesh files in the property editor
 * Shows a small Canvas with the selected mesh, auto-rotating for inspection
 */
import React, { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STLRenderer, OBJRenderer, DAERenderer, GLTFRenderer } from '@/shared/components/3d';
import { findAssetByPath } from '@/core/loaders/meshLoader';
import { getSourceFileDirectory } from '@/core/parsers/meshPathUtils';

interface MeshPreviewProps {
  meshPath: string;
  assets: Record<string, string>;
  normalizeColladaRoot?: boolean;
  notFoundText?: string;
}

/** Auto-fit camera using frustum projection to guarantee the full mesh is visible and centered */
function AutoFitCamera() {
  const { scene, camera, gl } = useThree();
  const fitted = useRef(false);
  const frameCount = useRef(0);
  const boxRef = useRef(new THREE.Box3());
  const centerRef = useRef(new THREE.Vector3());
  const sizeRef = useRef(new THREE.Vector3());
  const dirRef = useRef(new THREE.Vector3(0.3, 0.25, 0.92).normalize());
  const worldUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const rightRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3());
  const hsRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (fitted.current) return;
    frameCount.current++;
    if (frameCount.current < 3) return;

    scene.updateMatrixWorld(true);
    const box = boxRef.current.setFromObject(scene);
    if (box.isEmpty()) return;

    const center = box.getCenter(centerRef.current);
    const size = box.getSize(sizeRef.current);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 1e-6) return;

    const perspCamera = camera as THREE.PerspectiveCamera;
    const vFovHalf = (perspCamera.fov * Math.PI) / 360;
    const aspect = gl.domElement.clientWidth / gl.domElement.clientHeight;
    const hFovHalf = Math.atan(Math.tan(vFovHalf) * aspect);

    const dir = dirRef.current;
    const right = rightRef.current.crossVectors(dir, worldUpRef.current).normalize();
    const up = upRef.current.crossVectors(right, dir).normalize();

    const hs = hsRef.current.copy(size).multiplyScalar(0.5);
    const projUp = Math.abs(up.x) * hs.x + Math.abs(up.y) * hs.y + Math.abs(up.z) * hs.z;
    const projRight = Math.abs(right.x) * hs.x + Math.abs(right.y) * hs.y + Math.abs(right.z) * hs.z;

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
  const boxRef = useRef(new THREE.Box3());
  const centerRef = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!groupRef.current || !innerRef.current) return;

    if (!centered.current) {
      innerRef.current.updateMatrixWorld(true);
      const box = boxRef.current.setFromObject(innerRef.current);
      if (!box.isEmpty()) {
        const center = box.getCenter(centerRef.current);
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
function MeshContent({
  meshPath,
  assetUrl,
  assets,
  normalizeColladaRoot = false,
}: {
  meshPath: string;
  assetUrl: string;
  assets: Record<string, string>;
  normalizeColladaRoot?: boolean;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6b9bd2', metalness: 0.1, roughness: 0.6 }),
    []
  );
  useEffect(() => () => { material.dispose(); }, [material]);
  const ext = meshPath.split('.').pop()?.toLowerCase();
  const assetBaseDir = getSourceFileDirectory(meshPath);

  if (ext === 'stl') {
    return <STLRenderer url={assetUrl} material={material} />;
  } else if (ext === 'obj') {
    return <OBJRenderer url={assetUrl} material={material} color="#6b9bd2" assets={assets} assetBaseDir={assetBaseDir} />;
  } else if (ext === 'dae') {
    return (
      <DAERenderer
        url={assetUrl}
        material={material}
        assets={assets}
        assetBaseDir={assetBaseDir}
        normalizeRoot={normalizeColladaRoot}
      />
    );
  } else if (ext === 'gltf' || ext === 'glb') {
    return (
      <GLTFRenderer
        url={assetUrl}
        material={material}
        assets={assets}
        assetBaseDir={assetBaseDir}
        preserveOriginalMaterial
      />
    );
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

export const MeshPreview: React.FC<MeshPreviewProps> = React.memo(({
  meshPath,
  assets,
  normalizeColladaRoot = false,
  notFoundText = 'Mesh not found'
}) => {
  const assetUrl = findAssetByPath(meshPath, assets);

  if (!assetUrl) {
    return (
      <div className="flex h-[112px] items-center justify-center rounded border border-border-black bg-element-bg">
        <span className="text-[10px] text-text-tertiary">{notFoundText}</span>
      </div>
    );
  }

  return (
    <div className="h-[112px] overflow-hidden rounded border border-border-black bg-gradient-to-b from-element-bg to-panel-bg">
      <Canvas
        camera={{ fov: 45, near: 0.001, far: 100, position: [0.5, 0.3, 0.5] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={0.8} />
        <directionalLight position={[-1, -1, -1]} intensity={0.3} />
        <Suspense fallback={<LoadingFallback />}>
          <RotatingGroup>
            <MeshContent
              meshPath={meshPath}
              assetUrl={assetUrl}
              assets={assets}
              normalizeColladaRoot={normalizeColladaRoot}
            />
          </RotatingGroup>
          <AutoFitCamera />
        </Suspense>
      </Canvas>
    </div>
  );
});
