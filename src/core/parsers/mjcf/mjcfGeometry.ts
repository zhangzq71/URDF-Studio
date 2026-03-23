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

function mjcfQuatToThreeQuat(quat: [number, number, number, number]): THREE.Quaternion {
    return new THREE.Quaternion(quat[1], quat[2], quat[3], quat[0]);
}

function createMuJoCoFromToQuaternion(direction: THREE.Vector3): THREE.Quaternion {
    const normalizedDirection = direction.clone().normalize();
    const localNegativeZ = new THREE.Vector3(0, 0, -1);
    const dot = localNegativeZ.dot(normalizedDirection);

    // MuJoCo uses a deterministic 180deg rotation around +X when fromto points
    // exactly opposite the canonical local -Z axis.
    if (dot <= -1 + 1e-9) {
        return new THREE.Quaternion(1, 0, 0, 0);
    }

    return new THREE.Quaternion().setFromUnitVectors(localNegativeZ, normalizedDirection);
}

function normalizeScale(scale?: number[]): [number, number, number] | null {
    if (!scale || scale.length === 0) {
        return null;
    }

    return [
        scale[0] ?? 1,
        scale[1] ?? scale[0] ?? 1,
        scale[2] ?? scale[0] ?? 1,
    ];
}

export function applyMeshAssetTransform(meshObject: THREE.Object3D, meshDef: MJCFMesh): THREE.Object3D {
    const normalizedScale = normalizeScale(meshDef.scale);
    if (normalizedScale) {
        meshObject.scale.set(normalizedScale[0], normalizedScale[1], normalizedScale[2]);
    }

    if (!meshDef.refpos && !meshDef.refquat) {
        return meshObject;
    }

    const assetTransform = new THREE.Group();
    assetTransform.add(meshObject);

    if (meshDef.refquat) {
        assetTransform.quaternion.copy(mjcfQuatToThreeQuat(meshDef.refquat).conjugate());
    }

    if (meshDef.refpos) {
        assetTransform.position.set(-meshDef.refpos[0], -meshDef.refpos[1], -meshDef.refpos[2]);
        if (meshDef.refquat) {
            assetTransform.position.applyQuaternion(assetTransform.quaternion);
        }
    }

    return assetTransform;
}

function normalizeLookupPath(path: string): string {
    return path
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function pickDeterministicAssetMatch(matches: Array<{ key: string; url: string }>): string | null {
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].url;
    matches.sort((a, b) => a.key.length - b.key.length || a.key.localeCompare(b.key));
    return matches[0].url;
}

