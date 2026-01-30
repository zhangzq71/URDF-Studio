import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { RobotState } from '@/types';

interface PendingEdit {
  axis: string;
  value: number;
  startValue: number;
  isRotate: boolean;
}

export interface TransformControlsState {
  transformControlRef: React.RefObject<any>;
  pendingEdit: PendingEdit | null;
  setPendingEdit: (edit: PendingEdit | null) => void;
  currentAxis: string | null;
  isDraggingAxis: boolean;
  getDisplayValue: () => string;
  getDeltaDisplay: () => string;
  handleValueChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleConfirm: () => void;
  handleCancel: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleObjectChange: () => void;
}

/**
 * Custom hook to manage TransformControls state and interactions
 * Handles dragging, confirming, canceling, and axis highlighting
 */
export function useTransformControls(
  selectedObject: THREE.Group | null,
  transformMode: 'translate' | 'rotate',
  robot: RobotState,
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void,
  mode: 'skeleton' | 'detail' | 'hardware'
): TransformControlsState {
  const transformControlRef = useRef<any>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);

  const originalPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const originalRotationRef = useRef<THREE.Euler>(new THREE.Euler());
  const isDraggingControlRef = useRef(false);
  const currentAxisRef = useRef<string | null>(null);
  const startValueRef = useRef<number>(0);
  const [currentAxis, setCurrentAxis] = useState<string | null>(null);
  const [isDraggingAxis, setIsDraggingAxis] = useState(false);

  // Clear pending edit when selection changes
  useEffect(() => {
    if (pendingEdit && selectedObject) {
      selectedObject.position.copy(originalPositionRef.current);
      selectedObject.rotation.copy(originalRotationRef.current);
    }
    setPendingEdit(null);
  }, [robot.selection.id, robot.selection.type]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingEdit && selectedObject) {
        selectedObject.position.copy(originalPositionRef.current);
        selectedObject.rotation.copy(originalRotationRef.current);
      }
    };
  }, [pendingEdit, selectedObject]);

  // Update original refs when target object changes
  useEffect(() => {
    if (selectedObject) {
      originalPositionRef.current.copy(selectedObject.position);
      originalRotationRef.current.copy(selectedObject.rotation);
    }
  }, [selectedObject]);

  // Helper functions
  const radToDeg = (rad: number) => rad * (180 / Math.PI);
  const degToRad = (deg: number) => deg * (Math.PI / 180);

  const getDisplayValue = useCallback(() => {
    if (!pendingEdit) return '0';
    if (pendingEdit.isRotate) {
      return radToDeg(pendingEdit.value).toFixed(2);
    }
    return pendingEdit.value.toFixed(4);
  }, [pendingEdit]);

  const getDeltaDisplay = useCallback(() => {
    if (!pendingEdit) return '0';
    const delta = pendingEdit.value - pendingEdit.startValue;
    if (pendingEdit.isRotate) {
      const degDelta = radToDeg(delta);
      return (degDelta >= 0 ? '+' : '') + degDelta.toFixed(2);
    }
    return (delta >= 0 ? '+' : '') + delta.toFixed(4);
  }, [pendingEdit]);

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputVal = parseFloat(e.target.value);
      if (!isNaN(inputVal) && pendingEdit && selectedObject) {
        const val = pendingEdit.isRotate ? degToRad(inputVal) : inputVal;
        setPendingEdit({ ...pendingEdit, value: val });

        // Live preview
        const axis = pendingEdit.axis;
        if (pendingEdit.isRotate) {
          if (axis === 'X') selectedObject.rotation.x = val;
          else if (axis === 'Y') selectedObject.rotation.y = val;
          else if (axis === 'Z') selectedObject.rotation.z = val;
        } else {
          if (axis === 'X') selectedObject.position.x = val;
          else if (axis === 'Y') selectedObject.position.y = val;
          else if (axis === 'Z') selectedObject.position.z = val;
        }
      }
    },
    [pendingEdit, selectedObject]
  );

  const handleConfirm = useCallback(() => {
    if (!selectedObject || !robot.selection.id || !pendingEdit) return;

    const isJoint = robot.selection.type === 'joint';
    const id = robot.selection.id;
    const entity = isJoint ? robot.joints[id] : robot.links[id];
    if (!entity) return;

    // Apply the edited value
    const axis = pendingEdit.axis;
    if (pendingEdit.isRotate) {
      if (axis === 'X') selectedObject.rotation.x = pendingEdit.value;
      else if (axis === 'Y') selectedObject.rotation.y = pendingEdit.value;
      else if (axis === 'Z') selectedObject.rotation.z = pendingEdit.value;
    } else {
      if (axis === 'X') selectedObject.position.x = pendingEdit.value;
      else if (axis === 'Y') selectedObject.position.y = pendingEdit.value;
      else if (axis === 'Z') selectedObject.position.z = pendingEdit.value;
    }

    // Save to state
    const pos = selectedObject.position;
    const rot = selectedObject.rotation;

    if (isJoint) {
      onUpdate('joint', id, {
        ...entity,
        origin: {
          xyz: { x: pos.x, y: pos.y, z: pos.z },
          rpy: { r: rot.x, p: rot.y, y: rot.z },
        },
      });
    }

    // Update original refs
    originalPositionRef.current.copy(selectedObject.position);
    originalRotationRef.current.copy(selectedObject.rotation);

    setPendingEdit(null);
  }, [selectedObject, robot, pendingEdit, onUpdate]);

  const handleCancel = useCallback(() => {
    if (selectedObject) {
      selectedObject.position.copy(originalPositionRef.current);
      selectedObject.rotation.copy(originalRotationRef.current);
    }
    setPendingEdit(null);
  }, [selectedObject]);

  const handleObjectChange = useCallback(() => {
    // Trigger re-render during drag for visual feedback
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleConfirm, handleCancel]
  );

  // Update axis opacity based on active axis and dragging state
  const updateAxisOpacity = useCallback((gizmo: any, axis: string | null, isDragging: boolean) => {
    gizmo.traverse((child: any) => {
      if (child.material && child.material.color) {
        const color = child.material.color;
        const isXAxis = color.r > 0.5 && color.g < 0.4 && color.b < 0.4;
        const isYAxis = color.g > 0.5 && color.r < 0.4 && color.b < 0.4;
        const isZAxis = color.b > 0.5 && color.r < 0.4 && color.g < 0.4;

        const isActiveAxis =
          !axis ||
          (axis === 'X' && isXAxis) ||
          (axis === 'Y' && isYAxis) ||
          (axis === 'Z' && isZAxis);

        if (axis && !isActiveAxis) {
          child.material.opacity = isDragging ? 0.15 : 0.3;
          child.material.transparent = true;
        } else {
          child.material.opacity = 1.0;
          child.material.transparent = false;
        }
        child.material.needsUpdate = true;
      }
    });
  }, []);

  // Setup event listeners for TransformControls
  useEffect(() => {
    const controls = transformControlRef.current;
    if (!controls || !selectedObject || mode !== 'skeleton') return;

    const handleDraggingChange = (event: any) => {
      const dragging = event.value;

      if (dragging) {
        // Start dragging
        isDraggingControlRef.current = true;
        setIsDraggingAxis(true);
        originalPositionRef.current.copy(selectedObject.position);
        originalRotationRef.current.copy(selectedObject.rotation);

        const axis = controls.axis;
        currentAxisRef.current = axis;

        const gizmo = (controls as any).children?.[0];
        if (gizmo && axis) {
          updateAxisOpacity(gizmo, axis, true);
        }

        const isRotate = transformMode === 'rotate';
        let startValue = 0;

        if (isRotate) {
          startValue =
            axis === 'X'
              ? selectedObject.rotation.x
              : axis === 'Y'
              ? selectedObject.rotation.y
              : axis === 'Z'
              ? selectedObject.rotation.z
              : 0;
        } else {
          startValue =
            axis === 'X'
              ? selectedObject.position.x
              : axis === 'Y'
              ? selectedObject.position.y
              : axis === 'Z'
              ? selectedObject.position.z
              : 0;
        }

        startValueRef.current = startValue;
      } else if (isDraggingControlRef.current) {
        // End dragging
        isDraggingControlRef.current = false;
        setIsDraggingAxis(false);

        const axis = currentAxisRef.current;

        const gizmo = (controls as any).children?.[0];
        if (gizmo && axis) {
          updateAxisOpacity(gizmo, axis, false);
        }

        const isRotate = transformMode === 'rotate';
        let currentVal = 0;

        if (isRotate) {
          currentVal =
            axis === 'X'
              ? selectedObject.rotation.x
              : axis === 'Y'
              ? selectedObject.rotation.y
              : axis === 'Z'
              ? selectedObject.rotation.z
              : 0;
        } else {
          currentVal =
            axis === 'X'
              ? selectedObject.position.x
              : axis === 'Y'
              ? selectedObject.position.y
              : axis === 'Z'
              ? selectedObject.position.z
              : 0;
        }

        const delta = currentVal - startValueRef.current;

        if (Math.abs(delta) > 0.0001 && axis) {
          setPendingEdit({
            axis,
            value: currentVal,
            startValue: startValueRef.current,
            isRotate,
          });
        }
      }
    };

    controls.addEventListener('dragging-changed', handleDraggingChange);

    return () => {
      controls.removeEventListener('dragging-changed', handleDraggingChange);
    };
  }, [selectedObject, transformMode, mode, updateAxisOpacity]);

  // Customize TransformControls appearance
  useEffect(() => {
    const controls = transformControlRef.current;
    if (!controls || mode !== 'skeleton') return;

    const gizmo = (controls as any).children?.[0];
    if (!gizmo) return;

    const updateAxisAppearance = () => {
      gizmo.traverse((child: any) => {
        if (child.isMesh || child.isLine) {
          if (child.material) {
            if (child.material.linewidth !== undefined) {
              child.material.linewidth = 3;
            }
            if (!child.userData.scaled) {
              if (child.isLine) {
                child.scale.multiplyScalar(1.5);
              }
              child.userData.scaled = true;
            }
          }
        }
      });
    };

    updateAxisAppearance();

    const handleAxisChanged = (event: any) => {
      if (pendingEdit) return;

      const axis = event.value;
      setCurrentAxis(axis);

      updateAxisOpacity(gizmo, axis, isDraggingAxis);
    };

    controls.addEventListener('axis-changed', handleAxisChanged);

    return () => {
      controls.removeEventListener('axis-changed', handleAxisChanged);
    };
  }, [selectedObject, transformMode, mode, pendingEdit, isDraggingAxis, updateAxisOpacity]);

  return {
    transformControlRef,
    pendingEdit,
    setPendingEdit,
    currentAxis,
    isDraggingAxis,
    getDisplayValue,
    getDeltaDisplay,
    handleValueChange,
    handleConfirm,
    handleCancel,
    handleKeyDown,
    handleObjectChange,
  };
}
