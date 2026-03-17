import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { URDFLoader } from '@/core/parsers/urdf/loader';
import { disposeObject3D } from '../utils/dispose';
import { collisionBaseMaterial, enhanceMaterials } from '../utils/materials';
import { parseURDFMaterials, applyURDFMaterials } from '../utils/urdfMaterials';
import { offsetRobotToGround } from '../utils/robotPositioning';
import { SHARED_MATERIALS } from '../constants';
import { createLoadingManager, createMeshLoader } from '@/core/loaders';
import { loadMJCFToThreeJS, isMJCFContent } from '@/core/parsers/mjcf';
import { parseURDF } from '@/core/parsers/urdf/parser';
import { getSourceFileDirectory } from '@/core/parsers/meshPathUtils';
import type { UrdfJoint, UrdfLink } from '@/types';
import { isSingleDofJoint } from '../utils/jointTypes';
import { detectSingleGeometryPatch, detectSingleJointPatch } from '../utils/robotLoaderDiff';
import { applyGeometryPatchInPlace } from '../utils/robotLoaderGeometryPatch';
import { patchJointInPlace } from '../utils/robotLoaderJointPatch';
import {
    disposeTempMaterialMap,
    markCollisionObject,
    markVisualObject,
} from '../utils/robotLoaderPatchUtils';

function preprocessURDFForLoader(content: string): string {
    // Remove <transmission> blocks to prevent urdf-loader from finding duplicate joints
    // which can overwrite valid joints with empty origins
    return content.replace(/<transmission[\s\S]*?<\/transmission>/g, '');
}

function resolveRobotSourceFormat(content: string, sourceFormat: 'auto' | 'urdf' | 'mjcf' = 'auto'): 'urdf' | 'mjcf' {
    if (sourceFormat === 'urdf' || sourceFormat === 'mjcf') {
        return sourceFormat;
    }

    return isMJCFContent(content) ? 'mjcf' : 'urdf';
}

export interface UseRobotLoaderOptions {
    urdfContent: string;
    assets: Record<string, string>;
    sourceFormat?: 'auto' | 'urdf' | 'mjcf';
    showCollision: boolean;
    showVisual: boolean;
    isMeshPreview?: boolean;
    robotLinks?: Record<string, UrdfLink>;
    robotJoints?: Record<string, UrdfJoint>;
    initialJointAngles?: Record<string, number>;
    sourceFilePath?: string;
    onRobotLoaded?: (robot: THREE.Object3D) => void;
    groundPlaneOffset?: number;
}

export interface UseRobotLoaderResult {
    robot: THREE.Object3D | null;
    error: string | null;
    robotVersion: number;
    robotRef: RefObject<THREE.Object3D | null>;
    linkMeshMapRef: RefObject<Map<string, THREE.Mesh[]>>;
}

