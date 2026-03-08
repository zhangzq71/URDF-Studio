import React, { useLayoutEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { useLoadingManager } from '../meshLoadingManager';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

interface DAERendererImplProps {
  url: string;
  material: THREE.Material;
  assets: Record<string, string>;
  scale?: ScaleProps;
}

export function DAERendererImpl({ url, material, assets, scale }: DAERendererImplProps) {
  const manager = useLoadingManager(assets);
  const dae = useLoader(ColladaLoader, url, (loader) => {
    loader.manager = manager;
  });
  const { clone, overrideMeshes } = useMemo(() => {
    const nextClone = dae.scene.clone();
    const meshes: THREE.Mesh[] = [];

    nextClone.rotation.set(0, 0, 0);
    nextClone.updateMatrix();

    nextClone.traverse((child: THREE.Object3D) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as THREE.Mesh;
      const originalMaterial = mesh.material;

      const hasTexture = Array.isArray(originalMaterial)
        ? originalMaterial.some((mat) => Boolean((mat as THREE.MeshStandardMaterial).map || (mat as THREE.MeshStandardMaterial).emissiveMap))
        : Boolean(
            (originalMaterial as THREE.MeshStandardMaterial | undefined)?.map ||
            (originalMaterial as THREE.MeshStandardMaterial | undefined)?.emissiveMap
          );

      if (!hasTexture) {
        meshes.push(mesh);
      }
    });

    return { clone: nextClone, overrideMeshes: meshes };
  }, [dae]);

  useLayoutEffect(() => {
    overrideMeshes.forEach((mesh) => {
      mesh.material = material;
    });
  }, [material, overrideMeshes]);

  const scaleArr: [number, number, number] = scale ? [scale.x, scale.y, scale.z] : [1, 1, 1];

  return (
    <group scale={scaleArr}>
      <primitive object={clone} />
    </group>
  );
}

export default DAERendererImpl;
