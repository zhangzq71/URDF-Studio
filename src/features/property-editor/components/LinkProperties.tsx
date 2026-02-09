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
import { InputGroup, CollapsibleSection, NumberInput, Vec3Input } from './FormControls';
import { GeometryEditor } from './GeometryEditor';

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
}

export const LinkProperties: React.FC<LinkPropertiesProps> = ({
  data, robot, mode, selection, onUpdate, onSelect, assets, onUploadAsset, t
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
            className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full focus:border-google-blue focus:outline-none"
          />
        </InputGroup>
      )}

      {/* Detail Mode: Visual & Collision Tabs */}
      {mode === 'detail' && (
        <>
          {/* Tab Navigation - Folder Style */}
          <div className="flex items-stretch gap-1 border-t border-x border-b border-slate-200 dark:border-[#000000] mb-0 bg-slate-100/50 dark:bg-[#000000] pt-1 px-1 rounded-t-lg">
            <div className="w-px"></div>
            <button
              onClick={() => handleTabChange('visual')}
              className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center justify-center gap-2 relative border-t border-x ${
                linkTab === 'visual'
                  ? 'bg-white dark:bg-google-dark-surface text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-700 -mb-px pb-2.5 z-10'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {t.visualGeometry}
            </button>
            <button
              onClick={() => handleTabChange('collision')}
              className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center justify-center gap-2 relative border-t border-x ${
                linkTab === 'collision'
                  ? 'bg-white dark:bg-google-dark-surface text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-700 -mb-px pb-2.5 z-10'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              {t.collisionGeometry}
            </button>
          </div>

          {/* Visual Tab Content */}
          {linkTab === 'visual' && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 bg-white dark:bg-google-dark-surface border-x border-b border-slate-200 dark:border-slate-700 rounded-b-lg p-3 shadow-sm mb-4">
              <InputGroup label={t.name}>
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => onUpdate('link', selection.id!, { ...data, name: e.target.value })}
                  className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full focus:border-google-blue focus:outline-none"
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
                isTabbed={true}
              />
            </div>
          )}

          {/* Collision Tab Content */}
          {linkTab === 'collision' && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 bg-white dark:bg-google-dark-surface border-x border-b border-slate-200 dark:border-slate-700 rounded-b-lg p-3 shadow-sm mb-4">
              <GeometryEditor
                data={data}
                robot={robot}
                category="collision"
                onUpdate={(d) => onUpdate('link', selection.id!, d)}
                assets={assets}
                onUploadAsset={onUploadAsset}
                t={t}
                isTabbed={true}
              />
            </div>
          )}
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
            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-slate-500 mb-0.5 block">{t.position}</span>
                <Vec3Input
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
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 mb-0.5 block">{t.rotation}</span>
                <Vec3Input
                  value={data.inertial.origin?.rpy || { r: 0, p: 0, y: 0 }}
                  onChange={(rpy) => onUpdate('link', selection.id!, {
                    ...data,
                    inertial: {
                      ...data.inertial,
                      origin: {
                        xyz: data.inertial.origin?.xyz || { x: 0, y: 0, z: 0 },
                        rpy: rpy as { r: number; p: number; y: number }
                      }
                    }
                  })}
                  labels={[t.roll, t.pitch, t.yaw]}
                  keys={['r', 'p', 'y']}
                />
              </div>
            </div>
          </InputGroup>

          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase">{t.inertiaTensor}</h4>
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
