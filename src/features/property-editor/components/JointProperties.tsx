/**
 * JointProperties - Property editing panel for Joint elements.
 * Renders different content based on the current editor mode:
 * - Detail: Name only
 * - Skeleton: Type, Kinematics (origin, axis)
 * - Hardware: Motor config, Limits, Dynamics
 */
import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { AppMode, MotorSpec } from '@/types';
import { translations } from '@/shared/i18n';
import { InputGroup, CollapsibleSection, NumberInput, Vec3Input } from './FormControls';
import { useMotorConfig } from '../hooks/useMotorConfig';

const JOINT_TYPE_REVOLUTE = 'revolute';
const JOINT_TYPE_CONTINUOUS = 'continuous';
const JOINT_TYPE_PRISMATIC = 'prismatic';
const JOINT_TYPE_FIXED = 'fixed';

interface JointData {
  name?: string;
  type?: string;
  hardware?: { motorType?: string; armature?: number; motorId?: string; motorDirection?: number };
  limit?: { velocity?: number; effort?: number; lower?: number; upper?: number };
  dynamics?: { friction?: number; damping?: number };
  origin?: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } };
  axis?: { x: number; y: number; z: number };
}

interface JointPropertiesProps {
  data: JointData;
  mode: AppMode;
  selection: { id: string | null; type: string };
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  motorLibrary: Record<string, MotorSpec[]>;
  t: typeof translations['en'];
}

