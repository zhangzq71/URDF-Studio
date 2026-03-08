import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { throttle } from '@/shared/utils';
import { THROTTLE_INTERVAL } from '../constants';
import type { ToolMode } from '../types';
import { isSingleDofJoint } from '../utils/jointTypes';
import { resolveSelectionTarget } from '../utils/selectionTargets';

const JOINT_DRAG_EPSILON = 1e-5;

export interface UseMouseInteractionOptions {
    robot: THREE.Object3D | null;
    toolMode: ToolMode;
    mode?: 'detail' | 'hardware';
    highlightMode: 'link' | 'collision';
    showCollision: boolean;
    showVisual: boolean;
    onSelect?: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
    onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
    onJointChange?: (name: string, angle: number) => void;
    onJointChangeCommit?: (name: string, angle: number) => void;
    setIsDragging?: (dragging: boolean) => void;
    setActiveJoint?: (jointName: string | null) => void;
    justSelectedRef?: React.MutableRefObject<boolean>;
    isOrbitDragging?: React.MutableRefObject<boolean>;
    isSelectionLockedRef?: React.MutableRefObject<boolean>;
    highlightGeometry: (
        linkName: string | null,
        revert: boolean,
        subType?: 'visual' | 'collision',
        meshToHighlight?: THREE.Object3D | null | number
    ) => void;
}

export interface UseMouseInteractionResult {
    mouseRef: React.MutableRefObject<THREE.Vector2>;
    raycasterRef: React.MutableRefObject<THREE.Raycaster>;
    hoveredLinkRef: React.MutableRefObject<string | null>;
    isDraggingJoint: React.MutableRefObject<boolean>;
    needsRaycastRef: React.MutableRefObject<boolean>;
    lastMousePosRef: React.MutableRefObject<{ x: number; y: number }>;
}

