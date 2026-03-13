import * as THREE from 'three';
import { findAssetByPath, createPlaceholderMesh } from '@/core/loaders';
import { createMatteMaterial } from '@/core/utils/materialFactory';
import type { MJCFMesh } from './mjcfUtils';

export interface MJCFGeometryDef {
    name?: string;
    type: string;
    size?: number[];
    mesh?: string;
    fromto?: number[];
}

export type MJCFMeshCache = Map<string, THREE.Object3D | THREE.BufferGeometry>;

/**
 * Creates default matte material for MJCF geometry.
 * Uses unified material factory for consistent appearance with URDF.
 */
function createDefaultMaterial(): THREE.MeshStandardMaterial {
    return createMatteMaterial({
        color: 0x888888,
        name: 'mjcf_default'
    });
}

/**
 * Create geometry from fromto specification (common in MuJoCo).
 * fromto defines two endpoints, and we create a cylinder/capsule between them.
 */
function createFromToGeometry(geom: MJCFGeometryDef, type: 'cylinder' | 'capsule'): THREE.Object3D {
    const fromto = geom.fromto!;
    const from = new THREE.Vector3(fromto[0], fromto[1], fromto[2]);
    const to = new THREE.Vector3(fromto[3], fromto[4], fromto[5]);

    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    const center = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const radius = geom.size?.[0] || 0.05;

    const group = new THREE.Group();

    if (type === 'cylinder') {
        const geometry = new THREE.CylinderGeometry(radius, radius, length, 32);
        const mesh = new THREE.Mesh(geometry, createDefaultMaterial());
        group.add(mesh);
    } else {
        // Capsule: cylinder + 2 hemispheres
        const cylGeom = new THREE.CylinderGeometry(radius, radius, length, 32);
        const cylMesh = new THREE.Mesh(cylGeom, createDefaultMaterial());
        group.add(cylMesh);

        const topSphere = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const topMesh = new THREE.Mesh(topSphere, createDefaultMaterial());
        topMesh.position.y = length / 2;
        group.add(topMesh);

        const bottomSphere = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const bottomMesh = new THREE.Mesh(bottomSphere, createDefaultMaterial());
        bottomMesh.position.y = -length / 2;
        group.add(bottomMesh);
    }

    // Position at center
    group.position.copy(center);

    // Orient to align Y-axis with direction
    if (length > 0.0001) {
        const yAxis = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, direction.normalize());
        group.quaternion.copy(quaternion);
    }

    return group;
}

async function loadMeshForMJCF(
    filePath: string,
    assets: Record<string, string>,
    meshCache: MJCFMeshCache
): Promise<THREE.Object3D | null> {
    // 1. Try exact path (with meshdir)
    let assetUrl = findAssetByPath(filePath, assets, '');

    // 2. Fallback: Try filename only (ignore path/meshdir)
    if (!assetUrl) {
        const filename = filePath.split('/').pop() || '';
        if (filename && filename !== filePath) {
            console.warn(`[MJCFLoader] Mesh not found at ${filePath}, trying filename ${filename}`);
            assetUrl = findAssetByPath(filename, assets, '');
        }
    }

    if (!assetUrl) {
        console.warn(`[MJCFLoader] Mesh file definitely not found: ${filePath}`);
        // Log available assets to help debugging (limited output)
        const keys = Object.keys(assets);
        if (keys.length > 0) {
            console.debug(`[MJCFLoader] Available assets (${keys.length}):`, keys.slice(0, 10));
        } else {
            console.warn('[MJCFLoader] No assets available!');
        }
        return null;
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    try {
        if (ext === 'stl') {
            const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
            const loader = new STLLoader();
            const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
                loader.load(assetUrl, resolve, undefined, reject);
            });
            meshCache.set(filePath, geometry);
            return new THREE.Mesh(geometry, createDefaultMaterial());

        } else if (ext === 'dae') {
            const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
            const loader = new ColladaLoader();
            const result = await new Promise<any>((resolve, reject) => {
                loader.load(assetUrl, resolve, undefined, reject);
            });
            const scene = result.scene;
            meshCache.set(filePath, scene);
            return scene.clone(true);

        } else if (ext === 'obj') {
            const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
            const loader = new OBJLoader();
            const obj = await new Promise<THREE.Group>((resolve, reject) => {
                loader.load(assetUrl, resolve, undefined, reject);
            });
            meshCache.set(filePath, obj);
            return obj.clone(true);

        } else if (ext === 'gltf' || ext === 'glb') {
            const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
            const loader = new GLTFLoader();
            const gltf = await new Promise<any>((resolve, reject) => {
                loader.load(assetUrl, resolve, undefined, reject);
            });
            const scene = gltf.scene;
            meshCache.set(filePath, scene);
            return scene.clone(true);
        }

        console.warn(`[MJCFLoader] Unsupported mesh format: ${ext}`);
        return null;

    } catch (error) {
        console.error(`[MJCFLoader] Failed to load mesh: ${filePath}`, error);
        return null;
    }
}

