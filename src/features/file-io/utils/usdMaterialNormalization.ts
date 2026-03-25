import * as THREE from 'three';

import { createMatteMaterial } from '@/core/utils/materialFactory.ts';
import { disposeMaterial, disposeObject3D } from '@/shared/utils/three/dispose.ts';

export const createUsdBaseMaterial = (color: string | undefined): THREE.MeshStandardMaterial => {
  return createMatteMaterial({
    color: color || '#808080',
    side: THREE.FrontSide,
    preserveExactColor: true,
  });
};

export const isUsdMeshObject = (value: unknown): value is THREE.Mesh => {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as THREE.Mesh).isMesh
    && 'geometry' in (value as Record<string, unknown>),
  );
};

const isMeshStandardMaterial = (material: THREE.Material): material is THREE.MeshStandardMaterial => {
  return Boolean((material as THREE.MeshStandardMaterial).isMeshStandardMaterial);
};

const convertUsdMaterialToStandard = (
  material: THREE.Material,
  fallbackColor: string | undefined,
): THREE.MeshStandardMaterial => {
  if (isMeshStandardMaterial(material)) {
    const cloned = material.clone();
    cloned.side = THREE.FrontSide;
    cloned.needsUpdate = true;
    return cloned;
  }

  const nextMaterial = createUsdBaseMaterial(fallbackColor);
  const source = material as THREE.MeshStandardMaterial & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
  };

  if (source.color) {
    nextMaterial.color.copy(source.color);
  }

  if (source.map) {
    nextMaterial.map = source.map;
  }

  nextMaterial.transparent = material.transparent || material.opacity < 1;
  nextMaterial.opacity = material.opacity ?? 1;
  nextMaterial.name = material.name;
  nextMaterial.side = THREE.FrontSide;
  nextMaterial.needsUpdate = true;

  disposeMaterial(material, false);
  return nextMaterial;
};

export const normalizeUsdRenderableMaterials = (
  object: THREE.Object3D,
  fallbackColor: string | undefined,
): void => {
  object.traverse((child) => {
    if (!isUsdMeshObject(child)) return;

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        convertUsdMaterialToStandard(material, fallbackColor),
      );
      return;
    }

    if (!child.material) {
      child.material = createUsdBaseMaterial(fallbackColor);
      return;
    }

    child.material = convertUsdMaterialToStandard(child.material, fallbackColor);
  });
};

const createUsdMaterialVariantMesh = (
  mesh: THREE.Mesh,
  material: THREE.Material,
  variantIndex: number,
  materialIndex: number,
): THREE.Mesh | null => {
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
    return null;
  }

  const geometry = mesh.geometry.clone();
  const filteredGroups = geometry.groups.filter((group) => (group.materialIndex ?? 0) === materialIndex);
  if (filteredGroups.length === 0) {
    geometry.dispose();
    return null;
  }

  geometry.clearGroups();
  filteredGroups.forEach((group) => {
    geometry.addGroup(group.start, group.count, 0);
  });

  const variant = new THREE.Mesh(geometry, material.clone());
  variant.name = variantIndex === 0
    ? (mesh.name || 'mesh')
    : `${mesh.name || 'mesh'}_${materialIndex}`;
  variant.position.copy(mesh.position);
  variant.quaternion.copy(mesh.quaternion);
  variant.scale.copy(mesh.scale);
  variant.rotation.order = mesh.rotation.order;
  variant.castShadow = mesh.castShadow;
  variant.receiveShadow = mesh.receiveShadow;
  variant.frustumCulled = mesh.frustumCulled;
  variant.matrixAutoUpdate = mesh.matrixAutoUpdate;
  variant.matrix.copy(mesh.matrix);
  variant.visible = mesh.visible;
  variant.renderOrder = mesh.renderOrder;
  variant.userData = {
    ...mesh.userData,
    usdSerializeFilteredGroups: true,
  };

  return variant;
};

export const expandUsdMultiMaterialMeshesForSerialization = (root: THREE.Object3D): void => {
  const replacements: Array<{
    mesh: THREE.Mesh;
    parent: THREE.Object3D;
    insertionIndex: number;
    variants: THREE.Mesh[];
  }> = [];

  root.traverse((child) => {
    if (!isUsdMeshObject(child) || !Array.isArray(child.material) || !child.parent) {
      return;
    }

    if (!(child.geometry instanceof THREE.BufferGeometry) || child.material.length <= 1) {
      return;
    }

    const materialIndexes = Array.from(new Set(
      child.geometry.groups.map((group) => group.materialIndex ?? 0),
    )).filter((index) => Number.isInteger(index) && index >= 0);

    if (materialIndexes.length <= 1) {
      return;
    }

    const variants = materialIndexes
      .map((materialIndex, variantIndex) => {
        const material = child.material[materialIndex];
        if (!material) {
          return null;
        }
        return createUsdMaterialVariantMesh(child, material, variantIndex, materialIndex);
      })
      .filter((variant): variant is THREE.Mesh => Boolean(variant));

    if (variants.length <= 1) {
      variants.forEach((variant) => disposeObject3D(variant, true));
      return;
    }

    replacements.push({
      mesh: child,
      parent: child.parent,
      insertionIndex: child.parent.children.indexOf(child),
      variants,
    });
  });

  replacements.forEach(({ mesh, parent, insertionIndex, variants }) => {
    parent.remove(mesh);
    variants.forEach((variant) => parent.add(variant));

    const appendedVariants = parent.children.splice(parent.children.length - variants.length, variants.length);
    parent.children.splice(Math.max(0, insertionIndex), 0, ...appendedVariants);

    disposeObject3D(mesh, true);
  });
};
