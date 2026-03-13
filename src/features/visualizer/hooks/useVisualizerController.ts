import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { resolveLinkKey, updateCollisionGeometryByObjectIndex } from '@/core/robot';
import type { RobotState } from '@/types';
import { useSelectionStore } from '@/store/selectionStore';
import { useUIStore } from '@/store';
import { alignObjectLowestPointToZ } from '@/shared/utils';
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
  const tempRotationRef = useRef(new THREE.Euler(0, 0, 0, 'ZYX'));
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const clearHover = useSelectionStore((state) => state.clearHover);
  const groundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);
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
    robot.selection.subType,
    robot.selection.objectIndex ?? 0,
  );

  const transformControlsState = useTransformControls(
    selectedJointPivot,
    mode === 'skeleton' ? 'universal' : state.transformMode,
    robot,
    onUpdate,
    mode
  );

  const handleAutoFitGround = useCallback(() => {
    const robotRoot = robotRootRef.current;
    if (!robotRoot) return;
    const aligned = alignObjectLowestPointToZ(robotRoot, groundPlaneOffset, {
      includeInvisible: false,
      includeVisual: true,
      includeCollision: false,
    });

    if (aligned === null) {
      alignObjectLowestPointToZ(robotRoot, groundPlaneOffset, {
        includeInvisible: true,
        includeVisual: true,
        includeCollision: false,
      });
    }
  }, [groundPlaneOffset]);

  const handleCollisionTransformEnd = useCallback(() => {
    if (!selectedCollisionRef || !robot.selection.id || robot.selection.type !== 'link') return;

    selectedCollisionRef.updateMatrixWorld(true);

    const linkId = resolveLinkKey(robot.links, robot.selection.id);
    if (!linkId) return;

    const link = robot.links[linkId];
    if (!link) return;

    const pos = selectedCollisionRef.position;
    const rot = tempRotationRef.current.setFromQuaternion(selectedCollisionRef.quaternion, 'ZYX');
    const objectIndex = robot.selection.objectIndex ?? 0;

    onUpdate('link', linkId, {
      ...updateCollisionGeometryByObjectIndex(link, objectIndex, {
        origin: {
          xyz: { x: pos.x, y: pos.y, z: pos.z },
          rpy: { r: rot.x, p: rot.y, y: rot.z },
        },
      }),
    });
  }, [onUpdate, robot, selectedCollisionRef]);

  useEffect(() => {
    if (mode !== 'skeleton') return;

    const timers = [0, 80, 220].map((delay) =>
      window.setTimeout(handleAutoFitGround, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [groundPlaneOffset, handleAutoFitGround, mode, robot.joints, robot.links]);

  useEffect(() => {
    return () => {
      clearMaterialCache();
    };
  }, []);

  useEffect(() => {
    state.setTransformMode('translate');
  }, [mode, state.setTransformMode]);

  return {
    clearSelection,
    clearHover,
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
