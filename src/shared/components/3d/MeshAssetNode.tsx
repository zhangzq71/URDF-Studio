import React from 'react';
import * as THREE from 'three';

import { findAssetByPath } from '@/core/loaders/meshLoader';
import { getSourceFileDirectory } from '@/core/parsers/meshPathUtils';

import { DAERenderer, GLTFRenderer, OBJRenderer, STLRenderer } from './MeshRenderers';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

interface MeshAssetNodeProps {
  meshPath?: string | null;
  assets: Record<string, string>;
  material: THREE.Material;
  color?: string;
  scale?: ScaleProps;
  normalizeRoot?: boolean;
  preserveOriginalMaterial?: boolean;
  onResolved?: () => void;
  missingContent?: React.ReactNode;
  unknownContent?: React.ReactNode;
}

const DEFAULT_COLOR = '#ffffff';

export function MeshAssetNode({
  meshPath,
  assets,
  material,
  color = DEFAULT_COLOR,
  scale,
  normalizeRoot,
  preserveOriginalMaterial,
  onResolved,
  missingContent = null,
  unknownContent = null,
}: MeshAssetNodeProps) {
  if (!meshPath) {
    return missingContent;
  }

  const assetUrl = findAssetByPath(meshPath, assets);
  if (!assetUrl) {
    return missingContent;
  }

  const extension = meshPath.split('.').pop()?.toLowerCase();
  const assetBaseDir = getSourceFileDirectory(meshPath);

  if (extension === 'stl') {
    return <STLRenderer url={assetUrl} material={material} scale={scale} onResolved={onResolved} />;
  }

  if (extension === 'obj') {
    return (
      <OBJRenderer
        url={assetUrl}
        material={material}
        color={color}
        assets={assets}
        assetBaseDir={assetBaseDir}
        scale={scale}
        onResolved={onResolved}
      />
    );
  }

  if (extension === 'dae') {
    return (
      <DAERenderer
        url={assetUrl}
        material={material}
        assets={assets}
        assetBaseDir={assetBaseDir}
        normalizeRoot={normalizeRoot}
        preserveOriginalMaterial={preserveOriginalMaterial}
        scale={scale}
        onResolved={onResolved}
      />
    );
  }

  if (extension === 'gltf' || extension === 'glb') {
    return (
      <GLTFRenderer
        url={assetUrl}
        material={material}
        assets={assets}
        assetBaseDir={assetBaseDir}
        preserveOriginalMaterial={preserveOriginalMaterial}
        scale={scale}
        onResolved={onResolved}
      />
    );
  }

  return unknownContent;
}
