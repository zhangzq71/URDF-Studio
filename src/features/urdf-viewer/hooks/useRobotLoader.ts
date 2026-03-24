import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { URDFLoader } from '@/core/parsers/urdf/loader';
import { disposeObject3D } from '../utils/dispose';
import {
    alignRobotToGroundBeforeFirstMount,
    beginInitialGroundAlignment,
    offsetRobotToGround,
    setInitialGroundAlignment,
    setPreserveAuthoredRootTransform,
} from '../utils/robotPositioning';
import { SHARED_MATERIALS } from '../constants';
import {
    buildColladaRootNormalizationHints,
    createLoadingManager,
    createMeshLoader,
} from '@/core/loaders';
import { collectExplicitlyScaledMeshPaths } from '@/core/loaders/meshScaleHints';
import { loadMJCFToThreeJS, isMJCFContent } from '@/core/parsers/mjcf';
import { parseURDF } from '@/core/parsers/urdf/parser';
import { getSourceFileDirectory } from '@/core/parsers/meshPathUtils';
import type { UrdfJoint, UrdfLink } from '@/types';
import { setRegressionRuntimeRobot } from '@/shared/debug/regressionBridge';
import { isSingleDofJoint } from '../utils/jointTypes';
import { detectSingleGeometryPatch, detectSingleJointPatch } from '../utils/robotLoaderDiff';
import { applyGeometryPatchInPlace } from '../utils/robotLoaderGeometryPatch';
import { patchJointInPlace } from '../utils/robotLoaderJointPatch';
import { parseURDFMaterials } from '../utils/urdfMaterials';
import { syncLoadedRobotScene } from '../utils/loadedRobotSceneSync';
import { shouldMountRobotBeforeAssetsComplete } from '../utils/loadStrategy';

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

