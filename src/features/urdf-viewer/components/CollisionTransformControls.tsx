import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { TransformControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CollisionTransformControlsProps } from '../types';
import { translations } from '@/shared/i18n';
import { enhanceTransformControlsGizmo } from '../utils/transformGizmo';

const COLLISION_TRANSLATE_GIZMO_SIZE = 1.08;
const COLLISION_UNIVERSAL_ROTATE_GIZMO_SIZE = 1.22;

export const CollisionTransformControls: React.FC<CollisionTransformControlsProps> = ({
    robot,
    selection,
    transformMode,
    setIsDragging,
    onTransformEnd,
    robotLinks,
    lang = 'en',
    onTransformPending
}) => {
    const t = translations[lang];
    const transformRef = useRef<any>(null);
    const rotateTransformRef = useRef<any>(null);
    const { invalidate } = useThree();
    const [targetObject, setTargetObject] = useState<THREE.Object3D | null>(null);

    // Pending edit state - shown after drag ends, waiting for confirm/cancel
    const [pendingEdit, setPendingEdit] = useState<{
        axis: string;
        value: number;
        startValue: number;
        isRotate: boolean;
    } | null>(null);

    // Force re-render when pendingEdit changes
    const [, forceUpdate] = useState(0);

    // Store original transform for cancel
    const originalPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const originalRotationRef = useRef<THREE.Euler>(new THREE.Euler());

    // Track if currently dragging
    const isDraggingRef = useRef(false);
    const currentAxisRef = useRef<string | null>(null);
    const currentIsRotateRef = useRef(false);
    const startValueRef = useRef<number>(0);

    // Local input value state to prevent cursor jumping/formatting issues
    const [inputValue, setInputValue] = useState('');

    const getAxisTransformValue = useCallback((object: THREE.Object3D, axis: string, isRotate: boolean) => {
        if (axis === 'X') return isRotate ? object.rotation.x : object.position.x;
        if (axis === 'Y') return isRotate ? object.rotation.y : object.position.y;
        if (axis === 'Z') return isRotate ? object.rotation.z : object.position.z;
        return 0;
    }, []);

    const applyAxisTransformValue = useCallback((object: THREE.Object3D, axis: string, value: number, isRotate: boolean) => {
        if (axis === 'X') {
            if (isRotate) object.rotation.x = value;
            else object.position.x = value;
            return;
        }
        if (axis === 'Y') {
            if (isRotate) object.rotation.y = value;
            else object.position.y = value;
            return;
        }
        if (axis === 'Z') {
            if (isRotate) object.rotation.z = value;
            else object.position.z = value;
        }
    }, []);

    const markRotateKnobDragStart = useCallback((controls: any, axis: string) => {
        const rotateGizmo = controls?.children?.[0]?.gizmo?.rotate;
        if (!rotateGizmo) return;
        // TransformControls keeps `rotationAngle` from the previous drag.
        // If we reuse that value, knob offset will drift and feel like it lags behind the cursor.
        if (typeof controls?.rotationAngle === 'number') {
            controls.rotationAngle = 0;
        }

        rotateGizmo.traverse((child: any) => {
            if (!child.userData?.urdfRotateKnob || child.name !== axis) return;
            child.userData.urdfDragStartAnchor = child.position.clone();
            child.userData.urdfDragStartAngle = 0;
            delete child.userData.urdfDragTheta;
        });
    }, []);

    const persistRotateKnobAnchor = useCallback((controls: any, axis: string) => {
        const rotateGizmo = controls?.children?.[0]?.gizmo?.rotate;
        if (!rotateGizmo) return;

        rotateGizmo.traverse((child: any) => {
            if (!child.userData?.urdfRotateKnob || child.name !== axis) return;
            child.userData.urdfKnobAnchor = child.position.clone();
            delete child.userData.urdfDragStartAnchor;
            delete child.userData.urdfDragStartAngle;
            delete child.userData.urdfDragTheta;
        });
    }, []);

    const syncRotateKnobPickers = useCallback((controls: any) => {
        const root = controls?.children?.[0];
        const rotateGizmo = root?.gizmo?.rotate;
        const rotatePicker = root?.picker?.rotate;
        if (!rotateGizmo || !rotatePicker) return;

        rotateGizmo.updateWorldMatrix(true, true);
        rotatePicker.updateWorldMatrix(true, false);

        const knobCenters = new Map<string, THREE.Vector3>();
        rotateGizmo.traverse((child: any) => {
            if (!child.userData?.urdfRotateKnob || typeof child.name !== 'string') return;
            knobCenters.set(child.name, child.getWorldPosition(new THREE.Vector3()));
        });

        rotatePicker.traverse((child: any) => {
            if (!child.userData?.urdfRotateKnobPicker || typeof child.name !== 'string') return;
            const geometry = child.geometry as THREE.BufferGeometry | undefined;

            // Backward compatible for already-mounted gizmos whose picker geometry
            // was translated instead of positioned.
            if (geometry && !child.userData?.urdfPickerCentered) {
                geometry.computeBoundingBox();
                const center = geometry.boundingBox?.getCenter(new THREE.Vector3());
                if (center && center.lengthSq() > 1e-10) {
                    geometry.translate(-center.x, -center.y, -center.z);
                    geometry.computeBoundingSphere();
                }
                child.userData.urdfPickerCentered = true;
            }

            const knobWorld = knobCenters.get(child.name);
            if (!knobWorld) return;
            const pickerLocal = rotatePicker.worldToLocal(knobWorld.clone());
            child.position.copy(pickerLocal);
        });

        // Ensure raycast uses the latest picker transforms immediately.
        rotatePicker.updateWorldMatrix(true, true);
        rotateGizmo.updateWorldMatrix(true, true);
    }, []);

    const syncTranslateTipPickers = useCallback((controls: any) => {
        const root = controls?.children?.[0];
        const translateGizmo = root?.gizmo?.translate;
        const translatePicker = root?.picker?.translate;
        if (!translateGizmo || !translatePicker) return;

        translateGizmo.updateWorldMatrix(true, true);
        translatePicker.updateWorldMatrix(true, false);

        const tipCenters = new Map<string, THREE.Vector3>();
        translateGizmo.traverse((child: any) => {
            if (!child?.isLine || typeof child.name !== 'string') return;
            if (child.name !== 'X' && child.name !== 'Y' && child.name !== 'Z') return;

            const position = child.geometry?.getAttribute?.('position');
            if (!position || position.count < 2) return;

            let farthestIdx = 0;
            let farthestLenSq = -1;
            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i);
                const y = position.getY(i);
                const z = position.getZ(i);
                const lenSq = x * x + y * y + z * z;
                if (lenSq > farthestLenSq) {
                    farthestLenSq = lenSq;
                    farthestIdx = i;
                }
            }

            const key = `${child.name}_fwd`;
            const tipWorld = child.localToWorld(new THREE.Vector3(
                position.getX(farthestIdx),
                position.getY(farthestIdx),
                position.getZ(farthestIdx)
            ));
            tipCenters.set(key, tipWorld);
        });

        translatePicker.traverse((child: any) => {
            const key = child.userData?.urdfTranslateTipPickerKey;
            if (typeof key !== 'string') return;

            const tipWorld = tipCenters.get(key);
            if (!tipWorld) return;
            const pickerLocal = translatePicker.worldToLocal(tipWorld.clone());
            child.position.copy(pickerLocal);
        });

        const activeAxis = typeof controls?.axis === 'string' ? controls.axis : null;
        const isDragging = Boolean(controls?.dragging);
        translateGizmo.traverse((child: any) => {
            const key = child.userData?.urdfTranslateTipKnobKey;
            if (typeof key !== 'string') return;

            const tipWorld = tipCenters.get(key);
            if (tipWorld) {
                const gizmoLocal = translateGizmo.worldToLocal(tipWorld.clone());
                child.position.copy(gizmoLocal);
            }

            const targetScale = activeAxis === child.name ? (isDragging ? 1.16 : 1.09) : 1;
            child.scale.setScalar(targetScale);
        });

        // Ensure raycast uses the latest picker transforms immediately.
        translatePicker.updateWorldMatrix(true, true);
        translateGizmo.updateWorldMatrix(true, true);
    }, []);

    const syncAllGizmoPickers = useCallback(() => {
        syncTranslateTipPickers(transformRef.current);
        syncTranslateTipPickers(rotateTransformRef.current);
        syncRotateKnobPickers(transformRef.current);
        syncRotateKnobPickers(rotateTransformRef.current);
    }, [syncTranslateTipPickers, syncRotateKnobPickers]);

    const syncUniversalControlPriority = useCallback(() => {
        const translateControls = transformRef.current;
        const rotateControls = rotateTransformRef.current;
        if (!translateControls || !rotateControls) return;

        const isAxisActive = (axis: unknown) => axis === 'X' || axis === 'Y' || axis === 'Z';
        const translateActive = Boolean(translateControls.dragging) || isAxisActive(translateControls.axis);
        const rotateActive = Boolean(rotateControls.dragging) || isAxisActive(rotateControls.axis);

        // Prefer rotate interactions when both controls can potentially hit.
        if (rotateActive) {
            rotateControls.enabled = true;
            translateControls.enabled = false;
            return;
        }

        if (translateActive) {
            translateControls.enabled = true;
            rotateControls.enabled = false;
            return;
        }

        translateControls.enabled = true;
        rotateControls.enabled = true;
    }, []);

    // Setup event listeners for TransformControls
    useEffect(() => {
        const controlsList = [transformRef.current, rotateTransformRef.current].filter(Boolean) as any[];
        if (!targetObject || controlsList.length === 0) return;

        const cleanups: Array<() => void> = [];
        for (const controls of controlsList) {
            const handleDraggingChange = (event: any) => {
                const dragging = event.value;

                if (dragging) {
                    const axis = controls.axis as string | null;
                    if (!axis || (axis !== 'X' && axis !== 'Y' && axis !== 'Z')) return;

                    isDraggingRef.current = true;
                    setIsDragging(true);

                    originalPositionRef.current.copy(targetObject.position);
                    originalRotationRef.current.copy(targetObject.rotation);

                    currentAxisRef.current = axis;
                    currentIsRotateRef.current = controls.mode === 'rotate';
                    startValueRef.current = getAxisTransformValue(targetObject, axis, currentIsRotateRef.current);
                    // Keep transform controls usable after pending popup shows.
                    // Starting a new drag supersedes previous pending value.
                    setPendingEdit(null);

                    if (currentIsRotateRef.current) {
                        syncRotateKnobPickers(controls);
                        markRotateKnobDragStart(controls, axis);
                    }
                } else if (isDraggingRef.current) {
                    isDraggingRef.current = false;
                    setIsDragging(false);

                    const axis = currentAxisRef.current;
                    const isRotate = currentIsRotateRef.current;
                    if (!axis) return;

                    if (isRotate) {
                        persistRotateKnobAnchor(controls, axis);
                        syncRotateKnobPickers(controls);
                    }

                    const currentVal = getAxisTransformValue(targetObject, axis, isRotate);
                    const delta = currentVal - startValueRef.current;
                    if (Math.abs(delta) <= 0.0001) return;

                    const radToDeg = (rad: number) => rad * (180 / Math.PI);
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
        getAxisTransformValue,
        syncRotateKnobPickers,
        markRotateKnobDragStart,
        persistRotateKnobAnchor
    ]);

    // Ensure hit-testing always uses the latest custom picker transforms.
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

    // Find the selected collision mesh
    useEffect(() => {
        if (!robot || !selection?.id || selection.subType !== 'collision' || transformMode === 'select') {
            setTargetObject(null);
            setPendingEdit(null);
            return;
        }

        const linkName = selection.id;
        const linkObj = (robot as any).links?.[linkName];

        if (!linkObj) {
            setTargetObject(null);
            return;
        }

        let collisionGroup: THREE.Object3D | null = null;
        linkObj.traverse((child: any) => {
            if (!collisionGroup && child.isURDFCollider) {
                collisionGroup = child;
            }
        });

        if (collisionGroup) {
            const cg = collisionGroup as THREE.Object3D;
            setTargetObject(cg);
            // Store original position/rotation when target changes
            originalPositionRef.current.copy(cg.position);
            originalRotationRef.current.copy(cg.rotation);
        } else {
            setTargetObject(null);
        }
    }, [robot, selection, transformMode]);

    // Track pendingEdit in a ref to access it in cleanup/effects without triggering re-renders
    const pendingEditRef = useRef(pendingEdit);
    useEffect(() => {
        pendingEditRef.current = pendingEdit;
    }, [pendingEdit]);

    // Clear pending edit when selection changes or transformMode changes
    useEffect(() => {
        // When selection changes, cancel any pending edit by restoring original transform
        if (pendingEditRef.current && targetObject) {
            targetObject.position.copy(originalPositionRef.current);
            targetObject.rotation.copy(originalRotationRef.current);
        }
        setPendingEdit(null);
    }, [selection?.id, selection?.type, selection?.subType, transformMode]);

    // Report pending state
    useEffect(() => {
        onTransformPending?.(!!pendingEdit);
    }, [pendingEdit, onTransformPending]);

    // Clear pending edit and restore when switching away from collision selection
    useEffect(() => {
        return () => {
            // Cleanup: if component unmounts with pending edit, restore original transform
            if (pendingEditRef.current && targetObject) {
                targetObject.position.copy(originalPositionRef.current);
                targetObject.rotation.copy(originalRotationRef.current);
                invalidate();
            }
        };
    }, [targetObject]);

    // Customize TransformControls appearance:
    // - Fusion360-like sphere knobs on rotate arcs
    // - larger axis hit regions for easier drag
    // - remove free-rotate ring to reduce accidental trigger
    useEffect(() => {
        if (transformRef.current) {
            enhanceTransformControlsGizmo(transformRef.current);
        }
        if (rotateTransformRef.current) {
            enhanceTransformControlsGizmo(rotateTransformRef.current);
        }
        // In frameloop=\"demand\", gizmo internals can update one frame later.
        // Run a few sync passes so custom tip/knob pickers never stay at origin.
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

    // Handle transform change (live update during drag)
    const handleObjectChange = useCallback(() => {
        syncAllGizmoPickers();
        invalidate();
    }, [invalidate, syncAllGizmoPickers]);

    const normalizeGizmoMaterials = useCallback((controls: any) => {
        const root = controls?.children?.[0];
        if (!root?.gizmo) return;

        const groups = [root.gizmo.translate, root.gizmo.rotate].filter(Boolean);
        for (const group of groups) {
            group.traverse((child: any) => {
                child.renderOrder = typeof child.userData?.urdfRenderOrder === 'number'
                    ? child.userData.urdfRenderOrder
                    : 10000;
                if (child.userData?.urdfRotateKnobOutline) return;
                if (!child.material) return;
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (!mat) continue;
                    (mat as any).tempOpacity = 1;
                    const baseColor = mat.userData?.urdfBaseColor;
                    if (baseColor && mat.color && !mat.color.equals(baseColor)) {
                        mat.color.copy(baseColor);
                        mat.needsUpdate = true;
                    }
                    const needsDepthReset = mat.depthTest !== false || mat.depthWrite !== false;
                    if (mat.opacity !== 1 || mat.transparent !== true || needsDepthReset) {
                        mat.opacity = 1;
                        mat.transparent = true;
                        mat.depthTest = false;
                        mat.depthWrite = false;
                        mat.needsUpdate = true;
                    }
                }
            });
        }
    }, []);

    const updateRotateKnobFeedback = useCallback((controls: any, elapsedTime: number) => {
        const root = controls?.children?.[0];
        const rotateGizmo = root?.gizmo?.rotate;
        if (!rotateGizmo) return;

        const axis = typeof controls?.axis === 'string' ? controls.axis : null;
        const isDragging = Boolean(controls?.dragging);
        const axisPhase: Record<string, number> = { X: 0, Y: 2.1, Z: 4.2 };
        const pointEnd = controls?.pointEnd as THREE.Vector3 | undefined;
        const worldStart = controls?.worldPositionStart as THREE.Vector3 | undefined;
        const normalizeAngle = (angle: number) => {
            let a = angle;
            while (a <= -Math.PI) a += Math.PI * 2;
            while (a > Math.PI) a -= Math.PI * 2;
            return a;
        };

        const getRingMeta = (line: any) => {
            const cached = line?.userData?.urdfRingMeta as {
                center: THREE.Vector3;
                normal: THREE.Vector3;
                radius: number;
                basisU: THREE.Vector3;
                basisV: THREE.Vector3;
            } | undefined;
            if (cached) return cached;

            const geometry = line?.geometry as THREE.BufferGeometry | undefined;
            const position = geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
            if (!position || position.count < 3) return null;

            const center = new THREE.Vector3();
            for (let i = 0; i < position.count; i++) {
                center.x += position.getX(i);
                center.y += position.getY(i);
                center.z += position.getZ(i);
            }
            center.multiplyScalar(1 / position.count);

            let normal = new THREE.Vector3(0, 0, 1);
            let basisU = new THREE.Vector3(1, 0, 0);
            const pA = new THREE.Vector3();
            const pB = new THREE.Vector3();
            const tmp = new THREE.Vector3();
            for (let i = 0; i < position.count - 2; i++) {
                pA.set(position.getX(i), position.getY(i), position.getZ(i)).sub(center);
                pB.set(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)).sub(center);
                tmp.crossVectors(pA, pB);
                if (tmp.lengthSq() > 1e-10) {
                    normal = tmp.normalize().clone();
                    if (pA.lengthSq() > 1e-10) {
                        basisU = pA.clone().normalize();
                    }
                    break;
                }
            }
            const basisV = new THREE.Vector3().crossVectors(normal, basisU).normalize();
            if (basisV.lengthSq() < 1e-10) {
                basisU = new THREE.Vector3(1, 0, 0);
                if (Math.abs(normal.dot(basisU)) > 0.99) {
                    basisU = new THREE.Vector3(0, 1, 0);
                }
                basisU.addScaledVector(normal, -basisU.dot(normal)).normalize();
                basisV.copy(new THREE.Vector3().crossVectors(normal, basisU).normalize());
            }

            let radius = 0;
            const projected = new THREE.Vector3();
            for (let i = 0; i < position.count; i++) {
                projected.set(position.getX(i), position.getY(i), position.getZ(i)).sub(center);
                projected.addScaledVector(normal, -projected.dot(normal));
                radius += projected.length();
            }
            radius /= position.count;
            if (!Number.isFinite(radius) || radius <= 1e-8) radius = 0.5;

            const meta = { center, normal, radius, basisU, basisV };
            line.userData.urdfRingMeta = meta;
            return meta;
        };

        const getThetaOnRing = (
            localPoint: THREE.Vector3,
            ringMeta: { center: THREE.Vector3; basisU: THREE.Vector3; basisV: THREE.Vector3; normal: THREE.Vector3 }
        ) => {
            const v = localPoint.clone().sub(ringMeta.center);
            v.addScaledVector(ringMeta.normal, -v.dot(ringMeta.normal));
            const x = v.dot(ringMeta.basisU);
            const y = v.dot(ringMeta.basisV);
            return Math.atan2(y, x);
        };

        rotateGizmo.traverse((child: any) => {
            if (child.userData?.urdfRotateKnob) {
                const base = (child.userData.urdfKnobAnchor as THREE.Vector3 | undefined)?.clone?.() || child.position.clone();
                const phase = axisPhase[child.name] ?? 0;
                let targetPos = base.clone();

                if (isDragging && axis === child.name) {
                    const dragStart = (child.userData.urdfDragStartAnchor as THREE.Vector3 | undefined)?.clone?.() || base.clone();
                    const line = child.parent;
                    const ringMeta = getRingMeta(line);
                    if (pointEnd && worldStart && line && ringMeta) {
                        // Follow pointer in screen space: pick the ring point whose projected NDC
                        // is closest to the pointer projection.
                        // Keep angle unwrapped across frames to avoid flip/flop after >360deg.
                        const camera = controls?.camera as THREE.Camera | undefined;
                        const worldPoint = worldStart.clone().add(pointEnd);
                        if (camera) {
                            const pointerNdc = worldPoint.clone().project(camera);
                            const steps = 240;
                            const startTheta = getThetaOnRing(dragStart, ringMeta);
                            const lastThetaRaw = typeof child.userData?.urdfDragTheta === 'number'
                                ? child.userData.urdfDragTheta as number
                                : startTheta;
                            const wrappedLastTheta = normalizeAngle(lastThetaRaw);

                            // Prevent occasional 180deg flips when screen-space projection is ambiguous.
                            const MAX_STEP_ANGLE = Math.PI * 0.85;
                            const ANGLE_PENALTY = 0.03;

                            let bestScore = Number.POSITIVE_INFINITY;
                            let bestTheta = 0;
                            const candidateLocal = new THREE.Vector3();
                            const candidateWorld = new THREE.Vector3();
                            let foundCandidate = false;

                            for (let i = 0; i < steps; i++) {
                                const theta = (i / steps) * Math.PI * 2;
                                const angularDistance = Math.abs(normalizeAngle(theta - wrappedLastTheta));
                                if (angularDistance > MAX_STEP_ANGLE) {
                                    continue;
                                }

                                candidateLocal.copy(ringMeta.center)
                                    .addScaledVector(ringMeta.basisU, Math.cos(theta) * ringMeta.radius)
                                    .addScaledVector(ringMeta.basisV, Math.sin(theta) * ringMeta.radius);

                                candidateWorld.copy(candidateLocal);
                                line.localToWorld(candidateWorld);
                                candidateWorld.project(camera);

                                const dx = candidateWorld.x - pointerNdc.x;
                                const dy = candidateWorld.y - pointerNdc.y;
                                const distSq = dx * dx + dy * dy;
                                const score = distSq + ANGLE_PENALTY * angularDistance * angularDistance;
                                if (score < bestScore) {
                                    bestScore = score;
                                    bestTheta = theta;
                                    foundCandidate = true;
                                }
                            }

                            const delta = foundCandidate
                                ? normalizeAngle(bestTheta - wrappedLastTheta)
                                : 0;
                            const unwrappedTheta = lastThetaRaw + delta;
                            child.userData.urdfDragTheta = unwrappedTheta;

                            targetPos.copy(ringMeta.center)
                                .addScaledVector(ringMeta.basisU, Math.cos(unwrappedTheta) * ringMeta.radius)
                                .addScaledVector(ringMeta.basisV, Math.sin(unwrappedTheta) * ringMeta.radius);
                        } else {
                            targetPos = dragStart;
                        }
                    } else {
                        targetPos = dragStart;
                    }

                    child.position.copy(targetPos);
                } else {
                    child.position.copy(targetPos);
                }

                const hoverPulse = 1 + 0.015 * (0.5 + 0.5 * Math.sin(elapsedTime * 6 + phase));
                const targetScale = axis === child.name ? (isDragging ? 1.16 : 1.08) : hoverPulse;
                const nextScale = THREE.MathUtils.lerp(child.scale.x, targetScale, 0.32);
                child.scale.setScalar(nextScale);
                return;
            }

            if (child.userData?.urdfRotateKnobOutline && child.material) {
                const mat = child.material;
                const active = axis === child.name;
                const pulse = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(elapsedTime * 11));
                const nextOpacity = active ? pulse : 0;

                if (Math.abs((mat.opacity ?? 0) - nextOpacity) > 0.005) {
                    mat.opacity = nextOpacity;
                    mat.needsUpdate = true;
                }
            }
        });
    }, []);

    // Keep gizmo opacity stable (no auto fade on hover)
    useFrame((state) => {
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

        normalizeGizmoMaterials(transformRef.current);
        normalizeGizmoMaterials(rotateTransformRef.current);
        updateRotateKnobFeedback(transformRef.current, state.clock.getElapsedTime());
        updateRotateKnobFeedback(rotateTransformRef.current, state.clock.getElapsedTime());
        syncTranslateTipPickers(transformRef.current);
        syncTranslateTipPickers(rotateTransformRef.current);
        syncRotateKnobPickers(transformRef.current);
        syncRotateKnobPickers(rotateTransformRef.current);
    }, 1000);

    // Handle confirm - save to history
    const handleConfirm = useCallback(() => {
        if (!targetObject || !selection?.id || !onTransformEnd || !pendingEdit) return;

        // Apply the edited value (in case user modified in text field)
        const axis = pendingEdit.axis;
        applyAxisTransformValue(targetObject, axis, pendingEdit.value, pendingEdit.isRotate);

        // Call onTransformEnd to save to history
        const pos = targetObject.position;
        const euler = new THREE.Euler().setFromQuaternion(targetObject.quaternion, 'XYZ');

        onTransformEnd(
            selection.id,
            { x: pos.x, y: pos.y, z: pos.z },
            { r: euler.x, p: euler.y, y: euler.z }
        );

        // Update original refs for next operation
        originalPositionRef.current.copy(targetObject.position);
        originalRotationRef.current.copy(targetObject.rotation);

        setPendingEdit(null);
        invalidate();
    }, [targetObject, selection?.id, onTransformEnd, pendingEdit, invalidate, applyAxisTransformValue]);

    // Handle cancel - restore original transform
    const handleCancel = useCallback(() => {
        if (targetObject) {
            targetObject.position.copy(originalPositionRef.current);
            targetObject.rotation.copy(originalRotationRef.current);
        }
        setPendingEdit(null);
        invalidate();
    }, [targetObject, invalidate]);

    // Convert radians to degrees for display
    const radToDeg = (rad: number) => rad * (180 / Math.PI);
    const degToRad = (deg: number) => deg * (Math.PI / 180);

    // Get delta display value
    const getDeltaDisplay = useCallback(() => {
        if (!pendingEdit) return '0';
        const delta = pendingEdit.value - pendingEdit.startValue;
        if (pendingEdit.isRotate) {
            const degDelta = radToDeg(delta);
            return (degDelta >= 0 ? '+' : '') + degDelta.toFixed(2);
        }
        return (delta >= 0 ? '+' : '') + delta.toFixed(4);
    }, [pendingEdit]);

    // Handle value change in text field
    const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        setInputValue(rawValue);

        const inputVal = parseFloat(rawValue);
        if (!isNaN(inputVal) && pendingEdit) {
            // Convert degrees to radians for rotation
            const val = pendingEdit.isRotate ? degToRad(inputVal) : inputVal;
            setPendingEdit(prev => prev ? ({ ...prev, value: val }) : null);

            // Live preview
            if (targetObject) {
                applyAxisTransformValue(targetObject, pendingEdit.axis, val, pendingEdit.isRotate);
                invalidate();
            }
        }
    }, [pendingEdit, targetObject, invalidate, applyAxisTransformValue]);

    // Handle Enter key to confirm
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        } else {
            // Stop propagation to prevent camera movement/other shortcuts
            e.stopPropagation();
        }
    }, [handleConfirm, handleCancel]);

    if (!targetObject || transformMode === 'select') {
        return null;
    }

    // Get axis color
    const getAxisColor = (axis: string | null) => {
        if (axis === 'X') return '#ef4444';
        if (axis === 'Y') return '#22c55e';
        if (axis === 'Z') return '#3b82f6';
        return '#94a3b8';
    };

    // Determine the mode for TransformControls
    const getControlMode = () => {
        if (transformMode === 'translate') return 'translate';
        if (transformMode === 'rotate') return 'rotate';
        return 'translate';
    };

    return (
        <>
            {/* Main TransformControls */}
            <TransformControls
                ref={transformRef}
                object={targetObject}
                mode={getControlMode()}
                size={COLLISION_TRANSLATE_GIZMO_SIZE}
                space="local"
                enabled={true}
                onChange={handleObjectChange}
            />

            {/* For universal mode, add rotation gizmo */}
            {transformMode === 'universal' && (
                <TransformControls
                    ref={rotateTransformRef}
                    object={targetObject}
                    mode="rotate"
                    size={COLLISION_UNIVERSAL_ROTATE_GIZMO_SIZE}
                    enabled={true}
                    onChange={handleObjectChange}
                />
            )}

            {/* Confirm/Cancel UI after drag ends - Fusion360 style: positioned above collision body */}
            {pendingEdit && (() => {
                // Calculate bounding box top position for Fusion360-like UI placement
                const box = new THREE.Box3().setFromObject(targetObject);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                // Position UI just above the collision body's bounding box
                const uiPosition: [number, number, number] = [
                    center.x,
                    center.y,
                    center.z + size.z / 2 + 0.02 // Small offset above the top
                ];
                return (
                <Html
                    position={uiPosition}
                    style={{ pointerEvents: 'auto' }}
                    center
                    zIndexRange={[100, 0]}
                >
                    <div
                        className="flex flex-col items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {/* Compact input with axis indicator */}
                        <div className="flex items-center gap-1">
                            <span
                                className="w-5 h-5 rounded text-white text-xs font-bold flex items-center justify-center shadow"
                                style={{ backgroundColor: getAxisColor(pendingEdit.axis) }}
                            >
                                {pendingEdit.axis}
                            </span>
                            <input
                                type="number"
                                step={pendingEdit.isRotate ? "1" : "0.001"}
                                value={inputValue}
                                onChange={handleValueChange}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                className="w-20 px-1.5 py-0.5 text-xs font-mono bg-white/90 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-white focus:outline-none focus:border-blue-500 shadow"
                            />
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {pendingEdit.isRotate ? '°' : 'm'} ({getDeltaDisplay()})
                            </span>
                        </div>

                        {/* Compact confirm/cancel buttons */}
                        <div className="flex gap-1">
                            <button
                                onClick={handleConfirm}
                                className="w-6 h-6 bg-green-500 hover:bg-green-600 text-white rounded shadow flex items-center justify-center transition-colors"
                                title={t.confirmEnter}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </button>
                            <button
                                onClick={handleCancel}
                                className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded shadow flex items-center justify-center transition-colors"
                                title={t.cancelEsc}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </Html>
                );
            })()}
        </>
    );
};
