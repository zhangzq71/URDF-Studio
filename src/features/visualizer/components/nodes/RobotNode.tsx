import { memo, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { RobotState, UrdfJoint } from '@/types';
import { getCollisionGeometryEntries, isTransparentDisplayLink } from '@/core/robot';
import { useSelectionStore } from '@/store/selectionStore';
import { ThickerAxes, InertiaBox, LinkCenterOfMass } from '@/shared/components/3d';
import { Language, translations } from '@/shared/i18n';
import { GeometryRenderer } from './GeometryRenderer';
import { JointNode } from './JointNode';

// Type definitions
interface CommonVisualizerProps {
  robot: RobotState;
  childJointsByParent: Record<string, UrdfJoint[]>;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  mode: 'skeleton' | 'detail' | 'hardware';
  showGeometry: boolean;
  showVisual: boolean;
  selectionTarget?: 'visual' | 'collision';
  showLabels: boolean;
  showJointAxes: boolean;
  jointAxisSize: number;
  frameSize: number;
  labelScale: number;
  showSkeletonOrigin: boolean;
  showDetailOrigin: boolean;
  showDetailLabels: boolean;
  showCollision: boolean;
  showHardwareOrigin: boolean;
  showHardwareLabels: boolean;
  showInertia: boolean;
  showCenterOfMass: boolean;
  transformMode: 'translate' | 'rotate';
  assets: Record<string, string>;
  lang: Language;
  onRegisterJointPivot?: (jointId: string, pivot: THREE.Group | null) => void;
  onRegisterCollisionRef?: (linkId: string, objectIndex: number, ref: THREE.Group | null) => void;
}

interface RobotNodeProps extends CommonVisualizerProps {
  linkId: string;
  depth: number;
  onRegisterJointPivot?: (jointId: string, pivot: THREE.Group | null) => void;
  onRegisterCollisionRef?: (linkId: string, objectIndex: number, ref: THREE.Group | null) => void;
}

const EMPTY_CHILD_JOINTS: UrdfJoint[] = [];

/**
 * RobotNode - Renders a link in the robot hierarchy
 *
 * Features:
 * - Renders visual and collision geometry using GeometryRenderer
 * - Manages link selection and hover states
 * - Displays inertia and center of mass visualization
 * - Recursively renders child joints via JointNode
 * - Supports skeleton, detail, and hardware visualization modes
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
  selectionTarget,
  showLabels,
  showJointAxes,
  jointAxisSize,
  frameSize,
  labelScale,
  showSkeletonOrigin,
  showDetailOrigin,
  showDetailLabels,
  showCollision,
  showHardwareOrigin,
  showHardwareLabels,
  showInertia,
  showCenterOfMass,
  transformMode,
  depth,
  assets,
  lang,
  onRegisterJointPivot,
  onRegisterCollisionRef
}: RobotNodeProps) {
  const t = translations[lang];

  if (depth > 50) return null;

  const link = robot.links[linkId];
  if (!link) return null;

  const handleLinkClick = (e: any, subType?: 'visual' | 'collision') => {
    e.stopPropagation();

    // Override subType if selectionTarget is set (global override)
    // Otherwise use the clicked subType (granular selection)
    const targetSubType = selectionTarget || subType;

    onSelect('link', linkId, targetSubType);
  };

  const childJoints = childJointsByParent[linkId] ?? EMPTY_CHILD_JOINTS;
  const isTransparentLink = isTransparentDisplayLink(robot, linkId);
  const isSelected = robot.selection.type === 'link' && robot.selection.id === linkId;
  const selectionSubType = robot.selection.subType;
  const isRoot = linkId === robot.rootLinkId;
  const isHovered = useSelectionStore((state) => state.hoveredSelection.type === 'link' && state.hoveredSelection.id === linkId);
  const setHoveredSelection = useSelectionStore((state) => state.setHoveredSelection);

  // Refs for dragging geometry in Detail mode
  const [, setVisualRef] = useState<THREE.Group | null>(null);
  const [collisionRefs, setCollisionRefs] = useState<Record<number, THREE.Group | null>>({});
  const collisionRefHandlersRef = useRef<Record<number, (ref: THREE.Group | null) => void>>({});
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
    setHoveredSelection({ type: 'link', id: linkId });
  }, [linkId, setHoveredSelection]);

  const handleLinkHoverLeave = useCallback(() => {
    const hovered = useSelectionStore.getState().hoveredSelection;
    if (hovered.type === 'link' && hovered.id === linkId && !hovered.subType) {
      useSelectionStore.getState().clearHover();
    }
  }, [linkId]);

  const showRootAxes = isRoot && ((mode === 'skeleton' && showSkeletonOrigin) || (mode === 'detail' && showDetailOrigin) || (mode === 'hardware' && showHardwareOrigin));
  const shouldRenderGeometry = !(mode === 'skeleton' && !showGeometry && !showCollision);
  const showLinkLabel = (mode === 'detail' && showDetailLabels) || (mode === 'hardware' && showHardwareLabels);
  const showRootLabel = isRoot && ((mode === 'skeleton' && showLabels) || (mode === 'hardware' && showHardwareLabels));

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
            selectionTarget={selectionTarget}
            showLabels={showLabels}
            showJointAxes={showJointAxes}
            jointAxisSize={jointAxisSize}
            frameSize={frameSize}
            labelScale={labelScale}
            showSkeletonOrigin={showSkeletonOrigin}
            showDetailOrigin={showDetailOrigin}
            showDetailLabels={showDetailLabels}
            showCollision={showCollision}
            showHardwareOrigin={showHardwareOrigin}
            showHardwareLabels={showHardwareLabels}
            showInertia={showInertia}
            showCenterOfMass={showCenterOfMass}
            transformMode={transformMode}
            depth={depth + 1}
            assets={assets}
            lang={lang}
            onRegisterJointPivot={onRegisterJointPivot}
            onRegisterCollisionRef={onRegisterCollisionRef}
          />
        ))}
      </group>
    );
  }

  return (
    <group>
      {showRootAxes && (
        <group userData={{ isHelper: true }}>
            <ThickerAxes size={frameSize} />
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
          {/* Visual Geometry */}
          <GeometryRenderer
            isCollision={false}
            link={link}
            mode={mode}
            showGeometry={showGeometry}
            showCollision={showCollision}
            assets={assets}
            isSelected={isSelected}
            selectionSubType={selectionSubType}
            onLinkClick={handleLinkClick}
            setVisualRef={setVisualRef}
            objectIndex={0}
          />

          {collisionEntries.map((entry) => (
            <GeometryRenderer
              key={`collision-body-${linkId}-${entry.objectIndex}`}
              isCollision={true}
              link={link}
              mode={mode}
              showGeometry={showGeometry}
              showCollision={showCollision}
              assets={assets}
              isSelected={isSelected}
              selectionSubType={selectionSubType}
              onLinkClick={handleLinkClick}
              setCollisionRef={getCollisionRefHandler(entry.objectIndex)}
              geometryData={entry.bodyIndex === null ? undefined : entry.geometry}
              geometryId={entry.bodyIndex === null ? '0' : `extra-${entry.bodyIndex + 1}`}
              objectIndex={entry.objectIndex}
            />
          ))}
        </>
      )}

      {/* Inertia Visualization */}
      {showInertia && <group userData={{ isHelper: true }}><InertiaBox link={link} /></group>}

      {/* Center of Mass Indicator */}
      {showCenterOfMass && <group userData={{ isHelper: true }}><LinkCenterOfMass link={link} /></group>}

      {/* Transform Controls for Link Geometry in Detail Mode - Disabled to prioritize Joint Controls
      {isSelected && mode === 'detail' && activeGeometryRef && (
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
          selectionTarget={selectionTarget}
          showLabels={showLabels}
          showJointAxes={showJointAxes}
          jointAxisSize={jointAxisSize}
          frameSize={frameSize}
          labelScale={labelScale}
          showSkeletonOrigin={showSkeletonOrigin}
          showDetailOrigin={showDetailOrigin}
          showDetailLabels={showDetailLabels}
          showCollision={showCollision}
          showHardwareOrigin={showHardwareOrigin}
          showHardwareLabels={showHardwareLabels}
          showInertia={showInertia}
          showCenterOfMass={showCenterOfMass}
          transformMode={transformMode}
          depth={depth + 1}
          assets={assets}
          lang={lang}
          onRegisterJointPivot={onRegisterJointPivot}
          onRegisterCollisionRef={onRegisterCollisionRef}
        />
      ))}
    </group>
  );
});
