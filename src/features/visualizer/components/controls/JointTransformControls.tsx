import React, { memo } from 'react';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { JointType, RobotState } from '@/types';
import { TransformControlsState } from '../../hooks/useTransformControls';
import { TransformConfirmUI } from './TransformConfirmUI';

interface JointTransformControlsProps {
  mode: 'skeleton' | 'detail' | 'hardware';
  selectedJointPivot: THREE.Group | null;
  robot: RobotState;
  transformMode: 'translate' | 'rotate';
  transformControlsState: TransformControlsState;
  confirmTitle?: string;
}

/**
 * JointTransformControls - Handles TransformControls and confirmation UI for joint editing
 *
 * Features:
 * - Renders TransformControls for selected joint pivot
 * - Displays confirmation UI when dragging completes
 * - Skips fixed joints (they cannot be transformed)
 * - Only active in skeleton mode
 */
export const JointTransformControls = memo(function JointTransformControls({
  mode,
  selectedJointPivot,
  robot,
  transformMode,
  transformControlsState,
  confirmTitle,
}: JointTransformControlsProps) {
  const {
    transformControlRef,
    pendingEdit,
    getDisplayValue,
    getDeltaDisplay,
    handleValueChange,
    handleKeyDown,
    handleConfirm,
    handleCancel,
    handleObjectChange,
  } = transformControlsState;

  // Only show in skeleton mode
  if (mode !== 'skeleton') return null;

  // No joint selected
  if (!selectedJointPivot || robot.selection.type !== 'joint' || !robot.selection.id) return null;

  const jointId = robot.selection.id;
  const joint = robot.joints[jointId];

  if (!joint) return null;

  // Don't show TransformControls for fixed joints
  const jointTypeStr = String(joint.type).toLowerCase();
  if (jointTypeStr === 'fixed' || joint.type === JointType.FIXED) return null;

  return (
    <>
      {/* TransformControls at root Canvas level - not nested in hierarchy */}
      <TransformControls
        ref={transformControlRef}
        object={selectedJointPivot}
        mode={transformMode}
        size={0.7}
        space="local"
        enabled={!pendingEdit}
        onChange={handleObjectChange}
      />

      {/* Confirm/Cancel UI */}
      {pendingEdit && (() => {
        // Get world position for correct placement
        const worldPos = new THREE.Vector3();
        selectedJointPivot.getWorldPosition(worldPos);

        return (
          <TransformConfirmUI
            pendingEdit={pendingEdit}
            worldPosition={worldPos}
            getDisplayValue={getDisplayValue}
            getDeltaDisplay={getDeltaDisplay}
            handleValueChange={handleValueChange}
            handleKeyDown={handleKeyDown}
            handleConfirm={handleConfirm}
            handleCancel={handleCancel}
            confirmTitle={confirmTitle}
          />
        );
      })()}
    </>
  );
});
