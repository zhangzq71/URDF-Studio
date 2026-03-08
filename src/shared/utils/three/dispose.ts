import * as THREE from 'three';

export function disposeObject3D(
    object: THREE.Object3D | null,
    disposeTextures: boolean = true,
    excludeMaterials?: Set<THREE.Material>
): void {
    if (!object) return;

    object.traverse((child: any) => {
        if (child.geometry) {
            child.geometry.dispose();
        }

        if (child.material) {
            disposeMaterial(child.material, disposeTextures, excludeMaterials);
        }
    });

    if (object.parent) {
        object.parent.remove(object);
    }
}

export function disposeMaterial(
    material: THREE.Material | THREE.Material[],
    disposeTextures: boolean = true,
    excludeMaterials?: Set<THREE.Material>
): void {
    const materials = Array.isArray(material) ? material : [material];

    for (const mat of materials) {
        if (!mat) continue;

        if (excludeMaterials?.has(mat)) continue;

        if (disposeTextures) {
            disposeTexturesFromMaterial(mat);
        }

        mat.dispose();
    }
}

export function disposeTexturesFromMaterial(material: THREE.Material): void {
    const textureProperties = [
        'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
        'envMap', 'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap',
        'gradientMap', 'metalnessMap', 'roughnessMap', 'clearcoatMap',
        'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
        'sheenRoughnessMap', 'transmissionMap', 'thicknessMap',
    ];

    for (const prop of textureProperties) {
        const texture = (material as any)[prop];
        if (texture && texture instanceof THREE.Texture) {
            texture.dispose();
        }
    }
}

export function cleanupScene(scene: THREE.Scene, excludeMaterials?: Set<THREE.Material>): void {
    const directChildren = [...scene.children];
    for (const obj of directChildren) {
        disposeObject3D(obj, true, excludeMaterials);
    }
}

export function cancelAnimationFrameSafe(animationFrameId: { current: number | null }): void {
    if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
    }
}
