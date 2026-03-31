/**
 * BridgeCreateModal - Dialog to create a bridge joint between two components
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link2 } from 'lucide-react';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import { useSelectionStore } from '@/store/selectionStore';
import type { AssemblyState } from '@/types';
import { JointType } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import {
  filterSelectableBridgeComponents,
  isAssemblySelectionAllowedForBridge,
  resolveAssemblySelection,
  resolveBlockedBridgeComponentId,
  type BridgePickTarget,
} from '../utils/bridgeSelection';

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
  const selection = useSelectionStore((state) => state.selection);
  const setInteractionGuard = useSelectionStore((state) => state.setInteractionGuard);
  const lastAppliedSelectionRef = useRef<string | null>(null);
  const defaultPosition = useMemo(() => {
    if (typeof window === 'undefined') {
      return { x: 72, y: 92 };
    }

    return {
      x: Math.max(16, window.innerWidth - 456),
      y: 92,
    };
  }, []);
  const windowState = useDraggableWindow({
    isOpen,
    defaultPosition,
    defaultSize: { width: 432, height: 556 },
    minSize: { width: 392, height: 420 },
    centerOnMount: false,
    enableMinimize: false,
    enableMaximize: false,
    dragBounds: {
      allowNegativeX: false,
      minVisibleWidth: 120,
      topMargin: 64,
      bottomMargin: 56,
    },
  });
  const fieldClassName =
    'w-full px-2.5 py-2 text-sm bg-input-bg border border-border-black rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-system-blue/20 focus:border-system-blue';
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
  const [pickTarget, setPickTarget] = useState<BridgePickTarget>('parent');

  const parentComp = parentCompId ? assemblyState.components[parentCompId] : null;
  const childComp = childCompId ? assemblyState.components[childCompId] : null;
  const blockedComponentId = useMemo(
    () => resolveBlockedBridgeComponentId({
      pickTarget,
      parentComponentId: parentCompId,
      childComponentId: childCompId,
    }),
    [childCompId, parentCompId, pickTarget],
  );
  const parentComponentOptions = useMemo(
    () => filterSelectableBridgeComponents(comps, childCompId || null),
    [childCompId, comps],
  );
  const childComponentOptions = useMemo(
    () => filterSelectableBridgeComponents(comps, parentCompId || null),
    [comps, parentCompId],
  );
  const parentLinks = parentComp ? Object.values(parentComp.robot.links) : [];
  const childLinks = childComp ? Object.values(childComp.robot.links) : [];

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
    setPickTarget('parent');
    lastAppliedSelectionRef.current = null;
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !parentCompId || !parentLinkId || !childCompId || !childLinkId) return;
    if (parentCompId === childCompId) return;

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
    resetForm();
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
    resetForm,
  ]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  useEffect(() => {
    if (!isOpen) {
      lastAppliedSelectionRef.current = null;
      setInteractionGuard(null);
      return undefined;
    }

    setInteractionGuard((nextSelection) => isAssemblySelectionAllowedForBridge(
      assemblyState,
      nextSelection,
      blockedComponentId,
    ));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      setInteractionGuard(null);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [assemblyState, blockedComponentId, handleClose, isOpen, setInteractionGuard]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const resolvedSelection = resolveAssemblySelection(assemblyState, selection);
    if (!resolvedSelection) {
      return;
    }

    if (!isAssemblySelectionAllowedForBridge(assemblyState, selection, blockedComponentId)) {
      return;
    }

    const selectionSignature = `${pickTarget}:${selection.type}:${selection.id}:${selection.subType ?? ''}:${selection.objectIndex ?? ''}`;
    if (lastAppliedSelectionRef.current === selectionSignature) {
      return;
    }

    lastAppliedSelectionRef.current = selectionSignature;

    if (pickTarget === 'parent') {
      setParentCompId(resolvedSelection.componentId);
      setParentLinkId(resolvedSelection.linkId);
      if (!childCompId || !childLinkId) {
        setPickTarget('child');
      }
      return;
    }

    setChildCompId(resolvedSelection.componentId);
    setChildLinkId(resolvedSelection.linkId);
  }, [
    assemblyState,
    blockedComponentId,
    childCompId,
    childLinkId,
    isOpen,
    pickTarget,
    selection,
  ]);

  if (!isOpen) return null;

  return (
    <DraggableWindow
      window={windowState}
      onClose={handleClose}
      title={(
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-md border border-border-black bg-element-bg p-1 text-system-blue">
            <Link2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-primary">{t.createBridge}</div>
            <div className="text-[10px] text-text-tertiary">{t.bridgeJoint}</div>
          </div>
        </div>
      )}
      className="fixed z-[300] flex flex-col overflow-hidden rounded-xl border border-border-black bg-panel-bg text-text-primary shadow-2xl"
      headerClassName="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border-black bg-element-bg px-3"
      headerLeftClassName="flex min-w-0 flex-1 items-center gap-2"
      headerRightClassName="flex shrink-0 items-center gap-1"
      headerDraggableClassName="cursor-grab"
      headerDraggingClassName="cursor-grabbing"
      interactionClassName="select-none"
      showMinimizeButton={false}
      showMaximizeButton={false}
      showResizeHandles={false}
      closeTitle={t.close}
      controlButtonClassName="rounded-md p-1 text-text-tertiary transition-colors hover:bg-element-hover"
      closeButtonClassName="rounded-md p-1 text-text-tertiary transition-colors hover:bg-red-500 hover:text-white"
    >
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          <div className="rounded-lg border border-border-black bg-element-bg/70 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-4 text-text-secondary">{t.bridgePickHint}</p>
              <div className="flex shrink-0 items-center gap-1 rounded-md border border-border-black bg-panel-bg p-0.5">
                <button
                  type="button"
                  onClick={() => setPickTarget('parent')}
                  className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                    pickTarget === 'parent'
                      ? 'bg-system-blue/15 text-system-blue'
                      : 'text-text-tertiary hover:bg-element-hover hover:text-text-primary'
                  }`}
                >
                  {t.bridgePickParent}
                </button>
                <button
                  type="button"
                  onClick={() => setPickTarget('child')}
                  className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                    pickTarget === 'child'
                      ? 'bg-system-blue/15 text-system-blue'
                      : 'text-text-tertiary hover:bg-element-hover hover:text-text-primary'
                  }`}
                >
                  {t.bridgePickChild}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              {t.bridgeJoint} {t.name}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.bridgeJointNamePlaceholder}
              className={fieldClassName}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.parentComponent}</label>
              <select
                value={parentCompId}
                onChange={(e) => {
                  setPickTarget('parent');
                  setParentCompId(e.target.value);
                  setParentLinkId('');
                }}
                onFocus={() => setPickTarget('parent')}
                className={fieldClassName}
              >
                <option value="">--</option>
                {parentComponentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.parentLink}</label>
              <select
                value={parentLinkId}
                onChange={(e) => {
                  setPickTarget('parent');
                  setParentLinkId(e.target.value);
                }}
                onFocus={() => setPickTarget('parent')}
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
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.childComponent}</label>
              <select
                value={childCompId}
                onChange={(e) => {
                  setPickTarget('child');
                  setChildCompId(e.target.value);
                  setChildLinkId('');
                }}
                onFocus={() => setPickTarget('child')}
                className={fieldClassName}
              >
                <option value="">--</option>
                {childComponentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.childLink}</label>
              <select
                value={childLinkId}
                onChange={(e) => {
                  setPickTarget('child');
                  setChildLinkId(e.target.value);
                }}
                onFocus={() => setPickTarget('child')}
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
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.type}</label>
            <select
              value={jointType}
              onChange={(e) => setJointType(e.target.value as JointType)}
              className={fieldClassName}
            >
              <option value={JointType.FIXED}>{t.jointTypeFixed}</option>
              <option value={JointType.REVOLUTE}>{t.jointTypeRevolute}</option>
              <option value={JointType.CONTINUOUS}>{t.jointTypeContinuous}</option>
              <option value={JointType.PRISMATIC}>{t.jointTypePrismatic}</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.originX}</label>
              <input
                type="number"
                step={0.01}
                value={originX}
                onChange={(e) => setOriginX(Number(e.target.value))}
                className={compactFieldClassName}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.originY}</label>
              <input
                type="number"
                step={0.01}
                value={originY}
                onChange={(e) => setOriginY(Number(e.target.value))}
                className={compactFieldClassName}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.originZ}</label>
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
                <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.lower}</label>
                <input
                  type="number"
                  step={0.01}
                  value={limitLower}
                  onChange={(e) => setLimitLower(Number(e.target.value))}
                  className={compactFieldClassName}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-text-secondary">{t.upper}</label>
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
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border-black bg-element-bg px-3 py-2.5">
        <button
          onClick={handleClose}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-element-hover"
          type="button"
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !parentCompId || !parentLinkId || !childCompId || !childLinkId || parentCompId === childCompId}
          className="rounded-lg bg-system-blue-solid px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-system-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
        >
          {t.confirm}
        </button>
      </div>
    </DraggableWindow>
  );
};
