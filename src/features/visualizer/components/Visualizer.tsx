import React, { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { RobotState, Theme } from '@/types';
import { translations, Language } from '@/shared/i18n';
import { useSelectionStore } from '@/store/selectionStore';
import { useUIStore } from '@/store';

// Hooks
import {
  useVisualizerState,
  useDraggablePanel,
  useJointPivots,
  useCollisionRefs,
  useTransformControls,
} from '../hooks';

// Components
import { SkeletonOptionsPanel, DetailOptionsPanel, HardwareOptionsPanel } from '@/shared/components/Panel';
import { UsageGuide } from '@/shared/components/3d';
import { RobotNode } from './nodes';
import { JointTransformControls } from './controls';
import { VisualizerCanvas } from './VisualizerCanvas';

/**
 * Traverse the scene graph, skipping subtrees marked as helpers or gizmos.
 * This ensures only actual robot geometry is considered for bounding box calculations.
 */
function traverseRobotMeshes(obj: THREE.Object3D, callback: (mesh: THREE.Mesh) => void) {
  if (obj.userData?.isHelper || obj.userData?.isGizmo || obj.name?.startsWith('__')) return;
  if ((obj as THREE.Mesh).isMesh) {
    callback(obj as THREE.Mesh);
  }
  for (const child of obj.children) {
    traverseRobotMeshes(child, callback);
  }
}

/**
 * GroundedGroup - Ground plane is fixed at Z=0 (XY plane).
 * Robot is rendered at its URDF-defined position without auto-offset.
 */
function GroundedGroup({ children }: { children: React.ReactNode }) {
  return <group>{children}</group>;
}

// Props interface
interface VisualizerProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  mode: 'skeleton' | 'detail' | 'hardware';
  assets: Record<string, string>;
  lang: Language;
  theme: Theme;
  os?: 'mac' | 'win';
  showVisual?: boolean;
  setShowVisual?: (show: boolean) => void;
  snapshotAction?: React.MutableRefObject<(() => void) | null>;
  showOptionsPanel?: boolean;
  setShowOptionsPanel?: (show: boolean) => void;
}

/**
 * Visualizer - Main component for 3D robot visualization
 *
 * Supports three visualization modes:
 * - Skeleton: Basic structure with joints and links
 * - Detail: Full geometry with visual and collision meshes
 * - Hardware: Hardware-specific view
 */