export function useRobotLoader({
    urdfContent,
    assets,
    sourceFormat = 'auto',
    showCollision,
    showVisual,
    isMeshPreview = false,
    robotLinks,
    robotJoints,
    initialJointAngles,
    sourceFilePath,
    onRobotLoaded,
    groundPlaneOffset = 0,
}: UseRobotLoaderOptions): UseRobotLoaderResult {
    const [robot, setRobot] = useState<THREE.Object3D | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [robotVersion, setRobotVersion] = useState(0);
    const { invalidate } = useThree();

    // Ref to track current robot for proper cleanup (avoids stale closure issues)
    const robotRef = useRef<THREE.Object3D | null>(null);
    // Track component mount state for preventing state updates after unmount
    const isMountedRef = useRef(true);
    // Track loading abort controller to cancel duplicate loads
    const loadAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
    // Dispose the previously rendered robot only after the new one has had a chance to mount,
    // otherwise the canvas can flash a blank frame during file switching.
    const pendingDisposeRobotRef = useRef<THREE.Object3D | null>(null);
    const pendingDisposeFrameRef = useRef<number | null>(null);
    const groundAlignTimerRef = useRef<number[]>([]);

    // Refs for visibility state (used in loading callback)
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);
    const initialJointAnglesRef = useRef(initialJointAngles);

    // PERFORMANCE: Pre-built map of linkName -> meshes for O(1) highlight lookup
    const linkMeshMapRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
    // Track previous link snapshot to detect one-link geometry patches
    const prevRobotLinksRef = useRef<Record<string, UrdfLink> | null>(robotLinks || null);
    // Track previous joint snapshot to detect one-joint metadata/origin patches
    const prevRobotJointsRef = useRef<Record<string, UrdfJoint> | null>(robotJoints || null);
    // Skip exactly one upcoming urdfContent-driven full reload per successful
    // incremental patch. A counter is more robust than strict content matching
    // when robotLinks/robotJoints and urdfContent updates are not perfectly in sync.
    const skipReloadCountRef = useRef(0);
    const sourceFileDir = getSourceFileDirectory(sourceFilePath);
    const resolvedSourceFormat = resolveRobotSourceFormat(urdfContent, sourceFormat);

    // Keep refs in sync
    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);
    useEffect(() => { initialJointAnglesRef.current = initialJointAngles; }, [initialJointAngles]);

    const disposeRobotObject = useCallback((robotObject: THREE.Object3D | null) => {
        if (!robotObject) return;
        if (robotObject.parent) {
            robotObject.parent.remove(robotObject);
        }
        disposeObject3D(robotObject, true, SHARED_MATERIALS);
    }, []);

    const flushPendingRobotDispose = useCallback(() => {
        if (pendingDisposeFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(pendingDisposeFrameRef.current);
            pendingDisposeFrameRef.current = null;
        }

        if (pendingDisposeRobotRef.current) {
            const robotToDispose = pendingDisposeRobotRef.current;
            pendingDisposeRobotRef.current = null;
            disposeRobotObject(robotToDispose);
        }
    }, [disposeRobotObject]);

    const clearGroundAlignTimers = useCallback(() => {
        groundAlignTimerRef.current.forEach((timer) => window.clearTimeout(timer));
        groundAlignTimerRef.current = [];
    }, []);

    const schedulePreviousRobotDispose = useCallback((previousRobot: THREE.Object3D | null) => {
        if (!previousRobot) return;

        flushPendingRobotDispose();
        pendingDisposeRobotRef.current = previousRobot;

        const disposePreviousRobot = () => {
            pendingDisposeFrameRef.current = null;
            const robotToDispose = pendingDisposeRobotRef.current;
            pendingDisposeRobotRef.current = null;

            if (!robotToDispose || robotToDispose === robotRef.current) {
                return;
            }

            disposeRobotObject(robotToDispose);
        };

        if (typeof window !== 'undefined') {
            pendingDisposeFrameRef.current = window.requestAnimationFrame(() => {
                pendingDisposeFrameRef.current = window.requestAnimationFrame(disposePreviousRobot);
            });
            return;
        }

        queueMicrotask(disposePreviousRobot);
    }, [disposeRobotObject, flushPendingRobotDispose]);

    const scheduleGroundAlignment = useCallback((loadedRobot: THREE.Object3D) => {
        if (typeof window === 'undefined') {
            offsetRobotToGround(loadedRobot, groundPlaneOffset);
            return;
        }

        clearGroundAlignTimers();

        groundAlignTimerRef.current = [0, 80, 220, 500].map((delay) =>
            window.setTimeout(() => {
                if (!isMountedRef.current) return;
                if (robotRef.current !== loadedRobot) return;

                offsetRobotToGround(loadedRobot, groundPlaneOffset);
                invalidate();
            }, delay)
        );
    }, [clearGroundAlignTimers, groundPlaneOffset, invalidate]);

    // Incremental path: update exactly one changed link geometry in-place and skip next full URDF reload.
    useEffect(() => {
        if (isMeshPreview) return;
        if (!robotLinks) return;

        const previousLinks = prevRobotLinksRef.current;
        const currentRobot = robotRef.current;
        prevRobotLinksRef.current = robotLinks;

        if (!previousLinks || !currentRobot) return;
        if (resolvedSourceFormat === 'mjcf') return;

        const patch = detectSingleGeometryPatch(previousLinks, robotLinks);
        if (!patch) return;

        const applied = applyGeometryPatchInPlace({
            robotModel: currentRobot,
            patch,
            assets,
            sourceFileDir,
            showVisual: showVisualRef.current,
            showCollision: showCollisionRef.current,
            linkMeshMapRef,
            invalidate,
            isPatchTargetValid: () => isMountedRef.current && robotRef.current === currentRobot,
        });

        if (!applied) return;

        skipReloadCountRef.current += 1;
        setRobotVersion((v) => v + 1);
        setError(null);
    }, [robotLinks, resolvedSourceFormat, urdfContent, assets, invalidate, isMeshPreview, sourceFileDir]);

    // Incremental path: update exactly one changed joint in-place and skip next full URDF reload.
    useEffect(() => {
        if (isMeshPreview) return;
        if (!robotJoints) return;

        const previousJoints = prevRobotJointsRef.current;
        const currentRobot = robotRef.current;
        prevRobotJointsRef.current = robotJoints;

        if (!previousJoints || !currentRobot) return;
        if (resolvedSourceFormat === 'mjcf') return;

        const patch = detectSingleJointPatch(previousJoints, robotJoints);
        if (!patch) return;

        const applied = patchJointInPlace(currentRobot, patch, invalidate);
        if (!applied) return;

        skipReloadCountRef.current += 1;
        setRobotVersion((v) => v + 1);
        setError(null);
    }, [robotJoints, resolvedSourceFormat, urdfContent, invalidate, isMeshPreview]);

    // Track component mount state for preventing state updates after unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Cleanup on unmount ONLY
    useEffect(() => {
        return () => {
            clearGroundAlignTimers();
            flushPendingRobotDispose();

            // Deep cleanup of robot resources on unmount
            if (robotRef.current) {
                disposeRobotObject(robotRef.current);
                robotRef.current = null;
            }
        };
    }, [clearGroundAlignTimers, disposeRobotObject, flushPendingRobotDispose]);

    useEffect(() => {
        if (!robot) return;

        scheduleGroundAlignment(robot);

        return () => {
            clearGroundAlignTimers();
        };
    }, [clearGroundAlignTimers, robot, robotVersion, scheduleGroundAlignment, showCollision, showVisual]);

    // Load robot with proper cleanup and abort handling
    useEffect(() => {
        if (!urdfContent) return;
        if (skipReloadCountRef.current > 0) {
            skipReloadCountRef.current -= 1;
            return;
        }

        // Create abort controller for this load
        const abortController = { aborted: false };
        loadAbortRef.current = abortController;

        const loadRobot = async () => {
            try {
                // NOTE: We do NOT cleanup the previous robot here immediately.
                // We wait until the new robot is ready to avoid flickering/rendering disposed objects.

                let robotModel: THREE.Object3D | null = null;
                const isMJCFAsset = resolvedSourceFormat === 'mjcf';

                const finalizeLoadedRobot = (loadedRobot: THREE.Object3D) => {
                    if (abortController.aborted || !isMountedRef.current) {
                        if (robotRef.current !== loadedRobot) {
                            disposeObject3D(loadedRobot, true, SHARED_MATERIALS);
                        }
                        return;
                    }

                    if (!isMJCFAsset) {
                        const materials = parseURDFMaterials(urdfContent);
                        try {
                            applyURDFMaterials(loadedRobot, materials);
                        } finally {
                            disposeTempMaterialMap(materials);
                        }

                    }

                    enhanceMaterials(loadedRobot);

                    const newLinkMeshMap = new Map<string, THREE.Mesh[]>();

                    loadedRobot.traverse((child: any) => {
                        let parentLink: any = null;
                        let current = child;
                        while (current) {
                            if (current.isURDFLink || (loadedRobot as any).links?.[current.name]) {
                                parentLink = current;
                                break;
                            }
                            current = current.parent;
                        }

                        if (child.isURDFCollider) {
                            child.visible = showCollisionRef.current;
                            if (parentLink) {
                                markCollisionObject(child, parentLink.name);
                            } else {
                                child.traverse((inner: any) => {
                                    if (!inner.isMesh) return;
                                    inner.userData.isCollisionMesh = true;
                                    inner.material = collisionBaseMaterial;
                                    inner.renderOrder = 999;
                                });
                            }
                            child.traverse((inner: any) => {
                                if (!inner.isMesh) return;

                                inner.userData.isCollisionMesh = true;
                                if (parentLink) {
                                    inner.userData.parentLinkName = parentLink.name;
                                    const key = `${parentLink.name}:collision`;
                                    if (!newLinkMeshMap.has(key)) {
                                        newLinkMeshMap.set(key, []);
                                    }
                                    newLinkMeshMap.get(key)!.push(inner);
                                }
                            });
                            return;
                        }

                        if (!child.isMesh || child.userData.isCollisionMesh) {
                            return;
                        }

                        let isVisual = false;
                        let checkParent = child.parent;
                        while (checkParent) {
                            if (checkParent.isURDFCollider) {
                                break;
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
                    });

                    const nextJointAngles = initialJointAnglesRef.current;
                    if (nextJointAngles && (loadedRobot as any).joints) {
                        Object.entries(nextJointAngles).forEach(([jointName, angle]) => {
                            const joint = (loadedRobot as any).joints?.[jointName];
                            if (!isSingleDofJoint(joint) || typeof angle !== 'number') {
                                return;
                            }

                            joint.setJointValue?.(angle);
                        });
                        loadedRobot.updateMatrixWorld(true);
                    }

                    offsetRobotToGround(loadedRobot, groundPlaneOffset);

                    const previousRobot = robotRef.current;

                    linkMeshMapRef.current = newLinkMeshMap;
                    robotRef.current = loadedRobot;
                    setRobot(loadedRobot);
                    setRobotVersion((v) => v + 1);
                    setError(null);
                    invalidate();
                    scheduleGroundAlignment(loadedRobot);

                    if (previousRobot && previousRobot !== loadedRobot) {
                        schedulePreviousRobotDispose(previousRobot);
                    }

                    onRobotLoaded?.(loadedRobot);
                };

                // Check if content is MJCF (MuJoCo XML)
                if (isMJCFAsset) {
                    robotModel = await loadMJCFToThreeJS(urdfContent, assets);

                    if (abortController.aborted) {
                        if (robotModel) {
                            disposeObject3D(robotModel, true, SHARED_MATERIALS);
                        }
                        return;
                    }
                } else {
                    // Standard URDF loading
                    const urdfDir = sourceFileDir;
                    const manager = createLoadingManager(assets, urdfDir);
                    manager.onLoad = () => {
                        if (!robotModel) return;
                        finalizeLoadedRobot(robotModel);
                    };
                    // Use new local URDFLoader
                    const loader = new URDFLoader(manager);
                    loader.parseCollision = true;
                    loader.parseVisual = true;
                    // Fix: loader.loadMeshCb expects 3 args (path, manager, done)
                    loader.loadMeshCb = createMeshLoader(assets, manager, urdfDir);
                    loader.packages = '';

                    const loadCompletionKey = '__urdf_studio_robot_finalize__';
                    manager.itemStart(loadCompletionKey);
                    try {
                        const cleanContent = preprocessURDFForLoader(urdfContent);
                        robotModel = loader.parse(cleanContent);

                        const fullRobotState = parseURDF(urdfContent);
                        if (fullRobotState && fullRobotState.joints && (robotModel as any).joints) {
                            Object.entries((robotModel as any).joints).forEach(([name, joint]: [string, any]) => {
                                const parsedJoint = fullRobotState.joints[name];
                                if (parsedJoint && parsedJoint.limit) {
                                    if (!joint.limit) joint.limit = {};
                                    joint.limit.effort = parsedJoint.limit.effort;
                                    joint.limit.velocity = parsedJoint.limit.velocity;
                                    if (joint.limit.lower === undefined) joint.limit.lower = parsedJoint.limit.lower;
                                    if (joint.limit.upper === undefined) joint.limit.upper = parsedJoint.limit.upper;
                                }
                            });
                        }

                        if (abortController.aborted) {
                            if (robotModel) {
                                disposeObject3D(robotModel, true, SHARED_MATERIALS);
                            }
                            return;
                        }
                    } finally {
                        manager.itemEnd(loadCompletionKey);
                    }

                    return;
                }

                if (robotModel && isMountedRef.current) {
                    finalizeLoadedRobot(robotModel);
                } else if (robotModel) {
                     // Aborted or unmounted after load but before we could use it
                     disposeObject3D(robotModel, true, SHARED_MATERIALS);
                }
            } catch (err) {
                if (!abortController.aborted && isMountedRef.current) {
                    console.error('[URDFViewer] Failed to load URDF:', err);
                    setError(err instanceof Error ? err.message : 'Unknown error');
                }
            }
        };

        loadRobot();

        // Cleanup function - runs when dependencies change
        return () => {
            // Mark this load as aborted to prevent state updates
            abortController.aborted = true;
            clearGroundAlignTimers();

            // NOTE: We do NOT dispose robotRef.current here.
            // We allow the old robot to persist until the new one is ready, 
            // or until the component unmounts (handled by the separate useEffect).
        };
    }, [assets, clearGroundAlignTimers, groundPlaneOffset, invalidate, onRobotLoaded, resolvedSourceFormat, scheduleGroundAlignment, sourceFileDir, urdfContent]);

    return {
        robot,
        error,
        robotVersion,
        robotRef,
        linkMeshMapRef
    };
}
