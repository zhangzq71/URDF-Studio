import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { type AppMode, RobotState, UrdfJoint } from '@/types';
import { getCollisionGeometryEntries, getVisualGeometryEntries, isTransparentDisplayLink } from '@/core/robot';
import type { ColladaRootNormalizationHints } from '@/core/loaders/colladaRootNormalization';
import { useSelectionStore } from '@/store/selectionStore';
import { ThickerAxes, InertiaBox, LinkCenterOfMass } from '@/shared/components/3d';
import { Language, translations } from '@/shared/i18n';
import { GeometryRenderer } from './GeometryRenderer';
import { JointNode } from './JointNode';
import {
  createVisualizerHoverUserData,
  resolveVisualizerInteractionTargetFromHits,
  type VisualizerHoverTarget,
} from '../../utils/hoverPicking';
import type { VisualizerInteractiveLayer } from '../../utils/interactiveLayerPriority';

// Type definitions
interface CommonVisualizerProps {
  robot: RobotState;
  childJointsByParent: Record<string, UrdfJoint[]>;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  mode: AppMode;
  showGeometry: boolean;
  showVisual: boolean;
  showOrigin: boolean;
  selectionTarget?: 'visual' | 'collision';
  showLabels: boolean;
  showJointAxes: boolean;
  jointAxisSize: number;
  frameSize: number;
  labelScale: number;
  showCollision: boolean;
  modelOpacity: number;
  showInertia: boolean;
  showCenterOfMass: boolean;
  interactionLayerPriority: readonly VisualizerInteractiveLayer[];
  transformMode: 'translate' | 'rotate';
  assets: Record<string, string>;
  lang: Language;
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
  onRegisterJointPivot?: (jointId: string, pivot: THREE.Group | null) => void;
  onRegisterJointMotion?: (jointId: string, motion: THREE.Group | null) => void;
  onRegisterCollisionRef?: (linkId: string, objectIndex: number, ref: THREE.Group | null) => void;
  onMeshResolved?: (meshLoadKey: string) => void;
}

interface RobotNodeProps extends CommonVisualizerProps {
  linkId: string;
  depth: number;
  onRegisterJointPivot?: (jointId: string, pivot: THREE.Group | null) => void;
  onRegisterJointMotion?: (jointId: string, motion: THREE.Group | null) => void;
  onRegisterCollisionRef?: (linkId: string, objectIndex: number, ref: THREE.Group | null) => void;
}

const EMPTY_CHILD_JOINTS: UrdfJoint[] = [];

interface PropagationEventLike {
  stopPropagation(): void;
}

/**
 * RobotNode - Renders a link in the robot hierarchy
 *
 * Features:
 * - Renders visual and collision geometry using GeometryRenderer
 * - Manages link selection and hover states
 * - Displays inertia and center of mass visualization
 * - Recursively renders child joints via JointNode
 * - Uses unified scene display toggles while runtime mode still drives
 *   interaction-specific branches such as transform behavior
 */