export const Visualizer = ({
  robot,
  onSelect,
  onUpdate,
  mode,
  assets,
  lang,
  theme,
  showVisual: propShowVisual,
  setShowVisual: propSetShowVisual,
  snapshotAction,
  showOptionsPanel = true,
  setShowOptionsPanel,
}: VisualizerProps) => {
  const t = translations[lang];
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const sceneRef = useRef<THREE.Scene | null>(null);

  const handleAutoFitGround = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const box = new THREE.Box3();
    scene.traverse((obj) => {
      if (obj.userData?.isHelper || obj.userData?.isGizmo || obj.name?.startsWith('__')) return;
      if (obj.name === 'ReferenceGrid') return;
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const geomBox = mesh.geometry.boundingBox!.clone();
          geomBox.applyMatrix4(mesh.matrixWorld);
          box.union(geomBox);
        }
      }
    });
    if (!box.isEmpty() && isFinite(box.min.z)) {
      useUIStore.getState().setGroundPlaneOffset(box.min.z);
    }
  }, []);

  // Use custom hooks for state management
  const state = useVisualizerState({ propShowVisual, propSetShowVisual });
  const panel = useDraggablePanel();
  const { handleRegisterJointPivot, selectedJointPivot } = useJointPivots(
    robot.selection.type,
    robot.selection.id
  );
  const { handleRegisterCollisionRef, selectedCollisionRef } = useCollisionRefs(
    robot.selection.type,
    robot.selection.id,
    robot.selection.subType
  );

  // Transform controls state for joint editing
  const transformControlsState = useTransformControls(
    selectedJointPivot,
    state.transformMode === 'select' ? 'translate' : state.transformMode, // Pass valid mode to hook, but control visibility via JointTransformControls
    robot,
    onUpdate,
    mode
  );

  // Auto-fit ground plane when robot structure changes
  React.useEffect(() => {
    const timer = setTimeout(handleAutoFitGround, 100);
    return () => clearTimeout(timer);
  }, [robot.links, robot.joints]);

  // Reset transform mode when switching visualization modes to prevent ghost controls
  React.useEffect(() => {
    state.setTransformMode('translate');
  }, [mode]);

  // Collision transform handler for detail mode
  const handleCollisionTransformEnd = useCallback(() => {
    if (!selectedCollisionRef || !robot.selection.id || robot.selection.type !== 'link') return;

    const linkId = robot.selection.id;
    const link = robot.links[linkId];
    if (!link) return;

    const pos = selectedCollisionRef.position;
    const rot = selectedCollisionRef.rotation;

    onUpdate('link', linkId, {
      ...link,
      collision: {
        ...link.collision,
        origin: {
          xyz: { x: pos.x, y: pos.y, z: pos.z },
          rpy: { r: rot.x, p: rot.y, y: rot.z },
        },
      },
    });
  }, [selectedCollisionRef, robot, onUpdate]);

  return (
    <div
      ref={panel.containerRef}
      className="relative w-full h-full"
      onMouseMove={panel.handleMouseMove}
      onMouseUp={panel.handleMouseUp}
    >
      {/* Options Panel */}
      {showOptionsPanel && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          {mode === 'skeleton' && (
            <SkeletonOptionsPanel
              key="skeleton"
              ref={panel.optionsPanelRef}
              lang={lang}
              showGeometry={state.showGeometry}
              setShowGeometry={state.setShowGeometry}
              showSkeletonOrigin={state.showSkeletonOrigin}
              setShowSkeletonOrigin={state.setShowSkeletonOrigin}
              frameSize={state.frameSize}
              setFrameSize={state.setFrameSize}
              showLabels={state.showLabels}
              setShowLabels={state.setShowLabels}
              labelScale={state.labelScale}
              setLabelScale={state.setLabelScale}
              showJointAxes={state.showJointAxes}
              setShowJointAxes={state.setShowJointAxes}
              jointAxisSize={state.jointAxisSize}
              setJointAxisSize={state.setJointAxisSize}
              transformMode={state.transformMode}
              setTransformMode={state.setTransformMode}
              isCollapsed={panel.isOptionsCollapsed}
              toggleCollapsed={panel.toggleOptionsCollapsed}
              onMouseDown={panel.handleMouseDown}
              onResetPosition={() => panel.setOptionsPanelPos(null)}
              onClose={setShowOptionsPanel ? () => setShowOptionsPanel(false) : undefined}
              optionsPanelPos={panel.optionsPanelPos}
              onAutoFitGround={handleAutoFitGround}
            />
          )}
          {mode === 'detail' && (
            <DetailOptionsPanel
              key="detail"
              ref={panel.optionsPanelRef}
              lang={lang}
              showDetailOrigin={state.showDetailOrigin}
              setShowDetailOrigin={state.setShowDetailOrigin}
              showDetailLabels={state.showDetailLabels}
              setShowDetailLabels={state.setShowDetailLabels}
              showVisual={state.showVisual}
              setShowVisual={state.setShowVisual}
              showCollision={state.showCollision}
              setShowCollision={state.setShowCollision}
              showInertia={state.showInertia}
              setShowInertia={state.setShowInertia}
              showCenterOfMass={state.showCenterOfMass}
              setShowCenterOfMass={state.setShowCenterOfMass}
              transformMode={state.transformMode}
              setTransformMode={state.setTransformMode}
              isCollapsed={panel.isOptionsCollapsed}
              toggleCollapsed={panel.toggleOptionsCollapsed}
              onMouseDown={panel.handleMouseDown}
              onResetPosition={() => panel.setOptionsPanelPos(null)}
              optionsPanelPos={panel.optionsPanelPos}
            />
          )}
          {mode === 'hardware' && (
            <HardwareOptionsPanel
              key="hardware"
              ref={panel.optionsPanelRef}
              lang={lang}
              showHardwareOrigin={state.showHardwareOrigin}
              setShowHardwareOrigin={state.setShowHardwareOrigin}
              showHardwareLabels={state.showHardwareLabels}
              setShowHardwareLabels={state.setShowHardwareLabels}
              transformMode={state.transformMode}
              setTransformMode={state.setTransformMode}
              isCollapsed={panel.isOptionsCollapsed}
              toggleCollapsed={panel.toggleOptionsCollapsed}
              onMouseDown={panel.handleMouseDown}
              onResetPosition={() => panel.setOptionsPanelPos(null)}
              onClose={setShowOptionsPanel ? () => setShowOptionsPanel(false) : undefined}
              optionsPanelPos={panel.optionsPanelPos}
            />
          )}
        </div>
      )}

      {/* Usage Guide */}
      <UsageGuide lang={lang} />

      {/* 3D Canvas */}
      <VisualizerCanvas
        theme={theme}
        snapshotAction={snapshotAction}
        sceneRef={sceneRef}
        robotName={robot?.name || 'robot'}
        onPointerMissed={clearSelection}
      >
        {/* Robot Hierarchy - GroundedGroup offsets robot so bottom sits at Z=0 */}
        <GroundedGroup>
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
            onRegisterJointPivot={handleRegisterJointPivot}
            onRegisterCollisionRef={handleRegisterCollisionRef}
          />
        </GroundedGroup>

        {/* Joint Transform Controls (Skeleton Mode) */}
        <JointTransformControls
          mode={mode}
          selectedJointPivot={selectedJointPivot}
          robot={robot}
          transformMode={state.transformMode}
          transformControlsState={transformControlsState}
          confirmTitle={t.confirmEnter}
        />

        {/* Collision Transform Controls (Detail Mode) */}
        {mode === 'detail' &&
          selectedCollisionRef &&
          robot.selection.type === 'link' &&
          robot.selection.id &&
          robot.selection.subType === 'collision' && (
            <TransformControls
              object={selectedCollisionRef}
              mode={state.transformMode}
              size={0.7}
              space="local"
              onMouseUp={handleCollisionTransformEnd}
            />
          )}
      </VisualizerCanvas>
    </div>
  );
};