export function resolveMJCFAssetUrl(
    filePath: string,
    assets: Record<string, string>,
    sourceFileDir: string,
): string | null {
    const direct = findAssetByPath(filePath, assets, sourceFileDir);
    if (direct) return direct;

    const normalizedFilePath = normalizeLookupPath(filePath);
    const normalizedSourceDir = normalizeLookupPath(sourceFileDir);
    const sourcePrefix = normalizedSourceDir ? `${normalizedSourceDir}/` : '';
    const assetEntries = Object.entries(assets).map(([key, url]) => ({
        key: normalizeLookupPath(key),
        url,
    }));

    if (sourcePrefix) {
        const fullSuffix = normalizeLookupPath(`${sourcePrefix}${normalizedFilePath}`);
        const fullSuffixMatches = assetEntries.filter(({ key }) =>
            key === fullSuffix || key.endsWith(`/${fullSuffix}`),
        );
        const fullSuffixResolved = pickDeterministicAssetMatch(fullSuffixMatches);
        if (fullSuffixResolved) return fullSuffixResolved;
    }

    if (normalizedFilePath) {
        const relativeMatches = assetEntries.filter(({ key }) =>
            key === normalizedFilePath || key.endsWith(`/${normalizedFilePath}`),
        );

        if (relativeMatches.length === 1) {
            return relativeMatches[0].url;
        }

        if (relativeMatches.length > 1 && sourcePrefix) {
            const scopedRelativeMatches = relativeMatches.filter(({ key }) =>
                key.includes(`/${sourcePrefix}`) || key.startsWith(sourcePrefix),
            );
            const scopedRelativeResolved = pickDeterministicAssetMatch(scopedRelativeMatches);
            if (scopedRelativeResolved) return scopedRelativeResolved;
        }
    }

    const filename = normalizedFilePath.split('/').pop() || '';
    if (filename) {
        const filenameMatches = assetEntries.filter(({ key }) =>
            key === filename || key.endsWith(`/${filename}`),
        );

        if (filenameMatches.length === 1) {
            return filenameMatches[0].url;
        }

        if (filenameMatches.length > 1 && sourcePrefix) {
            const scopedFilenameMatches = filenameMatches.filter(({ key }) =>
                key.includes(`/${sourcePrefix}`) || key.startsWith(sourcePrefix),
            );
            const scopedFilenameResolved = pickDeterministicAssetMatch(scopedFilenameMatches);
            if (scopedFilenameResolved) return scopedFilenameResolved;
        }

        if (filenameMatches.length > 1) {
            console.warn(
                `[MJCFLoader] Ambiguous mesh filename "${filename}" (${filenameMatches.length} matches), refusing unscoped fallback.`,
            );
            return null;
        }
    }

    return null;
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
    const shapeGroup = new THREE.Group();

    if (type === 'cylinder') {
        const geometry = new THREE.CylinderGeometry(radius, radius, length, 32);
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, createDefaultMaterial());
        shapeGroup.add(mesh);
    } else {
        // Capsule: cylinder + 2 hemispheres
        const cylGeom = new THREE.CylinderGeometry(radius, radius, length, 32);
        const cylMesh = new THREE.Mesh(cylGeom, createDefaultMaterial());
        shapeGroup.add(cylMesh);

        const topSphere = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const topMesh = new THREE.Mesh(topSphere, createDefaultMaterial());
        topMesh.position.y = length / 2;
        shapeGroup.add(topMesh);

        const bottomSphere = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const bottomMesh = new THREE.Mesh(bottomSphere, createDefaultMaterial());
        bottomMesh.position.y = -length / 2;
        shapeGroup.add(bottomMesh);

        // MuJoCo canonicalizes fromto capsules so the primitive points along local -Z.
        shapeGroup.rotation.x = -Math.PI / 2;
    }

    group.add(shapeGroup);

    // Position at center
    group.position.copy(center);

    // MuJoCo canonicalizes fromto cylinder/capsule primitives so local -Z points
    // from the first endpoint to the second.
    if (length > 0.0001) {
        const quaternion = createMuJoCoFromToQuaternion(direction);
        group.quaternion.copy(quaternion);
    }

    return group;
}

async function loadMeshForMJCF(
    filePath: string,
    assets: Record<string, string>,
    meshCache: MJCFMeshCache,
    sourceFileDir: string,
): Promise<THREE.Object3D | null> {
    const assetUrl = resolveMJCFAssetUrl(filePath, assets, sourceFileDir);

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
    meshCache: MJCFMeshCache,
    sourceFileDir = '',
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
                    return applyMeshAssetTransform(cloned, meshDef);
                } else {
                    // BufferGeometry
                    const mesh = new THREE.Mesh(cached as THREE.BufferGeometry, createDefaultMaterial());
                    return applyMeshAssetTransform(mesh, meshDef);
                }
            }

            // Load mesh
            const loadedMesh = await loadMeshForMJCF(meshDef.file, assets, meshCache, sourceFileDir);
            if (!loadedMesh) {
                return createPlaceholderMesh(meshDef.file);
            }

            return applyMeshAssetTransform(loadedMesh, meshDef);
        }

        default:
            // Unknown type - log warning and create default sphere
            console.warn(`[MJCFLoader] Unknown geom type "${type}", defaulting to sphere`);
            const defaultRadius = geom.size?.[0] || 0.05;
            const defaultGeometry = new THREE.SphereGeometry(defaultRadius, 32, 32);
            return new THREE.Mesh(defaultGeometry, createDefaultMaterial());
    }
}
