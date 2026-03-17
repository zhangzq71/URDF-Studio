/**
 * LinkProperties - Property editing panel for Link elements.
 * Renders different content based on the current editor mode:
 * - Skeleton/Hardware: Name input
 * - Detail: Visual/Collision geometry tabs
 * - Hardware: Inertial properties (mass, CoM, inertia tensor)
 */
import React, { useState, useEffect } from 'react';
import { Eye, Box } from 'lucide-react';
import type { RobotState, AppMode, UrdfLink } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import {
  MAX_TRANSFORM_DECIMALS,
} from '@/core/utils/numberPrecision';
import {
  PROPERTY_EDITOR_POSITION_STEP,
  PROPERTY_EDITOR_TRANSFORM_STEPPER_REPEAT_INTERVAL_MS,
} from '../constants';
import {
  InputGroup,
  CollapsibleSection,
  NumberInput,
  Vec3InlineInput,
  PROPERTY_EDITOR_SUBLABEL_CLASS,
  PROPERTY_EDITOR_INPUT_CLASS,
} from './FormControls';
import { GeometryEditor } from './GeometryEditor';
import { RotationValueInput } from './RotationValueInput';

interface LinkPropertiesProps {
  data: UrdfLink;
  robot: RobotState;
  mode: AppMode;
  selection: { id: string | null; type: string; subType?: 'visual' | 'collision' };
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  onSelect?: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  assets: Record<string, string>;
  onUploadAsset: (file: File) => void;
  t: typeof translations['en'];
  lang: Language;
}

