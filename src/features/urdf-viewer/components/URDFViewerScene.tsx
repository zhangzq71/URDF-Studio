import { Suspense, lazy, useMemo, useRef } from 'react';
import { MeasureTool } from './MeasureTool';
import { RobotModel } from './RobotModel';
import type {
  MeasureTargetResolver,
  RobotModelProps,
  ToolMode,
  ViewerDocumentLoadEvent,
  URDFViewerProps,
  ViewerRuntimeStageBridge,
  UsdLoadingPhaseLabels,
} from '../types';
import { isContinuousHoverEnabledForToolMode } from '../utils/usdInteractionPolicy';
import type { URDFViewerController } from '../hooks/useURDFViewerController';
import type { RobotFile } from '@/types';
import type { ViewerRobotDataResolution } from '../utils/viewerRobotData';

const LazyUsdWasmStage = lazy(async () => ({
  default: (await import('./UsdWasmStage')).UsdWasmStage,
}));

interface URDFViewerSceneProps {
  controller: URDFViewerController;
  active?: boolean;
  sourceFile?: RobotFile | null;
  availableFiles: RobotFile[];
  urdfContent: string;
  assets: Record<string, string>;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  sourceFilePath?: string;
  groundPlaneOffset?: number;
  mode: 'detail' | 'hardware';
  selection?: URDFViewerProps['selection'];
  hoveredSelection?: URDFViewerProps['hoveredSelection'];
  hoverSelectionEnabled?: boolean;
  onHover?: URDFViewerProps['onHover'];
  onMeshSelect?: URDFViewerProps['onMeshSelect'];
  robotLinks?: URDFViewerProps['robotLinks'];
  robotJoints?: URDFViewerProps['robotJoints'];
  focusTarget?: URDFViewerProps['focusTarget'];
  onCollisionTransformPreview?: URDFViewerProps['onCollisionTransformPreview'];
  onCollisionTransform?: URDFViewerProps['onCollisionTransform'];
  isMeshPreview?: boolean;
  runtimeInstanceKey?: number;
  toolMode: ToolMode;
  t: RobotModelProps['t'];
}