export const JointProperties: React.FC<JointPropertiesProps> = ({
  data, mode, selection, onUpdate, motorLibrary, t
}) => {
  const {
    motorBrand,
    motorSource,
    currentMotorType,
    currentLibMotor,
    handleSourceChange,
    handleBrandChange,
    handleLibraryMotorChange
  } = useMotorConfig({
    motorLibrary,
    data,
    selectionId: selection.id,
    onUpdate
  });

  return (
    <>
      {/* Detail Mode: Name Only */}
      {mode === 'detail' && (
        <InputGroup label={t.name}>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onUpdate('joint', selection.id!, { ...data, name: e.target.value })}
            className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full focus:border-google-blue focus:outline-none"
          />
        </InputGroup>
      )}

      {/* Skeleton Mode: Kinematics Only */}
      {mode === 'skeleton' && (
        <>
          <InputGroup label={t.type}>
            <select
              value={data.type || JOINT_TYPE_REVOLUTE}
              onChange={(e) => onUpdate('joint', selection.id!, { ...data, type: e.target.value })}
              className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full"
            >
              <option value={JOINT_TYPE_REVOLUTE}>Revolute</option>
              <option value={JOINT_TYPE_CONTINUOUS}>Continuous</option>
              <option value={JOINT_TYPE_PRISMATIC}>Prismatic</option>
              <option value={JOINT_TYPE_FIXED}>Fixed</option>
            </select>
          </InputGroup>

          <CollapsibleSection title={t.kinematics} storageKey="kinematics">
            <InputGroup label={t.originRelativeParent + " (XYZ)"}>
              <Vec3Input
                value={data.origin?.xyz || { x: 0, y: 0, z: 0 }}
                onChange={(v) => onUpdate('joint', selection.id!, {
                  ...data,
                  origin: { ...data.origin, xyz: v }
                })}
                labels={['X', 'Y', 'Z']}
              />
            </InputGroup>
            <InputGroup label={t.originRelativeParent + " (RPY)"}>
              <Vec3Input
                value={data.origin?.rpy || { r: 0, p: 0, y: 0 }}
                onChange={(v) => onUpdate('joint', selection.id!, {
                  ...data,
                  origin: { ...data.origin, rpy: v }
                })}
                labels={[t.roll, t.pitch, t.yaw]}
                keys={['r', 'p', 'y']}
              />
            </InputGroup>

            {data.type !== JOINT_TYPE_FIXED && (
              <InputGroup label={t.axisRotation}>
                <Vec3Input
                  value={data.axis || { x: 0, y: 0, z: 1 }}
                  onChange={(v) => onUpdate('joint', selection.id!, { ...data, axis: v })}
                  labels={['X', 'Y', 'Z']}
                />
              </InputGroup>
            )}
          </CollapsibleSection>
        </>
      )}

      {/* Hardware Mode: Limits, Dynamics, Motor */}
      {mode === 'hardware' && data.type !== JOINT_TYPE_FIXED && (
        <div className="space-y-3">
          {/* 1. Hardware Section */}
          <CollapsibleSection title={t.hardwareConfig} storageKey="hardware_config">
            <InputGroup label={t.motorSource}>
              <select
                value={motorSource}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full"
              >
                <option value="None">{t.none}</option>
                <option value="Library">{t.library}</option>
                <option value="Custom">{t.custom}</option>
              </select>
            </InputGroup>

            {motorSource === 'Library' && (
              <div className="space-y-3 pl-2 border-l-2 border-slate-200 dark:border-google-dark-border mb-3">
                <InputGroup label={t.brand}>
                  <select
                    value={motorBrand}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full"
                  >
                    {Object.keys(motorLibrary).map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </InputGroup>
                <InputGroup label={t.model}>
                  <select
                    value={currentMotorType}
                    onChange={(e) => handleLibraryMotorChange(e.target.value)}
                    className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full"
                  >
                    {motorLibrary[motorBrand]?.map(m => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </InputGroup>

                {currentLibMotor && currentLibMotor.url && (
                  <div className="mt-2">
                    <a
                      href={currentLibMotor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
                    >
                      {t.viewMotor}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {motorSource === 'Custom' && (
              <InputGroup label={t.customType}>
                <input
                  type="text"
                  placeholder={t.enterMotorType}
                  value={currentMotorType}
                  onChange={(e) => onUpdate('joint', selection.id!, {
                    ...data, hardware: { ...data.hardware, motorType: e.target.value }
                  })}
                  className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full focus:outline-none focus:border-google-blue"
                />
              </InputGroup>
            )}

            {motorSource !== 'None' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <InputGroup label={t.motorId}>
                    <input
                      type="text"
                      value={data.hardware?.motorId || ''}
                      onChange={(e) => onUpdate('joint', selection.id!, {
                        ...data, hardware: { ...data.hardware, motorId: e.target.value }
                      })}
                      className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full focus:outline-none focus:border-google-blue"
                    />
                  </InputGroup>
                  <InputGroup label={t.direction}>
                    <select
                      value={data.hardware?.motorDirection || 1}
                      onChange={(e) => onUpdate('joint', selection.id!, {
                        ...data, hardware: { ...data.hardware, motorDirection: parseInt(e.target.value) }
                      })}
                      className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full"
                    >
                      <option value={1}>1 ({t.normal})</option>
                      <option value={-1}>-1 ({t.inverted})</option>
                    </select>
                  </InputGroup>
                </div>

                <InputGroup label={t.armature}>
                  <NumberInput
                    value={data.hardware?.armature || 0}
                    onChange={(v: number) => onUpdate('joint', selection.id!, {
                      ...data, hardware: { ...data.hardware, armature: v }
                    })}
                  />
                </InputGroup>
              </>
            )}
          </CollapsibleSection>

          {/* 2. Limits */}
          <CollapsibleSection title={t.limits} storageKey="limits">
            <div className="grid grid-cols-2 gap-2">
              <InputGroup label={t.lower}>
                <NumberInput
                  value={data.limit?.lower || 0}
                  onChange={(v: number) => onUpdate('joint', selection.id!, {
                    ...data, limit: { ...data.limit, lower: v }
                  })}
                />
              </InputGroup>
              <InputGroup label={t.upper}>
                <NumberInput
                  value={data.limit?.upper || 0}
                  onChange={(v: number) => onUpdate('joint', selection.id!, {
                    ...data, limit: { ...data.limit, upper: v }
                  })}
                />
              </InputGroup>
              <InputGroup label={t.velocity}>
                <NumberInput
                  value={data.limit?.velocity || 0}
                  onChange={(v: number) => onUpdate('joint', selection.id!, {
                    ...data, limit: { ...data.limit, velocity: v }
                  })}
                />
              </InputGroup>
              <InputGroup label={t.effort}>
                <NumberInput
                  value={data.limit?.effort || 0}
                  onChange={(v: number) => onUpdate('joint', selection.id!, {
                    ...data, limit: { ...data.limit, effort: v }
                  })}
                />
              </InputGroup>
            </div>
          </CollapsibleSection>

          {/* 3. Dynamics */}
          <CollapsibleSection title={t.dynamics} defaultOpen={false} storageKey="dynamics">
            <div className="grid grid-cols-2 gap-2">
              <InputGroup label={t.friction}>
                <NumberInput
                  value={data.dynamics?.friction || 0}
                  onChange={(v: number) => onUpdate('joint', selection.id!, {
                    ...data, dynamics: { ...data.dynamics, friction: v }
                  })}
                />
              </InputGroup>
              <InputGroup label={t.damping}>
                <NumberInput
                  value={data.dynamics?.damping || 0}
                  onChange={(v: number) => onUpdate('joint', selection.id!, {
                    ...data, dynamics: { ...data.dynamics, damping: v }
                  })}
                />
              </InputGroup>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </>
  );
};
