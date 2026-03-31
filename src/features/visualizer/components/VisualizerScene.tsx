import React from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { AppMode, RobotState, UrdfJoint } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/shared/i18n';
import {
  LoadingHud,
  SceneCompileWarmup,
  UnifiedTransformControls,
  VISUALIZER_UNIFIED_GIZMO_SIZE,
  buildLoadingHudState,
} from '@/shared/components/3d';
import { buildColladaRootNormalizationHints } from '@/core/loaders/colladaRootNormalization';
import { useSelectionStore } from '@/store/selectionStore';
import { RobotNode } from './nodes';
import { ClosedLoopConstraintsOverlay } from './constraints';
import { JointTransformControls } from './controls';
import { VisualizerHoverController } from './VisualizerHoverController';
import type { VisualizerController } from '../hooks/useVisualizerController';
import { shouldRenderMergedVisualizerConstraintOverlay } from '../utils/mergedVisualizerSceneMode';
import { resolveMergedVisualizerRootPlacements } from '../utils/mergedVisualizerLayout';
import { collectVisualizerMeshLoadKeys } from '../utils/visualizerMeshLoading';
import { buildVisualizerDocumentLoadEvent } from '../utils/visualizerDocumentLoad';

const GroundedGroup = React.forwardRef<THREE.Group, { children: React.ReactNode }>(
  function GroundedGroup({ children }, ref) {
    return <group ref={ref}>{children}</group>;
  }
);

interface VisualizerSceneProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  mode: AppMode;
  assets: Record<string, string>;
  lang: Language;
  controller: VisualizerController;
  active?: boolean;
  onDocumentLoadEvent?: (event: {
    status: 'loading' | 'ready' | 'error';
    phase?: string | null;
    message?: string | null;
    progressPercent?: number | null;
    loadedCount?: number | null;
    totalCount?: number | null;
    error?: string | null;
  }) => void;
}

