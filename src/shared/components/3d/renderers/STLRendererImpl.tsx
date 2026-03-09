import React, { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

interface STLRendererImplProps {
  url: string;
  material: THREE.Material;
  scale?: ScaleProps;
}

export function STLRendererImpl({ url, material, scale }: STLRendererImplProps) {
  const geometry = useLoader(STLLoader, url);
  const clone = useMemo(() => geometry.clone(), [geometry]);

  useEffect(() => () => {
    clone.dispose();
  }, [clone]);

  const scaleArr: [number, number, number] = scale ? [scale.x, scale.y, scale.z] : [1, 1, 1];

  return <mesh geometry={clone} material={material} rotation={[0, 0, 0]} scale={scaleArr} />;
}

export default STLRendererImpl;
