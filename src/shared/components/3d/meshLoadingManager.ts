import { useMemo } from 'react';
import * as THREE from 'three';
import { findAssetByPath } from '@/core/loaders';

export const useLoadingManager = (assets: Record<string, string>, assetBaseDir = '') => {
  return useMemo(() => {
    const manager = new THREE.LoadingManager();

    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      return findAssetByPath(url, assets, assetBaseDir) ?? url;
    });

    return manager;
  }, [assetBaseDir, assets]);
};
