import React from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
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
            <div className="flex flex-col items-center gap-1 pointer-events-none">
                <div
                    className="flex items-center gap-1 pointer-events-auto"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span
                        className="h-5 min-w-5 px-1.5 rounded text-white text-[10px] font-bold flex items-center justify-center shadow"
                        style={{ backgroundColor: getAxisColor(pendingEdit.axis) }}
                    >
                        {axisLabel}
                    </span>
                    <input
                        type="number"
                        step={pendingEdit.isRotate ? '1' : '0.001'}
                        value={inputValue}
                        onChange={onValueChange}
                        onKeyDown={onKeyDown}
                        autoFocus
                        className="w-20 rounded border border-border-strong bg-panel-bg px-1.5 py-0.5 text-xs font-mono text-text-primary shadow-sm focus:border-system-blue focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {pendingEdit.isRotate ? '°' : 'm'} ({deltaDisplay})
                    </span>
                </div>

                <div
                    className="flex gap-1 pointer-events-auto"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <button
                        onClick={onConfirm}
                        className="w-6 h-6 bg-green-500 hover:bg-green-600 text-white rounded shadow flex items-center justify-center transition-colors"
                        title={confirmTitle}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </button>
                    <button
                        onClick={onCancel}
                        className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded shadow flex items-center justify-center transition-colors"
                        title={cancelTitle}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </Html>
    );
};
