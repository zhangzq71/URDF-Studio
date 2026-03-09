/**
 * Shared Mesh Renderer Components
 * Used by both Visualizer.tsx and URDFViewer.tsx
 */

import React, { lazy, Suspense } from 'react';
import * as THREE from 'three';
export { useLoadingManager } from './meshLoadingManager';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

const LazySTLRenderer = lazy(() => import('./renderers/STLRendererImpl'));
const LazyOBJRenderer = lazy(() => import('./renderers/OBJRendererImpl'));
const LazyDAERenderer = lazy(() => import('./renderers/DAERendererImpl'));

// STL Renderer
export const STLRenderer = React.memo(({
  url,
  material,
  scale
}: {
  url: string;
  material: THREE.Material;
  scale?: ScaleProps;
}) => {
  return (
    <Suspense fallback={null}>
      <LazySTLRenderer url={url} material={material} scale={scale} />
    </Suspense>
  );
});

// OBJ Renderer
export const OBJRenderer = React.memo(({
  url,
  material,
  color,
  assets,
  scale
}: {
  url: string;
  material: THREE.Material;
  color: string;
  assets: Record<string, string>;
  scale?: ScaleProps;
}) => {
  return (
    <Suspense fallback={null}>
      <LazyOBJRenderer url={url} material={material} color={color} assets={assets} scale={scale} />
    </Suspense>
  );
});

// DAE (Collada) Renderer
export const DAERenderer = React.memo(({
  url,
  material,
  assets,
  scale
}: {
  url: string;
  material: THREE.Material;
  assets: Record<string, string>;
  scale?: ScaleProps;
}) => {
  return (
    <Suspense fallback={null}>
      <LazyDAERenderer url={url} material={material} assets={assets} scale={scale} />
    </Suspense>
  );
});
