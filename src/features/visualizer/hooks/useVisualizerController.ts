import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { RobotState } from '@/types';
import { useSelectionStore } from '@/store/selectionStore';
import { useUIStore } from '@/store';
import { getLowestMeshZ } from '@/shared/utils';
import { useCollisionRefs } from './useCollisionRefs';
import { useDraggablePanel } from './useDraggablePanel';
import { useJointPivots } from './useJointPivots';
import { useTransformControls } from './useTransformControls';
import { useVisualizerState } from './useVisualizerState';
import { clearMaterialCache } from '../utils';

interface UseVisualizerControllerProps {
  robot: RobotState;
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void;
  mode: 'skeleton' | 'detail' | 'hardware';
  propShowVisual?: boolean;
  propSetShowVisual?: (show: boolean) => void;
}

export const useVisualizerController = ({
  robot,
  onUpdate,
  mode,
  propShowVisual,
  propSetShowVisual,
}: UseVisualizerControllerProps) => {
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const robotRootRef = useRef<THREE.Group | null>(null);

  const state = useVisualizerState({ propShowVisual, propSetShowVisual });
  const panel = useDraggablePanel();
  const { handleRegisterJointPivot, selectedJointPivot } = useJointPivots(
    robot.selection.type,
    robot.selection.id ?? undefined
  );
  const { handleRegisterCollisionRef, selectedCollisionRef } = useCollisionRefs(
    robot.selection.type,
    robot.selection.id ?? undefined,
    robot.selection.subType
  );

  const transformControlsState = useTransformControls(
    selectedJointPivot,
    state.transformMode === 'select' ? 'translate' : state.transformMode,
    robot,
    onUpdate,
    mode
  );

  const handleAutoFitGround = useCallback(() => {
    const robotRoot = robotRootRef.current;
    if (!robotRoot) return;

    let minZ = getLowestMeshZ(robotRoot, {
      includeInvisible: false,
      includeVisual: true,
      includeCollision: false,
    });

    if (minZ === null) {
      minZ = getLowestMeshZ(robotRoot, {
        includeInvisible: true,
        includeVisual: true,
        includeCollision: false,
      });
    }

    if (minZ !== null) {
      useUIStore.getState().setGroundPlaneOffset(minZ);
    }
  }, []);

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
  }, [onUpdate, robot, selectedCollisionRef]);

  useEffect(() => {
    const timers = [80, 220, 500].map((delay) =>
      window.setTimeout(handleAutoFitGround, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [handleAutoFitGround, robot.joints, robot.links]);

  useEffect(() => {
    return () => {
      clearMaterialCache();
    };
  }, []);

  useEffect(() => {
    state.setTransformMode('translate');
  }, [mode, state]);

  return {
    clearSelection,
    sceneRef,
    robotRootRef,
    state,
    panel,
    selectedJointPivot,
    selectedCollisionRef,
    handleRegisterJointPivot,
    handleRegisterCollisionRef,
    transformControlsState,
    handleAutoFitGround,
    handleCollisionTransformEnd,
  };
};

export type VisualizerController = ReturnType<typeof useVisualizerController>;
