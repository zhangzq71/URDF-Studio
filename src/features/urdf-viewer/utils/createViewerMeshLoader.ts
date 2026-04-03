import * as THREE from 'three';
import { createMeshLoader, type ColladaRootNormalizationHints } from '@/core/loaders';

interface ViewerMeshLoaderOptions {
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
  explicitScaleMeshPaths?: Iterable<string>;
  yieldIfNeeded?: () => Promise<void>;
}

export function createViewerMeshLoader(
  assets: Record<string, string>,
  manager: THREE.LoadingManager,
  urdfDir = '',
  options: ViewerMeshLoaderOptions = {},
) {
  return createMeshLoader(assets, manager, urdfDir, options);
}
