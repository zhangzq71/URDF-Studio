/**
 * BridgeCreateModal - Dialog to create a bridge joint between two components
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link2, Minus, Plus } from 'lucide-react';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import { useSelectionStore } from '@/store/selectionStore';
import type { Language } from '@/store';
import { JointType, type AssemblyState, type BridgeJoint, type UrdfOrigin } from '@/types';
import { translations } from '@/shared/i18n';
import {
  filterSelectableBridgeComponents,
  isAssemblySelectionAllowedForBridge,
  resolveAssemblySelection,
  resolveBlockedBridgeComponentId,
  type BridgePickTarget,
} from '../utils/bridgeSelection';
import {
  bridgeEulerDegreesToQuaternion,
  bridgeQuaternionToEulerDegrees,
  buildBridgeJointFromDraft,
  buildBridgePreview,
  normalizeBridgeQuaternion,
  type BridgeRotationMode,
} from '../utils/bridgePreview';

interface StepperNumberFieldProps {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
}

function StepperNumberField({
  label,
  value,
  step,
  onChange,
  className = '',
}: StepperNumberFieldProps) {
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.valueAsNumber;
    onChange(Number.isFinite(nextValue) ? nextValue : 0);
  }, [onChange]);

  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </label>
      <div className="flex h-8 items-stretch overflow-hidden rounded-md border border-border-black bg-input-bg">
        <input
          type="number"
          step={step}
          value={value}
          onChange={handleInputChange}
          className="min-w-0 flex-1 bg-transparent px-2 text-[12px] text-text-primary outline-none"
        />
        <div className="flex shrink-0 border-l border-border-black">
          <button
            type="button"
            onClick={() => onChange(value - step)}
            className="flex w-7 items-center justify-center text-text-tertiary transition-colors hover:bg-element-hover hover:text-text-primary"
            aria-label={`${label} -`}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onChange(value + step)}
            className="flex w-7 items-center justify-center border-l border-border-black text-text-tertiary transition-colors hover:bg-element-hover hover:text-text-primary"
            aria-label={`${label} +`}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface CompactNumberFieldProps {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}

function CompactNumberField({
  label,
  value,
  step,
  onChange,
}: CompactNumberFieldProps) {
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.valueAsNumber;
    onChange(Number.isFinite(nextValue) ? nextValue : 0);
  }, [onChange]);

  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={handleInputChange}
        className="h-8 w-full rounded-md border border-border-black bg-input-bg px-2 text-[12px] text-text-primary outline-none focus:border-system-blue focus:ring-2 focus:ring-system-blue/15"
      />
    </div>
  );
}

export interface BridgeCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPreviewChange?: (bridge: BridgeJoint | null) => void;
  onCreate: (params: {
    name: string;
    parentComponentId: string;
    parentLinkId: string;
    childComponentId: string;
    childLinkId: string;
    joint: {
      type: JointType;
      origin: UrdfOrigin;
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
  onPreviewChange,
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
      x: Math.max(16, window.innerWidth - 420),
      y: 92,
    };
  }, []);
  const windowState = useDraggableWindow({
    isOpen,
    defaultPosition,
    defaultSize: { width: 396, height: 560 },
    minSize: { width: 360, height: 452 },
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
    'h-8 w-full rounded-md border border-border-black bg-input-bg px-2 text-[12px] text-text-primary outline-none focus:border-system-blue focus:ring-2 focus:ring-system-blue/15';

  const [name, setName] = useState('');
  const [parentCompId, setParentCompId] = useState('');
  const [parentLinkId, setParentLinkId] = useState('');
  const [childCompId, setChildCompId] = useState('');
  const [childLinkId, setChildLinkId] = useState('');
  const [jointType, setJointType] = useState<JointType>(JointType.FIXED);
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);
  const [originZ, setOriginZ] = useState(0);
  const [rotationMode, setRotationMode] = useState<BridgeRotationMode>('euler_deg');
  const [rollDeg, setRollDeg] = useState(0);
  const [pitchDeg, setPitchDeg] = useState(0);
  const [yawDeg, setYawDeg] = useState(0);
  const [quatX, setQuatX] = useState(0);
  const [quatY, setQuatY] = useState(0);
  const [quatZ, setQuatZ] = useState(0);
  const [quatW, setQuatW] = useState(1);
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

  const applyEulerRotation = useCallback((nextEulerDeg: { r: number; p: number; y: number }) => {
    setRollDeg(nextEulerDeg.r);
    setPitchDeg(nextEulerDeg.p);
    setYawDeg(nextEulerDeg.y);

    const nextQuaternion = bridgeEulerDegreesToQuaternion(nextEulerDeg);
    setQuatX(nextQuaternion.x);
    setQuatY(nextQuaternion.y);
    setQuatZ(nextQuaternion.z);
    setQuatW(nextQuaternion.w);
  }, []);

  const applyQuaternionRotation = useCallback((nextQuaternionValue: { x: number; y: number; z: number; w: number }) => {
    const normalizedQuaternion = normalizeBridgeQuaternion(nextQuaternionValue);
    setQuatX(normalizedQuaternion.x);
    setQuatY(normalizedQuaternion.y);
    setQuatZ(normalizedQuaternion.z);
    setQuatW(normalizedQuaternion.w);

    const nextEulerDegrees = bridgeQuaternionToEulerDegrees(normalizedQuaternion);
    setRollDeg(nextEulerDegrees.r);
    setPitchDeg(nextEulerDegrees.p);
    setYawDeg(nextEulerDegrees.y);
  }, []);

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
    setRotationMode('euler_deg');
    setRollDeg(0);
    setPitchDeg(0);
    setYawDeg(0);
    setQuatX(0);
    setQuatY(0);
    setQuatZ(0);
    setQuatW(1);
    setAxisX(0);
    setAxisY(0);
    setAxisZ(1);
    setLimitLower(-1.57);
    setLimitUpper(1.57);
    setPickTarget('parent');
    lastAppliedSelectionRef.current = null;
  }, []);

  const previewBridge = useMemo(() => buildBridgePreview({
    name,
    parentComponentId: parentCompId,
    parentLinkId,
    childComponentId: childCompId,
    childLinkId,
    jointType,
    originXyz: { x: originX, y: originY, z: originZ },
    axis: { x: axisX, y: axisY, z: axisZ },
    limitLower,
    limitUpper,
    rotationMode,
    rotationEulerDeg: { r: rollDeg, p: pitchDeg, y: yawDeg },
    rotationQuaternion: { x: quatX, y: quatY, z: quatZ, w: quatW },
  }), [
    axisX,
    axisY,
    axisZ,
    childCompId,
    childLinkId,
    jointType,
    limitLower,
    limitUpper,
    name,
    originX,
    originY,
    originZ,
    parentCompId,
    parentLinkId,
    pitchDeg,
    quatW,
    quatX,
    quatY,
    quatZ,
    rollDeg,
    rotationMode,
    yawDeg,
  ]);
  const submitJoint = useMemo(() => buildBridgeJointFromDraft({
    name: name.trim(),
    parentComponentId: parentCompId,
    parentLinkId,
    childComponentId: childCompId,
    childLinkId,
    jointType,
    originXyz: { x: originX, y: originY, z: originZ },
    axis: { x: axisX, y: axisY, z: axisZ },
    limitLower,
    limitUpper,
    rotationMode,
    rotationEulerDeg: { r: rollDeg, p: pitchDeg, y: yawDeg },
    rotationQuaternion: { x: quatX, y: quatY, z: quatZ, w: quatW },
  }, name.trim() || 'bridge_joint'), [
    axisX,
    axisY,
    axisZ,
    childCompId,
    childLinkId,
    jointType,
    limitLower,
    limitUpper,
    name,
    originX,
    originY,
    originZ,
    parentCompId,
    parentLinkId,
    pitchDeg,
    quatW,
    quatX,
    quatY,
    quatZ,
    rollDeg,
    rotationMode,
    yawDeg,
  ]);
  const isConfirmDisabled = !name.trim()
    || !submitJoint
    || !parentCompId
    || !parentLinkId
    || !childCompId
    || !childLinkId
    || parentCompId === childCompId;

  const handleSubmit = useCallback(() => {
    if (!submitJoint || isConfirmDisabled) {
      return;
    }

    onPreviewChange?.(null);
    onCreate({
      name: name.trim(),
      parentComponentId: parentCompId,
      parentLinkId,
      childComponentId: childCompId,
      childLinkId,
      joint: {
        type: submitJoint.type,
        origin: submitJoint.origin,
        axis: submitJoint.axis ?? { x: axisX, y: axisY, z: axisZ },
        limit: submitJoint.limit,
      },
    });
    resetForm();
    onClose();
  }, [
    axisX,
    axisY,
    axisZ,
    childCompId,
    childLinkId,
    isConfirmDisabled,
    name,
    onClose,
    onCreate,
    onPreviewChange,
    parentCompId,
    parentLinkId,
    resetForm,
    submitJoint,
  ]);

  const handleClose = useCallback(() => {
    onPreviewChange?.(null);
    resetForm();
    onClose();
  }, [onClose, onPreviewChange, resetForm]);

  useEffect(() => {
    if (!isOpen) {
      lastAppliedSelectionRef.current = null;
      setInteractionGuard(null);
      onPreviewChange?.(null);
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
  }, [assemblyState, blockedComponentId, handleClose, isOpen, onPreviewChange, setInteractionGuard]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    onPreviewChange?.(previewBridge);
  }, [isOpen, onPreviewChange, previewBridge]);

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
            <div className="truncate text-[13px] font-semibold text-text-primary">{t.createBridge}</div>
            <div className="text-[10px] text-text-tertiary">{t.bridgeJoint}</div>
          </div>
        </div>
      )}
      className="fixed z-[300] flex flex-col overflow-hidden rounded-xl border border-border-black bg-panel-bg text-text-primary shadow-2xl"
      headerClassName="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border-black bg-element-bg px-3"
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
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5">
        <div className="space-y-2.5">
          <div className="rounded-lg border border-border-black bg-element-bg/70 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] leading-4 text-text-secondary">{t.bridgePickHint}</p>
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

          <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {t.bridgeJoint} {t.name}
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.bridgeJointNamePlaceholder}
                className={fieldClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {t.type}
              </label>
              <select
                value={jointType}
                onChange={(event) => setJointType(event.target.value as JointType)}
                className={fieldClassName}
              >
                <option value={JointType.FIXED}>{t.jointTypeFixed}</option>
                <option value={JointType.REVOLUTE}>{t.jointTypeRevolute}</option>
                <option value={JointType.CONTINUOUS}>{t.jointTypeContinuous}</option>
                <option value={JointType.PRISMATIC}>{t.jointTypePrismatic}</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border-black bg-element-bg/45 p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{t.parentComponent}</label>
                <select
                  value={parentCompId}
                  onChange={(event) => {
                    setPickTarget('parent');
                    setParentCompId(event.target.value);
                    setParentLinkId('');
                  }}
                  onFocus={() => setPickTarget('parent')}
                  className={fieldClassName}
                >
                  <option value="">--</option>
                  {parentComponentOptions.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{t.parentLink}</label>
                <select
                  value={parentLinkId}
                  onChange={(event) => {
                    setPickTarget('parent');
                    setParentLinkId(event.target.value);
                  }}
                  onFocus={() => setPickTarget('parent')}
                  className={fieldClassName}
                >
                  <option value="">--</option>
                  {parentLinks.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{t.childComponent}</label>
                <select
                  value={childCompId}
                  onChange={(event) => {
                    setPickTarget('child');
                    setChildCompId(event.target.value);
                    setChildLinkId('');
                  }}
                  onFocus={() => setPickTarget('child')}
                  className={fieldClassName}
                >
                  <option value="">--</option>
                  {childComponentOptions.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{t.childLink}</label>
                <select
                  value={childLinkId}
                  onChange={(event) => {
                    setPickTarget('child');
                    setChildLinkId(event.target.value);
                  }}
                  onFocus={() => setPickTarget('child')}
                  className={fieldClassName}
                >
                  <option value="">--</option>
                  {childLinks.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-black bg-element-bg/45 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  {t.originRelativeParent}
                </div>
                <div className="text-[10px] text-text-tertiary">{t.urdfFrame}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <StepperNumberField label={t.originX} value={originX} step={0.01} onChange={setOriginX} />
              <StepperNumberField label={t.originY} value={originY} step={0.01} onChange={setOriginY} />
              <StepperNumberField label={t.originZ} value={originZ} step={0.01} onChange={setOriginZ} />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  {t.rotation}
                </label>
                <div className="flex items-center gap-1 rounded-md border border-border-black bg-panel-bg p-0.5">
                  <button
                    type="button"
                    onClick={() => setRotationMode('euler_deg')}
                    className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                      rotationMode === 'euler_deg'
                        ? 'bg-system-blue/15 text-system-blue'
                        : 'text-text-tertiary hover:bg-element-hover hover:text-text-primary'
                    }`}
                  >
                    {t.eulerDegrees}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotationMode('quaternion')}
                    className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                      rotationMode === 'quaternion'
                        ? 'bg-system-blue/15 text-system-blue'
                        : 'text-text-tertiary hover:bg-element-hover hover:text-text-primary'
                    }`}
                  >
                    {t.quaternion}
                  </button>
                </div>
              </div>

              {rotationMode === 'euler_deg' ? (
                <div className="grid grid-cols-3 gap-2">
                  <CompactNumberField label={t.roll} value={rollDeg} step={1} onChange={(value) => applyEulerRotation({ r: value, p: pitchDeg, y: yawDeg })} />
                  <CompactNumberField label={t.pitch} value={pitchDeg} step={1} onChange={(value) => applyEulerRotation({ r: rollDeg, p: value, y: yawDeg })} />
                  <CompactNumberField label={t.yaw} value={yawDeg} step={1} onChange={(value) => applyEulerRotation({ r: rollDeg, p: pitchDeg, y: value })} />
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  <CompactNumberField label="X" value={quatX} step={0.001} onChange={(value) => applyQuaternionRotation({ x: value, y: quatY, z: quatZ, w: quatW })} />
                  <CompactNumberField label="Y" value={quatY} step={0.001} onChange={(value) => applyQuaternionRotation({ x: quatX, y: value, z: quatZ, w: quatW })} />
                  <CompactNumberField label="Z" value={quatZ} step={0.001} onChange={(value) => applyQuaternionRotation({ x: quatX, y: quatY, z: value, w: quatW })} />
                  <CompactNumberField label="W" value={quatW} step={0.001} onChange={(value) => applyQuaternionRotation({ x: quatX, y: quatY, z: quatZ, w: value })} />
                </div>
              )}
            </div>
          </div>

          {jointType !== JointType.FIXED ? (
            <div className="rounded-lg border border-border-black bg-element-bg/45 p-2.5">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{t.limits}</div>
              <div className="grid grid-cols-2 gap-2">
                <CompactNumberField label={t.lower} value={limitLower} step={0.01} onChange={setLimitLower} />
                <CompactNumberField label={t.upper} value={limitUpper} step={0.01} onChange={setLimitUpper} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border-black bg-element-bg px-2.5 py-2">
        <button
          onClick={handleClose}
          className="rounded-md px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-element-hover"
          type="button"
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isConfirmDisabled}
          className="rounded-md bg-system-blue-solid px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-system-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
        >
          {t.confirm}
        </button>
      </div>
    </DraggableWindow>
  );
};