export const LinkProperties: React.FC<LinkPropertiesProps> = ({
  data, robot, mode, selection, onUpdate, onSelect, assets, onUploadAsset, t, lang
}) => {
  // Tab state for Visual vs Collision
  const [linkTab, setLinkTab] = useState<'visual' | 'collision'>('visual');

  // Sync internal tab state with global selection subType
  useEffect(() => {
    if (selection.subType) {
      setLinkTab(selection.subType);
    }
  }, [selection.subType]);

  const handleTabChange = (tab: 'visual' | 'collision') => {
    setLinkTab(tab);
    if (selection.id && onSelect) {
      onSelect('link', selection.id, tab);
    }
  };

  return (
    <>
      {/* Name (Skeleton & Hardware Mode) */}
      {mode !== 'detail' && (
        <InputGroup label={t.name}>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onUpdate('link', selection.id!, { ...data, name: e.target.value })}
            className={PROPERTY_EDITOR_INPUT_CLASS}
          />
        </InputGroup>
      )}

      {/* Detail Mode: Visual & Collision Tabs */}
      {mode === 'detail' && (
        <>
          {/* Tab Navigation - Folder Style */}
          <div className="flex items-stretch gap-1 border border-border-black mb-0 bg-element-bg pt-1 px-1 rounded-t-lg">
            <div className="w-px"></div>
            <button
              onClick={() => handleTabChange('visual')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-t-lg transition-all flex items-center justify-center gap-1.5 relative border-t border-x ${
                linkTab === 'visual'
                  ? 'bg-panel-bg dark:bg-segmented-active text-system-blue border-border-black -mb-px pb-2 z-10'
                  : 'bg-transparent border-transparent text-text-tertiary hover:text-text-secondary hover:bg-element-hover'
              }`}
            >
              <Eye className="w-3 h-3" />
              {t.visualGeometry}
            </button>
            <button
              onClick={() => handleTabChange('collision')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-t-lg transition-all flex items-center justify-center gap-1.5 relative border-t border-x ${
                linkTab === 'collision'
                  ? 'bg-panel-bg dark:bg-segmented-active text-system-blue border-border-black -mb-px pb-2 z-10'
                  : 'bg-transparent border-transparent text-text-tertiary hover:text-text-secondary hover:bg-element-hover'
              }`}
            >
              <Box className="w-3 h-3" />
              {t.collisionGeometry}
            </button>
          </div>

          {/* Visual Tab Content - always mounted to preserve snapshot cache */}
          <div style={{ display: linkTab === 'visual' ? undefined : 'none' }} className="animate-in fade-in slide-in-from-bottom-1 duration-200 bg-panel-bg border-x border-b border-border-black rounded-b-lg p-2.5 shadow-sm mb-3">
            <InputGroup label={t.name}>
              <input
                type="text"
                value={data.name}
                onChange={(e) => onUpdate('link', selection.id!, { ...data, name: e.target.value })}
                className={PROPERTY_EDITOR_INPUT_CLASS}
              />
            </InputGroup>

            <GeometryEditor
              data={data}
              robot={robot}
              category="visual"
              onUpdate={(d) => onUpdate('link', selection.id!, d)}
              assets={assets}
              onUploadAsset={onUploadAsset}
              t={t}
              lang={lang}
              isTabbed={true}
            />
          </div>

          {/* Collision Tab Content - always mounted to preserve snapshot cache */}
          <div style={{ display: linkTab === 'collision' ? undefined : 'none' }} className="animate-in fade-in slide-in-from-bottom-1 duration-200 bg-panel-bg border-x border-b border-border-black rounded-b-lg p-2.5 shadow-sm mb-3">
            <GeometryEditor
              data={data}
              robot={robot}
              category="collision"
              onUpdate={(d) => onUpdate('link', selection.id!, d)}
              assets={assets}
              onUploadAsset={onUploadAsset}
              t={t}
              lang={lang}
              isTabbed={true}
            />
          </div>
        </>
      )}

      {/* Hardware Mode: Inertial */}
      {mode === 'hardware' && (
        <CollapsibleSection title={t.inertial} storageKey="inertial">
          <InputGroup label={t.mass}>
            <NumberInput
              value={data.inertial.mass}
              onChange={(v: number) => onUpdate('link', selection.id!, {
                ...data,
                inertial: { ...data.inertial, mass: v }
              })}
            />
          </InputGroup>

          {/* Center of Mass (Origin) */}
          <InputGroup label={t.centerOfMass || "Center of Mass"}>
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <span className={PROPERTY_EDITOR_SUBLABEL_CLASS}>{t.position}</span>
                <Vec3InlineInput
                  value={data.inertial.origin?.xyz || { x: 0, y: 0, z: 0 }}
                  onChange={(xyz) => onUpdate('link', selection.id!, {
                    ...data,
                    inertial: {
                      ...data.inertial,
                      origin: {
                        xyz: xyz as { x: number; y: number; z: number },
                        rpy: data.inertial.origin?.rpy || { r: 0, p: 0, y: 0 }
                      }
                    }
                  })}
                  labels={['X', 'Y', 'Z']}
                  compact
                  step={PROPERTY_EDITOR_POSITION_STEP}
                  precision={MAX_TRANSFORM_DECIMALS}
                  repeatIntervalMs={PROPERTY_EDITOR_TRANSFORM_STEPPER_REPEAT_INTERVAL_MS}
                />
              </div>
              <RotationValueInput
                value={data.inertial.origin?.rpy || { r: 0, p: 0, y: 0 }}
                onChange={(rpy) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: {
                    ...data.inertial,
                    origin: {
                      xyz: data.inertial.origin?.xyz || { x: 0, y: 0, z: 0 },
                      rpy
                    }
                  }
                })}
                lang={lang}
                label={t.rotation}
                compact
                holdRepeatIntervalMs={PROPERTY_EDITOR_TRANSFORM_STEPPER_REPEAT_INTERVAL_MS}
              />
            </div>
          </InputGroup>

          <div className="mt-3 pt-2 border-t border-border-black/60">
            <h4 className="text-[10px] font-bold text-text-tertiary mb-2 uppercase">{t.inertiaTensor}</h4>
            <div className="grid grid-cols-3 gap-2">
              <NumberInput
                label="ixx"
                value={data.inertial.inertia.ixx}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...data.inertial, inertia: { ...data.inertial.inertia, ixx: v } }
                })}
              />
              <NumberInput
                label="ixy"
                value={data.inertial.inertia.ixy}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...data.inertial, inertia: { ...data.inertial.inertia, ixy: v } }
                })}
              />
              <NumberInput
                label="ixz"
                value={data.inertial.inertia.ixz}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...data.inertial, inertia: { ...data.inertial.inertia, ixz: v } }
                })}
              />
              <NumberInput
                label="iyy"
                value={data.inertial.inertia.iyy}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...data.inertial, inertia: { ...data.inertial.inertia, iyy: v } }
                })}
              />
              <NumberInput
                label="iyz"
                value={data.inertial.inertia.iyz}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...data.inertial, inertia: { ...data.inertial.inertia, iyz: v } }
                })}
              />
              <NumberInput
                label="izz"
                value={data.inertial.inertia.izz}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...data.inertial, inertia: { ...data.inertial.inertia, izz: v } }
                })}
              />
            </div>
          </div>
        </CollapsibleSection>
      )}
    </>
  );
};
