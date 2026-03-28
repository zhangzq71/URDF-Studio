import { useMemo } from 'react';
import * as THREE from 'three';
import { buildAssetIndex, resolveManagedAssetUrl } from '@/core/loaders';

export const useLoadingManager = (assets: Record<string, string>, assetBaseDir = '') => {
  return useMemo(() => {
    const manager = new THREE.LoadingManager();
    const assetIndex = buildAssetIndex(assets, assetBaseDir);

    manager.setURLModifier((url) => {
      const resolved = resolveManagedAssetUrl(url, assetIndex, assetBaseDir);
      return resolved || url;
    });

    return manager;
  }, [assetBaseDir, assets]);
};
