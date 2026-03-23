/**
 * Mesh Loader - Handles loading of mesh files (STL, DAE, OBJ, GLTF/GLB)
 *
 * Features:
 * - Pre-indexed asset lookup for O(1) complexity
 * - First-detection mode for automatic unit scaling
 * - Placeholder mesh for missing/failed loads
 * - Support for STL, DAE, OBJ, GLTF/GLB formats
 */

import * as THREE from 'three';
import { buildMeshLookupCandidates, resolveImportedAssetPath } from '@/core/parsers/meshPathUtils';
import {
    buildExplicitlyScaledMeshPathHints,
    hasExplicitMeshScaleHint,
} from './meshScaleHints';
import { mitigateCoplanarMaterialZFighting } from './coplanarMaterialOffset';
import {
    type ColladaRootNormalizationHints,
} from './colladaRootNormalization';
import { normalizeColladaUpAxis } from './colladaUpAxis';
import { cleanFilePath } from './pathNormalization';

// ============================================================
// SHARED MATERIALS - Avoid shader recompilation for each mesh
// ============================================================
const DEFAULT_MESH_MATERIAL = new THREE.MeshStandardMaterial({
    color: 0x707070,      // Medium-dark grey for proper exposure in bright studio lighting
    roughness: 0.45,      // Lower roughness for visible surface gloss and sharper edges
    metalness: 0.15,      // Low metalness for industrial plastic/painted metal look
    envMapIntensity: 1.0  // Full environment reflection for realistic highlights
});
const PLACEHOLDER_MATERIAL = new THREE.MeshPhongMaterial({
    color: 0xff6b6b,
    transparent: true,
    opacity: 0.7
});
const TRANSPARENT_TEXTURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Reusable Vector3 for size calculations (object pooling)
const _tempSize = new THREE.Vector3();
const _tempBox = new THREE.Box3();

// ============================================================
// PERFORMANCE: Pre-indexed asset lookup for O(1) complexity
// Build once, lookup many times
// ============================================================
export interface AssetIndex {
    // Direct path -> URL mapping
    direct: Map<string, string>;
    // Lowercase path -> URL mapping (case-insensitive)
    lowercase: Map<string, string>;
    // Filename only -> URL mapping
    filename: Map<string, string>;
    // Lowercase filename -> URL mapping
    filenameLower: Map<string, string>;
    // Suffix matches (for fuzzy matching)
    suffixes: Map<string, string>;
}

// Build pre-indexed asset lookup (call once during model load)
export const buildAssetIndex = (assets: Record<string, string>, urdfDir: string = ''): AssetIndex => {
    const index: AssetIndex = {
        direct: new Map(),
        lowercase: new Map(),
        filename: new Map(),
        filenameLower: new Map(),
        suffixes: new Map(),
    };

    for (const [key, value] of Object.entries(assets)) {
        // Direct mapping
        index.direct.set(key, value);

        // Cleaned path
        const cleaned = cleanFilePath(key);
        index.direct.set(cleaned, value);

        // With urdfDir prefix
        if (urdfDir) {
            index.direct.set(urdfDir + cleaned, value);
            index.direct.set(urdfDir + key, value);
        }

        // Lowercase variants
        index.lowercase.set(key.toLowerCase(), value);
        index.lowercase.set(cleaned.toLowerCase(), value);

        // Filename only
        const filename = key.split('/').pop() || key;
        index.filename.set(filename, value);
        index.filenameLower.set(filename.toLowerCase(), value);

        // Suffix matching: store the shortest unique suffix
        const cleanedLower = cleaned.toLowerCase();
        for (let i = cleanedLower.length - 1; i >= 0; i--) {
            if (cleanedLower[i] === '/') {
                const suffix = cleanedLower.substring(i + 1);
                if (!index.suffixes.has(suffix)) {
                    index.suffixes.set(suffix, value);
                }
                break;
            }
        }
    }

    return index;
};

