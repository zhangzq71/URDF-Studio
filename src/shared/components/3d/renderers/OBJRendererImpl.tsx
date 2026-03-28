import { use, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  createObjectFromSerializedObjData,
  loadSerializedObjModelData,
} from '@/core/loaders/objParseWorkerBridge';

interface ScaleProps {
  x: number;
  y: number;
  z: number;
}

interface OBJRendererImplProps {
  url: string;
  material: THREE.Material;
  color: string;
  assets: Record<string, string>;
  assetBaseDir?: string;
  scale?: ScaleProps;
  onResolved?: () => void;
}

function enableVertexColorMaterials(mesh: THREE.Mesh): void {
  if (!mesh.geometry?.getAttribute?.('color')) {
    return;
  }

  const currentMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let didCloneMaterial = false;
  const nextMaterials = currentMaterials.map((entry) => {
    if (!entry || !('vertexColors' in entry) || (entry as THREE.MeshPhongMaterial).vertexColors === true) {
      return entry;
    }

    const cloned = entry.clone();
    (cloned as THREE.MeshPhongMaterial).vertexColors = true;
    cloned.needsUpdate = true;
    didCloneMaterial = true;
    return cloned;
  });

  if (!didCloneMaterial) {
    return;
  }

  mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
}

export function OBJRendererImpl({
  url,
  material,
  scale,
  onResolved,
}: OBJRendererImplProps) {
  const serializedObject = use(useMemo(
    () => loadSerializedObjModelData(url),
    [url],
  ));
  const { clone, overrideMeshes } = useMemo(() => {
    const nextClone = createObjectFromSerializedObjData(serializedObject);
    const meshes: THREE.Mesh[] = [];

    nextClone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as THREE.Mesh;
      enableVertexColorMaterials(mesh);
      const existingMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const hasTextureMap = existingMaterials.some((entry) => (
        Boolean(entry && 'map' in entry && (entry as THREE.MeshStandardMaterial).map)
      ));
      const hasVertexColors = Boolean(mesh.geometry?.getAttribute?.('color'));

      if (!hasTextureMap && !hasVertexColors) {
        meshes.push(mesh);
      }
    });

    return { clone: nextClone, overrideMeshes: meshes };
  }, [serializedObject]);

  useLayoutEffect(() => {
    overrideMeshes.forEach((mesh) => {
      mesh.material = material;
    });
  }, [material, overrideMeshes]);

  useEffect(() => {
    onResolved?.();
  }, [clone, onResolved]);

  const scaleArr: [number, number, number] = scale ? [scale.x, scale.y, scale.z] : [1, 1, 1];

  return (
    <group rotation={[0, 0, 0]} scale={scaleArr}>
      <primitive object={clone} />
    </group>
  );
}

export default OBJRendererImpl;
