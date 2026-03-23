import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { useLoadingManager } from '../meshLoadingManager';
import { cloneColladaScenePreservingRootTransform } from './colladaScene';
import { normalizeColladaUpAxis } from '@/core/loaders/colladaUpAxis';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

interface DAERendererImplProps {
  url: string;
  material: THREE.Material;
  assets: Record<string, string>;
  assetBaseDir?: string;
  normalizeRoot?: boolean;
  scale?: ScaleProps;
  onResolved?: () => void;
}

export function DAERendererImpl({
  url,
  material,
  assets,
  assetBaseDir,
  normalizeRoot = false,
  scale,
  onResolved,
}: DAERendererImplProps) {
  const manager = useLoadingManager(assets, assetBaseDir);
  const colladaText = useLoader(THREE.FileLoader, url, (loader) => {
    loader.manager = manager;
    loader.setResponseType('text');
  });
  const { clone, overrideMeshes } = useMemo(() => {
    const loader = new ColladaLoader(manager);
    const colladaContent = normalizeRoot ? normalizeColladaUpAxis(colladaText).content : colladaText;
    const dae = loader.parse(colladaContent, THREE.LoaderUtils.extractUrlBase(url));
    return cloneColladaScenePreservingRootTransform(dae.scene, normalizeRoot);
  }, [colladaText, manager, normalizeRoot, url]);

  useLayoutEffect(() => {
    overrideMeshes.forEach((mesh) => {
      mesh.material = material;
    });
  }, [material, overrideMeshes]);

  useEffect(() => {
    onResolved?.();
  }, [clone, onResolved]);

  const scaleArr: [number, number, number] = scale ? [scale.x, scale.y, scale.z] : [1, 1, 1];

  return (
    <group scale={scaleArr}>
      <primitive object={clone} />
    </group>
  );
}

export default DAERendererImpl;