// Fast O(1) asset lookup using pre-built index
export const findAssetByIndex = (path: string, index: AssetIndex, urdfDir: string = ''): string | null => {
    // Strategy 0: Direct match (most common case)
    let result = index.direct.get(path);
    if (result) return result;

    // Clean the path (optimized version)
    let cleanPath = path.replace(/\\/g, '/');

    // Remove blob: prefix if present
    if (cleanPath.startsWith('blob:')) {
        const slashIdx = cleanPath.indexOf('/', 5);
        if (slashIdx !== -1) {
            cleanPath = cleanPath.substring(slashIdx + 1);
        }
    }

    // Try package-relative lookup before falling back to package-local paths.
    if (cleanPath.startsWith('package://')) {
        const packagePath = cleanFilePath(cleanPath.substring(10).replace(/^\/+/, ''));
        if (packagePath) {
            result = index.direct.get(packagePath);
            if (result) return result;

            result = index.lowercase.get(packagePath.toLowerCase());
            if (result) return result;
        }

        cleanPath = packagePath;
        const slashIdx = cleanPath.indexOf('/');
        if (slashIdx !== -1) {
            cleanPath = cleanPath.substring(slashIdx + 1);
        }
    }

    // Remove leading ./
    if (cleanPath.startsWith('./')) {
        cleanPath = cleanPath.substring(2);
    }

    // Normalize path
    const normalizedPath = cleanFilePath(cleanPath);
    const resolvedPath = urdfDir
        ? resolveImportedAssetPath(cleanPath, `${urdfDir}__asset_lookup__`)
        : normalizedPath;

    // Strategy 1: Direct lookup with normalized path
    result = index.direct.get(normalizedPath);
    if (result) return result;

    // Strategy 2: With urdfDir
    if (urdfDir && resolvedPath) {
        result = index.direct.get(resolvedPath);
        if (result) return result;
    }

    // Strategy 3: Clean path
    result = index.direct.get(cleanPath);
    if (result) return result;

    // Strategy 4: Lowercase lookup
    const lowerPath = resolvedPath.toLowerCase();
    result = index.lowercase.get(lowerPath);
    if (result) return result;

    // Strategy 5: Filename only
    const lastSlash = resolvedPath.lastIndexOf('/');
    const filename = lastSlash === -1 ? resolvedPath : resolvedPath.substring(lastSlash + 1);
    result = index.filename.get(filename);
    if (result) return result;

    // Strategy 6: Lowercase filename
    result = index.filenameLower.get(filename.toLowerCase());
    if (result) return result;

    // Strategy 7: Suffix match
    result = index.suffixes.get(lowerPath);
    if (result) return result;

    // Strategy 8: Candidate-based lookup for imported package paths like
    // "/pkg/meshes/part.dae" when the asset library only stores "meshes/part.dae".
    for (const candidate of buildMeshLookupCandidates(path)) {
        result = index.direct.get(candidate);
        if (result) return result;

        result = index.lowercase.get(candidate.toLowerCase());
        if (result) return result;

        result = index.suffixes.get(candidate.toLowerCase());
        if (result) return result;
    }

    return null;
};