export const RobotNode = memo(function RobotNode({
  linkId,
  robot,
  childJointsByParent,
  onSelect,
  onUpdate,
  mode,
  showGeometry,
  showVisual,
  showOrigin,
  selectionTarget,
  showLabels,
  showJointAxes,
  jointAxisSize,
  frameSize,
  labelScale,
  showCollision,
  modelOpacity,
  showInertia,
  showCenterOfMass,
  interactionLayerPriority,
  transformMode,
  depth,
  assets,
  lang,
  colladaRootNormalizationHints,
  onRegisterJointPivot,
  onRegisterJointMotion,
  onRegisterCollisionRef,
  onMeshResolved,
}: RobotNodeProps) {
  const t = translations[lang];

  if (depth > 50) return null;

  const link = robot.links[linkId];
  if (!link) return null;

  const handleLinkClick = (
    event: PropagationEventLike,
    resolvedTarget?: VisualizerHoverTarget | null,
  ) => {
    event.stopPropagation();
    if (resolvedTarget?.type === 'joint') {
      onSelect('joint', resolvedTarget.id);
      return;
    }

    const targetLinkId = resolvedTarget?.id ?? linkId;
    const targetSubType = selectionTarget || resolvedTarget?.subType;
    onSelect('link', targetLinkId, targetSubType);
  };

  const childJoints = childJointsByParent[linkId] ?? EMPTY_CHILD_JOINTS;
  const isTransparentLink = isTransparentDisplayLink(robot, linkId);
  const isSelected = robot.selection.type === 'link' && robot.selection.id === linkId;
  const selectionSubType = robot.selection.subType;
  const isRoot = linkId === robot.rootLinkId;
  const isHovered = useSelectionStore((state) => (
    state.hoveredSelection.type === 'link' && state.hoveredSelection.id === linkId
  ));
  const isHelperHovered = useSelectionStore((state) => (
    state.hoveredSelection.type === 'link'
    && state.hoveredSelection.id === linkId
    && state.hoveredSelection.subType === undefined
    && state.hoveredSelection.objectIndex === undefined
  ));
  const isHelperSelected = isSelected && !selectionSubType && robot.selection.objectIndex === undefined;
  const setHoveredSelection = useSelectionStore((state) => state.setHoveredSelection);
  const linkHoverTarget = useMemo<VisualizerHoverTarget>(() => ({ type: 'link', id: linkId }), [linkId]);
  const linkHoverUserData = useMemo(
    () => createVisualizerHoverUserData(linkHoverTarget, 'origin-axes'),
    [linkHoverTarget],
  );
  const inertiaHoverUserData = useMemo(
    () => createVisualizerHoverUserData(linkHoverTarget, 'inertia'),
    [linkHoverTarget],
  );
  const centerOfMassHoverUserData = useMemo(
    () => createVisualizerHoverUserData(linkHoverTarget, 'center-of-mass'),
    [linkHoverTarget],
  );

  // Refs for dragging selected collision geometry in the merged visualizer scene
  const [, setVisualRef] = useState<THREE.Group | null>(null);
  const [collisionRefs, setCollisionRefs] = useState<Record<number, THREE.Group | null>>({});
  const collisionRefHandlersRef = useRef<Record<number, (ref: THREE.Group | null) => void>>({});
  const visualEntries = getVisualGeometryEntries(link);
  const collisionEntries = getCollisionGeometryEntries(link);
  const isCollisionSelected = isSelected && selectionSubType === 'collision';
  const selectedCollisionObjectIndex = isCollisionSelected ? robot.selection.objectIndex ?? 0 : null;
  const selectedCollisionRef =
    selectedCollisionObjectIndex !== null ? collisionRefs[selectedCollisionObjectIndex] ?? null : null;

  const getCollisionRefHandler = useCallback((objectIndex: number) => {
    if (!collisionRefHandlersRef.current[objectIndex]) {
      collisionRefHandlersRef.current[objectIndex] = (ref: THREE.Group | null) => {
        setCollisionRefs((prev) => {
          if (prev[objectIndex] === ref) return prev;
          return { ...prev, [objectIndex]: ref };
        });
      };
    }

    return collisionRefHandlersRef.current[objectIndex];
  }, []);

  // Register collision ref with parent when selected
  useEffect(() => {
    if (
      onRegisterCollisionRef &&
      selectedCollisionObjectIndex !== null
    ) {
      onRegisterCollisionRef(linkId, selectedCollisionObjectIndex, selectedCollisionRef);
    }

    return () => {
      if (
        onRegisterCollisionRef &&
        selectedCollisionObjectIndex !== null
      ) {
        onRegisterCollisionRef(linkId, selectedCollisionObjectIndex, null);
      }
    };
  }, [linkId, onRegisterCollisionRef, selectedCollisionObjectIndex, selectedCollisionRef]);

  const handleLinkHoverEnter = useCallback(() => {
    setHoveredSelection(linkHoverTarget);
  }, [linkHoverTarget, setHoveredSelection]);

  const handleLinkHoverLeave = useCallback(() => {
    const hovered = useSelectionStore.getState().hoveredSelection;
    if (hovered.type === 'link' && hovered.id === linkId && !hovered.subType && hovered.objectIndex === undefined) {
      useSelectionStore.getState().clearHover();
    }
  }, [linkId]);

  const handleHelperClick = useCallback((event: any) => {
    const resolvedTarget = resolveVisualizerInteractionTargetFromHits(event.object ?? null, event.intersections ?? [], {
      interactionLayerPriority,
    });
    handleLinkClick(event, resolvedTarget);
  }, [handleLinkClick, interactionLayerPriority]);

  const handleHelperPointerOver = useCallback((event: any) => {
    if (event.buttons !== 0) {
      return;
    }

    event.stopPropagation();
    handleLinkHoverEnter();
  }, [handleLinkHoverEnter]);

  const handleHelperPointerOut = useCallback((event: any) => {
    event.stopPropagation();
    handleLinkHoverLeave();
  }, [handleLinkHoverLeave]);

  const showRootAxes = isRoot && showOrigin;
  const shouldRenderGeometry = showGeometry
    || showCollision
    || visualEntries.length > 0
    || collisionEntries.length > 0;
  const showLinkLabel = showLabels;
  const showRootLabel = isRoot && showLabels;

  if (isTransparentLink) {
    return (
      <group>
        {childJoints.map((joint) => (
          <JointNode
            key={joint.id}
            joint={joint}
            robot={robot}
            childJointsByParent={childJointsByParent}
            onSelect={onSelect}
            onUpdate={onUpdate}
            mode={mode}
            showGeometry={showGeometry}
            showVisual={showVisual}
            showOrigin={showOrigin}
            selectionTarget={selectionTarget}
            showLabels={showLabels}
            showJointAxes={showJointAxes}
            jointAxisSize={jointAxisSize}
            frameSize={frameSize}
            labelScale={labelScale}
            showCollision={showCollision}
            modelOpacity={modelOpacity}
            showInertia={showInertia}
            showCenterOfMass={showCenterOfMass}
            interactionLayerPriority={interactionLayerPriority}
            transformMode={transformMode}
            depth={depth + 1}
            assets={assets}
            lang={lang}
            colladaRootNormalizationHints={colladaRootNormalizationHints}
            onRegisterJointPivot={onRegisterJointPivot}
            onRegisterJointMotion={onRegisterJointMotion}
            onRegisterCollisionRef={onRegisterCollisionRef}
            onMeshResolved={onMeshResolved}
          />
        ))}
      </group>
    );
  }

  return (
    <group>
      {showRootAxes && (
        <group
          userData={{ isHelper: true, ...linkHoverUserData }}
          onClick={handleHelperClick}
          onPointerOver={handleHelperPointerOver}
          onPointerOut={handleHelperPointerOut}
        >
            <ThickerAxes size={frameSize} onClick={handleHelperClick} />
            {showRootLabel && (
                <Html center position={[0, 0, 0]} distanceFactor={1.5} className="pointer-events-none" zIndexRange={[0, 0]}>
                    <div
                        style={{ transform: `scale(${labelScale})`, transformOrigin: 'center center' }}
                        className="pointer-events-auto cursor-pointer select-none"
                        onMouseEnter={handleLinkHoverEnter}
                        onMouseLeave={handleLinkHoverLeave}
                        onClick={handleLinkClick}
                    >
                      {(isSelected || isHovered) ? (
                        <div
                          className={`
                            px-1 py-px text-[8px] font-mono rounded border whitespace-nowrap shadow-xl transition-colors
                            ${isSelected
                              ? 'bg-blue-600 text-white border-blue-400 z-50'
                              : 'bg-white dark:bg-element-bg text-slate-800 dark:text-slate-200 border-slate-300 dark:border-border-black hover:bg-slate-100 dark:hover:bg-element-hover'
                            }
                          `}
                        >
                          {link.name} {t.baseLabelSuffix}
                        </div>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-slate-400/80 hover:scale-150 transition-transform" />
                      )}
                    </div>
                </Html>
          )}
        </group>
      )}

      {shouldRenderGeometry && (
        <>
          {visualEntries.map((entry) => (
            <GeometryRenderer
              key={`visual-body-${linkId}-${entry.objectIndex}`}
              isCollision={false}
              link={link}
              mode={mode}
              showGeometry={showGeometry}
              showCollision={showCollision}
              modelOpacity={modelOpacity}
              interactionLayerPriority={interactionLayerPriority}
              assets={assets}
              isSelected={isSelected}
              selectionSubType={selectionSubType}
              onLinkClick={handleLinkClick}
              setVisualRef={entry.bodyIndex === null ? setVisualRef : undefined}
              geometryData={entry.bodyIndex === null ? undefined : entry.geometry}
              geometryId={entry.bodyIndex === null ? 'primary' : `extra-${entry.bodyIndex + 1}`}
              objectIndex={entry.objectIndex}
              colladaRootNormalizationHints={colladaRootNormalizationHints}
              onMeshResolved={onMeshResolved}
            />
          ))}

          {collisionEntries.map((entry) => (
            <GeometryRenderer
              key={`collision-body-${linkId}-${entry.objectIndex}`}
              isCollision={true}
              link={link}
              mode={mode}
              showGeometry={showGeometry}
              showCollision={showCollision}
              modelOpacity={modelOpacity}
              interactionLayerPriority={interactionLayerPriority}
              assets={assets}
              isSelected={isSelected}
              selectionSubType={selectionSubType}
              onLinkClick={handleLinkClick}
              setCollisionRef={getCollisionRefHandler(entry.objectIndex)}
              geometryData={entry.bodyIndex === null ? undefined : entry.geometry}
              geometryId={entry.bodyIndex === null ? 'primary' : `extra-${entry.bodyIndex + 1}`}
              objectIndex={entry.objectIndex}
              colladaRootNormalizationHints={colladaRootNormalizationHints}
              onMeshResolved={onMeshResolved}
            />
          ))}
        </>
      )}

      {/* Inertia Visualization */}
      {showInertia && (
        <group
          userData={{ isHelper: true, ...inertiaHoverUserData }}
          onClick={handleHelperClick}
          onPointerOver={handleHelperPointerOver}
          onPointerOut={handleHelperPointerOut}
        >
          <InertiaBox link={link} hovered={isHelperHovered} selected={isHelperSelected} />
        </group>
      )}

      {/* Center of Mass Indicator */}
      {showCenterOfMass && (
        <group
          userData={{ isHelper: true, ...centerOfMassHoverUserData }}
          onClick={handleHelperClick}
          onPointerOver={handleHelperPointerOver}
          onPointerOut={handleHelperPointerOut}
        >
          <LinkCenterOfMass link={link} hovered={isHelperHovered} selected={isHelperSelected} />
        </group>
      )}

      {/* Link-geometry transform controls stay disabled here so joint controls keep priority.
      {isSelected && activeGeometryRef && (
          <TransformControls
              object={activeGeometryRef}
              mode={transformMode}
              space="local"
              size={1.3}
              onMouseUp={handleGeometryTransformEnd}
              depthTest={false}
          />
      )}
      */}

      {showLinkLabel && (
        <Html center position={[0, 0, 0]} distanceFactor={1.5} className="pointer-events-none" zIndexRange={[100, 0]}>
          <div
            style={{ transform: `scale(${labelScale})`, transformOrigin: 'center center' }}
            className="pointer-events-auto cursor-pointer select-none"
            onMouseEnter={handleLinkHoverEnter}
            onMouseLeave={handleLinkHoverLeave}
            onClick={handleLinkClick}
          >
            {(isSelected || isHovered) ? (
              <div
                className={`
                  px-1 py-px text-[8px] font-mono rounded border whitespace-nowrap shadow-xl transition-colors
                  ${isSelected
                    ? 'bg-blue-600 text-white border-blue-400 z-50'
                    : 'bg-white dark:bg-element-bg text-blue-700 dark:text-blue-200 border-slate-300 dark:border-border-black hover:bg-slate-100 dark:hover:bg-element-hover'
                  }
                `}
              >
                {link.name}
              </div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-blue-400/80 hover:scale-150 transition-transform" />
            )}
          </div>
        </Html>
      )}

      {childJoints.map(joint => (
        <JointNode
          key={joint.id}
          joint={joint}
          robot={robot}
          childJointsByParent={childJointsByParent}
          onSelect={onSelect}
          onUpdate={onUpdate}
          mode={mode}
          showGeometry={showGeometry}
          showVisual={showVisual}
          showOrigin={showOrigin}
          selectionTarget={selectionTarget}
          showLabels={showLabels}
          showJointAxes={showJointAxes}
          jointAxisSize={jointAxisSize}
          frameSize={frameSize}
          labelScale={labelScale}
          showCollision={showCollision}
          modelOpacity={modelOpacity}
          showInertia={showInertia}
          showCenterOfMass={showCenterOfMass}
          interactionLayerPriority={interactionLayerPriority}
          transformMode={transformMode}
          depth={depth + 1}
            assets={assets}
            lang={lang}
            colladaRootNormalizationHints={colladaRootNormalizationHints}
            onRegisterJointPivot={onRegisterJointPivot}
            onRegisterJointMotion={onRegisterJointMotion}
            onRegisterCollisionRef={onRegisterCollisionRef}
            onMeshResolved={onMeshResolved}
          />
        ))}
      </group>
  );
});
