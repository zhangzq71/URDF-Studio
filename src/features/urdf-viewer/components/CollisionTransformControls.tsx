import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { UnifiedTransformControls } from '@/shared/components/3d';
import type { CollisionTransformControlsProps } from '../types';
import { translations } from '@/shared/i18n';
import {
    applyAxisTransformValue,
    degToRad,
    formatPendingDelta,
    getAxisTransformValue,
    getObjectRPY,
    radToDeg,
    type CollisionPendingEdit,
    type CollisionTransformAxis
} from '../utils/collisionTransformMath';
import { CollisionPendingEditOverlay } from './CollisionPendingEditOverlay';

const COLLISION_TRANSLATE_GIZMO_SIZE = 1.48;
const COLLISION_UNIVERSAL_ROTATE_GIZMO_SIZE = 1.3;

const isTransformAxis = (axis: unknown): axis is CollisionTransformAxis =>
    axis === 'X' || axis === 'Y' || axis === 'Z';

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
    const pendingEditRef = useRef<CollisionPendingEdit | null>(null);
    const [inputValue, setInputValue] = useState('');

    const originalPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const originalRotationRef = useRef<THREE.Euler>(new THREE.Euler());
    const isDraggingRef = useRef(false);
    const activeDragControlsRef = useRef<any | null>(null);
    const currentAxisRef = useRef<CollisionTransformAxis | null>(null);
    const currentIsRotateRef = useRef(false);
    const startValueRef = useRef(0);

    useEffect(() => {
        pendingEditRef.current = pendingEdit;
    }, [pendingEdit]);

    useEffect(() => {
        const controlsList = [transformRef.current, rotateTransformRef.current].filter(Boolean) as any[];
        if (!targetObject || controlsList.length === 0) return;

        const cleanups: Array<() => void> = [];
        for (const controls of controlsList) {
            const handleDraggingChange = (event: any) => {
                const dragging = Boolean(event.value);

                if (dragging) {
                    if (isDraggingRef.current && activeDragControlsRef.current !== controls) {
                        return;
                    }

                    const axis = controls.axis;
                    if (!isTransformAxis(axis)) return;

                    isDraggingRef.current = true;
                    activeDragControlsRef.current = controls;
                    currentAxisRef.current = axis;
                    currentIsRotateRef.current = controls.mode === 'rotate';
                    startValueRef.current = getAxisTransformValue(
                        targetObject,
                        axis,
                        currentIsRotateRef.current
                    );

                    originalPositionRef.current.copy(targetObject.position);
                    originalRotationRef.current.copy(targetObject.rotation);
                    setPendingEdit(null);
                    setIsDragging(true);
                } else if (isDraggingRef.current) {
                    if (activeDragControlsRef.current && activeDragControlsRef.current !== controls) {
                        return;
                    }

                    isDraggingRef.current = false;
                    activeDragControlsRef.current = null;
                    setIsDragging(false);

                    const axis = currentAxisRef.current;
                    if (!axis) {
                        invalidate();
                        return;
                    }

                    const isRotate = currentIsRotateRef.current;
                    const currentVal = getAxisTransformValue(targetObject, axis, isRotate);
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
    }, [targetObject, transformMode, setIsDragging, invalidate]);

    useEffect(() => {
        if (!robot || !selection?.id || selection.subType !== 'collision' || transformMode === 'select') {
            setTargetObject(null);
            setPendingEdit(null);
            activeDragControlsRef.current = null;
            isDraggingRef.current = false;
            setIsDragging(false);
            return;
        }

        const linkObj = (robot as any).links?.[selection.id];
        if (!linkObj) {
            setTargetObject(null);
            return;
        }

        const colliders: THREE.Object3D[] = [];
        linkObj.traverse((child: any) => {
            if (child.isURDFCollider && child.parent === linkObj) {
                colliders.push(child);
            }
        });

        if (colliders.length === 0) {
            linkObj.traverse((child: any) => {
                if (child.isURDFCollider) {
                    colliders.push(child);
                }
            });
        }

        const objectIndex = selection.objectIndex ?? 0;
        const collisionGroup = colliders[objectIndex] || colliders[0] || null;

        if (!collisionGroup) {
            setTargetObject(null);
            return;
        }

        setTargetObject(collisionGroup);
        if (!isDraggingRef.current && !pendingEditRef.current) {
            originalPositionRef.current.copy(collisionGroup.position);
            originalRotationRef.current.copy(collisionGroup.rotation);
        }
    }, [robot, selection, transformMode, setIsDragging]);

    useEffect(() => {
        if (pendingEditRef.current && targetObject) {
            targetObject.position.copy(originalPositionRef.current);
            targetObject.rotation.copy(originalRotationRef.current);
            targetObject.updateMatrixWorld(true);
        }
        setPendingEdit(null);
    }, [selection?.id, selection?.type, selection?.subType, transformMode, targetObject]);

    useEffect(() => {
        onTransformPending?.(!!pendingEdit);
    }, [pendingEdit, onTransformPending]);

    useEffect(() => {
        return () => {
            setIsDragging(false);
            if (pendingEditRef.current && targetObject) {
                targetObject.position.copy(originalPositionRef.current);
                targetObject.rotation.copy(originalRotationRef.current);
                targetObject.updateMatrixWorld(true);
                invalidate();
            }
        };
    }, [targetObject, invalidate, setIsDragging]);

    const handleObjectChange = useCallback(() => {
        invalidate();
    }, [invalidate]);

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
        if (targetObject && pendingEdit) {
            applyAxisTransformValue(targetObject, pendingEdit.axis, pendingEdit.startValue, pendingEdit.isRotate);
            targetObject.updateMatrixWorld(true);
        }
        setPendingEdit(null);
        invalidate();
    }, [targetObject, pendingEdit, invalidate]);

    const getDeltaDisplay = useCallback(() => formatPendingDelta(pendingEdit), [pendingEdit]);

    const getAxisLabel = useCallback((edit: CollisionPendingEdit) => {
        if (!edit.isRotate) return edit.axis;
        if (edit.axis === 'X') return t.roll;
        if (edit.axis === 'Y') return t.pitch;
        return t.yaw;
    }, [t.pitch, t.roll, t.yaw]);

    const handleValueChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        setInputValue(rawValue);

        const inputVal = parseFloat(rawValue);
        if (!Number.isNaN(inputVal) && pendingEdit) {
            const value = pendingEdit.isRotate ? degToRad(inputVal) : inputVal;
            setPendingEdit((prev) => prev ? ({ ...prev, value }) : null);

            if (targetObject) {
                applyAxisTransformValue(targetObject, pendingEdit.axis, value, pendingEdit.isRotate);
                targetObject.updateMatrixWorld(true);
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
            <UnifiedTransformControls
                ref={transformRef}
                rotateRef={rotateTransformRef}
                object={targetObject}
                mode={transformMode}
                gizmoPreset="collision-precise"
                size={COLLISION_TRANSLATE_GIZMO_SIZE}
                rotateSize={COLLISION_UNIVERSAL_ROTATE_GIZMO_SIZE}
                space="local"
                enabled={true}
                onChange={handleObjectChange}
                onRotateChange={handleObjectChange}
            />

            {pendingEdit && (
                <CollisionPendingEditOverlay
                    pendingEdit={pendingEdit}
                    axisLabel={getAxisLabel(pendingEdit)}
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
