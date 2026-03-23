import React, { memo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TransformConfirmOverlay } from '@/shared/components/3d';

interface TransformConfirmUIProps {
  pendingEdit: {
    axis: string;
    value: number;
    startValue: number;
    isRotate: boolean;
  };
  worldPosition: THREE.Vector3;
  getDisplayValue: () => string;
  getDeltaDisplay: () => string;
  handleValueChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleConfirm: () => void;
  handleCancel: () => void;
  confirmTitle?: string;
  cancelTitle?: string;
}

/**
 * TransformConfirmUI - Input UI for confirming/canceling transform edits
 *
 * Features:
 * - Displays input field with axis indicator
 * - Shows current value and delta
 * - Confirm/Cancel buttons
 * - Keyboard shortcuts (Enter/Esc)
 */
export const TransformConfirmUI = memo(function TransformConfirmUI({
  pendingEdit,
  worldPosition,
  getDisplayValue,
  getDeltaDisplay,
  handleValueChange,
  handleKeyDown,
  handleConfirm,
  handleCancel,
  confirmTitle = 'Confirm (Enter)',
  cancelTitle = 'Cancel (Esc)',
}: TransformConfirmUIProps) {

  const getAxisColor = (axis: string) => {
    if (axis === 'X') return '#ef4444'; // Red
    if (axis === 'Y') return '#22c55e'; // Green
    if (axis === 'Z') return '#3b82f6'; // Blue
    return '#94a3b8'; // Gray
  };

  return (
    <Html
      position={worldPosition.toArray()}
      style={{ pointerEvents: 'auto' }}
      center
      zIndexRange={[100, 0]}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <TransformConfirmOverlay
          axisLabel={pendingEdit.axis}
          axisColor={getAxisColor(pendingEdit.axis)}
          value={getDisplayValue()}
          step={pendingEdit.isRotate ? '1' : '0.001'}
          unitLabel={pendingEdit.isRotate ? '°' : 'm'}
          deltaDisplay={getDeltaDisplay()}
          onValueChange={handleValueChange}
          onKeyDown={handleKeyDown}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          confirmTitle={confirmTitle}
          cancelTitle={cancelTitle}
        />
      </div>
    </Html>
  );
});
