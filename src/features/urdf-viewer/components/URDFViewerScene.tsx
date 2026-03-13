import { Suspense } from 'react';
import { JointInteraction } from './JointInteraction';
import { MeasureTool } from './MeasureTool';
import { RobotModel } from './RobotModel';
import type { RobotModelProps, URDFViewerProps } from '../types';
import type { URDFViewerController } from '../hooks/useURDFViewerController';

interface URDFViewerSceneProps {
  controller: URDFViewerController;
  urdfContent: string;
  assets: Record<string, string>;
  mode: 'detail' | 'hardware';
  selection?: URDFViewerProps['selection'];
  hoverSelectionEnabled?: boolean;
  onHover?: URDFViewerProps['onHover'];
  onMeshSelect?: URDFViewerProps['onMeshSelect'];
  robotLinks?: URDFViewerProps['robotLinks'];
  robotJoints?: URDFViewerProps['robotJoints'];
  focusTarget?: URDFViewerProps['focusTarget'];
  onCollisionTransformPreview?: URDFViewerProps['onCollisionTransformPreview'];
  onCollisionTransform?: URDFViewerProps['onCollisionTransform'];
  isMeshPreview?: boolean;
  t: RobotModelProps['t'];
}

export const URDFViewerScene = ({
  controller,
  urdfContent,
  assets,
  mode,
  selection,
  hoverSelectionEnabled = true,
  onHover,
  onMeshSelect,
  robotLinks,
  robotJoints,
  focusTarget,
  onCollisionTransformPreview,
  onCollisionTransform,
  isMeshPreview = false,
  t,
}: URDFViewerSceneProps) => {
  return (
    <>
      <MeasureTool
        active={controller.toolMode === 'measure'}
        robot={controller.robot}
        measureState={controller.measureState}
        setMeasureState={controller.setMeasureState}
        deleteTooltip={t.deleteMeasurement}
      />

      <Suspense fallback={null}>
        <RobotModel
          urdfContent={urdfContent}
          assets={assets}
          onRobotLoaded={controller.handleRobotLoaded}
          showCollision={controller.showCollision}
          showVisual={controller.showVisual}
          onSelect={controller.handleSelectWrapper}
          onHover={onHover}
          onMeshSelect={onMeshSelect}
          onJointChange={controller.handleJointAngleChange}
          onJointChangeCommit={controller.handleJointChangeCommit}
          jointAngles={controller.jointAngles}
          setIsDragging={controller.setIsDragging}
          setActiveJoint={controller.setActiveJoint}
          justSelectedRef={controller.justSelectedRef}
          t={t}
          mode={mode}
          selection={selection}
          hoverSelectionEnabled={hoverSelectionEnabled}
          highlightMode={controller.highlightMode}
          showInertia={controller.showInertia}
          showInertiaOverlay={controller.showInertiaOverlay}
          showCenterOfMass={controller.showCenterOfMass}
          showCoMOverlay={controller.showCoMOverlay}
          centerOfMassSize={controller.centerOfMassSize}
          showOrigins={controller.showOrigins}
          showOriginsOverlay={controller.showOriginsOverlay}
          originSize={controller.originSize}
          showJointAxes={controller.showJointAxes}
          showJointAxesOverlay={controller.showJointAxesOverlay}
          jointAxisSize={controller.jointAxisSize}
          modelOpacity={controller.modelOpacity}
          robotLinks={robotLinks}
          robotJoints={robotJoints}
          focusTarget={focusTarget}
          transformMode={controller.transformMode}
          transformReferenceFrame={controller.transformReferenceFrame}
          toolMode={controller.toolMode}
          onCollisionTransformPreview={onCollisionTransformPreview}
          onCollisionTransformEnd={onCollisionTransform}
          isOrbitDragging={controller.isOrbitDragging}
          onTransformPending={controller.handleTransformPending}
          isSelectionLockedRef={controller.transformPendingRef}
          isMeshPreview={isMeshPreview}
        />
      </Suspense>

      {controller.activeJoint && controller.robot?.joints?.[controller.activeJoint] && (
        <JointInteraction
          joint={controller.robot.joints[controller.activeJoint]}
          value={controller.jointAngles[controller.activeJoint] || 0}
          onChange={(value) => controller.handleJointAngleChange(controller.activeJoint!, value)}
          onCommit={(value) => controller.handleJointChangeCommit(controller.activeJoint!, value)}
          setIsDragging={controller.setIsDragging}
          onInteractionLockChange={controller.handleTransformPending}
        />
      )}
    </>
  );
};
