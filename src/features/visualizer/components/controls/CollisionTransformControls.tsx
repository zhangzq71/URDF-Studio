import React, { memo } from 'react';
import * as THREE from 'three';
import { RobotState } from '@/types';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import { TransformControlsState } from '../../hooks/useTransformControls';
import { TransformConfirmUI } from './TransformConfirmUI';

interface CollisionTransformControlsProps {
  mode: 'skeleton' | 'detail' | 'hardware';
  selectedCollisionRef: THREE.Group | null;
  robot: RobotState;
  transformMode: 'translate' | 'rotate';
  transformControlsState: TransformControlsState;
  confirmTitle?: string;
}

/**
 * CollisionTransformControls - Handles TransformControls and confirmation UI for collision editing
 *
 * Features:
 * - Renders TransformControls for selected collision object
 * - Displays confirmation UI when dragging completes
 * - Only active in detail mode
 */
export const CollisionTransformControls = memo(function CollisionTransformControls({
  mode,
  selectedCollisionRef,
  robot,
  transformMode,
  transformControlsState,
  confirmTitle,
}: CollisionTransformControlsProps) {
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

  // Only show in detail mode
  if (mode !== 'detail') return null;

  // No collision selected
  if (
    !selectedCollisionRef || 
    robot.selection.type !== 'link' || 
    !robot.selection.id || 
    robot.selection.subType !== 'collision'
  ) return null;

  return (
    <>
      {/* TransformControls at root Canvas level - not nested in hierarchy */}
      <UnifiedTransformControls
        ref={transformControlRef}
        object={selectedCollisionRef}
        mode={transformMode}
        size={VISUALIZER_UNIFIED_GIZMO_SIZE}
        space="local"
        enabled={!pendingEdit}
        onChange={handleObjectChange}
      />

      {/* Confirm/Cancel UI */}
      {pendingEdit && (() => {
        // Get world position for correct placement
        const worldPos = new THREE.Vector3();
        selectedCollisionRef.getWorldPosition(worldPos);
        
        // Offset upward to float above the collision object
        worldPos.y += 0.3;

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