function waitForLoadingHudPaint(invalidate?: () => void): Promise<void> {
    invalidate?.();

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

type RobotLoadingPhase = 'preparing-scene' | 'streaming-meshes' | 'finalizing-scene' | 'ready';

interface RobotLoadingProgress {
    phase: RobotLoadingPhase;
    loadedCount?: number | null;
    totalCount?: number | null;
    progressPercent?: number | null;
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
    isLoading: boolean;
    loadingProgress: RobotLoadingProgress | null;
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
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<RobotLoadingProgress | null>(null);
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
    const deferredSceneSyncTimerRef = useRef<number[]>([]);

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

    const clearDeferredSceneSyncTimers = useCallback(() => {
        deferredSceneSyncTimerRef.current.forEach((timer) => window.clearTimeout(timer));
        deferredSceneSyncTimerRef.current = [];
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
        if (!beginInitialGroundAlignment(loadedRobot)) {
            return;
        }

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

        const colladaRootNormalizationHints = buildColladaRootNormalizationHints(robotLinks);

        const applied = applyGeometryPatchInPlace({
            robotModel: currentRobot,
            patch,
            assets,
            sourceFileDir,
            colladaRootNormalizationHints,
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
            clearDeferredSceneSyncTimers();
            flushPendingRobotDispose();

            // Deep cleanup of robot resources on unmount
            if (robotRef.current) {
                disposeRobotObject(robotRef.current);
                robotRef.current = null;
            }
        };
    }, [clearDeferredSceneSyncTimers, clearGroundAlignTimers, disposeRobotObject, flushPendingRobotDispose]);

    useEffect(() => {
        if (!import.meta.env.DEV || isMeshPreview) {
            return;
        }

        setRegressionRuntimeRobot(robot);

        return () => {
            setRegressionRuntimeRobot(null);
        };
    }, [isMeshPreview, robot]);

    useEffect(() => {
        return () => {
            clearGroundAlignTimers();
            clearDeferredSceneSyncTimers();
        };
    }, [clearDeferredSceneSyncTimers, clearGroundAlignTimers]);

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
                setIsLoading(true);
                setLoadingProgress({
                    phase: 'preparing-scene',
                    progressPercent: 0,
                });
                setError(null);
                clearDeferredSceneSyncTimers();
                await waitForLoadingHudPaint(invalidate);

                if (abortController.aborted || !isMountedRef.current) {
                    return;
                }

                // NOTE: We do NOT cleanup the previous robot here immediately.
                // We wait until the new robot is ready to avoid flickering/rendering disposed objects.

                let robotModel: THREE.Object3D | null = null;
                let hasMountedRobot = false;
                const isMJCFAsset = resolvedSourceFormat === 'mjcf';
                const preserveAuthoredRootTransform = false;
                const urdfMaterials = isMJCFAsset ? null : parseURDFMaterials(urdfContent);

                const syncLoadedRobot = (loadedRobot: THREE.Object3D) => {
                    const { changed, linkMeshMap } = syncLoadedRobotScene({
                        robot: loadedRobot,
                        sourceFormat: resolvedSourceFormat,
                        showCollision: showCollisionRef.current,
                        showVisual: showVisualRef.current,
                        urdfMaterials,
                    });

                    linkMeshMapRef.current = linkMeshMap;
                    return changed;
                };

                const scheduleDeferredSceneSync = (loadedRobot: THREE.Object3D) => {
                    if (isMJCFAsset || typeof window === 'undefined') {
                        return;
                    }

                    clearDeferredSceneSyncTimers();
                    deferredSceneSyncTimerRef.current = [0, 80, 220, 500].map((delay) =>
                        window.setTimeout(() => {
                            if (!isMountedRef.current) return;
                            if (robotRef.current !== loadedRobot) return;

                            const changed = syncLoadedRobot(loadedRobot);
                            if (!changed) return;

                            setRobotVersion((value) => value + 1);
                            invalidate();
                        }, delay),
                    );
                };

                const mountLoadedRobot = (loadedRobot: THREE.Object3D) => {
                    if (hasMountedRobot) {
                        return;
                    }

                    if (abortController.aborted || !isMountedRef.current) {
                        if (robotRef.current !== loadedRobot) {
                            disposeObject3D(loadedRobot, true, SHARED_MATERIALS);
                        }
                        return;
                    }

                    hasMountedRobot = true;
                    setPreserveAuthoredRootTransform(loadedRobot, preserveAuthoredRootTransform);
                    syncLoadedRobot(loadedRobot);

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

                    // Place the robot on the ground before the first visible mount so
                    // the scene never shows it popping up from below the grid.
                    alignRobotToGroundBeforeFirstMount(loadedRobot, groundPlaneOffset);

                    const previousRobot = robotRef.current;

                    robotRef.current = loadedRobot;
                    setRobot(loadedRobot);
                    setRobotVersion((v) => v + 1);
                    setError(null);
                    invalidate();
                    scheduleGroundAlignment(loadedRobot);
                    scheduleDeferredSceneSync(loadedRobot);

                    if (previousRobot && previousRobot !== loadedRobot) {
                        schedulePreviousRobotDispose(previousRobot);
                    }
                };

                const finalizeLoadedRobot = (loadedRobot: THREE.Object3D) => {
                    const wasMountedBeforeFinalize = hasMountedRobot;
                    mountLoadedRobot(loadedRobot);
                    if (abortController.aborted || !isMountedRef.current) {
                        return;
                    }

                    const changed = syncLoadedRobot(loadedRobot);
                    if (changed) {
                        setRobotVersion((value) => value + 1);
                    }

                    setIsLoading(false);
                    setLoadingProgress(null);
                    setError(null);
                    invalidate();
                    if (wasMountedBeforeFinalize) {
                        setInitialGroundAlignment(loadedRobot, false);
                    }
                    scheduleGroundAlignment(loadedRobot);
                    onRobotLoaded?.(loadedRobot);
                };

                // Check if content is MJCF (MuJoCo XML)
                if (isMJCFAsset) {
                    robotModel = await loadMJCFToThreeJS(urdfContent, assets, sourceFileDir, (nextProgress) => {
                        if (abortController.aborted || !isMountedRef.current) {
                            return;
                        }

                        setLoadingProgress(nextProgress.phase === 'ready' ? null : {
                            phase: nextProgress.phase,
                            loadedCount: nextProgress.loadedCount ?? null,
                            totalCount: nextProgress.totalCount ?? null,
                            progressPercent: nextProgress.progressPercent ?? null,
                        });
                    });

                    if (abortController.aborted) {
                        if (robotModel) {
                            disposeObject3D(robotModel, true, SHARED_MATERIALS);
                        }
                        return;
                    }
                } else {
                    // Standard URDF loading
                    const urdfDir = sourceFileDir;
                    const fullRobotState = parseURDF(urdfContent);
                    const explicitlyScaledMeshPaths = collectExplicitlyScaledMeshPaths(fullRobotState);
                    const colladaRootNormalizationHints = buildColladaRootNormalizationHints(fullRobotState.links);
                    const manager = createLoadingManager(assets, urdfDir);
                    manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
                        if (abortController.aborted || !isMountedRef.current) {
                            return;
                        }

                        const adjustedTotalCount = Math.max(0, itemsTotal - 1);
                        if (adjustedTotalCount <= 0) {
                            return;
                        }

                        setLoadingProgress({
                            phase: 'streaming-meshes',
                            loadedCount: Math.min(itemsLoaded, adjustedTotalCount),
                            totalCount: adjustedTotalCount,
                            progressPercent: null,
                        });
                    };
                    manager.onLoad = () => {
                        if (!robotModel) return;
                        if (!abortController.aborted && isMountedRef.current) {
                            setLoadingProgress((current) => ({
                                phase: 'finalizing-scene',
                                loadedCount: current?.totalCount ?? current?.loadedCount ?? null,
                                totalCount: current?.totalCount ?? null,
                                progressPercent: current?.totalCount ? 100 : 96,
                            }));
                        }
                        finalizeLoadedRobot(robotModel);
                    };
                    // Use new local URDFLoader
                    const loader = new URDFLoader(manager);
                    loader.parseCollision = true;
                    loader.parseVisual = true;
                    loader.loadMeshCb = createMeshLoader(assets, manager, urdfDir, {
                        colladaRootNormalizationHints,
                        explicitScaleMeshPaths: explicitlyScaledMeshPaths,
                    });
                    loader.packages = '';

                    const loadCompletionKey = '__urdf_studio_robot_finalize__';
                    manager.itemStart(loadCompletionKey);
                    try {
                        const cleanContent = preprocessURDFForLoader(urdfContent);
                        robotModel = loader.parse(cleanContent);
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

                        if (shouldMountRobotBeforeAssetsComplete(resolvedSourceFormat)) {
                            mountLoadedRobot(robotModel);
                        }
                    } finally {
                        manager.itemEnd(loadCompletionKey);
                    }

                    return;
                }

                if (robotModel && isMountedRef.current) {
                    setLoadingProgress((current) => current ?? {
                        phase: 'finalizing-scene',
                        progressPercent: 96,
                    });
                    finalizeLoadedRobot(robotModel);
                } else if (robotModel) {
                     // Aborted or unmounted after load but before we could use it
                     disposeObject3D(robotModel, true, SHARED_MATERIALS);
                }
            } catch (err) {
                if (!abortController.aborted && isMountedRef.current) {
                    console.error('[URDFViewer] Failed to load URDF:', err);
                    setError(err instanceof Error ? err.message : 'Unknown error');
                    setIsLoading(false);
                    setLoadingProgress(null);
                }
            }
        };

        loadRobot();

        // Cleanup function - runs when dependencies change
        return () => {
            // Mark this load as aborted to prevent state updates
            abortController.aborted = true;
            clearGroundAlignTimers();
            clearDeferredSceneSyncTimers();

            // NOTE: We do NOT dispose robotRef.current here.
            // We allow the old robot to persist until the new one is ready, 
            // or until the component unmounts (handled by the separate useEffect).
        };
    }, [assets, clearDeferredSceneSyncTimers, clearGroundAlignTimers, groundPlaneOffset, invalidate, onRobotLoaded, resolvedSourceFormat, scheduleGroundAlignment, sourceFileDir, urdfContent]);

    return {
        robot,
        error,
        isLoading,
        loadingProgress,
        robotVersion,
        robotRef,
        linkMeshMapRef
    };
}