export const VisualizerScene = React.memo(({
  robot,
  onSelect,
  onUpdate,
  mode,
  assets,
  lang,
  controller,
  active = true,
  onDocumentLoadEvent,
}: VisualizerSceneProps) => {
  const t = translations[lang];
  const setHoverFrozen = useSelectionStore((state) => state.setHoverFrozen);
  const collisionTransformControlRef = React.useRef<any>(null);
  const {
    robotRootRef,
    state,
    selectedJointPivot,
    selectedJointMotion,
    selectedCollisionRef,
    handleRegisterJointPivot,
    handleRegisterJointMotion,
    handleRegisterCollisionRef,
    transformControlsState,
    handleCollisionTransformEnd,
    requestGroundRealignment,
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
  const rootPlacements = React.useMemo(
    () => resolveMergedVisualizerRootPlacements(robot),
    [robot.joints, robot.links, robot.rootLinkId],
  );
  const colladaRootNormalizationHints = React.useMemo(
    () => buildColladaRootNormalizationHints(robot.links),
    [robot.links]
  );
  const expectedMeshLoadKeys = React.useMemo(() => collectVisualizerMeshLoadKeys({
    robot,
    mode,
    showGeometry: state.showGeometry,
    showCollision: state.showCollision,
    assets,
  }), [assets, mode, robot, state.showCollision, state.showGeometry]);
  const expectedMeshLoadSignature = React.useMemo(
    () => expectedMeshLoadKeys.join('\u0000'),
    [expectedMeshLoadKeys],
  );
  const expectedMeshLoadKeySet = React.useMemo(
    () => new Set(expectedMeshLoadKeys),
    [expectedMeshLoadKeys],
  );
  const [meshLoadingState, setMeshLoadingState] = React.useState<{
    signature: string;
    resolvedKeys: Set<string>;
  }>({
    signature: expectedMeshLoadSignature,
    resolvedKeys: new Set<string>(),
  });
  const resolvedMeshCount = meshLoadingState.signature === expectedMeshLoadSignature
    ? meshLoadingState.resolvedKeys.size
    : 0;
  const isMeshLoading = expectedMeshLoadKeys.length > 0 && resolvedMeshCount < expectedMeshLoadKeys.length;
  const loadingHudState = React.useMemo(() => buildLoadingHudState({
    loadedCount: resolvedMeshCount,
    totalCount: expectedMeshLoadKeys.length,
    fallbackDetail: t.loadingRobotPreparing,
  }), [expectedMeshLoadKeys.length, resolvedMeshCount, t.loadingRobotPreparing]);
  const loadingStageLabel = resolvedMeshCount === 0
    ? t.loadingRobotPreparing
    : t.loadingRobotStreamingMeshes;
  const loadingDetail = loadingHudState.detail === loadingStageLabel ? '' : loadingHudState.detail;
  const sceneCompileWarmupKey = React.useMemo(() => [
    mode,
    robot.rootLinkId,
    String(Object.keys(robot.links).length),
    String(Object.keys(robot.joints).length),
    expectedMeshLoadSignature || 'inline-geometry',
    state.showGeometry ? 'geometry-on' : 'geometry-off',
    state.showVisual ? 'visual-on' : 'visual-off',
    state.showCollision ? 'collision-on' : 'collision-off',
  ].join('|'), [
    expectedMeshLoadSignature,
    mode,
    robot.joints,
    robot.links,
    robot.rootLinkId,
    state.showCollision,
    state.showGeometry,
    state.showVisual,
  ]);

  React.useEffect(() => {
    setMeshLoadingState({
      signature: expectedMeshLoadSignature,
      resolvedKeys: new Set<string>(),
    });
  }, [expectedMeshLoadSignature]);

  React.useEffect(() => {
    if (!active || !onDocumentLoadEvent) {
      return;
    }

    onDocumentLoadEvent(buildVisualizerDocumentLoadEvent({
      resolvedCount: resolvedMeshCount,
      totalCount: expectedMeshLoadKeys.length,
    }));
  }, [active, expectedMeshLoadKeys.length, onDocumentLoadEvent, resolvedMeshCount]);

  const handleCollisionDraggingChanged = React.useCallback(
    (event: { value?: boolean }) => {
      const dragging = Boolean(event?.value);
      setHoverFrozen(dragging);
      if (dragging) return;
      handleCollisionTransformEnd();
    },
    [handleCollisionTransformEnd, setHoverFrozen]
  );

  const handleMeshResolved = React.useCallback((meshLoadKey: string) => {
    requestGroundRealignment();
    setMeshLoadingState((current) => {
      const resolvedKeys = current.signature === expectedMeshLoadSignature
        ? current.resolvedKeys
        : new Set<string>();

      if (!expectedMeshLoadKeySet.has(meshLoadKey) || resolvedKeys.has(meshLoadKey)) {
        if (current.signature === expectedMeshLoadSignature) {
          return current;
        }

        return {
          signature: expectedMeshLoadSignature,
          resolvedKeys,
        };
      }

      const nextResolvedKeys = new Set(resolvedKeys);
      nextResolvedKeys.add(meshLoadKey);
      return {
        signature: expectedMeshLoadSignature,
        resolvedKeys: nextResolvedKeys,
      };
    });
  }, [expectedMeshLoadKeySet, expectedMeshLoadSignature, requestGroundRealignment]);
  const shouldRenderConstraintOverlay = shouldRenderMergedVisualizerConstraintOverlay(mode);

  return (
    <>
      <SceneCompileWarmup active={active && !isMeshLoading} warmupKey={sceneCompileWarmupKey} />
      <VisualizerHoverController
        robotRootRef={robotRootRef}
        interactionLayerPriority={state.interactionLayerPriority}
        active={active}
      />
      <GroundedGroup ref={robotRootRef}>
        {shouldRenderConstraintOverlay && <ClosedLoopConstraintsOverlay robot={robot} />}
        {rootPlacements.map(({ linkId, position }) => (
          <group key={linkId} position={position}>
            <RobotNode
              linkId={linkId}
              robot={robot}
              onSelect={onSelect}
              onUpdate={onUpdate}
              mode={mode}
              showGeometry={state.showGeometry}
              showVisual={state.showVisual}
              showOrigin={state.showOrigin}
              showLabels={state.showLabels}
              showJointAxes={state.showJointAxes}
              jointAxisSize={state.jointAxisSize}
              frameSize={state.frameSize}
              labelScale={state.labelScale}
              showCollision={state.showCollision}
              modelOpacity={state.modelOpacity}
              showInertia={state.showInertia}
              showCenterOfMass={state.showCenterOfMass}
              interactionLayerPriority={state.interactionLayerPriority}
              transformMode={state.transformMode}
              depth={0}
              assets={assets}
              lang={lang}
              colladaRootNormalizationHints={colladaRootNormalizationHints}
              childJointsByParent={childJointsByParent}
              onRegisterJointPivot={handleRegisterJointPivot}
              onRegisterJointMotion={handleRegisterJointMotion}
              onRegisterCollisionRef={handleRegisterCollisionRef}
              onMeshResolved={handleMeshResolved}
            />
          </group>
        ))}
      </GroundedGroup>
      {active && isMeshLoading ? (
        <Html fullscreen>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-4">
            <LoadingHud
              title={t.loadingRobot}
              detail={loadingDetail}
              progress={loadingHudState.progress}
              statusLabel={loadingHudState.statusLabel}
              stageLabel={loadingStageLabel}
              delayMs={0}
            />
          </div>
        </Html>
      ) : null}

        <JointTransformControls
        mode={mode}
        selectedJointPivot={selectedJointPivot}
        selectedJointMotion={selectedJointMotion}
        robot={robot}
        transformMode="universal"
        transformControlsState={transformControlsState}
      />

      {selectedCollisionRef &&
        robot.selection.type === 'link' &&
        robot.selection.id &&
        robot.selection.subType === 'collision' && (
          <>
            <UnifiedTransformControls
              ref={collisionTransformControlRef}
              object={selectedCollisionRef}
              mode={state.transformMode}
              size={VISUALIZER_UNIFIED_GIZMO_SIZE}
              translateSpace="world"
              rotateSpace="local"
              hoverStyle="single-axis"
              displayStyle="thick-primary"
              onDraggingChanged={handleCollisionDraggingChanged}
              onMouseUp={handleCollisionTransformEnd}
            />
          </>
        )}
    </>
  );
});
