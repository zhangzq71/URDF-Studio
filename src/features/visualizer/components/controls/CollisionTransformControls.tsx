import { memo } from 'react';
import * as THREE from 'three';
import { RobotState } from '@/types';
import {
  TransformConfirmHtmlOverlay,
  UnifiedTransformControls,
  VISUALIZER_UNIFIED_GIZMO_SIZE,
} from '@/shared/components/3d';
import { TransformControlsState } from '../../hooks/useTransformControls';

const COLLISION_TRANSLATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE;
const COLLISION_ROTATE_GIZMO_SIZE = VISUALIZER_UNIFIED_GIZMO_SIZE * 0.84;
const COLLISION_GIZMO_THICKNESS_SCALE = 1.9;

interface CollisionTransformControlsProps {
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
 * - Active for merged visualizer editing scenes regardless of legacy app mode
 */
export const CollisionTransformControls = memo(function CollisionTransformControls({
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
        size={COLLISION_TRANSLATE_GIZMO_SIZE}
        rotateSize={COLLISION_ROTATE_GIZMO_SIZE}
        space="local"
        hoverStyle="single-axis"
        displayStyle="thick-primary"
        displayThicknessScale={COLLISION_GIZMO_THICKNESS_SCALE}
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
          <TransformConfirmHtmlOverlay
            axisLabel={pendingEdit.axis}
            position={worldPos.toArray() as [number, number, number]}
            value={getDisplayValue()}
            step={pendingEdit.isRotate ? '1' : '0.001'}
            unitLabel={pendingEdit.isRotate ? '°' : 'm'}
            deltaDisplay={getDeltaDisplay()}
            onValueChange={handleValueChange}
            onKeyDown={handleKeyDown}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            confirmTitle={confirmTitle}
            htmlStyle={{ pointerEvents: 'auto' }}
          />
        );
      })()}
    </>
  );
});