export async function createGeometryMesh(
    geom: MJCFGeometryDef,
    meshMap: Map<string, MJCFMesh>,
    assets: Record<string, string>,
    meshCache: MJCFMeshCache
): Promise<THREE.Object3D | null> {
    // Determine geometry type: mesh attribute takes priority, otherwise use parsed type
    const type = geom.mesh ? 'mesh' : geom.type;

    if (type === 'plane') {
        console.debug(`[MJCFLoader] Skipping non-importable plane geom "${geom.name || 'unnamed'}"`);
        return null;
    }

    // Debug logging for collision geometry creation
    if (geom.name || (!geom.mesh && geom.size)) {
        console.debug(`[MJCFLoader] Creating geom: type="${type}", size=[${geom.size?.join(', ') || 'none'}], name="${geom.name || 'unnamed'}"`);
    }

    switch (type) {
        case 'box': {
            if (!geom.size || geom.size.length < 1) return null;
            // MJCF size is half-size
            const sx = (geom.size[0] || 0.05) * 2;
            const sy = ((geom.size[1] ?? geom.size[0]) || 0.05) * 2;
            const sz = ((geom.size[2] ?? geom.size[0]) || 0.05) * 2;
            const geometry = new THREE.BoxGeometry(sx, sy, sz);
            return new THREE.Mesh(geometry, createDefaultMaterial());
        }

        case 'sphere': {
            const radius = geom.size?.[0] || 0.05;
            const geometry = new THREE.SphereGeometry(radius, 32, 32);
            return new THREE.Mesh(geometry, createDefaultMaterial());
        }

        case 'cylinder': {
            // Handle fromto if specified
            if (geom.fromto && geom.fromto.length === 6) {
                return createFromToGeometry(geom, 'cylinder');
            }
            const radius = geom.size?.[0] || 0.05;
            const halfHeight = geom.size?.[1] || 0.1;
            const geometry = new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 32);
            geometry.rotateX(Math.PI / 2); // MJCF cylinder is along Z by default
            return new THREE.Mesh(geometry, createDefaultMaterial());
        }

        case 'capsule': {
            // Handle fromto if specified
            if (geom.fromto && geom.fromto.length === 6) {
                return createFromToGeometry(geom, 'capsule');
            }
            const radius = geom.size?.[0] || 0.05;
            const halfHeight = geom.size?.[1] || 0.1;
            // Create capsule using cylinder + 2 hemispheres
            const group = new THREE.Group();

            // Cylinder body
            const cylGeom = new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 32);
            const cylMesh = new THREE.Mesh(cylGeom, createDefaultMaterial());
            group.add(cylMesh);

            // Top hemisphere
            const topSphere = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const topMesh = new THREE.Mesh(topSphere, createDefaultMaterial());
            topMesh.position.y = halfHeight;
            group.add(topMesh);

            // Bottom hemisphere
            const bottomSphere = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
            const bottomMesh = new THREE.Mesh(bottomSphere, createDefaultMaterial());
            bottomMesh.position.y = -halfHeight;
            group.add(bottomMesh);

            // MJCF capsule is along Z by default, rotate to align
            group.rotation.x = Math.PI / 2;
            return group;
        }

        case 'ellipsoid': {
            const sx = geom.size?.[0] || 0.05;
            const sy = geom.size?.[1] || sx;
            const sz = geom.size?.[2] || sx;
            const geometry = new THREE.SphereGeometry(1, 32, 32);
            const mesh = new THREE.Mesh(geometry, createDefaultMaterial());
            mesh.scale.set(sx, sy, sz);
            return mesh;
        }

        case 'mesh': {
            if (!geom.mesh) return null;

            const meshDef = meshMap.get(geom.mesh);
            if (!meshDef) {
                console.warn(`[MJCFLoader] Mesh not defined in assets: ${geom.mesh}`);
                return createPlaceholderMesh(geom.mesh);
            }

            // Check cache
            if (meshCache.has(meshDef.file)) {
                const cached = meshCache.get(meshDef.file)!;
                if ((cached as any).isGroup || (cached as any).isObject3D) {
                    const cloned = (cached as THREE.Object3D).clone(true);
                    if (meshDef.scale) {
                        cloned.scale.set(meshDef.scale[0], meshDef.scale[1], meshDef.scale[2]);
                    }
                    return cloned;
                } else {
                    // BufferGeometry
                    const mesh = new THREE.Mesh(cached as THREE.BufferGeometry, createDefaultMaterial());
                    if (meshDef.scale) {
                        mesh.scale.set(meshDef.scale[0], meshDef.scale[1], meshDef.scale[2]);
                    }
                    return mesh;
                }
            }

            // Load mesh
            const loadedMesh = await loadMeshForMJCF(meshDef.file, assets, meshCache);
            if (!loadedMesh) {
                return createPlaceholderMesh(meshDef.file);
            }

            if (meshDef.scale) {
                loadedMesh.scale.set(meshDef.scale[0], meshDef.scale[1], meshDef.scale[2]);
            }

            return loadedMesh;
        }

        default:
            // Unknown type - log warning and create default sphere
            console.warn(`[MJCFLoader] Unknown geom type "${type}", defaulting to sphere`);
            const defaultRadius = geom.size?.[0] || 0.05;
            const defaultGeometry = new THREE.SphereGeometry(defaultRadius, 32, 32);
            return new THREE.Mesh(defaultGeometry, createDefaultMaterial());
    }
}
