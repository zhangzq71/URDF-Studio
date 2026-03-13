import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { resolveJointKey } from '@/core/robot';
import { RobotState } from '@/types';

interface PendingEdit {
  axis: string;
  value: number;
  startValue: number;
  isRotate: boolean;
}

export interface TransformControlsState {
  transformControlRef: React.RefObject<any>;
  rotateTransformControlRef: React.RefObject<any>;
  pendingEdit: PendingEdit | null;
  setPendingEdit: (edit: PendingEdit | null) => void;
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
 * Handles dragging and persisting joint transforms while preserving
 * the stock Three.js TransformControls appearance.
 */
export function useTransformControls(
  selectedObject: THREE.Group | null,
  transformMode: 'translate' | 'rotate' | 'universal',
  robot: RobotState,
  onUpdate: (type: 'link' | 'joint', id: string, data: any) => void,
  mode: 'skeleton' | 'detail' | 'hardware'
): TransformControlsState {
  const tempEulerRef = useRef(new THREE.Euler(0, 0, 0, 'ZYX'));
  const transformControlRef = useRef<any>(null);
  const rotateTransformControlRef = useRef<any>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);

  const originalPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const originalQuaternionRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const isDraggingControlRef = useRef(false);
  const currentAxisRef = useRef<string | null>(null);
  const startValueRef = useRef<number>(0);

  const getObjectRPY = useCallback((object: THREE.Object3D) => {
    const rotation = tempEulerRef.current.setFromQuaternion(object.quaternion, 'ZYX');
    return { r: rotation.x, p: rotation.y, y: rotation.z };
  }, []);

  const applyAxisRotationValue = useCallback(
    (object: THREE.Object3D, axis: string, value: number) => {
      const rotation = tempEulerRef.current.setFromQuaternion(object.quaternion, 'ZYX');
      if (axis === 'X') rotation.x = value;
      else if (axis === 'Y') rotation.y = value;
      else if (axis === 'Z') rotation.z = value;

      object.quaternion.setFromEuler(rotation);
    },
    []
  );

  const persistSelectedObject = useCallback(() => {
    if (!selectedObject || !robot.selection.id) return;

    const isJoint = robot.selection.type === 'joint';
    if (!isJoint) return;

    const id = resolveJointKey(robot.joints, robot.selection.id);
    if (!id) return;

    const entity = robot.joints[id];
    if (!entity) return;

    const pos = selectedObject.position;
    const rot = getObjectRPY(selectedObject);

    onUpdate('joint', id, {
      ...entity,
      origin: {
        xyz: { x: pos.x, y: pos.y, z: pos.z },
        rpy: { r: rot.x, p: rot.y, y: rot.z },
      },
    });

    originalPositionRef.current.copy(pos);
    originalQuaternionRef.current.copy(selectedObject.quaternion);
  }, [getObjectRPY, onUpdate, robot.joints, robot.selection.id, robot.selection.type, selectedObject]);

  // Clear pending edit when selection changes
  useEffect(() => {
    if (pendingEdit && selectedObject) {
      selectedObject.position.copy(originalPositionRef.current);
      selectedObject.quaternion.copy(originalQuaternionRef.current);
    }
    setPendingEdit(null);
  }, [robot.selection.id, robot.selection.type]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingEdit && selectedObject) {
        selectedObject.position.copy(originalPositionRef.current);
        selectedObject.quaternion.copy(originalQuaternionRef.current);
      }
    };
  }, [pendingEdit, selectedObject]);

  // Update original refs when target object changes
  useEffect(() => {
    if (selectedObject) {
      originalPositionRef.current.copy(selectedObject.position);
      originalQuaternionRef.current.copy(selectedObject.quaternion);
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
          applyAxisRotationValue(selectedObject, axis, val);
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

    // Apply the edited value
    const axis = pendingEdit.axis;
    if (pendingEdit.isRotate) {
      applyAxisRotationValue(selectedObject, axis, pendingEdit.value);
    } else {
      if (axis === 'X') selectedObject.position.x = pendingEdit.value;
      else if (axis === 'Y') selectedObject.position.y = pendingEdit.value;
      else if (axis === 'Z') selectedObject.position.z = pendingEdit.value;
    }

    persistSelectedObject();

    setPendingEdit(null);
  }, [applyAxisRotationValue, pendingEdit, persistSelectedObject, robot.selection.id, selectedObject]);

  const handleCancel = useCallback(() => {
    if (selectedObject) {
      selectedObject.position.copy(originalPositionRef.current);
      selectedObject.quaternion.copy(originalQuaternionRef.current);
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

  // Setup event listeners for TransformControls
  useEffect(() => {
    if (!selectedObject || mode !== 'skeleton') return;

    const getAxisValue = (axis: string | null, isRotate: boolean) => {
      if (!axis) return 0;

      if (isRotate) {
        const rotation = getObjectRPY(selectedObject);
        return axis === 'X'
          ? rotation.r
          : axis === 'Y'
          ? rotation.p
          : axis === 'Z'
          ? rotation.y
          : 0;
      }

      return axis === 'X'
        ? selectedObject.position.x
        : axis === 'Y'
        ? selectedObject.position.y
        : axis === 'Z'
        ? selectedObject.position.z
        : 0;
    };

    const bindDraggingListener = (controls: any, isRotate: boolean) => {
      if (!controls) return () => {};

      const handleDraggingChange = (event: any) => {
        const dragging = event.value;

        if (dragging) {
          isDraggingControlRef.current = true;
          originalPositionRef.current.copy(selectedObject.position);
          originalQuaternionRef.current.copy(selectedObject.quaternion);

          const axis = controls.axis;
          currentAxisRef.current = axis;
          startValueRef.current = getAxisValue(axis, isRotate);
          return;
        }

        if (!isDraggingControlRef.current) return;

        isDraggingControlRef.current = false;

        const axis = currentAxisRef.current;
        const currentVal = getAxisValue(axis, isRotate);
        const delta = currentVal - startValueRef.current;

        if (Math.abs(delta) > 0.0001 && axis) {
          persistSelectedObject();
        }
      };

      controls.addEventListener('dragging-changed', handleDraggingChange);

      return () => {
        controls.removeEventListener('dragging-changed', handleDraggingChange);
      };
    };

    const cleanupTranslate = bindDraggingListener(
      transformControlRef.current,
      transformMode === 'rotate'
    );
    const cleanupRotate =
      transformMode === 'universal'
        ? bindDraggingListener(rotateTransformControlRef.current, true)
        : () => {};

    return () => {
      cleanupTranslate();
      cleanupRotate();
    };
  }, [getObjectRPY, mode, persistSelectedObject, selectedObject, transformMode]);

  return {
    transformControlRef,
    rotateTransformControlRef,
    pendingEdit,
    setPendingEdit,
    getDisplayValue,
    getDeltaDisplay,
    handleValueChange,
    handleConfirm,
    handleCancel,
    handleKeyDown,
    handleObjectChange,
  };
}
