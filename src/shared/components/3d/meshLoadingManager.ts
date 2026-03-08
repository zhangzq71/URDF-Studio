import { useMemo } from 'react';
import * as THREE from 'three';

export const useLoadingManager = (assets: Record<string, string>) => {
  return useMemo(() => {
    const manager = new THREE.LoadingManager();

    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;

      const normalizedUrl = url.replace(/\\/g, '/');
      const filename = normalizedUrl.split('/').pop();

      if (filename) {
        if (assets[filename]) return assets[filename];

        const lowerFilename = filename.toLowerCase();
        const foundKey = Object.keys(assets).find((key) => key.toLowerCase().endsWith(lowerFilename));

        if (foundKey) return assets[foundKey];
      }

      return url;
    });

    return manager;
  }, [assets]);
};
