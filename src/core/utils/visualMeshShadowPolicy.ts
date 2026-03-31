import * as THREE from 'three';

export function getVisualMeshTriangleCount(mesh: THREE.Mesh): number {
    const geometry = mesh.geometry;
    if (!geometry) {
        return 0;
    }

    const index = geometry.getIndex();
    if (index) {
        return index.count / 3;
    }

    const position = geometry.getAttribute('position');
    if (!position) {
        return 0;
    }

    return position.count / 3;
}

export function shouldVisualMeshParticipateInShadows(mesh: THREE.Mesh): boolean {
    void mesh;
    return true;
}

export function applyVisualMeshShadowPolicy(mesh: THREE.Mesh): void {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
}
