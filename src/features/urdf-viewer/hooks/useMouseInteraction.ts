import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { throttle } from '@/shared/utils';
import { THROTTLE_INTERVAL } from '../constants';
import type { ToolMode } from '../types';
import { isSingleDofJoint } from '../utils/jointTypes';
import { collectGizmoRaycastTargets, findFirstIntersection, isGizmoObject } from '../utils/raycast';
import { collectPickTargets, findPickIntersections, type PickTargetMode } from '../utils/pickTargets';
import { resolveSelectionTarget } from '../utils/selectionTargets';
import { resolveEffectiveInteractionSubType } from '../utils/interactionMode';
import { resolveRevoluteDragDelta } from '../utils/jointDragDelta';
import { createJointDragStoreSync } from '../utils/jointDragStoreSync';
import { resolveActiveViewerJointKeyFromSelection } from '../utils/activeJointSelection';
import { resolveMouseDownSelectionPlan } from '../utils/mouseDownSelectionPlan';
import {
    armSelectionMissGuard,
    clearSelectionMissGuardTimer,
    scheduleSelectionMissGuardReset,
} from '../utils/selectionMissGuard';

const JOINT_DRAG_EPSILON = 1e-5;
const MAX_REVOLUTE_DELTA_PER_EVENT = Math.PI / 8;
const JOINT_DRAG_STORE_SYNC_INTERVAL = 16;

export interface UseMouseInteractionOptions {
    robot: THREE.Object3D | null;
    robotVersion: number;
    toolMode: ToolMode;
    mode?: 'detail' | 'hardware';
    highlightMode: 'link' | 'collision';
    showCollision: boolean;
    showVisual: boolean;
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision', objectIndex?: number) => void;
    onSelect?: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
    onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
    onJointChange?: (name: string, angle: number) => void;
    onJointChangeCommit?: (name: string, angle: number) => void;
    throttleJointChangeDuringDrag?: boolean;
    setIsDragging?: (dragging: boolean) => void;
    setActiveJoint?: (jointName: string | null) => void;
    justSelectedRef?: React.RefObject<boolean>;
    isOrbitDragging?: React.RefObject<boolean>;
    isSelectionLockedRef?: React.RefObject<boolean>;
    selection?: {
        type: 'link' | 'joint' | null;
        id: string | null;
    };
    highlightGeometry: (
        linkName: string | null,
        revert: boolean,
        subType?: 'visual' | 'collision',
        meshToHighlight?: THREE.Object3D | null | number
    ) => void;
}

export interface UseMouseInteractionResult {
    mouseRef: React.RefObject<THREE.Vector2>;
    raycasterRef: React.RefObject<THREE.Raycaster>;
    hoveredLinkRef: React.RefObject<string | null>;
    isDraggingJoint: React.RefObject<boolean>;
    needsRaycastRef: React.RefObject<boolean>;
    lastMousePosRef: React.RefObject<{ x: number; y: number }>;
}

