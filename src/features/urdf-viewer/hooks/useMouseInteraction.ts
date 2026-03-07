import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { throttle } from '@/shared/utils';
import { THROTTLE_INTERVAL } from '../constants';
import type { ToolMode } from '../types';
import { isSingleDofJoint } from '../utils/jointTypes';
import { resolveSelectionTarget } from '../utils/selectionTargets';

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

        const getRevoluteDelta = (joint: any, startPt: THREE.Vector3, endPt: THREE.Vector3): number => {
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
            tempPlane.setFromNormalAndCoplanarPoint(tempAxisWorld, tempPivotPoint);

            tempPlane.projectPoint(startPt, tempProjStart);
            tempPlane.projectPoint(endPt, tempProjEnd);

            tempProjStart.sub(tempPivotPoint);
            tempProjEnd.sub(tempPivotPoint);

            tempCross.crossVectors(tempProjStart, tempProjEnd);
            const direction = Math.sign(tempCross.dot(tempAxisWorld));
            return direction * tempProjStart.angleTo(tempProjEnd);
        };

        const getPrismaticDelta = (joint: any, startPt: THREE.Vector3, endPt: THREE.Vector3): number => {
            const axis = joint.axis || new THREE.Vector3(0, 0, 1);

            if (joint.bodyOffsetGroup) {
                joint.bodyOffsetGroup.getWorldQuaternion(tempWorldQuat);
            } else if (joint.parent) {
                joint.parent.getWorldQuaternion(tempWorldQuat);
            } else {
                joint.getWorldQuaternion(tempWorldQuat);
            }

            tempAxisWorld.copy(axis).applyQuaternion(tempWorldQuat).normalize();
            tempDelta.subVectors(endPt, startPt);
            return tempDelta.dot(tempAxisWorld);
        };

        const moveRay = (toRay: THREE.Ray) => {
            if (!isDraggingJoint.current || !dragJoint.current) return;

            lastRayRef.current.at(dragHitDistance.current, tempPrevHitPoint);
            toRay.at(dragHitDistance.current, tempNewHitPoint);

            let delta = 0;
            const jt = dragJoint.current.jointType;

            if (jt === 'revolute' || jt === 'continuous') {
                delta = getRevoluteDelta(dragJoint.current, tempPrevHitPoint, tempNewHitPoint);
            } else if (jt === 'prismatic') {
                delta = getPrismaticDelta(dragJoint.current, tempPrevHitPoint, tempNewHitPoint);
            }

            if (delta !== 0) {
                const currentAngle = dragJoint.current.angle ?? dragJoint.current.jointValue ?? 0;
                let newAngle = currentAngle + delta;

                const limit = dragJoint.current.limit || { lower: -Math.PI, upper: Math.PI };
                if (jt === 'revolute') {
                    newAngle = Math.max(limit.lower, Math.min(limit.upper, newAngle));
                }

                if (dragJoint.current.setJointValue) {
                    dragJoint.current.setJointValue(newAngle);
                    invalidateRef.current();
                }

                if (onJointChangeRef.current) {
                    onJointChangeRef.current(dragJoint.current.name, newAngle);
                }
            }

            lastRayRef.current.copy(toRay);
        };

        // Core mouse move logic (will be throttled for hover, but immediate for dragging)
        const handleMouseMoveCore = (e: MouseEvent) => {
            lastMousePosRef.current.x = e.clientX;
            lastMousePosRef.current.y = e.clientY;

            const rect = gl.domElement.getBoundingClientRect();
            mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            // OPTIMIZATION: Signal that raycast is needed on next frame
            needsRaycastRef.current = true;

            raycasterRef.current.setFromCamera(mouseRef.current, camera);

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
                const rect = gl.domElement.getBoundingClientRect();
                mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                raycasterRef.current.setFromCamera(mouseRef.current, camera);
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

            const isStandardSelectionMode = ['select', 'translate', 'rotate', 'universal'].includes(toolMode || 'select');

            if (!isStandardSelectionMode) return;

            // CRITICAL: Only allow selection if the corresponding display option is enabled
            const isCollisionMode = highlightMode === 'collision';
            if ((isCollisionMode && !showCollision) || (!isCollisionMode && !showVisual)) {
                return;
            }

            const rect = gl.domElement.getBoundingClientRect();
            mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycasterRef.current.setFromCamera(mouseRef.current, camera);

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
                if (onJointChangeCommitRef.current && dragJoint.current) {
                    const currentAngle = dragJoint.current.angle ?? dragJoint.current.jointValue ?? 0;
                    onJointChangeCommitRef.current(dragJoint.current.name, currentAngle);
                }

                isDraggingJoint.current = false;
                dragJoint.current = null;
                setIsDraggingRef.current?.(false);
            }

            if (justSelectedRef) {
                if (selectionResetTimerRef.current !== null) {
                    clearTimeout(selectionResetTimerRef.current);
                }
                selectionResetTimerRef.current = window.setTimeout(() => {
                    justSelectedRef.current = false;
                    selectionResetTimerRef.current = null;
                }, 100);
            }
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
            gl.domElement.removeEventListener('mousemove', handleMouseMove);
            gl.domElement.removeEventListener('mousedown', handleMouseDown);
            gl.domElement.removeEventListener('mouseup', handleMouseUp);
            gl.domElement.removeEventListener('mouseleave', handleMouseLeave);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('pointerup', handleMouseUp);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [gl, camera, scene, robot, onSelect, onMeshSelect, highlightGeometry, highlightMode, toolMode, mode, justSelectedRef, isOrbitDragging, isSelectionLockedRef, showCollision, showVisual]);

    return {
        mouseRef,
        raycasterRef,
        hoveredLinkRef,
        isDraggingJoint,
        needsRaycastRef,
        lastMousePosRef
    };
}
