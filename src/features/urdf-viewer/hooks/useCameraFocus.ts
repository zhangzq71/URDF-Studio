import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { URDFViewerProps } from '../types';

export interface UseCameraFocusOptions {
    robot: THREE.Object3D | null;
    focusTarget: string | null | undefined;
    selection?: URDFViewerProps['selection'];
    mode?: 'detail' | 'hardware';
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
    mode
}: UseCameraFocusOptions): void {
    const { camera, controls, invalidate } = useThree();

    const focusTargetRef = useRef<THREE.Vector3 | null>(null);
    const cameraTargetPosRef = useRef<THREE.Vector3 | null>(null);
    const isFocusingRef = useRef(false);

    // Handle focus target change
    useEffect(() => {
        if (!focusTarget || !robot) return;

        const targetObj = resolveFocusObject(robot, focusTarget, selection);
        if (!targetObj) return;

        targetObj.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(targetObj);
        if (box.isEmpty()) return;

        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 0.25;
        const currentOrbitTarget = controls ? (controls as any).target : new THREE.Vector3(0, 0, 0);
        const direction = new THREE.Vector3().subVectors(camera.position, currentOrbitTarget);

        if (direction.lengthSq() < 0.001) {
            direction.set(1, 1, 1);
        }
        direction.normalize();

        const newPos = sphere.center.clone().add(direction.multiplyScalar(Math.max(radius * 3, 0.6)));

        focusTargetRef.current = sphere.center;
        cameraTargetPosRef.current = newPos;
        isFocusingRef.current = true;
        invalidate();
    }, [focusTarget, selection?.id, selection?.subType, selection?.objectIndex, robot, camera, controls, invalidate]);

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
