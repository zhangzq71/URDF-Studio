import { memo } from 'react';
import * as THREE from 'three';
import { JointType, RobotState } from '@/types';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import { TransformControlsState } from '../../hooks/useTransformControls';
interface JointTransformControlsProps {
  mode: 'skeleton' | 'detail' | 'hardware';
  selectedJointPivot: THREE.Group | null;
  robot: RobotState;
  transformMode: 'translate' | 'rotate' | 'universal';
  transformControlsState: TransformControlsState;
}

/**
 * JointTransformControls - Handles joint TransformControls in skeleton mode
 *
 * Features:
 * - Renders TransformControls for selected joint pivot
 * - Applies drag results immediately
 * - Skips fixed joints (they cannot be transformed)
 * - Only active in skeleton mode
 */
export const JointTransformControls = memo(function JointTransformControls({
  mode,
  selectedJointPivot,
  robot,
  transformMode,
  transformControlsState,
}: JointTransformControlsProps) {
  const {
    transformControlRef,
    rotateTransformControlRef,
    handleObjectChange,
  } = transformControlsState;

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
      <UnifiedTransformControls
        ref={transformControlRef}
        rotateRef={rotateTransformControlRef}
        object={selectedJointPivot}
        mode={transformMode}
        size={VISUALIZER_UNIFIED_GIZMO_SIZE}
        space="local"
        hoverStyle="single-axis"
        displayStyle="thick-primary"
        onChange={handleObjectChange}
        onRotateChange={handleObjectChange}
      />
    </>
  );
});
