import { useLayoutEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { useLoadingManager } from '../meshLoadingManager';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

interface OBJRendererImplProps {
  url: string;
  material: THREE.Material;
  color: string;
  assets: Record<string, string>;
  assetBaseDir?: string;
  scale?: ScaleProps;
}

export function OBJRendererImpl({
  url,
  material,
  assets,
  assetBaseDir,
  scale,
}: OBJRendererImplProps) {
  const manager = useLoadingManager(assets, assetBaseDir);
  const obj = useLoader(OBJLoader, url, (loader) => {
    loader.manager = manager;
  });
  const { clone, overrideMeshes } = useMemo(() => {
    const nextClone = obj.clone();
    const meshes: THREE.Mesh[] = [];

    nextClone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as THREE.Mesh;
      const existingMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const hasTextureMap = existingMaterials.some((entry) => (
        Boolean(entry && 'map' in entry && (entry as THREE.MeshStandardMaterial).map)
      ));
      const hasVertexColors = Boolean(mesh.geometry?.getAttribute?.('color'));

      if (!hasTextureMap && !hasVertexColors) {
        meshes.push(mesh);
      }
    });

    return { clone: nextClone, overrideMeshes: meshes };
  }, [obj]);

  useLayoutEffect(() => {
    overrideMeshes.forEach((mesh) => {
      mesh.material = material;
    });
  }, [material, overrideMeshes]);

  const scaleArr: [number, number, number] = scale ? [scale.x, scale.y, scale.z] : [1, 1, 1];

  return (
    <group rotation={[0, 0, 0]} scale={scaleArr}>
      <primitive object={clone} />
    </group>
  );
}

export default OBJRendererImpl;
