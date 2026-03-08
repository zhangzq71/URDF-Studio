import React from 'react';
import * as THREE from 'three';
import type { RobotState, UrdfJoint } from '@/types';
import type { Language } from '@/shared/i18n';
import { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from '@/shared/components/3d';
import { RobotNode } from './nodes';
import { JointTransformControls } from './controls';
import type { VisualizerController } from '../hooks/useVisualizerController';

const GroundedGroup = React.forwardRef<THREE.Group, { children: React.ReactNode }>(
  function GroundedGroup({ children }, ref) {
    return <group ref={ref}>{children}</group>;
  }
);

interface VisualizerSceneProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  mode: 'skeleton' | 'detail' | 'hardware';
  assets: Record<string, string>;
  lang: Language;
  controller: VisualizerController;
  confirmTitle: string;
  cancelTitle: string;
}

export const VisualizerScene = React.memo(({
  robot,
  onSelect,
  onUpdate,
  mode,
  assets,
  lang,
  controller,
  confirmTitle,
  cancelTitle,
}: VisualizerSceneProps) => {
  const collisionTransformControlRef = React.useRef<any>(null);
  const {
    robotRootRef,
    state,
    selectedJointPivot,
    selectedCollisionRef,
    handleRegisterJointPivot,
    handleRegisterCollisionRef,
    transformControlsState,
    handleCollisionTransformEnd,
  } = controller;
  const childJointsByParent = React.useMemo<Record<string, UrdfJoint[]>>(() => {
    const grouped: Record<string, UrdfJoint[]> = {};

    Object.values(robot.joints).forEach((joint) => {
      if (!grouped[joint.parentLinkId]) {
        grouped[joint.parentLinkId] = [];
      }

      grouped[joint.parentLinkId].push(joint);
    });

    return grouped;
  }, [robot.joints]);

  return (
    <>
      <GroundedGroup ref={robotRootRef}>
        <RobotNode
          linkId={robot.rootLinkId}
          robot={robot}
          onSelect={onSelect}
          onUpdate={onUpdate}
          mode={mode}
          showGeometry={state.showGeometry}
          showVisual={state.showVisual}
          showLabels={state.showLabels}
          showJointAxes={state.showJointAxes}
          showSkeletonOrigin={state.showSkeletonOrigin}
          jointAxisSize={state.jointAxisSize}
          frameSize={state.frameSize}
          labelScale={state.labelScale}
          showDetailOrigin={state.showDetailOrigin}
          showDetailLabels={state.showDetailLabels}
          showCollision={state.showCollision}
          showHardwareOrigin={state.showHardwareOrigin}
          showHardwareLabels={state.showHardwareLabels}
          showInertia={state.showInertia}
          showCenterOfMass={state.showCenterOfMass}
          transformMode={state.transformMode}
          depth={0}
          assets={assets}
          lang={lang}
          childJointsByParent={childJointsByParent}
          onRegisterJointPivot={handleRegisterJointPivot}
          onRegisterCollisionRef={handleRegisterCollisionRef}
        />
      </GroundedGroup>

      <JointTransformControls
        mode={mode}
        selectedJointPivot={selectedJointPivot}
        robot={robot}
        transformMode={state.transformMode}
        transformControlsState={transformControlsState}
        confirmTitle={confirmTitle}
        cancelTitle={cancelTitle}
      />

      {mode === 'detail' &&
        selectedCollisionRef &&
        robot.selection.type === 'link' &&
        robot.selection.id &&
        robot.selection.subType === 'collision' && (
          <>
            <UnifiedTransformControls
              ref={collisionTransformControlRef}
              object={selectedCollisionRef}
              mode={state.transformMode === 'select' ? 'translate' : state.transformMode}
              gizmoPreset="collision-precise"
              size={VISUALIZER_UNIFIED_GIZMO_SIZE}
              space="local"
              onMouseUp={handleCollisionTransformEnd}
            />
          </>
        )}
    </>
  );
});
