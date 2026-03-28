/**
 * Shared Mesh Renderer Components
 * Used by both Visualizer.tsx and URDFViewer.tsx
 */

import React, { lazy } from 'react';
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
const LazyGLTFRenderer = lazy(() => import('./renderers/GLTFRendererImpl'));

// STL Renderer
export const STLRenderer = React.memo(({
  url,
  material,
  scale,
  onResolved,
}: {
  url: string;
  material: THREE.Material;
  scale?: ScaleProps;
  onResolved?: () => void;
}) => {
  return <LazySTLRenderer url={url} material={material} scale={scale} onResolved={onResolved} />;
});

// OBJ Renderer
export const OBJRenderer = React.memo(({
  url,
  material,
  color,
  assets,
  assetBaseDir,
  scale,
  onResolved,
}: {
  url: string;
  material: THREE.Material;
  color: string;
  assets: Record<string, string>;
  assetBaseDir?: string;
  scale?: ScaleProps;
  onResolved?: () => void;
}) => {
  return (
    <LazyOBJRenderer
      url={url}
      material={material}
      color={color}
      assets={assets}
      assetBaseDir={assetBaseDir}
      scale={scale}
      onResolved={onResolved}
    />
  );
});

// DAE (Collada) Renderer
export const DAERenderer = React.memo(({
  url,
  material,
  assets,
  assetBaseDir,
  normalizeRoot,
  preserveOriginalMaterial,
  scale,
  onResolved,
}: {
  url: string;
  material: THREE.Material;
  assets: Record<string, string>;
  assetBaseDir?: string;
  normalizeRoot?: boolean;
  preserveOriginalMaterial?: boolean;
  scale?: ScaleProps;
  onResolved?: () => void;
}) => {
  return (
    <LazyDAERenderer
      url={url}
      material={material}
      assets={assets}
      assetBaseDir={assetBaseDir}
      normalizeRoot={normalizeRoot}
      preserveOriginalMaterial={preserveOriginalMaterial}
      scale={scale}
      onResolved={onResolved}
    />
  );
});

// GLTF / GLB Renderer
export const GLTFRenderer = React.memo(({
  url,
  material,
  assets,
  assetBaseDir,
  preserveOriginalMaterial,
  scale,
  onResolved,
}: {
  url: string;
  material: THREE.Material;
  assets: Record<string, string>;
  assetBaseDir?: string;
  preserveOriginalMaterial?: boolean;
  scale?: ScaleProps;
  onResolved?: () => void;
}) => {
  return (
    <LazyGLTFRenderer
      url={url}
      material={material}
      assets={assets}
      assetBaseDir={assetBaseDir}
      preserveOriginalMaterial={preserveOriginalMaterial}
      scale={scale}
      onResolved={onResolved}
    />
  );
});
