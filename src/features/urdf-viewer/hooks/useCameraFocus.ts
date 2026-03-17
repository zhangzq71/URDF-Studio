import { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { URDFViewerProps } from '../types';

export interface UseCameraFocusOptions {
    robot: THREE.Object3D | null;
    focusTarget: string | null | undefined;
    selection?: URDFViewerProps['selection'];
    mode?: 'detail' | 'hardware';
    autoFrameOnRobotChange?: boolean;
}

function computeVisibleBounds(root: THREE.Object3D): THREE.Box3 | null {
    const bounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    let hasBounds = false;

    root.updateWorldMatrix(true, true);

    root.traverseVisible((child) => {
        if (child.userData?.isHelper || child.userData?.isGizmo || child.name?.startsWith('__')) {
            return;
        }

        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;

        if (!mesh.geometry.boundingBox) {
            mesh.geometry.computeBoundingBox();
        }

        const geometryBounds = mesh.geometry.boundingBox;
        if (!geometryBounds) return;

        meshBounds.copy(geometryBounds).applyMatrix4(mesh.matrixWorld);
        if (
            !Number.isFinite(meshBounds.min.x) || !Number.isFinite(meshBounds.min.y) || !Number.isFinite(meshBounds.min.z)
            || !Number.isFinite(meshBounds.max.x) || !Number.isFinite(meshBounds.max.y) || !Number.isFinite(meshBounds.max.z)
        ) {
            return;
        }

        if (!hasBounds) {
            bounds.copy(meshBounds);
            hasBounds = true;
        } else {
            bounds.union(meshBounds);
        }
    });

    return hasBounds ? bounds : null;
}

function collectLinkBodies(
    linkObject: THREE.Object3D,
    subType: 'visual' | 'collision'
): THREE.Object3D[] {
    const isMatchingBody = (child: THREE.Object3D) =>
        subType === 'collision'
            ? Boolean((child as any).isURDFCollider)
            : Boolean((child as any).isURDFVisual);

    const directBodies = linkObject.children.filter(isMatchingBody);
    if (directBodies.length > 0) {
        return directBodies;
    }

    const nestedBodies: THREE.Object3D[] = [];
    linkObject.traverse((child) => {
        if (child !== linkObject && isMatchingBody(child)) {
            nestedBodies.push(child);
        }
    });

    return nestedBodies;
}

function resolveFocusObject(
    robot: THREE.Object3D,
    focusTarget: string,
    selection?: URDFViewerProps['selection']
): THREE.Object3D | null {
    if (
        selection?.type === 'link' &&
        selection.id === focusTarget &&
        selection.subType
    ) {
        const linkObject = (robot as any).links?.[selection.id] as THREE.Object3D | undefined;
        if (linkObject) {
            const targetBodies = collectLinkBodies(linkObject, selection.subType);
            const objectIndex = selection.objectIndex ?? 0;
            return targetBodies[objectIndex] ?? targetBodies[0] ?? null;
        }
    }

    if ((robot as any).links?.[focusTarget]) {
        return (robot as any).links[focusTarget] as THREE.Object3D;
    }

    if ((robot as any).joints?.[focusTarget]) {
        return (robot as any).joints[focusTarget] as THREE.Object3D;
    }

    return robot.getObjectByName(focusTarget);
}

export function useCameraFocus({
    robot,
    focusTarget,
    selection,
    mode,
    autoFrameOnRobotChange = false,
}: UseCameraFocusOptions): void {
    const { camera, controls, invalidate } = useThree();

    const focusTargetRef = useRef<THREE.Vector3 | null>(null);
    const cameraTargetPosRef = useRef<THREE.Vector3 | null>(null);
    const isFocusingRef = useRef(false);
    const autoFramedRobotIdRef = useRef<string | null>(null);

    const frameObject = useCallback((targetObj: THREE.Object3D, bounds?: THREE.Box3 | null) => {
        if (!controls) return false;

        targetObj.updateWorldMatrix(true, true);
        const box = bounds ?? computeVisibleBounds(targetObj);
        if (!box || box.isEmpty()) return false;

        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 0.25;
        const currentOrbitTarget = (controls as any).target as THREE.Vector3;
        const direction = new THREE.Vector3().subVectors(camera.position, currentOrbitTarget);

        if (direction.lengthSq() < 0.001) {
            direction.set(1, 1, 1);
        }
        direction.normalize();

        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const distance = Math.max(radius / Math.sin(Math.max(verticalFov * 0.5, 0.35)), 0.85);
        const newPos = sphere.center.clone().add(direction.multiplyScalar(distance * 1.15));

        focusTargetRef.current = sphere.center;
        cameraTargetPosRef.current = newPos;
        isFocusingRef.current = true;
        invalidate();
        return true;
    }, [camera, controls, invalidate]);

    // Handle focus target change
    useEffect(() => {
        if (!focusTarget || !robot) return;

        const targetObj = resolveFocusObject(robot, focusTarget, selection);
        if (!targetObj) return;

        frameObject(targetObj, new THREE.Box3().setFromObject(targetObj));
    }, [focusTarget, frameObject, robot, selection?.id, selection?.subType, selection?.objectIndex]);

    useEffect(() => {
        if (!autoFrameOnRobotChange || !robot || focusTarget || mode === 'hardware') return;
        if (autoFramedRobotIdRef.current === robot.uuid) return;

        autoFramedRobotIdRef.current = robot.uuid;
        const timers = [80, 260].map((delay) => window.setTimeout(() => {
            if (focusTarget || mode === 'hardware') return;
            frameObject(robot);
        }, delay));

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [autoFrameOnRobotChange, focusTarget, frameObject, mode, robot]);

    // Animate camera focus
    useFrame((state, delta) => {
        void state;
        // Skip in hardware mode to improve performance
        if (mode === 'hardware') return;

        if (isFocusingRef.current && focusTargetRef.current && cameraTargetPosRef.current && controls) {
            const orbitControls = controls as any;
            const step = Math.min(1, 5 * delta);

            orbitControls.target.lerp(focusTargetRef.current, step);
            camera.position.lerp(cameraTargetPosRef.current, step);
            orbitControls.update();
            invalidate();

            if (camera.position.distanceTo(cameraTargetPosRef.current) < 0.01 &&
                orbitControls.target.distanceTo(focusTargetRef.current) < 0.01) {
                isFocusingRef.current = false;
            }
        }
    });
}
