import React from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TransformConfirmOverlay } from '@/shared/components/3d';
import { getAxisColor, type CollisionPendingEdit } from '../utils/collisionTransformMath';

interface CollisionPendingEditOverlayProps {
    pendingEdit: CollisionPendingEdit;
    axisLabel: string;
    targetObject: THREE.Object3D;
    inputValue: string;
    deltaDisplay: string;
    confirmTitle: string;
    cancelTitle: string;
    onValueChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export const CollisionPendingEditOverlay: React.FC<CollisionPendingEditOverlayProps> = ({
    pendingEdit,
    axisLabel,
    targetObject,
    inputValue,
    deltaDisplay,
    confirmTitle,
    cancelTitle,
    onValueChange,
    onKeyDown,
    onConfirm,
    onCancel
}) => {
    const box = new THREE.Box3().setFromObject(targetObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const uiPosition: [number, number, number] = [
        center.x,
        center.y,
        center.z + size.z / 2 + 0.02
    ];

    return (
        <Html
            position={uiPosition}
            style={{ pointerEvents: 'none' }}
            center
            zIndexRange={[100, 0]}
        >
            <TransformConfirmOverlay
                axisLabel={axisLabel}
                axisColor={getAxisColor(pendingEdit.axis)}
                value={inputValue}
                step={pendingEdit.isRotate ? '1' : '0.001'}
                unitLabel={pendingEdit.isRotate ? '°' : 'm'}
                deltaDisplay={deltaDisplay}
                onValueChange={onValueChange}
                onKeyDown={onKeyDown}
                onConfirm={onConfirm}
                onCancel={onCancel}
                confirmTitle={confirmTitle}
                cancelTitle={cancelTitle}
                rootClassName="pointer-events-none"
                contentClassName="pointer-events-auto"
            />
        </Html>
    );
};
