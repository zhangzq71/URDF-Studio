/**
 * Hook for managing motor configuration state.
 * Handles motor brand selection, source detection, and motor switching.
 */
import { useState, useEffect } from 'react';
import type { MotorSpec } from '@/types';

interface JointHardware {
  motorType?: string;
  armature?: number;
  motorId?: string;
  motorDirection?: number;
}

interface JointLimit {
  velocity?: number;
  effort?: number;
  lower?: number;
  upper?: number;
}

export interface JointDataForMotor {
  hardware?: JointHardware;
  limit?: JointLimit;
}

export function useMotorConfig({
  motorLibrary,
  data,
  selectionId,
  onUpdate
}: {
  motorLibrary: Record<string, MotorSpec[]>;
  data: JointDataForMotor | null;
  selectionId: string | null;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
}) {
  const [motorBrand, setMotorBrand] = useState<string>('');

  // Initialize default brand if empty or invalid
  useEffect(() => {
    if (Object.keys(motorLibrary).length > 0) {
      if (!motorBrand || !motorLibrary[motorBrand]) {
        setMotorBrand(Object.keys(motorLibrary)[0]);
      }
    }
  }, [motorLibrary, motorBrand]);

  // Infer brand from current motor type when selection changes
  useEffect(() => {
    if (data) {
      const type = data.hardware?.motorType;
      if (type) {
        for (const [brand, motors] of Object.entries(motorLibrary)) {
          if (motors.some(m => m.name === type)) {
            setMotorBrand(brand);
            break;
          }
        }
      }
    }
  }, [selectionId, data, motorLibrary]);

  // Derived values
  const currentMotorType = data?.hardware?.motorType || 'None';

  let motorSource = 'Custom';
  if (currentMotorType === 'None') {
    motorSource = 'None';
  } else {
    let foundInLib = false;
    for (const motors of Object.values(motorLibrary)) {
      if (motors.some(m => m.name === currentMotorType)) {
        foundInLib = true;
        break;
      }
    }
    if (foundInLib) motorSource = 'Library';
  }

  const currentLibMotor = motorSource === 'Library' && motorBrand
    ? motorLibrary[motorBrand]?.find(m => m.name === currentMotorType)
    : null;

  // Handlers
  const handleSourceChange = (newSource: string) => {
    const newHardware = { ...data?.hardware };
    const newLimit = { ...data?.limit };

    if (newSource === 'None') {
      newHardware.motorType = 'None';
      newHardware.armature = 0;
    } else if (newSource === 'Library') {
      const brands = Object.keys(motorLibrary);
      if (brands.length > 0) {
        const defaultBrand = brands[0];
        setMotorBrand(defaultBrand);
        const motor = motorLibrary[defaultBrand][0];
        if (motor) {
          newHardware.motorType = motor.name;
          newHardware.armature = motor.armature;
          newLimit.velocity = motor.velocity;
          newLimit.effort = motor.effort;
        }
      }
    } else if (newSource === 'Custom') {
      if (currentMotorType === 'None' || motorSource === 'Library') {
        newHardware.motorType = 'my_motor';
      }
    }

    const updates = { hardware: newHardware, limit: newLimit };
    onUpdate('joint', selectionId!, Object.assign({}, data, updates));
  };

  const handleBrandChange = (newBrand: string) => {
    setMotorBrand(newBrand);
    const motor = motorLibrary[newBrand]?.[0];
    if (motor) {
      const updates = {
        hardware: { ...data?.hardware, motorType: motor.name, armature: motor.armature },
        limit: { ...data?.limit, velocity: motor.velocity, effort: motor.effort }
      };
      onUpdate('joint', selectionId!, Object.assign({}, data, updates));
    }
  };

  const handleLibraryMotorChange = (motorName: string) => {
    const motor = motorLibrary[motorBrand]?.find(m => m.name === motorName);
    if (motor) {
      const updates = {
        hardware: { ...data?.hardware, motorType: motor.name, armature: motor.armature },
        limit: { ...data?.limit, velocity: motor.velocity, effort: motor.effort }
      };
      onUpdate('joint', selectionId!, Object.assign({}, data, updates));
    }
  };

  return {
    motorBrand,
    motorSource,
    currentMotorType,
    currentLibMotor,
    handleSourceChange,
    handleBrandChange,
    handleLibraryMotorChange
  };
}