export function useMouseInteraction({
    robot,
    toolMode,
    mode,
    highlightMode,
    showCollision,
    showVisual,
    onSelect,
    onMeshSelect,
    onJointChange,
    onJointChangeCommit,
    setIsDragging,
    setActiveJoint,
    justSelectedRef,
    isOrbitDragging,
    isSelectionLockedRef,
    highlightGeometry
}: UseMouseInteractionOptions): UseMouseInteractionResult {
    const { camera, gl, scene, invalidate } = useThree();
    const orbitControls = useThree((state) => state.controls as { enabled?: boolean } | undefined);

    const mouseRef = useRef(new THREE.Vector2(-1000, -1000));
    const raycasterRef = useRef(new THREE.Raycaster());
    const hoveredLinkRef = useRef<string | null>(null);

    // PERFORMANCE: Track last mouse position for state locking (skip small movements)
    const lastMousePosRef = useRef({ x: 0, y: 0 });
    // OPTIMIZATION: Signal that raycast is needed on next frame
    const needsRaycastRef = useRef(false);

    const isDraggingJoint = useRef(false);
    const dragJoint = useRef<any>(null);
    const dragHitDistance = useRef(0);
    const lastRayRef = useRef(new THREE.Ray());
    const lastDragPointerRef = useRef({ x: 0, y: 0 });
    const lastRotationPointRef = useRef(new THREE.Vector3());
    const hasLastRotationPointRef = useRef(false);
    const selectionResetTimerRef = useRef<number | null>(null);

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

            const isStandardSelectionMode = ['select', 'translate', 'rotate', 'universal'].includes(toolMode || 'select');
            if (!isStandardSelectionMode) return false;

            updatePointerFromClient(clientX, clientY);

            const sceneHits = raycasterRef.current.intersectObjects(scene.children, true);
            const nearestSceneHit = sceneHits[0];
            if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
                return true;
            }

            return raycasterRef.current.intersectObject(robot, true).length > 0;
        };

        const handlePointerDownCapture = (event: PointerEvent) => {
            if (shouldBlockOrbitForPointer(event.clientX, event.clientY)) {
                setOrbitControlsEnabled(false);
            }
        };

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
        const tempScreenPointWorld = new THREE.Vector3();
        const tempScreenTangentWorldPoint = new THREE.Vector3();
        const tempProjectedPoint = new THREE.Vector3();
        const tempScreenPoint = new THREE.Vector2();
        const tempScreenTangentPoint = new THREE.Vector2();
        const tempScreenTangent = new THREE.Vector2();

        const projectWorldToCanvas = (point: THREE.Vector3, target: THREE.Vector2) => {
            const rect = gl.domElement.getBoundingClientRect();

            tempProjectedPoint.copy(point).project(camera);
            target.set(
                ((tempProjectedPoint.x + 1) * 0.5) * rect.width,
                ((1 - tempProjectedPoint.y) * 0.5) * rect.height
            );

            return Number.isFinite(target.x) && Number.isFinite(target.y);
        };

        const getScreenAlignedDirection = (
            radialVector: THREE.Vector3,
            pointerDeltaX: number,
            pointerDeltaY: number
        ): number => {
            if (pointerDeltaX === 0 && pointerDeltaY === 0) {
                return 0;
            }

            tempTangentWorld.crossVectors(tempAxisWorld, radialVector);
            const tangentLengthSq = tempTangentWorld.lengthSq();
            if (tangentLengthSq <= JOINT_DRAG_EPSILON) {
                return 0;
            }

            const tangentScale = Math.max(radialVector.length(), 0.05);
            tempTangentWorld.normalize().multiplyScalar(tangentScale);

            tempScreenPointWorld.copy(tempPivotPoint).add(radialVector);
            tempScreenTangentWorldPoint.copy(tempScreenPointWorld).add(tempTangentWorld);

            const hasScreenPoint = projectWorldToCanvas(tempScreenPointWorld, tempScreenPoint);
            const hasScreenTangentPoint = projectWorldToCanvas(tempScreenTangentWorldPoint, tempScreenTangentPoint);

            if (!hasScreenPoint || !hasScreenTangentPoint) {
                return 0;
            }

            tempScreenTangent.subVectors(tempScreenTangentPoint, tempScreenPoint);
            const tangentScreenLengthSq = tempScreenTangent.lengthSq();
            if (tangentScreenLengthSq <= JOINT_DRAG_EPSILON) {
                return 0;
            }

            const pointerAlignment = tempScreenTangent.x * pointerDeltaX + tempScreenTangent.y * pointerDeltaY;
            if (Math.abs(pointerAlignment) <= JOINT_DRAG_EPSILON) {
                return 0;
            }

            return Math.sign(pointerAlignment);
        };

        const syncJointWorldFrame = (joint: any) => {
            const axis = joint.axis || new THREE.Vector3(0, 0, 1);

            if (joint.bodyOffsetGroup) {
                joint.bodyOffsetGroup.getWorldQuaternion(tempWorldQuat);
            } else if (joint.parent) {
                joint.parent.getWorldQuaternion(tempWorldQuat);
            } else {
                joint.getWorldQuaternion(tempWorldQuat);
            }

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

        const isGizmoObject = (object: THREE.Object3D | null): boolean => {
            let current: THREE.Object3D | null = object;
            while (current) {
                if (current.userData?.isGizmo) return true;
                current = current.parent;
            }
            return false;
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

        const getRevoluteDelta = (
            joint: any,
            startPt: THREE.Vector3,
            endPt: THREE.Vector3,
            pointerDeltaX: number,
            pointerDeltaY: number
        ): number => {
            syncJointWorldFrame(joint);
            tempPlane.setFromNormalAndCoplanarPoint(tempAxisWorld, tempPivotPoint);

            tempPlane.projectPoint(startPt, tempProjStart);
            tempPlane.projectPoint(endPt, tempProjEnd);

            tempProjStart.sub(tempPivotPoint);
            tempProjEnd.sub(tempPivotPoint);

            tempCross.crossVectors(tempProjStart, tempProjEnd);
            const worldDirection = Math.sign(tempCross.dot(tempAxisWorld));
            const screenDirection = getScreenAlignedDirection(tempProjStart, pointerDeltaX, pointerDeltaY);
            const direction = screenDirection || worldDirection;
            return direction * tempProjStart.angleTo(tempProjEnd);
        };

        const getPrismaticDelta = (joint: any, startPt: THREE.Vector3, endPt: THREE.Vector3): number => {
            syncJointWorldFrame(joint);
            tempDelta.subVectors(endPt, startPt);
            return tempDelta.dot(tempAxisWorld);
        };

        const resolveRevoluteDragPoint = (
            joint: any,
            ray: THREE.Ray,
            fallbackDistance: number,
            target: THREE.Vector3
        ): boolean => {
            syncJointWorldFrame(joint);
            tempPlane.setFromNormalAndCoplanarPoint(tempAxisWorld, tempPivotPoint);

            if (ray.intersectPlane(tempPlane, target)) {
                return true;
            }

            if (!Number.isFinite(fallbackDistance)) {
                return false;
            }

            ray.at(fallbackDistance, target);
            tempPlane.projectPoint(target, target);
            return true;
        };

        const moveRay = (toRay: THREE.Ray, pointerDeltaX: number, pointerDeltaY: number) => {
            if (!isDraggingJoint.current || !dragJoint.current) return;

            let delta = 0;
            const jt = dragJoint.current.jointType;

            if (jt === 'revolute' || jt === 'continuous') {
                const hasCurrentPoint = resolveRevoluteDragPoint(
                    dragJoint.current,
                    toRay,
                    dragHitDistance.current,
                    tempNewHitPoint
                );

                if (hasCurrentPoint && hasLastRotationPointRef.current) {
                    delta = getRevoluteDelta(
                        dragJoint.current,
                        lastRotationPointRef.current,
                        tempNewHitPoint,
                        pointerDeltaX,
                        pointerDeltaY
                    );
                }

                if (hasCurrentPoint) {
                    lastRotationPointRef.current.copy(tempNewHitPoint);
                    hasLastRotationPointRef.current = true;
                }
            } else if (jt === 'prismatic') {
                lastRayRef.current.at(dragHitDistance.current, tempPrevHitPoint);
                toRay.at(dragHitDistance.current, tempNewHitPoint);
                delta = getPrismaticDelta(dragJoint.current, tempPrevHitPoint, tempNewHitPoint);
            }

            if (Math.abs(delta) > JOINT_DRAG_EPSILON) {
                const currentAngle = dragJoint.current.angle ?? dragJoint.current.jointValue ?? 0;
                let newAngle = currentAngle + delta;

                const limit = dragJoint.current.limit || { lower: -Math.PI, upper: Math.PI };
                if (jt === 'revolute') {
                    newAngle = Math.max(limit.lower, Math.min(limit.upper, newAngle));
                }

                if (Math.abs(newAngle - currentAngle) > JOINT_DRAG_EPSILON && dragJoint.current.setJointValue) {
                    dragJoint.current.setJointValue(newAngle);
                    invalidateRef.current();

                    if (onJointChangeRef.current) {
                        onJointChangeRef.current(dragJoint.current.name, newAngle);
                    }
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
                const pointerDeltaX = e.clientX - lastDragPointerRef.current.x;
                const pointerDeltaY = e.clientY - lastDragPointerRef.current.y;

                updatePointerFromClient(e.clientX, e.clientY);
                moveRay(raycasterRef.current.ray, pointerDeltaX, pointerDeltaY);
                lastDragPointerRef.current.x = e.clientX;
                lastDragPointerRef.current.y = e.clientY;
                invalidateRef.current();
            } else {
                // Throttled for normal hover detection
                throttledMouseMove(e);
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (!robot) return;
            if (isSelectionLockedRef?.current) return;

            const isStandardSelectionMode = ['select', 'translate', 'rotate', 'universal'].includes(toolMode || 'select');

            if (!isStandardSelectionMode) return;

            // CRITICAL: Only allow selection if the corresponding display option is enabled
            const isCollisionMode = highlightMode === 'collision';
            if ((isCollisionMode && !showCollision) || (!isCollisionMode && !showVisual)) {
                return;
            }

            updatePointerFromClient(e.clientX, e.clientY);

            // IMPORTANT:
            // TransformControls gizmo is not a child of `robot`.
            // If we only raycast `robot`, clicking gizmo will "pass through" and select
            // underlying collision/visual meshes by mistake.
            const sceneHits = raycasterRef.current.intersectObjects(scene.children, true);
            const nearestSceneHit = sceneHits[0];
            if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
                return;
            }

            const intersections = raycasterRef.current.intersectObject(robot, true);

            const validHits = intersections.filter(hit => {
                if (hit.object.userData?.isGizmo) return false;
                let p = hit.object.parent;
                while (p) {
                    if (p.userData?.isGizmo) return false;
                    p = p.parent;
                }
                if (isCollisionMode) {
                    let obj: THREE.Object3D | null = hit.object;
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
                let obj: THREE.Object3D | null = hit.object;
                while (obj) {
                    if (obj.userData?.isCollisionMesh || (obj as any).isURDFCollider) {
                        return false;
                    }
                    obj = obj.parent;
                }
                return true;
            });

            if (validHits.length > 0) {
                // Ensure strictly sorted by distance (closest first)
                validHits.sort((a, b) => a.distance - b.distance);
                const hit = validHits[0];

                if (justSelectedRef) {
                    justSelectedRef.current = true;
                }

                const linkObj = findParentLink(hit.object);

                if (linkObj && (onSelect || onMeshSelect)) {
                    const subType = isCollisionMode ? 'collision' : 'visual';

                    const { objectIndex, highlightTarget } = resolveSelectionTarget(hit.object, linkObj);

                    // Call onSelect FIRST so onMeshSelect (called after) wins in React state batching
                    if (onSelect) {
                        if (mode === 'detail') {
                            onSelect('link', linkObj.name, subType);
                        } else {
                            const parent = linkObj.parent;
                            if (parent && (parent as any).isURDFJoint) {
                                onSelect('joint', parent.name);
                            } else {
                                onSelect('link', linkObj.name, subType);
                            }
                        }
                    }

                    // Call onMeshSelect AFTER onSelect so its objectIndex wins in React batching
                    if (onMeshSelect) {
                        const clickedJoint = isCollisionMode ? null : findParentJoint(linkObj);
                        onMeshSelect(linkObj.name, clickedJoint ? clickedJoint.name : null, objectIndex, subType);
                    }

                    if (mode === 'detail' || !((linkObj.parent as any)?.isURDFJoint)) {
                        // Clear all stale highlights first, then apply only the specific body
                        highlightGeometry(linkObj.name, true, subType);
                        highlightGeometry(linkObj.name, false, subType, highlightTarget);
                    }

                    hoveredLinkRef.current = null;
                    (hoveredLinkRef as any).currentMesh = null;
                }

                // Find the parent joint of the clicked link
                const clickedLink = findParentLink(hit.object);
                const joint = isCollisionMode ? null : (clickedLink ? findParentJoint(clickedLink) : null);

                if (joint) {
                    isDraggingJoint.current = true;
                    dragJoint.current = joint;
                    dragHitDistance.current = hit.distance;
                    lastDragPointerRef.current.x = e.clientX;
                    lastDragPointerRef.current.y = e.clientY;
                    lastRayRef.current.copy(raycasterRef.current.ray);
                    if (joint.jointType === 'revolute' || joint.jointType === 'continuous') {
                        hasLastRotationPointRef.current = resolveRevoluteDragPoint(
                            joint,
                            raycasterRef.current.ray,
                            hit.distance,
                            lastRotationPointRef.current
                        );
                    } else {
                        hasLastRotationPointRef.current = false;
                    }
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
                if (onJointChangeCommitRef.current && dragJoint.current) {
                    const currentAngle = dragJoint.current.angle ?? dragJoint.current.jointValue ?? 0;
                    onJointChangeCommitRef.current(dragJoint.current.name, currentAngle);
                }

                isDraggingJoint.current = false;
                dragJoint.current = null;
                hasLastRotationPointRef.current = false;
                setIsDraggingRef.current?.(false);
            }

            if (justSelectedRef) {
                if (selectionResetTimerRef.current !== null) {
                    clearTimeout(selectionResetTimerRef.current);
                }
                selectionResetTimerRef.current = window.setTimeout(() => {
                    justSelectedRef.current = false;
                    selectionResetTimerRef.current = null;
                    needsRaycastRef.current = true;
                    invalidateRef.current();
                }, 100);
            }

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
                const isCollisionMode = highlightMode === 'collision';
                highlightGeometry(hoveredLinkRef.current, true, isCollisionMode ? 'collision' : 'visual', (hoveredLinkRef as any).currentMesh);
                hoveredLinkRef.current = null;
                (hoveredLinkRef as any).currentMesh = null;
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
            if (selectionResetTimerRef.current !== null) {
                clearTimeout(selectionResetTimerRef.current);
                selectionResetTimerRef.current = null;
            }
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
        };
    }, [gl, camera, scene, robot, orbitControls, onSelect, onMeshSelect, highlightGeometry, highlightMode, toolMode, mode, justSelectedRef, isOrbitDragging, isSelectionLockedRef, showCollision, showVisual]);

    return {
        mouseRef,
        raycasterRef,
        hoveredLinkRef,
        isDraggingJoint,
        needsRaycastRef,
        lastMousePosRef
    };
}
