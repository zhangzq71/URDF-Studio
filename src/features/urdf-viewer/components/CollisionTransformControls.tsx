import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CollisionTransformControlsProps } from '../types';
import { translations } from '@/shared/i18n';
import { enhanceTransformControlsGizmo } from '../utils/transformGizmo';
import {
    applyAxisTransformValue,
    degToRad,
    formatPendingDelta,
    getAxisTransformValue,
    getObjectRPY,
    getTransformControlMode,
    radToDeg,
    type CollisionPendingEdit,
    type CollisionTransformAxis
} from '../utils/collisionTransformMath';
import { useCollisionTransformGizmo } from '../hooks/useCollisionTransformGizmo';
import { CollisionPendingEditOverlay } from './CollisionPendingEditOverlay';

const COLLISION_TRANSLATE_GIZMO_SIZE = 1.08;
const COLLISION_UNIVERSAL_ROTATE_GIZMO_SIZE = 1.22;

export const CollisionTransformControls: React.FC<CollisionTransformControlsProps> = ({
    robot,
    selection,
    transformMode,
    setIsDragging,
    onTransformEnd,
    lang = 'en',
    onTransformPending
}) => {
    const t = translations[lang];
    const transformRef = useRef<any>(null);
    const rotateTransformRef = useRef<any>(null);
    const { invalidate } = useThree();
    const [targetObject, setTargetObject] = useState<THREE.Object3D | null>(null);

    const [pendingEdit, setPendingEdit] = useState<CollisionPendingEdit | null>(null);
    const [, forceUpdate] = useState(0);

    const originalPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const originalRotationRef = useRef<THREE.Euler>(new THREE.Euler());

    const isDraggingRef = useRef(false);
    const activeDragControlsRef = useRef<any | null>(null);
    const currentAxisRef = useRef<CollisionTransformAxis | null>(null);
    const currentIsRotateRef = useRef(false);
    const startValueRef = useRef(0);
    const idleSyncAccumulatorRef = useRef(0);

    const [inputValue, setInputValue] = useState('');

    const getCurrentRotateValue = useCallback((controls: any) => {
        const rotationAngle = typeof controls?.rotationAngle === 'number' ? controls.rotationAngle : 0;
        return startValueRef.current + rotationAngle;
    }, []);

    const {
        markRotateKnobDragStart,
        persistRotateKnobAnchor,
        syncRotateKnobPickers,
        syncTranslateTipPickers,
        syncAllGizmoPickers,
        syncUniversalControlPriority,
        normalizeGizmoMaterials,
        updateRotateKnobFeedback
    } = useCollisionTransformGizmo({
        transformRef,
        rotateTransformRef
    });

    useEffect(() => {
        const controlsList = [transformRef.current, rotateTransformRef.current].filter(Boolean) as any[];
        if (!targetObject || controlsList.length === 0) return;

        const cleanups: Array<() => void> = [];
        for (const controls of controlsList) {
            const handleDraggingChange = (event: any) => {
                const dragging = event.value;

                if (dragging) {
                    if (isDraggingRef.current && activeDragControlsRef.current !== controls) {
                        return;
                    }

                    const axis = controls.axis as string | null;
                    if (!axis || (axis !== 'X' && axis !== 'Y' && axis !== 'Z')) return;

                    const activeAxis = axis as CollisionTransformAxis;

                    isDraggingRef.current = true;
                    activeDragControlsRef.current = controls;
                    setIsDragging(true);

                    originalPositionRef.current.copy(targetObject.position);
                    originalRotationRef.current.copy(targetObject.rotation);

                    currentAxisRef.current = activeAxis;
                    currentIsRotateRef.current = controls.mode === 'rotate';
                    startValueRef.current = getAxisTransformValue(targetObject, activeAxis, currentIsRotateRef.current);
                    setPendingEdit(null);

                    if (currentIsRotateRef.current) {
                        syncRotateKnobPickers(controls);
                        markRotateKnobDragStart(controls, activeAxis);
                        if (transformMode === 'universal' && transformRef.current) {
                            transformRef.current.enabled = false;
                        }
                    } else if (transformMode === 'universal' && rotateTransformRef.current) {
                        rotateTransformRef.current.enabled = false;
                    }
                } else if (isDraggingRef.current) {
                    if (activeDragControlsRef.current && activeDragControlsRef.current !== controls) {
                        return;
                    }
                    isDraggingRef.current = false;
                    activeDragControlsRef.current = null;
                    setIsDragging(false);

                    const axis = currentAxisRef.current;
                    const isRotate = currentIsRotateRef.current;
                    if (transformMode === 'universal') {
                        if (transformRef.current) transformRef.current.enabled = true;
                        if (rotateTransformRef.current) rotateTransformRef.current.enabled = true;
                    }
                    if (!axis) {
                        invalidate();
                        return;
                    }

                    if (isRotate) {
                        persistRotateKnobAnchor(controls, axis);
                        syncRotateKnobPickers(controls);
                    }

                    const currentVal = isRotate
                        ? getCurrentRotateValue(controls)
                        : getAxisTransformValue(targetObject, axis, false);
                    const delta = currentVal - startValueRef.current;
                    if (Math.abs(delta) <= 0.0001) {
                        invalidate();
                        return;
                    }

                    setPendingEdit({
                        axis,
                        value: currentVal,
                        startValue: startValueRef.current,
                        isRotate
                    });
                    setInputValue(isRotate ? radToDeg(currentVal).toFixed(2) : currentVal.toFixed(4));
                    forceUpdate((n) => n + 1);
                }

                invalidate();
            };

            controls.addEventListener('dragging-changed', handleDraggingChange);
            cleanups.push(() => {
                controls.removeEventListener('dragging-changed', handleDraggingChange);
            });
        }

        return () => {
            for (const cleanup of cleanups) cleanup();
        };
    }, [
        targetObject,
        transformMode,
        setIsDragging,
        invalidate,
        getCurrentRotateValue,
        syncRotateKnobPickers,
        markRotateKnobDragStart,
        persistRotateKnobAnchor
    ]);

    useEffect(() => {
        const controlsList = [transformRef.current, rotateTransformRef.current].filter(Boolean) as any[];
        if (!targetObject || controlsList.length === 0) return;

        const restores: Array<() => void> = [];
        for (const controls of controlsList) {
            const originalHover = controls.onPointerHover;
            const originalDown = controls.onPointerDown;
            if (typeof originalHover === 'function') {
                controls.onPointerHover = (event: any) => {
                    syncAllGizmoPickers();
                    if (transformMode === 'universal') {
                        syncUniversalControlPriority();
                    }
                    return originalHover.call(controls, event);
                };
                restores.push(() => {
                    controls.onPointerHover = originalHover;
                });
            }

            if (typeof originalDown === 'function') {
                controls.onPointerDown = (event: any) => {
                    syncAllGizmoPickers();
                    if (transformMode === 'universal') {
                        syncUniversalControlPriority();
                    }
                    return originalDown.call(controls, event);
                };
                restores.push(() => {
                    controls.onPointerDown = originalDown;
                });
            }
        }

        return () => {
            for (const restore of restores) restore();
        };
    }, [targetObject, transformMode, syncAllGizmoPickers, syncUniversalControlPriority]);

    useEffect(() => {
        if (!robot || !selection?.id || selection.subType !== 'collision' || transformMode === 'select') {
            setTargetObject(null);
            setPendingEdit(null);
            activeDragControlsRef.current = null;
            isDraggingRef.current = false;
            return;
        }

        const linkObj = (robot as any).links?.[selection.id];
        if (!linkObj) {
            setTargetObject(null);
            return;
        }

        let colliders: THREE.Object3D[] = [];
        linkObj.traverse((child: any) => {
            if (child.isURDFCollider && child.parent === linkObj) {
                colliders.push(child);
            }
        });

        // Fallback to traverse all if not direct children
        if (colliders.length === 0) {
             linkObj.traverse((child: any) => {
                 if (child.isURDFCollider) {
                     colliders.push(child);
                 }
             });
        }

        let collisionGroup: THREE.Object3D | null = null;
        const objectIndex = selection.objectIndex ?? 0;
        
        if (colliders.length > 0) {
            // Find the specific collider by index, or default to the first one
            collisionGroup = colliders[objectIndex] || colliders[0];
        }

        if (collisionGroup) {
            const cg = collisionGroup as THREE.Object3D;
            setTargetObject(cg);
            originalPositionRef.current.copy(cg.position);
            originalRotationRef.current.copy(cg.rotation);
        } else {
            setTargetObject(null);
        }
    }, [robot, selection, transformMode]);

    const pendingEditRef = useRef(pendingEdit);
    useEffect(() => {
        pendingEditRef.current = pendingEdit;
    }, [pendingEdit]);

    useEffect(() => {
        if (pendingEditRef.current && targetObject) {
            targetObject.position.copy(originalPositionRef.current);
            targetObject.rotation.copy(originalRotationRef.current);
        }
        setPendingEdit(null);
    }, [selection?.id, selection?.type, selection?.subType, transformMode, targetObject]);

    useEffect(() => {
        onTransformPending?.(!!pendingEdit);
    }, [pendingEdit, onTransformPending]);

    useEffect(() => {
        return () => {
            if (pendingEditRef.current && targetObject) {
                targetObject.position.copy(originalPositionRef.current);
                targetObject.rotation.copy(originalRotationRef.current);
                invalidate();
            }
        };
    }, [targetObject, invalidate]);

    useEffect(() => {
        if (transformRef.current) {
            enhanceTransformControlsGizmo(transformRef.current);
        }
        if (rotateTransformRef.current) {
            enhanceTransformControlsGizmo(rotateTransformRef.current);
        }

        syncAllGizmoPickers();
        const rafIds: number[] = [];
        for (let i = 0; i < 3; i++) {
            const id = window.requestAnimationFrame(() => {
                syncAllGizmoPickers();
                invalidate();
            });
            rafIds.push(id);
        }
        invalidate();

        return () => {
            for (const id of rafIds) {
                window.cancelAnimationFrame(id);
            }
        };
    }, [targetObject, transformMode, invalidate, syncAllGizmoPickers]);

    const handleObjectChange = useCallback(() => {
        syncAllGizmoPickers();
        invalidate();
    }, [invalidate, syncAllGizmoPickers]);

    useFrame((state, delta) => {
        const hasAxisFocus = (controls: any) =>
            controls?.axis === 'X' || controls?.axis === 'Y' || controls?.axis === 'Z';

        const hasActiveInteraction = Boolean(
            transformRef.current?.dragging ||
            rotateTransformRef.current?.dragging ||
            hasAxisFocus(transformRef.current) ||
            hasAxisFocus(rotateTransformRef.current) ||
            pendingEditRef.current
        );

        if (transformMode === 'universal') {
            syncUniversalControlPriority();
        } else {
            if (transformRef.current) {
                transformRef.current.enabled = true;
            }
            if (rotateTransformRef.current) {
                rotateTransformRef.current.enabled = true;
            }
        }

        if (!hasActiveInteraction) {
            idleSyncAccumulatorRef.current += delta;
            if (idleSyncAccumulatorRef.current < 0.2) {
                return;
            }
            idleSyncAccumulatorRef.current = 0;
        } else {
            idleSyncAccumulatorRef.current = 0;
        }

        normalizeGizmoMaterials(transformRef.current);
        normalizeGizmoMaterials(rotateTransformRef.current);

        if (hasActiveInteraction) {
            const elapsed = state.clock.getElapsedTime();
            updateRotateKnobFeedback(transformRef.current, elapsed);
            updateRotateKnobFeedback(rotateTransformRef.current, elapsed);
        }

        syncTranslateTipPickers(transformRef.current);
        syncTranslateTipPickers(rotateTransformRef.current);
        syncRotateKnobPickers(transformRef.current);
        syncRotateKnobPickers(rotateTransformRef.current);
    }, 1000);

    const handleConfirm = useCallback(() => {
        if (!targetObject || !selection?.id || !onTransformEnd || !pendingEdit) return;

        const pos = targetObject.position;
        const rotation = getObjectRPY(targetObject);

        onTransformEnd(
            selection.id,
            { x: pos.x, y: pos.y, z: pos.z },
            rotation,
            selection.objectIndex
        );

        originalPositionRef.current.copy(targetObject.position);
        originalRotationRef.current.copy(targetObject.rotation);

        setPendingEdit(null);
        invalidate();
    }, [targetObject, selection?.id, selection?.objectIndex, onTransformEnd, pendingEdit, invalidate]);

    const handleCancel = useCallback(() => {
        if (targetObject) {
            targetObject.position.copy(originalPositionRef.current);
            targetObject.rotation.copy(originalRotationRef.current);
        }
        setPendingEdit(null);
        invalidate();
    }, [targetObject, invalidate]);

    const getDeltaDisplay = useCallback(() => formatPendingDelta(pendingEdit), [pendingEdit]);

    const handleValueChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        setInputValue(rawValue);

        const inputVal = parseFloat(rawValue);
        if (!Number.isNaN(inputVal) && pendingEdit) {
            const value = pendingEdit.isRotate ? degToRad(inputVal) : inputVal;
            setPendingEdit((prev) => prev ? ({ ...prev, value }) : null);

            if (targetObject) {
                applyAxisTransformValue(targetObject, pendingEdit.axis, value, pendingEdit.isRotate);
                invalidate();
            }
        }
    }, [pendingEdit, targetObject, invalidate]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleConfirm();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            handleCancel();
        } else {
            event.stopPropagation();
        }
    }, [handleConfirm, handleCancel]);

    if (!targetObject || transformMode === 'select') {
        return null;
    }

    return (
        <>
            <TransformControls
                ref={transformRef}
                object={targetObject}
                mode={getTransformControlMode(transformMode)}
                size={COLLISION_TRANSLATE_GIZMO_SIZE}
                space="local"
                enabled={true}
                onChange={handleObjectChange}
            />

            {transformMode === 'universal' && (
                <TransformControls
                    ref={rotateTransformRef}
                    object={targetObject}
                    mode="rotate"
                    size={COLLISION_UNIVERSAL_ROTATE_GIZMO_SIZE}
                    space="local"
                    enabled={true}
                    onChange={handleObjectChange}
                />
            )}

            {pendingEdit && (
                <CollisionPendingEditOverlay
                    pendingEdit={pendingEdit}
                    targetObject={targetObject}
                    inputValue={inputValue}
                    deltaDisplay={getDeltaDisplay()}
                    confirmTitle={t.confirmEnter}
                    cancelTitle={t.cancelEsc}
                    onValueChange={handleValueChange}
                    onKeyDown={handleKeyDown}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </>
    );
};