// Legacy function for backward compatibility (uses non-indexed lookup)
export const findAssetByPath = (path: string, assets: Record<string, string>, urdfDir: string = ''): string | null => {
    const assetIndex = buildAssetIndex(assets, urdfDir);
    const result = findAssetByIndex(path, assetIndex, urdfDir);
    if (result) {
        return result;
    }

    if (Object.keys(assets).length > 0) {
        const normalizedPath = cleanFilePath(
            path
                .replace(/\\/g, '/')
                .replace(/^blob:[^/]*\//, '')
                .replace(/^package:\/\//i, '')
                .replace(/^\/+/, '')
                .replace(/^(\.\/)+/, ''),
        );
        console.warn(`[MeshLoader] Asset lookup failed for: "${path}"`);
        console.warn(`[MeshLoader] Search path was: "${normalizedPath}"`);
        const keys = Object.keys(assets);
        console.warn(`[MeshLoader] Available assets (first 10):`, keys.slice(0, 10));
        const fn = path.split('/').pop() || '';
        const partialMatches = keys.filter(k => k.toLowerCase().includes(fn.toLowerCase()));
        if (partialMatches.length > 0) {
            console.warn(`[MeshLoader] Potential partial matches found:`, partialMatches);
        }
    }

    return null;
};

// Loading manager that resolves asset URLs from our blob storage
export interface LoadingManagerOptions {
    preferPlaceholderTextures?: boolean;
}

export const createLoadingManager = (
    assets: Record<string, string>,
    urdfDir: string = '',
    options: LoadingManagerOptions = {}
) => {
    const manager = new THREE.LoadingManager();
    const assetIndex = buildAssetIndex(assets, urdfDir);

    manager.setURLModifier((url: string) => {
        const isTextureUrl = /\.(jpg|jpeg|png|gif|bmp|tga|tiff|webp)$/i.test(url);

        // If already a blob/data URL, return as-is
        if (url.startsWith('blob:') || url.startsWith('data:')) {
            // Check if it's a malformed blob URL
            const blobMatch = url.match(/^blob:https?:\/\/[^\/]+\/(.+)$/);
            if (blobMatch && blobMatch[1]) {
                const fileName = blobMatch[1];
                // If it looks like a filename, it's malformed
                if (/\.(jpg|jpeg|png|gif|bmp|tga|tiff|webp|dae|stl|obj|gltf|glb)$/i.test(fileName)) {
                    const found = findAssetByIndex(fileName, assetIndex, urdfDir);
                    if (found) return found;
                }
            }
            return url;
        }

        if (options.preferPlaceholderTextures && isTextureUrl) {
            return TRANSPARENT_TEXTURE_DATA_URL;
        }

        const found = findAssetByIndex(url, assetIndex, urdfDir);
        if (found) return found;

        // Allow HTTP/HTTPS URLs to pass through (e.g. cloud storage or CDN links)
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        console.warn('[MeshLoader] Asset not found:', url);
        // Return a transparent 1x1 pixel for missing textures instead of invalid URL
        // This prevents the browser from trying to load package:// URLs
        if (isTextureUrl) {
            return TRANSPARENT_TEXTURE_DATA_URL;
        }
        // For mesh files, return empty string to let mesh loader handle it with placeholder
        return '';
    });

    return manager;
};

// Shared placeholder geometry (created once)
const PLACEHOLDER_GEOMETRY = new THREE.BoxGeometry(0.05, 0.05, 0.05);

// Create a placeholder mesh when mesh is not found or fails to load
export const createPlaceholderMesh = (path: string): THREE.Object3D => {
    // Use shared geometry and material to avoid shader recompilation
    const mesh = new THREE.Mesh(PLACEHOLDER_GEOMETRY, PLACEHOLDER_MATERIAL);
    mesh.userData.isPlaceholder = true;
    mesh.userData.missingMeshPath = path;
    return mesh;
};

// ============================================================
// PERFORMANCE: First-detection mode for unit scaling
// Once we detect the scale factor, apply it to all subsequent meshes
// ============================================================
// State moved to createMeshLoader closure

// Reset unit detection (call when loading new model)
// Deprecated: State is now scoped to createMeshLoader closure
export const resetUnitDetection = () => {
    // No-op
};

export interface MeshLoaderOptions {
    assetIndex?: AssetIndex;
    explicitScaleMeshPaths?: Iterable<string>;
    colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
}

// Custom mesh loader callback with first-detection unit scaling
export const createMeshLoader = (
    assets: Record<string, string>,
    manager: THREE.LoadingManager,
    urdfDir: string = '',
    options: MeshLoaderOptions = {}
) => {
    // Scoped state for this loader instance
    let _detectedUnitScale: number | null = null;
    let pendingRequestCounter = 0;
    const assetIndex = options.assetIndex ?? buildAssetIndex(assets, urdfDir);
    const explicitScaleHints = options.explicitScaleMeshPaths
        ? buildExplicitlyScaledMeshPathHints(options.explicitScaleMeshPaths, urdfDir)
        : null;

    return async (
        path: string,
        _manager: THREE.LoadingManager,
        done: (result: THREE.Object3D, err?: Error) => void
    ) => {
        const pendingRequestToken = `__urdf_studio_mesh_loader__${pendingRequestCounter++}:${path}`;
        manager.itemStart(pendingRequestToken);

        try {
            const assetUrl = findAssetByIndex(path, assetIndex, urdfDir);

            if (assetUrl) {
                // Asset found, proceed with loading
            }

            if (!assetUrl) {
                console.warn('[MeshLoader] Mesh not found, using placeholder:', path);
                done(createPlaceholderMesh(path));
                return;
            }

            // PERFORMANCE: Avoid split, use lastIndexOf
            const lastSlash = path.lastIndexOf('/');
            const filename = lastSlash === -1 ? path : path.substring(lastSlash + 1);
            const lastDot = filename.lastIndexOf('.');
            const ext = lastDot === -1 ? '' : filename.substring(lastDot + 1).toLowerCase();
            const hasExplicitScale = hasExplicitMeshScaleHint(path, explicitScaleHints, urdfDir);

            let meshObject: THREE.Object3D | null = null;

            if (ext === 'stl') {
                const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
                const loader = new STLLoader(manager);
                const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
                    loader.load(assetUrl, resolve, undefined, reject);
                });

                // Use default material - urdf-loader will override with URDF-defined materials if present
                meshObject = new THREE.Mesh(geometry, DEFAULT_MESH_MATERIAL.clone());

                // Unit Detection Logic
                if (hasExplicitScale) {
                    console.debug(`[MeshLoader] Skipping STL unit auto-detection for explicitly scaled mesh "${filename}"`);
                } else if (_detectedUnitScale !== null) {
                    // We have already decided on a scale factor
                    if (_detectedUnitScale !== 1) {
                        meshObject.scale.set(_detectedUnitScale, _detectedUnitScale, _detectedUnitScale);
                    }
                } else {
                    // Not yet decided, check this mesh
                    geometry.computeBoundingBox();
                    if (geometry.boundingBox) {
                        geometry.boundingBox.getSize(_tempSize);
                        const maxDim = Math.max(_tempSize.x, _tempSize.y, _tempSize.z);
                        
                        // Log the raw size for debugging
                        console.debug(`[MeshLoader] Loaded STL "${filename}" Raw Size:`, _tempSize, `Max: ${maxDim}`);

                        if (maxDim > 10) {
                            // Definitive proof of MM units (unless giant robot)
                            _detectedUnitScale = 0.001;
                            console.warn(`[MeshLoader] Detected mm units from "${filename}" (size ${maxDim.toFixed(2)}), setting scale 0.001`);
                            meshObject.scale.set(0.001, 0.001, 0.001);
                        } else if (maxDim > 0.001) {
                            // It's a "reasonable" size. Could be meters, or could be small MM parts.
                            // We do NOT lock to Meters (1.0) here, because a small screw (5mm) looks like 5.0.
                            // If we locked to 1.0, a subsequent Body (1000mm) would be treated as 1000m.
                            // So we leave _detectedUnitScale as null.
                            // Default behavior for null is "Apply 1.0", effectively.
                        }
                    }
                }

            } else if (ext === 'dae') {
                const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
                const loader = new ColladaLoader(manager);
                let result: { scene: THREE.Object3D };

                if (typeof DOMParser === 'function') {
                    const fileLoader = new THREE.FileLoader(manager);
                    const text = await new Promise<string>((resolve, reject) => {
                        fileLoader.load(assetUrl, (data) => resolve(data as string), undefined, reject);
                    });
                    const { content: normalizedContent } = normalizeColladaUpAxis(text);
                    const baseUrl = THREE.LoaderUtils.extractUrlBase(assetUrl);
                    result = loader.parse(normalizedContent, baseUrl);
                    meshObject = result.scene;
                } else {
                    result = await new Promise<any>((resolve, reject) => {
                        loader.load(assetUrl, resolve, undefined, reject);
                    });
                    meshObject = result.scene;
                }

                if (meshObject) {
                    // Unit Detection Logic
                    if (hasExplicitScale) {
                        console.debug(`[MeshLoader] Skipping DAE unit auto-detection for explicitly scaled mesh "${filename}"`);
                    } else if (_detectedUnitScale !== null) {
                        if (_detectedUnitScale !== 1) {
                            meshObject.scale.set(_detectedUnitScale, _detectedUnitScale, _detectedUnitScale);
                        }
                    } else {
                        // Use pooled Box3
                        _tempBox.setFromObject(meshObject);
                        _tempBox.getSize(_tempSize);
                        const maxDim = Math.max(_tempSize.x, _tempSize.y, _tempSize.z);

                        console.debug(`[MeshLoader] Loaded DAE "${filename}" Raw Size:`, _tempSize, `Max: ${maxDim}`);

                        if (maxDim > 10) {
                            _detectedUnitScale = 0.001;
                            console.warn(`[MeshLoader] Detected mm units from DAE "${filename}" (size ${maxDim.toFixed(2)}), setting scale 0.001`);
                            meshObject.scale.set(0.001, 0.001, 0.001);
                        }
                    }

                    meshObject.updateMatrix();

                    // Remove lights from Collada (optimized: collect first, then remove)
                    const lightsToRemove: THREE.Object3D[] = [];
                    meshObject.traverse((child: THREE.Object3D) => {
                        if ((child as any).isLight) {
                            lightsToRemove.push(child);
                        }
                    });
                    for (let i = 0; i < lightsToRemove.length; i++) {
                        lightsToRemove[i].parent?.remove(lightsToRemove[i]);
                    }
                }

            } else if (ext === 'obj') {
                const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
                const loader = new OBJLoader(manager);
                meshObject = await new Promise<THREE.Group>((resolve, reject) => {
                    loader.load(assetUrl, resolve, undefined, reject);
                });

            } else if (ext === 'gltf' || ext === 'glb') {
                const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
                const loader = new GLTFLoader(manager);
                const gltfModel = await new Promise<any>((resolve, reject) => {
                    loader.load(assetUrl, resolve, undefined, reject);
                });
                meshObject = gltfModel.scene;
            }

            if (meshObject) {
                meshObject.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        mitigateCoplanarMaterialZFighting(child as THREE.Mesh);
                    }
                });
                done(meshObject);
            } else {
                console.warn('[MeshLoader] Unsupported mesh format, using placeholder:', ext, path);
                done(createPlaceholderMesh(path));
            }

        } catch (error) {
            console.error('[MeshLoader] Mesh loading error, using placeholder:', path, error);
            // Return placeholder instead of failing completely
            done(createPlaceholderMesh(path));
        } finally {
            manager.itemEnd(pendingRequestToken);
        }
    };
};
