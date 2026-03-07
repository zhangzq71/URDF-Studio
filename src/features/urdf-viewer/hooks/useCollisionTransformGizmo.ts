import { useCallback, type MutableRefObject } from 'react';
import * as THREE from 'three';

interface UseCollisionTransformGizmoArgs {
    transformRef: MutableRefObject<any>;
    rotateTransformRef: MutableRefObject<any>;
}

export const useCollisionTransformGizmo = ({
    transformRef,
    rotateTransformRef
}: UseCollisionTransformGizmoArgs) => {
    const markRotateKnobDragStart = useCallback((controls: any, axis: string) => {
        const rotateGizmo = controls?.children?.[0]?.gizmo?.rotate;
        if (!rotateGizmo) return;
        if (!controls.userData) controls.userData = {};
        controls.userData.urdfActiveRotateAxis = axis;

        // TransformControls keeps `rotationAngle` from the previous drag.
        // If we reuse that value, knob offset will drift and feel like it lags behind the cursor.
        if (typeof controls?.rotationAngle === 'number') {
            controls.rotationAngle = 0;
        }

        rotateGizmo.traverse((child: any) => {
            if (!child.userData?.urdfRotateKnob) return;
            if (child.name !== axis) return;
            child.userData.urdfDragStartAnchor = child.position.clone();
            child.userData.urdfDragStartAngle = 0;
            child.userData.urdfDragAccumulatedAngle = 0;
            child.userData.urdfDragLastRawAngle = 0;
            delete child.userData.urdfDragTheta;
            delete child.userData.urdfDragDirection;
        });
    }, []);

    const persistRotateKnobAnchor = useCallback((controls: any, axis: string) => {
        const rotateGizmo = controls?.children?.[0]?.gizmo?.rotate;
        if (!rotateGizmo) return;
        if (controls?.userData) {
            delete controls.userData.urdfActiveRotateAxis;
        }

        rotateGizmo.traverse((child: any) => {
            if (!child.userData?.urdfRotateKnob) return;
            if (child.name === axis) {
                child.userData.urdfKnobAnchor = child.position.clone();
            }
            delete child.userData.urdfDragStartAnchor;
            delete child.userData.urdfDragStartAngle;
            delete child.userData.urdfDragAccumulatedAngle;
            delete child.userData.urdfDragLastRawAngle;
            delete child.userData.urdfDragTheta;
            delete child.userData.urdfDragDirection;
            delete child.userData.urdfDragFrozenPos;
            delete child.userData.urdfDragFrozenWorldPos;
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
    }, [syncTranslateTipPickers, syncRotateKnobPickers, transformRef, rotateTransformRef]);

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
    }, [transformRef, rotateTransformRef]);

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
                    // Only enforce render-state — let TransformControls manage
                    // opacity and color so hover highlight/dimming is visible.
                    const needsDepthReset = mat.depthTest !== false || mat.depthWrite !== false || mat.transparent !== true;
                    if (needsDepthReset) {
                        mat.transparent = true;
                        mat.depthTest = false;
                        mat.depthWrite = false;
                        mat.needsUpdate = true;
                    }
                }
            });
        }
    }, []);

    const updateRotateKnobFeedback = useCallback((controls: any, _elapsedTime: number) => {
        if (controls?.mode !== 'rotate') return;
        const root = controls?.children?.[0];
        const rotateGizmo = root?.gizmo?.rotate;
        if (!rotateGizmo) return;

        rotateGizmo.updateWorldMatrix(true, true);

        const isDragging = Boolean(controls?.dragging);
        const hoveredAxis = typeof controls?.axis === 'string' ? controls.axis : null;
        const lockedDragAxis = typeof controls?.userData?.urdfActiveRotateAxis === 'string'
            ? controls.userData.urdfActiveRotateAxis as string
            : null;
        const axis = (
            isDragging &&
            (lockedDragAxis === 'X' || lockedDragAxis === 'Y' || lockedDragAxis === 'Z')
        )
            ? lockedDragAxis
            : hoveredAxis;
        const rotationAngle = typeof controls?.rotationAngle === 'number' ? controls.rotationAngle : 0;
        const pointEnd = controls?.pointEnd as THREE.Vector3 | undefined;
        const worldStart = controls?.worldPositionStart as THREE.Vector3 | undefined;
        const normalizeAngle = (angle: number) => {
            let value = angle;
            while (value <= -Math.PI) value += Math.PI * 2;
            while (value > Math.PI) value -= Math.PI * 2;
            return value;
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
            ringMeta: {
                center: THREE.Vector3;
                basisU: THREE.Vector3;
                basisV: THREE.Vector3;
                normal: THREE.Vector3;
            }
        ) => {
            const v = localPoint.clone().sub(ringMeta.center);
            v.addScaledVector(ringMeta.normal, -v.dot(ringMeta.normal));
            const x = v.dot(ringMeta.basisU);
            const y = v.dot(ringMeta.basisV);
            return Math.atan2(y, x);
        };

        const getPointForTheta = (
            theta: number,
            ringMeta: {
                center: THREE.Vector3;
                radius: number;
                basisU: THREE.Vector3;
                basisV: THREE.Vector3;
            }
        ) => {
            return new THREE.Vector3()
                .copy(ringMeta.center)
                .addScaledVector(ringMeta.basisU, Math.cos(theta) * ringMeta.radius)
                .addScaledVector(ringMeta.basisV, Math.sin(theta) * ringMeta.radius);
        };

        rotateGizmo.traverse((child: any) => {
            if (child.userData?.urdfRotateKnob) {
                const base = (child.userData.urdfKnobAnchor as THREE.Vector3 | undefined)?.clone?.() || child.position.clone();
                let targetPos = base.clone();

                if (isDragging && axis === child.name) {
                    const dragStart = (child.userData.urdfDragStartAnchor as THREE.Vector3 | undefined)?.clone?.() || base.clone();
                    const line = child.parent;
                    const ringMeta = getRingMeta(line);
                    if (line && ringMeta) {
                        const startTheta = getThetaOnRing(dragStart, ringMeta);
                        if (pointEnd && worldStart) {
                            const camera = controls?.camera as THREE.Camera | undefined;
                            const worldPoint = worldStart.clone().add(pointEnd);
                            if (camera) {
                                const pointerNdc = worldPoint.clone().project(camera);
                                const steps = 240;
                                const lastThetaRaw = typeof child.userData?.urdfDragTheta === 'number'
                                    ? child.userData.urdfDragTheta as number
                                    : startTheta;
                                const wrappedLastTheta = normalizeAngle(lastThetaRaw);
                                const maxStepAngle = Math.PI * 0.85;
                                const anglePenalty = 0.03;

                                let bestScore = Number.POSITIVE_INFINITY;
                                let bestTheta = 0;
                                const candidateLocal = new THREE.Vector3();
                                const candidateWorld = new THREE.Vector3();
                                let foundCandidate = false;

                                for (let i = 0; i < steps; i++) {
                                    const theta = (i / steps) * Math.PI * 2;
                                    const angularDistance = Math.abs(normalizeAngle(theta - wrappedLastTheta));
                                    if (angularDistance > maxStepAngle) continue;

                                    candidateLocal.copy(ringMeta.center)
                                        .addScaledVector(ringMeta.basisU, Math.cos(theta) * ringMeta.radius)
                                        .addScaledVector(ringMeta.basisV, Math.sin(theta) * ringMeta.radius);

                                    candidateWorld.copy(candidateLocal);
                                    line.localToWorld(candidateWorld);
                                    candidateWorld.project(camera);

                                    const dx = candidateWorld.x - pointerNdc.x;
                                    const dy = candidateWorld.y - pointerNdc.y;
                                    const distSq = dx * dx + dy * dy;
                                    const score = distSq + anglePenalty * angularDistance * angularDistance;

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
                                targetPos.copy(getPointForTheta(unwrappedTheta, ringMeta));
                            } else {
                                targetPos = dragStart;
                            }
                        } else {
                            const previousRaw = typeof child.userData?.urdfDragLastRawAngle === 'number'
                                ? child.userData.urdfDragLastRawAngle as number
                                : rotationAngle;
                            let deltaRaw = rotationAngle - previousRaw;
                            if (deltaRaw > Math.PI) deltaRaw -= Math.PI * 2;
                            else if (deltaRaw < -Math.PI) deltaRaw += Math.PI * 2;
                            const accumulated = (
                                typeof child.userData?.urdfDragAccumulatedAngle === 'number'
                                    ? child.userData.urdfDragAccumulatedAngle as number
                                    : 0
                            ) + deltaRaw;
                            child.userData.urdfDragLastRawAngle = rotationAngle;
                            child.userData.urdfDragAccumulatedAngle = accumulated;

                            const targetTheta = startTheta + accumulated;

                            child.userData.urdfDragTheta = targetTheta;
                            targetPos.copy(getPointForTheta(targetTheta, ringMeta));
                        }
                    } else {
                        targetPos = dragStart;
                    }

                    child.position.copy(targetPos);
                } else if (isDragging) {
                    child.position.copy(base);
                } else {
                    child.position.copy(targetPos);
                }

                child.scale.setScalar(1);
                return;
            }

            if (child.userData?.urdfRotateKnobOutline && child.material) {
                const mat = child.material;
                if ((mat.opacity ?? 0) !== 0) {
                    mat.opacity = 0;
                    mat.needsUpdate = true;
                }
            }
        });
    }, []);

    return {
        markRotateKnobDragStart,
        persistRotateKnobAnchor,
        syncRotateKnobPickers,
        syncTranslateTipPickers,
        syncAllGizmoPickers,
        syncUniversalControlPriority,
        normalizeGizmoMaterials,
        updateRotateKnobFeedback
    };
};
