import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { useLoadingManager } from '../meshLoadingManager';
import { cloneColladaScenePreservingRootTransform } from './colladaScene';
import { isCoplanarOffsetMaterial, markMaterialAsCoplanarOffset } from '@/core/loaders';
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

const ORIGINAL_MATERIAL_KEY = '__urdfStudioDaeOriginalMaterial';
const GENERATED_OVERRIDE_MATERIAL_KEY = '__urdfStudioDaeGeneratedOverrideMaterial';

function disposeGeneratedOverrideMaterials(materialOrMaterials: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  materials.forEach((nextMaterial) => {
    if (nextMaterial?.userData?.[GENERATED_OVERRIDE_MATERIAL_KEY] === true) {
      nextMaterial.dispose();
    }
  });
}

function buildOverrideMaterial(
  sourceMaterial: THREE.Material | THREE.Material[],
  baseMaterial: THREE.Material,
) {
  const sourceMaterials = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial];
  const hasCoplanarOffsets = sourceMaterials.some((nextMaterial) => isCoplanarOffsetMaterial(nextMaterial));
  if (!hasCoplanarOffsets) {
    return baseMaterial;
  }

  const nextMaterials = sourceMaterials.map((nextMaterial) => {
    const overrideMaterial = baseMaterial.clone();
    overrideMaterial.userData = {
      ...(overrideMaterial.userData ?? {}),
      [GENERATED_OVERRIDE_MATERIAL_KEY]: true,
    };

    if (isCoplanarOffsetMaterial(nextMaterial)) {
      return markMaterialAsCoplanarOffset(overrideMaterial);
    }

    overrideMaterial.needsUpdate = true;
    return overrideMaterial;
  });

  return Array.isArray(sourceMaterial) ? nextMaterials : nextMaterials[0];
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
      const originalMaterial = (mesh.userData?.[ORIGINAL_MATERIAL_KEY] as THREE.Material | THREE.Material[] | undefined)
        ?? mesh.material;
      mesh.userData = {
        ...(mesh.userData ?? {}),
        [ORIGINAL_MATERIAL_KEY]: originalMaterial,
      };

      disposeGeneratedOverrideMaterials(mesh.material);
      mesh.material = buildOverrideMaterial(originalMaterial, material);
    });

    return () => {
      overrideMeshes.forEach((mesh) => {
        disposeGeneratedOverrideMaterials(mesh.material);
      });
    };
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
