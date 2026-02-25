/**
 * BridgeCreateModal - Dialog to create a bridge joint between two components
 */
import React, { useState, useCallback } from 'react';
import type { AssemblyState, AssemblyComponent, BridgeJoint } from '@/types';
import { JointType } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';

export interface BridgeCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (params: {
    name: string;
    parentComponentId: string;
    parentLinkId: string;
    childComponentId: string;
    childLinkId: string;
    joint: {
      type: JointType;
      origin: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } };
      axis: { x: number; y: number; z: number };
      limit?: { lower: number; upper: number; effort: number; velocity: number };
    };
  }) => void;
  assemblyState: AssemblyState;
  lang: Language;
}

export const BridgeCreateModal: React.FC<BridgeCreateModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  assemblyState,
  lang,
}) => {
  const t = translations[lang];
  const comps = Object.values(assemblyState.components);
  const fieldClassName =
    'w-full px-3 py-2 text-sm bg-input-bg border border-border-black rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-system-blue/20 focus:border-system-blue';
  const compactFieldClassName =
    'w-full px-2 py-1.5 text-sm bg-input-bg border border-border-black rounded text-text-primary focus:outline-none focus:ring-2 focus:ring-system-blue/20 focus:border-system-blue';

  const [name, setName] = useState('');
  const [parentCompId, setParentCompId] = useState('');
  const [parentLinkId, setParentLinkId] = useState('');
  const [childCompId, setChildCompId] = useState('');
  const [childLinkId, setChildLinkId] = useState('');
  const [jointType, setJointType] = useState<JointType>(JointType.FIXED);
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);
  const [originZ, setOriginZ] = useState(0);
  const [axisX, setAxisX] = useState(0);
  const [axisY, setAxisY] = useState(0);
  const [axisZ, setAxisZ] = useState(1);
  const [limitLower, setLimitLower] = useState(-1.57);
  const [limitUpper, setLimitUpper] = useState(1.57);

  const parentComp = parentCompId ? assemblyState.components[parentCompId] : null;
  const childComp = childCompId ? assemblyState.components[childCompId] : null;
  const parentLinks = parentComp ? Object.values(parentComp.robot.links) : [];
  const childLinks = childComp ? Object.values(childComp.robot.links) : [];

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !parentCompId || !parentLinkId || !childCompId || !childLinkId) return;
    if (parentCompId === childCompId && parentLinkId === childLinkId) return;

    onCreate({
      name: name.trim(),
      parentComponentId: parentCompId,
      parentLinkId,
      childComponentId: childCompId,
      childLinkId,
      joint: {
        type: jointType,
        origin: { xyz: { x: originX, y: originY, z: originZ }, rpy: { r: 0, p: 0, y: 0 } },
        axis: { x: axisX, y: axisY, z: axisZ },
        limit:
          jointType !== JointType.FIXED
            ? { lower: limitLower, upper: limitUpper, effort: 100, velocity: 10 }
            : undefined,
      },
    });
    onClose();
  }, [
    name,
    parentCompId,
    parentLinkId,
    childCompId,
    childLinkId,
    jointType,
    originX,
    originY,
    originZ,
    axisX,
    axisY,
    axisZ,
    limitLower,
    limitUpper,
    onCreate,
    onClose,
  ]);

  const resetForm = useCallback(() => {
    setName('');
    setParentCompId('');
    setParentLinkId('');
    setChildCompId('');
    setChildLinkId('');
    setJointType(JointType.FIXED);
    setOriginX(0);
    setOriginY(0);
    setOriginZ(0);
    setAxisX(0);
    setAxisY(0);
    setAxisZ(1);
    setLimitLower(-1.57);
    setLimitUpper(1.57);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-panel-bg rounded-2xl shadow-xl border border-border-black w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border-black bg-element-bg">
          <h3 className="text-sm font-semibold text-text-primary">{t.createBridge}</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {t.bridgeJoint} {t.name}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arm_to_Hand_Joint"
              className={fieldClassName}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t.parentComponent}</label>
            <select
              value={parentCompId}
              onChange={(e) => {
                setParentCompId(e.target.value);
                setParentLinkId('');
              }}
              className={fieldClassName}
            >
              <option value="">--</option>
              {comps.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t.parentLink}</label>
            <select
              value={parentLinkId}
              onChange={(e) => setParentLinkId(e.target.value)}
              className={fieldClassName}
            >
              <option value="">--</option>
              {parentLinks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t.childComponent}</label>
            <select
              value={childCompId}
              onChange={(e) => {
                setChildCompId(e.target.value);
                setChildLinkId('');
              }}
              className={fieldClassName}
            >
              <option value="">--</option>
              {comps.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t.childLink}</label>
            <select
              value={childLinkId}
              onChange={(e) => setChildLinkId(e.target.value)}
              className={fieldClassName}
            >
              <option value="">--</option>
              {childLinks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">{t.type}</label>
            <select
              value={jointType}
              onChange={(e) => setJointType(e.target.value as JointType)}
              className={fieldClassName}
            >
              <option value={JointType.FIXED}>fixed</option>
              <option value={JointType.REVOLUTE}>revolute</option>
              <option value={JointType.CONTINUOUS}>continuous</option>
              <option value={JointType.PRISMATIC}>prismatic</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Origin X</label>
              <input
                type="number"
                step={0.01}
                value={originX}
                onChange={(e) => setOriginX(Number(e.target.value))}
                className={compactFieldClassName}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Origin Y</label>
              <input
                type="number"
                step={0.01}
                value={originY}
                onChange={(e) => setOriginY(Number(e.target.value))}
                className={compactFieldClassName}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Origin Z</label>
              <input
                type="number"
                step={0.01}
                value={originZ}
                onChange={(e) => setOriginZ(Number(e.target.value))}
                className={compactFieldClassName}
              />
            </div>
          </div>

          {jointType !== JointType.FIXED && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">{t.lower}</label>
                <input
                  type="number"
                  step={0.01}
                  value={limitLower}
                  onChange={(e) => setLimitLower(Number(e.target.value))}
                  className={compactFieldClassName}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">{t.upper}</label>
                <input
                  type="number"
                  step={0.01}
                  value={limitUpper}
                  onChange={(e) => setLimitUpper(Number(e.target.value))}
                  className={compactFieldClassName}
                />
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border-black bg-element-bg flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-element-hover rounded-lg"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !parentCompId || !parentLinkId || !childCompId || !childLinkId}
            className="px-4 py-2 text-sm font-medium bg-system-blue-solid text-white rounded-lg hover:bg-system-blue-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
};