export function useMouseInteraction({
    robot,
    robotVersion,
    toolMode,
    mode,
    highlightMode,
    showCollision,
    showVisual,
    linkMeshMapRef,
    onHover,
    onSelect,
    onMeshSelect,
    onJointChange,
    onJointChangeCommit,
    throttleJointChangeDuringDrag = false,
    setIsDragging,
    setActiveJoint,
    justSelectedRef,
    isOrbitDragging,
    isSelectionLockedRef,
    selection,
    highlightGeometry
}: UseMouseInteractionOptions): UseMouseInteractionResult {
    const { camera, gl, scene, invalidate } = useThree();
    const orbitControls = useThree((state) => state.controls as { enabled?: boolean } | undefined);

    const mouseRef = useRef(new THREE.Vector2(-1000, -1000));
    const raycasterRef = useRef(new THREE.Raycaster());
    const hoveredLinkRef = useRef<string | null>(null);
    const useExternalHover = typeof onHover === 'function';

    // PERFORMANCE: Track last mouse position for state locking (skip small movements)
    const lastMousePosRef = useRef({ x: 0, y: 0 });
    // OPTIMIZATION: Signal that raycast is needed on next frame
    const needsRaycastRef = useRef(false);

    const isDraggingJoint = useRef(false);
    const dragJoint = useRef<any>(null);
    const dragHitDistance = useRef(0);
    const lastRayRef = useRef(new THREE.Ray());
    const selectionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gizmoTargetsRef = useRef<THREE.Object3D[]>([]);
    const gizmoTargetsCacheKeyRef = useRef('');
    const gizmoTargetsUpdatedAtRef = useRef(0);
    const pickTargetCachesRef = useRef<Record<PickTargetMode, {
        key: string;
        updatedAt: number;
        targets: THREE.Object3D[];
    }>>({
        all: { key: '', updatedAt: 0, targets: [] },
        visual: { key: '', updatedAt: 0, targets: [] },
        collision: { key: '', updatedAt: 0, targets: [] }
    });

    // Keep refs up to date
    const onJointChangeRef = useRef(onJointChange);
    const onJointChangeCommitRef = useRef(onJointChangeCommit);
    const setIsDraggingRef = useRef(setIsDragging);
    const setActiveJointRef = useRef(setActiveJoint);
    const invalidateRef = useRef(invalidate);

    useEffect(() => {
        invalidateRef.current = invalidate;
        onJointChangeRef.current = onJointChange;
        onJointChangeCommitRef.current = onJointChangeCommit;
        setIsDraggingRef.current = setIsDragging;
        setActiveJointRef.current = setActiveJoint;
    }, [invalidate, onJointChange, onJointChangeCommit, setIsDragging, setActiveJoint]);

    // Mouse tracking for hover detection AND joint dragging
    useEffect(() => {
        const getGizmoTargets = () => {
            const nextCacheKey = `${scene.children.length}:${toolMode}:${mode ?? 'detail'}:${robot ? 'robot' : 'empty'}`;
            const now = performance.now();

            if (
                gizmoTargetsCacheKeyRef.current !== nextCacheKey
                || now - gizmoTargetsUpdatedAtRef.current > 120
            ) {
                gizmoTargetsRef.current = collectGizmoRaycastTargets(scene);
                gizmoTargetsCacheKeyRef.current = nextCacheKey;
                gizmoTargetsUpdatedAtRef.current = now;
            }

            return gizmoTargetsRef.current;
        };

        const getPickTargets = (targetMode: PickTargetMode) => {
            const cache = pickTargetCachesRef.current[targetMode];
            const nextCacheKey = [
                robotVersion,
                targetMode,
                highlightMode,
                showCollision ? 'col:1' : 'col:0',
                showVisual ? 'vis:1' : 'vis:0',
                linkMeshMapRef.current.size
            ].join(':');
            const now = performance.now();

            if (
                cache.key !== nextCacheKey
                || now - cache.updatedAt > 120
            ) {
                cache.targets = collectPickTargets(linkMeshMapRef.current, targetMode);
                cache.key = nextCacheKey;
                cache.updatedAt = now;
            }

            return cache.targets;
        };

        const setOrbitControlsEnabled = (enabled: boolean) => {
            if (orbitControls && typeof orbitControls.enabled === 'boolean') {
                orbitControls.enabled = enabled;
            }

            if (!enabled && isOrbitDragging) {
                isOrbitDragging.current = false;
            }
        };

        const updatePointerFromClient = (clientX: number, clientY: number) => {
            const rect = gl.domElement.getBoundingClientRect();
            mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            raycasterRef.current.setFromCamera(mouseRef.current, camera);
        };

        const shouldBlockOrbitForPointer = (clientX: number, clientY: number) => {
            if (!robot) return false;

            const isStandardSelectionMode = ['select', 'translate', 'rotate', 'universal', 'measure'].includes(toolMode || 'select');
            if (!isStandardSelectionMode) return false;
            const isTransformTool = toolMode === 'translate' || toolMode === 'rotate' || toolMode === 'universal';

            // In detail mode with transform tools, UnifiedTransformControls handles
            // gizmo picking and orbit passthrough via its own picker-based mechanism.
            // Avoid blocking orbit here based on visible gizmo mesh hits, which can
            // diverge from picker mesh hits after thickness patching.
            if (mode === 'detail' && isTransformTool) {
                return false;
            }

            updatePointerFromClient(clientX, clientY);

            const gizmoTargets = getGizmoTargets();
            const nearestSceneHit = gizmoTargets.length > 0
                ? raycasterRef.current.intersectObjects(gizmoTargets, false)[0]
                : undefined;
            if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
                return true;
            }

            return findPickIntersections(robot, raycasterRef.current, getPickTargets('all'), 'all').length > 0;
        };

        const handlePointerDownCapture = (event: PointerEvent) => {
            if (shouldBlockOrbitForPointer(event.clientX, event.clientY)) {
                setOrbitControlsEnabled(false);
            }
        };

        const jointDragStoreSync = createJointDragStoreSync({
            onDragChange: (jointName, angle) => {
                onJointChangeRef.current?.(jointName, angle);
            },
            onDragCommit: (jointName, angle) => {
                onJointChangeCommitRef.current?.(jointName, angle);
            },
            // Keep drag motion fully local in Three.js, but cap React/store sync to once per frame.
            throttleChanges: throttleJointChangeDuringDrag,
            intervalMs: JOINT_DRAG_STORE_SYNC_INTERVAL,
        });

        const tempWorldQuat = new THREE.Quaternion();
        const tempAxisWorld = new THREE.Vector3();
        const tempPivotPoint = new THREE.Vector3();
        const tempPlane = new THREE.Plane();
        const tempProjStart = new THREE.Vector3();
        const tempProjEnd = new THREE.Vector3();
        const tempCross = new THREE.Vector3();
        const tempDelta = new THREE.Vector3();
        const tempPrevHitPoint = new THREE.Vector3();
        const tempNewHitPoint = new THREE.Vector3();
        const tempTangentWorld = new THREE.Vector3();
        const tempCameraView = new THREE.Vector3();
        const tempCameraForward = new THREE.Vector3();

        const syncJointWorldFrame = (joint: any) => {
            const axis = joint.axis || new THREE.Vector3(0, 0, 1);
            joint.getWorldQuaternion(tempWorldQuat);

            tempAxisWorld.copy(axis).applyQuaternion(tempWorldQuat).normalize();
            tempPivotPoint.setFromMatrixPosition(joint.matrixWorld);
        };

        /**
         * Find the parent link of the clicked object
         */
        const findParentLink = (hitObject: THREE.Object3D): THREE.Object3D | null => {
            let current: THREE.Object3D | null = hitObject;
            while (current) {
                if (current.userData?.isGizmo) return null;
                if ((current as any).isURDFLink || (current as any).type === 'URDFLink') {
                    return current;
                }
                if ((robot as any)?.links?.[current.name]) {
                    return current;
                }
                if (current === robot) break;
                current = current.parent;
            }
            return null;
        };

        /**
         * Find the parent joint of a link (for drag rotation)
         */
        const findParentJoint = (linkObject: THREE.Object3D | null): any => {
            if (!linkObject) return null;

            let current: THREE.Object3D | null = linkObject.parent;

            while (current && current !== robot) {
                if ((current as any).isURDFJoint || (current as any).type === 'URDFJoint') {
                    // Skip non-interactive joints (fixed, floating, planar, etc.)
                    if (!isSingleDofJoint(current)) {
                        let parentLink: THREE.Object3D | null = current.parent;
                        while (parentLink && parentLink !== robot) {
                            if ((parentLink as any).isURDFLink || (parentLink as any).type === 'URDFLink') {
                                return findParentJoint(parentLink);
                            }
                            parentLink = parentLink.parent;
                        }
                        return null;
                    }

                    return current;
                }

                current = current.parent;
            }

            return null;
        };

        const syncActiveJointFromCurrentSelection = () => {
            if (!setActiveJointRef.current) {
                return;
            }

            const activeJointKey = resolveActiveViewerJointKeyFromSelection(
                (robot as { joints?: Record<string, unknown> } | null)?.joints,
                selection,
            );

            if (activeJointKey) {
                setActiveJointRef.current(activeJointKey);
            }
        };

        const getRevoluteDelta = (
            joint: any,
            startPt: THREE.Vector3,
            endPt: THREE.Vector3
        ): number => {
            syncJointWorldFrame(joint);
            tempPlane.setFromNormalAndCoplanarPoint(tempAxisWorld, tempPivotPoint);

            tempPlane.projectPoint(startPt, tempProjStart);
            tempPlane.projectPoint(endPt, tempProjEnd);

            tempProjStart.sub(tempPivotPoint);
            tempProjEnd.sub(tempPivotPoint);

            if (
                tempProjStart.lengthSq() <= JOINT_DRAG_EPSILON ||
                tempProjEnd.lengthSq() <= JOINT_DRAG_EPSILON
            ) {
                return 0;
            }

            tempCross.crossVectors(tempProjStart, tempProjEnd);
            const worldDelta = Math.atan2(
                tempCross.dot(tempAxisWorld),
                tempProjStart.dot(tempProjEnd)
            );
            tempCameraView.copy(camera.position).sub(startPt);
            if (tempCameraView.lengthSq() <= JOINT_DRAG_EPSILON) {
                camera.getWorldDirection(tempCameraView).multiplyScalar(-1);
            } else {
                tempCameraView.normalize();
            }

            camera.getWorldDirection(tempCameraForward);
            tempTangentWorld.copy(tempCameraForward).cross(tempAxisWorld);
            const tangentDelta = tempTangentWorld.lengthSq() > JOINT_DRAG_EPSILON
                ? tempTangentWorld.dot(tempDelta.subVectors(endPt, startPt))
                : 0;

            return resolveRevoluteDragDelta({
                worldDelta,
                tangentDelta,
                planeFacingRatio: Math.abs(tempCameraView.dot(tempAxisWorld)),
                epsilon: JOINT_DRAG_EPSILON,
                maxDelta: MAX_REVOLUTE_DELTA_PER_EVENT
            });
        };

        const getPrismaticDelta = (joint: any, startPt: THREE.Vector3, endPt: THREE.Vector3): number => {
            syncJointWorldFrame(joint);
            tempDelta.subVectors(endPt, startPt);
            return tempDelta.dot(tempAxisWorld);
        };

        const moveRay = (toRay: THREE.Ray) => {
            if (!isDraggingJoint.current || !dragJoint.current) return;

            let delta = 0;
            const jt = dragJoint.current.jointType;

            if (jt === 'revolute' || jt === 'continuous') {
                lastRayRef.current.at(dragHitDistance.current, tempPrevHitPoint);
                toRay.at(dragHitDistance.current, tempNewHitPoint);
                delta = getRevoluteDelta(
                    dragJoint.current,
                    tempPrevHitPoint,
                    tempNewHitPoint
                );
            } else if (jt === 'prismatic') {
                lastRayRef.current.at(dragHitDistance.current, tempPrevHitPoint);
                toRay.at(dragHitDistance.current, tempNewHitPoint);
                delta = getPrismaticDelta(dragJoint.current, tempPrevHitPoint, tempNewHitPoint);
            }

            if (Math.abs(delta) > JOINT_DRAG_EPSILON) {
                const currentAngle = dragJoint.current.angle ?? dragJoint.current.jointValue ?? 0;
                let newAngle = currentAngle + delta;

                const limit = dragJoint.current.limit;
                const hasFiniteLimit = limit
                    && Number.isFinite(limit.lower)
                    && Number.isFinite(limit.upper);
                if ((jt === 'revolute' || jt === 'prismatic') && hasFiniteLimit) {
                    newAngle = Math.max(limit.lower, Math.min(limit.upper, newAngle));
                }

                if (Math.abs(newAngle - currentAngle) > JOINT_DRAG_EPSILON && dragJoint.current.setJointValue) {
                    dragJoint.current.setJointValue(newAngle);
                    jointDragStoreSync.emit(dragJoint.current.name, newAngle);
                }
            }

            lastRayRef.current.copy(toRay);
        };

        // Core mouse move logic (will be throttled for hover, but immediate for dragging)
        const handleMouseMoveCore = (e: MouseEvent) => {
            lastMousePosRef.current.x = e.clientX;
            lastMousePosRef.current.y = e.clientY;

            updatePointerFromClient(e.clientX, e.clientY);
            needsRaycastRef.current = true;

            if (!isOrbitDragging?.current) {
                invalidateRef.current();
            }
        };

        // Throttled version for hover detection
        const throttledMouseMove = throttle(handleMouseMoveCore, THROTTLE_INTERVAL);

        // Full handler: immediate for joint dragging, throttled for hover
        const handleMouseMove = (e: MouseEvent) => {
            // Joint dragging needs immediate response - bypass throttle
            if (isDraggingJoint.current && dragJoint.current) {
                updatePointerFromClient(e.clientX, e.clientY);
                moveRay(raycasterRef.current.ray);
                invalidateRef.current();
            } else {
                // Throttled for normal hover detection
                throttledMouseMove(e);
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (!robot) return;
            if (isSelectionLockedRef?.current) return;

            const isStandardSelectionMode = ['select', 'translate', 'rotate', 'universal', 'measure'].includes(toolMode || 'select');

            if (!isStandardSelectionMode) return;

            // CRITICAL: Only allow selection if the corresponding display option is enabled
            const { subType: activeInteractionSubType } = resolveEffectiveInteractionSubType(
                highlightMode,
                showVisual,
                showCollision
            );
            if (!activeInteractionSubType) {
                return;
            }
            const isCollisionInteraction = activeInteractionSubType === 'collision';

            updatePointerFromClient(e.clientX, e.clientY);

            // IMPORTANT:
            // TransformControls gizmo is not a child of `robot`.
            // If we only raycast `robot`, clicking gizmo will "pass through" and select
            // underlying collision/visual meshes by mistake.
            const gizmoTargets = getGizmoTargets();
            const pickTargets = getPickTargets(activeInteractionSubType);
            const nearestSceneHit = gizmoTargets.length > 0
                ? raycasterRef.current.intersectObjects(gizmoTargets, false)[0]
                : undefined;
            if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
                syncActiveJointFromCurrentSelection();
                return;
            }

            const intersections = findPickIntersections(
                robot,
                raycasterRef.current,
                pickTargets,
                activeInteractionSubType
            );

            const hit = findFirstIntersection(intersections, (rayHit) => {
                if (rayHit.object.userData?.isGizmo) return false;
                let p = rayHit.object.parent;
                while (p) {
                    if (p.userData?.isGizmo) return false;
                    p = p.parent;
                }
                if (isCollisionInteraction) {
                    let obj: THREE.Object3D | null = rayHit.object;
                    let isCollision = false;
                    while (obj) {
                        if (obj.userData?.isCollisionMesh || (obj as any).isURDFCollider) {
                            isCollision = true;
                            break;
                        }
                        obj = obj.parent;
                    }
                    return isCollision;
                }
                let obj: THREE.Object3D | null = rayHit.object;
                while (obj) {
                    if (obj.userData?.isCollisionMesh || (obj as any).isURDFCollider) {
                        return false;
                    }
                    obj = obj.parent;
                }
                return true;
            });

            if (hit) {
                armSelectionMissGuard(justSelectedRef);

                const linkObj = findParentLink(hit.object);
                const clickedJoint = isCollisionInteraction ? null : (linkObj ? findParentJoint(linkObj) : null);

                if (linkObj && (onSelect || onMeshSelect)) {
                    const subType = activeInteractionSubType;
                    const { objectIndex, highlightTarget } = resolveSelectionTarget(hit.object, linkObj);
                    const selectionPlan = resolveMouseDownSelectionPlan({
                        mode,
                        linkName: linkObj.name,
                        jointName: clickedJoint?.name ?? null,
                        subType,
                    });

                    if (onSelect) {
                        const selectTarget = selectionPlan.selectTarget;
                        if (selectTarget.type === 'joint') {
                            onSelect('joint', selectTarget.id);
                        } else {
                            onSelect('link', selectTarget.id, selectTarget.subType);
                        }
                    }

                    if (onMeshSelect && selectionPlan.shouldSyncMeshSelection) {
                        onMeshSelect(linkObj.name, clickedJoint ? clickedJoint.name : null, objectIndex, subType);
                    }

                    if (mode === 'detail' || !((linkObj.parent as any)?.isURDFJoint)) {
                        // Clear all stale highlights first, then apply only the specific body
                        highlightGeometry(linkObj.name, true, subType);
                        highlightGeometry(linkObj.name, false, subType, highlightTarget);
                    }

                    hoveredLinkRef.current = null;
                    (hoveredLinkRef as any).currentMesh = null;
                    (hoveredLinkRef as any).currentObjectIndex = null;
                    (hoveredLinkRef as any).currentSubType = null;
                    onHover?.(null, null);
                }

                // Find the parent joint of the clicked link
                const joint = toolMode === 'measure'
                    ? null
                    : isCollisionInteraction
                        ? null
                        : clickedJoint;

                if (joint) {
                    isDraggingJoint.current = true;
                    dragJoint.current = joint;
                    dragHitDistance.current = hit.distance;
                    lastRayRef.current.copy(raycasterRef.current.ray);
                    setIsDraggingRef.current?.(true);
                    if (setActiveJointRef.current) {
                        setActiveJointRef.current(joint.name);
                    }
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        };

        const handleMouseUp = () => {
            if (isDraggingJoint.current) {
                if (dragJoint.current) {
                    const currentAngle = dragJoint.current.angle ?? dragJoint.current.jointValue ?? 0;
                    jointDragStoreSync.commit(dragJoint.current.name, currentAngle);
                }

                isDraggingJoint.current = false;
                dragJoint.current = null;
                setIsDraggingRef.current?.(false);
            }

            scheduleSelectionMissGuardReset({
                justSelectedRef,
                timerRef: selectionResetTimerRef,
                onReset: () => {
                    needsRaycastRef.current = true;
                    invalidateRef.current();
                },
            });

            setOrbitControlsEnabled(true);
            needsRaycastRef.current = true;
            invalidateRef.current();
        };

        const handleWindowBlur = () => {
            handleMouseUp();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleMouseUp();
            }
        };

        const handleMouseLeave = () => {
            mouseRef.current.set(-1000, -1000);

            if (hoveredLinkRef.current) {
                const hoveredSubType = ((hoveredLinkRef as any).currentSubType as 'visual' | 'collision' | null) ?? undefined;
                if (!useExternalHover) {
                    highlightGeometry(hoveredLinkRef.current, true, hoveredSubType, (hoveredLinkRef as any).currentMesh);
                }
                hoveredLinkRef.current = null;
                (hoveredLinkRef as any).currentMesh = null;
                (hoveredLinkRef as any).currentObjectIndex = null;
                (hoveredLinkRef as any).currentSubType = null;
                onHover?.(null, null);
            }

            handleMouseUp();
        };

        gl.domElement.addEventListener('pointerdown', handlePointerDownCapture, true);
        gl.domElement.addEventListener('mousemove', handleMouseMove);
        gl.domElement.addEventListener('mousedown', handleMouseDown);
        gl.domElement.addEventListener('mouseup', handleMouseUp);
        gl.domElement.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('pointerup', handleMouseUp);
            window.addEventListener('blur', handleWindowBlur);
            document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            // Cancel throttled handler to prevent pending callbacks
            throttledMouseMove.cancel();
            jointDragStoreSync.dispose();
            clearSelectionMissGuardTimer(selectionResetTimerRef);
            setOrbitControlsEnabled(true);
            gl.domElement.removeEventListener('pointerdown', handlePointerDownCapture, true);
            gl.domElement.removeEventListener('mousemove', handleMouseMove);
            gl.domElement.removeEventListener('mousedown', handleMouseDown);
            gl.domElement.removeEventListener('mouseup', handleMouseUp);
            gl.domElement.removeEventListener('mouseleave', handleMouseLeave);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('pointerup', handleMouseUp);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            pickTargetCachesRef.current.all.targets = [];
            pickTargetCachesRef.current.visual.targets = [];
            pickTargetCachesRef.current.collision.targets = [];
        };
    }, [gl, camera, scene, robot, robotVersion, orbitControls, onHover, onSelect, onMeshSelect, highlightGeometry, highlightMode, toolMode, mode, justSelectedRef, isOrbitDragging, isSelectionLockedRef, selection, showCollision, showVisual, linkMeshMapRef, useExternalHover, throttleJointChangeDuringDrag]);

    return {
        mouseRef,
        raycasterRef,
        hoveredLinkRef,
        isDraggingJoint,
        needsRaycastRef,
        lastMousePosRef
    };
}
