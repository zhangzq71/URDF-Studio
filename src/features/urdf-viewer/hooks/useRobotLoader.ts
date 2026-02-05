import { useState, useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
// @ts-ignore
import URDFLoader from 'urdf-loader';
import { disposeObject3D } from '../utils/dispose';
import { enhanceMaterials, collisionBaseMaterial } from '../utils/materials';
import { parseURDFMaterials, applyURDFMaterials } from '../utils/urdfMaterials';
import { offsetRobotToGround } from '../utils/robotPositioning';
import { SHARED_MATERIALS } from '../constants';
import { createLoadingManager, createMeshLoader } from '@/core/loaders';
import { loadMJCFToThreeJS, isMJCFContent } from '@/core/parsers/mjcf';
import { processCapsuleGeometries } from '../utils/capsulePostProcessor';

function preprocessURDFForLoader(content: string): string {
    // Remove <transmission> blocks to prevent urdf-loader from finding duplicate joints
    // which can overwrite valid joints with empty origins
    return content.replace(/<transmission[\s\S]*?<\/transmission>/g, '');
}

export interface UseRobotLoaderOptions {
    urdfContent: string;
    assets: Record<string, string>;
    showCollision: boolean;
    showVisual: boolean;
    onRobotLoaded?: (robot: THREE.Object3D) => void;
}

export interface UseRobotLoaderResult {
    robot: THREE.Object3D | null;
    error: string | null;
    robotVersion: number;
    robotRef: React.MutableRefObject<THREE.Object3D | null>;
    linkMeshMapRef: React.MutableRefObject<Map<string, THREE.Mesh[]>>;
}

export function useRobotLoader({
    urdfContent,
    assets,
    showCollision,
    showVisual,
    onRobotLoaded
}: UseRobotLoaderOptions): UseRobotLoaderResult {
    const [robot, setRobot] = useState<THREE.Object3D | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [robotVersion, setRobotVersion] = useState(0);
    const { invalidate } = useThree();

    // Ref to track current robot for proper cleanup (avoids stale closure issues)
    const robotRef = useRef<THREE.Object3D | null>(null);
    // Track if component is mounted to prevent state updates after unmount
    const isMountedRef = useRef(true);
    // Track loading abort controller to cancel duplicate loads
    const loadAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

    // Refs for visibility state (used in loading callback)
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);

    // PERFORMANCE: Pre-built map of linkName -> meshes for O(1) highlight lookup
    const linkMeshMapRef = useRef<Map<string, THREE.Mesh[]>>(new Map());

    // Keep refs in sync
    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);

    // Track component mount state for preventing state updates after unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Load robot with proper cleanup and abort handling
    useEffect(() => {
        if (!urdfContent) return;

        // Create abort controller for this load
        const abortController = { aborted: false };
        loadAbortRef.current = abortController;

        // Cleanup previous robot before loading new one
        const cleanupPreviousRobot = () => {
            if (robotRef.current) {
                // Remove from scene first
                if (robotRef.current.parent) {
                    robotRef.current.parent.remove(robotRef.current);
                }
                // Deep dispose with shared materials exclusion
                disposeObject3D(robotRef.current, true, SHARED_MATERIALS);
                robotRef.current = null;
            }
        };

        const loadRobot = async () => {
            try {
                // Cleanup any existing robot before loading new one
                cleanupPreviousRobot();

                let robotModel: THREE.Object3D | null = null;

                // Check if content is MJCF (MuJoCo XML)
                if (isMJCFContent(urdfContent)) {
                    robotModel = await loadMJCFToThreeJS(urdfContent, assets);

                    if (abortController.aborted) {
                        if (robotModel) {
                            disposeObject3D(robotModel, true, SHARED_MATERIALS);
                        }
                        return;
                    }
                } else {
                    // Standard URDF loading
                    const urdfDir = '';
                    const manager = createLoadingManager(assets, urdfDir);
                    manager.onLoad = () => {
                        if (!abortController.aborted && isMountedRef.current) {

                            // Apply URDF materials AFTER meshes are fully loaded
                            // This is critical because meshes load asynchronously
                            const materials = parseURDFMaterials(urdfContent);
                            applyURDFMaterials(robotModel!, materials);

                            // Process capsule geometries after materials are applied
                            processCapsuleGeometries(robotModel!, urdfContent);

                            // Re-run enhanceMaterials to ensure proper lighting on loaded meshes
                            enhanceMaterials(robotModel!);

                            // Re-offset to ground after meshes are loaded (bounds may have changed)
                            offsetRobotToGround(robotModel!);

                            setRobotVersion(v => v + 1);
                            invalidate();
                        }
                    };

                    const loader = new URDFLoader(manager);
                    loader.parseCollision = true;
                    loader.loadMeshCb = createMeshLoader(assets, manager, urdfDir);
                    loader.packages = (pkg: string) => '';

                    const cleanContent = preprocessURDFForLoader(urdfContent);
                    robotModel = loader.parse(cleanContent);

                    // Check if load was aborted (e.g., by StrictMode remount or urdfContent change)
                    if (abortController.aborted) {
                        // Dispose the loaded model since we don't need it
                        if (robotModel) {
                            disposeObject3D(robotModel, true, SHARED_MATERIALS);
                        }
                        return;
                    }
                }

                if (robotModel && isMountedRef.current) {
                    // Apply URDF materials from XML (urdf-loader doesn't handle inline rgba)
                    if (!isMJCFContent(urdfContent)) {
                        const materials = parseURDFMaterials(urdfContent);
                        applyURDFMaterials(robotModel, materials);

                        // Process capsule geometries (urdf-loader doesn't support capsule natively)
                        processCapsuleGeometries(robotModel, urdfContent);
                    }

                    // Offset robot so bottom is at ground level (Y=0)
                    offsetRobotToGround(robotModel);

                    enhanceMaterials(robotModel);

                    // PERFORMANCE: Build linkName -> meshes map and inject userData in single traverse
                    // This eliminates the need for traverse in highlightGeometry
                    const newLinkMeshMap = new Map<string, THREE.Mesh[]>();

                    robotModel.traverse((child: any) => {
                        // Find parent link for this object
                        let parentLink: any = null;
                        let current = child;
                        while (current) {
                            if (current.isURDFLink || (robotModel as any).links?.[current.name]) {
                                parentLink = current;
                                break;
                            }
                            current = current.parent;
                        }

                        // Handle collision meshes
                        if (child.isURDFCollider) {
                            child.visible = showCollisionRef.current;
                            child.traverse((inner: any) => {
                                if (inner.isMesh) {
                                    inner.userData.isCollisionMesh = true;
                                    // Inject parent link name for fast lookup
                                    if (parentLink) {
                                        inner.userData.parentLinkName = parentLink.name;
                                    }
                                    // Add to link mesh map
                                    if (parentLink) {
                                        const key = `${parentLink.name}:collision`;
                                        if (!newLinkMeshMap.has(key)) {
                                            newLinkMeshMap.set(key, []);
                                        }
                                        newLinkMeshMap.get(key)!.push(inner);
                                    }
                                }
                            });
                        }
                        // Handle visual meshes
                        else if (child.isMesh && !child.userData.isCollisionMesh) {
                            // Check if it's a visual (not a joint or collider)
                            let isVisual = false;
                            let checkParent = child.parent;
                            while (checkParent) {
                                if (checkParent.isURDFCollider) {
                                    break; // Already handled as collision
                                }
                                if (checkParent.isURDFLink) {
                                    isVisual = true;
                                    break;
                                }
                                checkParent = checkParent.parent;
                            }

                            if (isVisual && parentLink) {
                                child.userData.parentLinkName = parentLink.name;
                                child.userData.isVisualMesh = true;
                                const key = `${parentLink.name}:visual`;
                                if (!newLinkMeshMap.has(key)) {
                                    newLinkMeshMap.set(key, []);
                                }
                                newLinkMeshMap.get(key)!.push(child);
                            }

                            child.visible = showVisualRef.current;
                        }
                    });

                    // Store the pre-built map
                    linkMeshMapRef.current = newLinkMeshMap;

                    // Store in ref for cleanup
                    robotRef.current = robotModel;
                    setRobot(robotModel);
                    setError(null);

                    if (onRobotLoaded) {
                        onRobotLoaded(robotModel);
                    }

                }
            } catch (err) {
                if (!abortController.aborted && isMountedRef.current) {
                    console.error('[URDFViewer] Failed to load URDF:', err);
                    setError(err instanceof Error ? err.message : 'Unknown error');
                }
            }
        };

        loadRobot();

        // Cleanup function - runs on unmount or when dependencies change
        return () => {
            // Mark this load as aborted to prevent state updates
            abortController.aborted = true;

            // Deep cleanup of robot resources
            if (robotRef.current) {
                // Remove from scene
                if (robotRef.current.parent) {
                    robotRef.current.parent.remove(robotRef.current);
                }
                // Dispose all geometries, materials (except shared), and textures
                disposeObject3D(robotRef.current, true, SHARED_MATERIALS);
                robotRef.current = null;
            }
        };
    }, [urdfContent, assets, invalidate, onRobotLoaded]);

    return {
        robot,
        error,
        robotVersion,
        robotRef,
        linkMeshMapRef
    };
}