export const URDFViewerScene = ({
  controller,
  active = true,
  sourceFile,
  availableFiles,
  urdfContent,
  assets,
  onRobotDataResolved,
  onDocumentLoadEvent,
  sourceFilePath,
  groundPlaneOffset,
  mode,
  selection,
  hoveredSelection,
  hoverSelectionEnabled = true,
  onHover,
  onMeshSelect,
  robotLinks,
  robotJoints,
  focusTarget,
  onCollisionTransformPreview,
  onCollisionTransform,
  isMeshPreview = false,
  runtimeInstanceKey = 0,
  toolMode,
  t,
}: URDFViewerSceneProps) => {
  const useUsdStage = sourceFile?.format === 'usd' && !isMeshPreview;
  const usdSourceFile = useUsdStage ? sourceFile : null;
  const effectiveHoverSelectionEnabled =
    hoverSelectionEnabled && isContinuousHoverEnabledForToolMode(toolMode);
  const measureTargetResolverRef = useRef<MeasureTargetResolver | null>(null);
  const runtimeBridge = useMemo<ViewerRuntimeStageBridge>(() => ({
    onRobotResolved: controller.handleJointPanelRobotLoaded,
    onSelectionChange: controller.handleSelectWrapper,
    onActiveJointChange: controller.handleActiveJointChange,
    onJointAnglesChange: controller.handleRuntimeJointAnglesChange,
  }), [
    controller.handleActiveJointChange,
    controller.handleJointPanelRobotLoaded,
    controller.handleRuntimeJointAnglesChange,
    controller.handleSelectWrapper,
  ]);
  const usdLoadingPhaseLabels = useMemo<UsdLoadingPhaseLabels>(() => ({
    'checking-path': t.loadingRobotCheckingPath,
    'preloading-dependencies': t.loadingRobotPreloadingDependencies,
    'initializing-renderer': t.loadingRobotInitializingRenderer,
    'streaming-meshes': t.loadingRobotStreamingMeshes,
    'applying-stage-fixes': t.loadingRobotApplyingStageFixes,
    'resolving-metadata': t.loadingRobotResolvingMetadata,
    'finalizing-scene': t.loadingRobotFinalizingScene,
  }), [
    t.loadingRobotApplyingStageFixes,
    t.loadingRobotCheckingPath,
    t.loadingRobotFinalizingScene,
    t.loadingRobotInitializingRenderer,
    t.loadingRobotPreloadingDependencies,
    t.loadingRobotResolvingMetadata,
    t.loadingRobotStreamingMeshes,
  ]);

  return (
    <>
      <MeasureTool
        active={controller.toolMode === 'measure'}
        robot={controller.robot}
        robotLinks={robotLinks}
        measureState={controller.measureState}
        setMeasureState={controller.setMeasureState}
        measureAnchorMode={controller.measureAnchorMode}
        showDecomposition={controller.showMeasureDecomposition}
        deleteTooltip={t.deleteMeasurement}
        measureTargetResolverRef={measureTargetResolverRef}
      />

      {usdSourceFile ? (
        <Suspense fallback={null}>
          <LazyUsdWasmStage
            key={runtimeInstanceKey}
            active={active}
            sourceFile={usdSourceFile}
            availableFiles={availableFiles}
            assets={assets}
            groundPlaneOffset={groundPlaneOffset}
            mode={mode}
            justSelectedRef={controller.justSelectedRef}
            selection={selection}
            hoveredSelection={hoveredSelection}
            hoverSelectionEnabled={effectiveHoverSelectionEnabled}
            onHover={onHover}
            onMeshSelect={onMeshSelect}
            showOrigins={controller.showOrigins}
            showOriginsOverlay={controller.showOriginsOverlay}
            originSize={controller.originSize}
            showJointAxes={controller.showJointAxes}
            showJointAxesOverlay={controller.showJointAxesOverlay}
            jointAxisSize={controller.jointAxisSize}
            highlightMode={controller.highlightMode}
            showCenterOfMass={controller.showCenterOfMass}
            showCoMOverlay={controller.showCoMOverlay}
            centerOfMassSize={controller.centerOfMassSize}
            showInertia={controller.showInertia}
            showInertiaOverlay={controller.showInertiaOverlay}
            showVisual={controller.showVisual}
            showCollision={controller.showCollision}
            robotLinks={robotLinks}
            toolMode={toolMode}
            transformMode={controller.transformMode}
            onCollisionTransformPreview={onCollisionTransformPreview}
            onCollisionTransformEnd={onCollisionTransform}
            onTransformPending={controller.handleTransformPending}
            setIsDragging={controller.setIsDragging}
            loadingLabel={t.loadingRobot}
            loadingDetailLabel={t.loadingRobotPreparing}
            loadingPhaseLabels={usdLoadingPhaseLabels}
            onRobotDataResolved={onRobotDataResolved}
            onDocumentLoadEvent={onDocumentLoadEvent}
            runtimeBridge={runtimeBridge}
            measureTargetResolverRef={measureTargetResolverRef}
          />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <RobotModel
            key={runtimeInstanceKey}
            active={active}
            urdfContent={urdfContent}
            assets={assets}
            sourceFormat={sourceFile?.format === 'mjcf' ? 'mjcf' : sourceFile?.format === 'urdf' ? 'urdf' : 'auto'}
            sourceFilePath={sourceFilePath}
            onRobotLoaded={controller.handleRobotLoaded}
            onDocumentLoadEvent={onDocumentLoadEvent}
            showCollision={controller.showCollision}
            showVisual={controller.showVisual}
            onSelect={controller.handleSelectWrapper}
            onHover={onHover}
            onMeshSelect={onMeshSelect}
            onJointChange={controller.handleRuntimeJointAngleChange}
            onJointChangeCommit={controller.handleJointChangeCommit}
            initialJointAngles={controller.getInitialJointAnglesForNextLoad()}
            registerSceneRefresh={controller.registerSceneRefresh}
            setIsDragging={controller.setIsDragging}
            setActiveJoint={controller.handleActiveJointChange}
            justSelectedRef={controller.justSelectedRef}
            t={t}
            mode={mode}
            selection={selection}
            hoveredSelection={hoveredSelection}
            hoverSelectionEnabled={effectiveHoverSelectionEnabled}
            groundPlaneOffset={groundPlaneOffset}
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
            toolMode={toolMode}
            onCollisionTransformPreview={onCollisionTransformPreview}
            onCollisionTransformEnd={onCollisionTransform}
            isOrbitDragging={controller.isOrbitDragging}
            onTransformPending={controller.handleTransformPending}
            isSelectionLockedRef={controller.transformPendingRef}
            isMeshPreview={isMeshPreview}
          />
        </Suspense>
      )}
    </>
  );
};
