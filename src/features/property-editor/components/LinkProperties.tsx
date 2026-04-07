/**
 * LinkProperties - Property editing panel for Link elements.
 * Renders the link-only editing layout shared by all editor modes:
 * - Name input
 * - Visual/Collision/Physics tabs
 */
import React, { useMemo } from 'react';
import { Eye, EyeOff, Box, Minus, Plus, Waypoints } from 'lucide-react';
import type {
  DetailLinkTab,
  InteractionSelection,
  RobotState,
  AppMode,
  MotorSpec,
  UrdfLink,
} from '@/types';
import { GeometryType } from '@/types';
import { translations } from '@/shared/i18n';
import { useUIStore, type Language, type MassInertiaChangeBehavior } from '@/store';
import { MAX_PROPERTY_DECIMALS, formatNumberWithMaxDecimals } from '@/core/utils/numberPrecision';
import {
  appendCollisionBody,
  getCollisionGeometryEntries,
  removeCollisionGeometryByObjectIndex,
} from '@/core/robot';
import {
  composeInertiaTensorFromDerivedValues,
  computeInertialDerivedValues,
  computeLinkDensity,
  scaleInertiaTensorForMassChange,
  type InertiaTensorComponents,
} from '@/shared/utils/inertialDerived';
import { Button, Checkbox, Dialog, SegmentedControl } from '@/shared/components/ui';
import {
  CollapsibleSection,
  InlineInputGroup,
  NumberInput,
  PROPERTY_EDITOR_HELPER_TEXT_CLASS,
  PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS,
  PROPERTY_EDITOR_INPUT_CLASS,
  PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS,
  PROPERTY_EDITOR_SECTION_TITLE_CLASS,
  ReadonlyVectorStatHeader,
  ReadonlyVectorStatRow,
  ReadonlyValueField,
} from './FormControls';
import { GeometryEditor } from './GeometryEditor';
import { TransformFields } from './TransformFields';

const DEFAULT_INERTIAL = {
  mass: 0,
  origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
  inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
};

const DEFAULT_PRINCIPAL_AXES = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
] as const;

type ResolvedMassInertiaBehavior = Exclude<MassInertiaChangeBehavior, 'ask'>;

interface PendingMassInertiaDecision {
  linkSnapshot: UrdfLink;
  nextMass: number;
  scaledEstimate: ReturnType<typeof scaleInertiaTensorForMassChange>;
}

interface FloatingMassInertiaNotice {
  message: string;
  tone: 'info' | 'success';
}

const formatReadonlyNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }

  return formatNumberWithMaxDecimals(value, MAX_PROPERTY_DECIMALS);
};

const fillTemplate = (template: string, replacements: Record<string, string>): string =>
  Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );

const formatMassValue = (value: number): string =>
  formatNumberWithMaxDecimals(value, MAX_PROPERTY_DECIMALS);

const formatInertiaTensorSummary = (inertia: InertiaTensorComponents): string => {
  const diagonalSummary = `ixx=${formatReadonlyNumber(inertia.ixx)}, iyy=${formatReadonlyNumber(
    inertia.iyy,
  )}, izz=${formatReadonlyNumber(inertia.izz)}`;
  const hasOffDiagonalTerms = [inertia.ixy, inertia.ixz, inertia.iyz].some(
    (value) => Math.abs(value) > 1e-9,
  );

  if (!hasOffDiagonalTerms) {
    return diagonalSummary;
  }

  return `${diagonalSummary}; ixy=${formatReadonlyNumber(inertia.ixy)}, ixz=${formatReadonlyNumber(
    inertia.ixz,
  )}, iyz=${formatReadonlyNumber(inertia.iyz)}`;
};

const buildMassInertiaNotice = (
  t: (typeof translations)['en'],
  linkName: string,
  nextMass: number,
  behavior: ResolvedMassInertiaBehavior,
  scaledEstimate: ReturnType<typeof scaleInertiaTensorForMassChange>,
): FloatingMassInertiaNotice => {
  if (behavior === 'reestimate' && scaledEstimate) {
    return {
      message: fillTemplate(t.massChangeInertiaReestimatedNotice, {
        name: linkName,
        tensor: formatInertiaTensorSummary(scaledEstimate.inertia),
      }),
      tone: 'success',
    };
  }

  if (behavior === 'reestimate') {
    return {
      message: fillTemplate(t.massChangeInertiaFallbackNotice, {
        name: linkName,
      }),
      tone: 'info',
    };
  }

  return {
    message: fillTemplate(t.massChangeInertiaPreservedNotice, {
      name: linkName,
      mass: formatMassValue(nextMass),
    }),
    tone: 'info',
  };
};

const DetailGeometryTabButton = ({
  icon: Icon,
  isActive,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={`relative flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-t-lg border-x border-t px-1 py-1 text-[10px] font-semibold transition-all ${
      isActive
        ? 'z-10 -mb-px border-border-black bg-panel-bg pb-1.5 text-system-blue dark:bg-segmented-active'
        : 'border-transparent bg-transparent text-text-tertiary hover:bg-element-hover hover:text-text-secondary'
    }`}
  >
    <Icon className="h-3 w-3 shrink-0" />
    <span className="min-w-0 truncate leading-tight">{label}</span>
  </button>
);

const DetailGeometryTabPanel = ({
  activeTab,
  children,
  tab,
}: {
  activeTab: DetailLinkTab;
  children: React.ReactNode;
  tab: DetailLinkTab;
}) => (
  <div
    style={{ display: activeTab === tab ? undefined : 'none' }}
    className="mb-2.5 animate-in rounded-b-lg border-x border-b border-border-black bg-panel-bg p-1.5 shadow-sm fade-in slide-in-from-bottom-1 duration-200"
  >
    {children}
  </div>
);

const getGeometryTypeLabel = (type: GeometryType, t: (typeof translations)['en']) =>
  type === GeometryType.BOX
    ? t.box
    : type === GeometryType.PLANE
      ? t.plane
      : type === GeometryType.CYLINDER
        ? t.cylinder
        : type === GeometryType.SPHERE
          ? t.sphere
          : type === GeometryType.ELLIPSOID
            ? t.ellipsoid
            : type === GeometryType.CAPSULE
              ? t.capsule
              : type === GeometryType.HFIELD
                ? t.hfield
                : type === GeometryType.SDF
                  ? t.sdf
                  : type === GeometryType.MESH
                    ? t.mesh
                    : t.none;

interface LinkPropertiesProps {
  data: UrdfLink;
  robot: RobotState;
  mode: AppMode;
  selection: RobotState['selection'];
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  onSelect?: (
    type: Exclude<InteractionSelection['type'], null>,
    id: string,
    subType?: 'visual' | 'collision',
  ) => void;
  onSelectGeometry?: (
    linkId: string,
    subType: 'visual' | 'collision',
    objectIndex?: number,
    suppressPulse?: boolean,
  ) => void;
  onAddCollisionBody?: (linkId: string) => void;
  motorLibrary: Record<string, MotorSpec[]>;
  assets: Record<string, string>;
  onUploadAsset: (file: File) => void;
  t: (typeof translations)['en'];
  lang: Language;
}

export const LinkProperties: React.FC<LinkPropertiesProps> = ({
  data,
  robot,
  selection,
  onUpdate,
  onSelect,
  onSelectGeometry,
  onAddCollisionBody,
  assets,
  onUploadAsset,
  t,
  lang,
}) => {
  const linkTab = useUIStore((state) => state.detailLinkTab);
  const setDetailLinkTab = useUIStore((state) => state.setDetailLinkTab);
  const massInertiaChangeBehavior = useUIStore((state) => state.massInertiaChangeBehavior);
  const setMassInertiaChangeBehavior = useUIStore((state) => state.setMassInertiaChangeBehavior);
  const inertial = data.inertial ?? DEFAULT_INERTIAL;
  const noticeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingMassInertiaDecision, setPendingMassInertiaDecision] =
    React.useState<PendingMassInertiaDecision | null>(null);
  const [selectedMassInertiaBehavior, setSelectedMassInertiaBehavior] =
    React.useState<ResolvedMassInertiaBehavior>('reestimate');
  const [rememberMassInertiaBehavior, setRememberMassInertiaBehavior] = React.useState(false);
  const [floatingMassInertiaNotice, setFloatingMassInertiaNotice] =
    React.useState<FloatingMassInertiaNotice | null>(null);
  const densityResult = useMemo(() => computeLinkDensity(data), [data]);
  const derivedInertial = useMemo(
    () => computeInertialDerivedValues(data.inertial),
    [data.inertial],
  );
  const collisionGeometryEntries = useMemo(() => getCollisionGeometryEntries(data), [data]);
  const densityLabel = t.density;
  const selectedCollisionObjectIndex =
    selection.type === 'link' && selection.id === data.id && selection.subType === 'collision'
      ? (selection.objectIndex ?? 0)
      : (collisionGeometryEntries[0]?.objectIndex ?? 0);

  const handleTabChange = (tab: DetailLinkTab) => {
    setDetailLinkTab(tab);
  };
  const inertiaTensorFields = ['ixx', 'ixy', 'ixz', 'iyy', 'iyz', 'izz'] as const;
  const diagonalInertiaLabels = ['I1', 'I2', 'I3'] as const;
  const principalAxisLabels = ['A1', 'A2', 'A3'] as const;
  const diagonalInertiaValues = derivedInertial?.diagonalInertia ?? [
    inertial.inertia.ixx,
    inertial.inertia.iyy,
    inertial.inertia.izz,
  ];
  const principalAxes =
    derivedInertial?.principalAxes ??
    (DEFAULT_PRINCIPAL_AXES as [
      { x: number; y: number; z: number },
      { x: number; y: number; z: number },
      { x: number; y: number; z: number },
    ]);

  const handleDiagonalInertiaChange = (index: 0 | 1 | 2, value: number) => {
    const nextDiagonalInertia = [...diagonalInertiaValues] as [number, number, number];
    nextDiagonalInertia[index] = value;

    onUpdate('link', selection.id!, {
      ...data,
      inertial: {
        ...inertial,
        inertia: composeInertiaTensorFromDerivedValues(nextDiagonalInertia, principalAxes),
      },
    });
  };

  const showFloatingMassInertiaNotice = React.useCallback((notice: FloatingMassInertiaNotice) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }

    setFloatingMassInertiaNotice(notice);
    noticeTimerRef.current = setTimeout(() => {
      setFloatingMassInertiaNotice(null);
      noticeTimerRef.current = null;
    }, 5000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    setPendingMassInertiaDecision(null);
    setRememberMassInertiaBehavior(false);
    setSelectedMassInertiaBehavior('reestimate');
  }, [data.id]);

  const applyMassChange = React.useCallback(
    (
      linkSnapshot: UrdfLink,
      nextMass: number,
      behavior: ResolvedMassInertiaBehavior,
      scaledEstimate: ReturnType<typeof scaleInertiaTensorForMassChange>,
      options?: { remember?: boolean },
    ) => {
      const nextInertial = {
        ...(linkSnapshot.inertial ?? DEFAULT_INERTIAL),
        mass: nextMass,
        ...(behavior === 'reestimate' && scaledEstimate ? { inertia: scaledEstimate.inertia } : {}),
      };

      onUpdate('link', linkSnapshot.id, {
        ...linkSnapshot,
        inertial: nextInertial,
      });

      if (options?.remember) {
        setMassInertiaChangeBehavior(behavior);
      }

      showFloatingMassInertiaNotice(
        buildMassInertiaNotice(t, linkSnapshot.name, nextMass, behavior, scaledEstimate),
      );
    },
    [onUpdate, setMassInertiaChangeBehavior, showFloatingMassInertiaNotice, t],
  );

  const handleMassChange = React.useCallback(
    (nextMass: number) => {
      if (Math.abs(nextMass - inertial.mass) <= 1e-12) {
        return;
      }

      const preferredBehavior = massInertiaChangeBehavior;
      const scaledEstimate = scaleInertiaTensorForMassChange(inertial, nextMass);

      if (preferredBehavior === 'ask') {
        setPendingMassInertiaDecision({
          linkSnapshot: data,
          nextMass,
          scaledEstimate,
        });
        setSelectedMassInertiaBehavior(scaledEstimate ? 'reestimate' : 'preserve');
        setRememberMassInertiaBehavior(false);
        return;
      }

      applyMassChange(data, nextMass, preferredBehavior, scaledEstimate);
    },
    [applyMassChange, data, inertial, massInertiaChangeBehavior],
  );

  const handleConfirmMassInertiaDecision = React.useCallback(() => {
    if (!pendingMassInertiaDecision) {
      return;
    }

    applyMassChange(
      pendingMassInertiaDecision.linkSnapshot,
      pendingMassInertiaDecision.nextMass,
      selectedMassInertiaBehavior,
      pendingMassInertiaDecision.scaledEstimate,
      {
        remember: rememberMassInertiaBehavior,
      },
    );
    setPendingMassInertiaDecision(null);
    setRememberMassInertiaBehavior(false);
  }, [
    applyMassChange,
    pendingMassInertiaDecision,
    rememberMassInertiaBehavior,
    selectedMassInertiaBehavior,
  ]);

  const nameField = (
    <InlineInputGroup label={t.name} labelWidthClassName="w-11">
      <input
        type="text"
        value={data.name}
        onChange={(e) => onUpdate('link', selection.id!, { ...data, name: e.target.value })}
        className={PROPERTY_EDITOR_INPUT_CLASS}
      />
    </InlineInputGroup>
  );

  const inertialParametersSection = (
    <CollapsibleSection
      title={t.inertial}
      className="mb-2.5"
      storageKey="property_editor_link_inertial"
    >
      <InlineInputGroup label={t.mass} labelWidthClassName="w-16">
        <NumberInput value={inertial.mass} min={0} commitOnBlurOnly onChange={handleMassChange} />
      </InlineInputGroup>

      <div className="mb-1 overflow-hidden rounded-md border border-border-black/60">
        <div className="bg-element-bg/70 px-2 py-1 text-[9px] font-semibold tracking-[0.02em] text-text-secondary">
          {t.centerOfMass || 'Center of Mass'}
        </div>
        <div className="border-t border-border-black/60 bg-panel-bg px-1.5 py-1">
          <TransformFields
            lang={lang}
            positionValue={inertial.origin?.xyz || { x: 0, y: 0, z: 0 }}
            rotationValue={inertial.origin?.rpy || { r: 0, p: 0, y: 0 }}
            compact={false}
            rotationQuickStepDegrees={90}
            onPositionChange={(xyz) =>
              onUpdate('link', selection.id!, {
                ...data,
                inertial: {
                  ...inertial,
                  origin: {
                    xyz: xyz as { x: number; y: number; z: number },
                    rpy: inertial.origin?.rpy || { r: 0, p: 0, y: 0 },
                  },
                },
              })
            }
            onRotationChange={(rpy) =>
              onUpdate('link', selection.id!, {
                ...data,
                inertial: {
                  ...inertial,
                  origin: {
                    xyz: inertial.origin?.xyz || { x: 0, y: 0, z: 0 },
                    rpy,
                  },
                },
              })
            }
          />
        </div>
      </div>

      <div className="mt-3 border-t border-border-black/60 pt-2">
        <h4 className="mb-2 text-[10px] font-semibold tracking-[0.02em] text-text-tertiary">
          {t.inertiaTensor}
        </h4>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {inertiaTensorFields.map((field) => (
            <InlineInputGroup key={field} label={field} labelWidthClassName="w-7" className="mb-0">
              <NumberInput
                value={inertial.inertia[field]}
                onChange={(v) =>
                  onUpdate('link', selection.id!, {
                    ...data,
                    inertial: { ...inertial, inertia: { ...inertial.inertia, [field]: v } },
                  })
                }
              />
            </InlineInputGroup>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );

  const derivedValuesSection = (
    <CollapsibleSection
      title={t.derivedValues}
      className="mb-2.5"
      storageKey="property_editor_link_derived_values"
    >
      <InlineInputGroup label={densityLabel} labelWidthClassName="w-16" align="start">
        <ReadonlyValueField className="min-w-0 w-full overflow-hidden truncate">
          {formatReadonlyNumber(densityResult.value)}
        </ReadonlyValueField>
      </InlineInputGroup>

      <InlineInputGroup label={t.diagonalInertia} labelWidthClassName="w-16" align="start">
        <div className="grid min-w-0 w-full grid-cols-3 gap-1.5">
          {diagonalInertiaLabels.map((label, index) => (
            <div key={label} className="flex min-w-0 items-center gap-1.5">
              <span className={`${PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS} w-4 justify-center`}>
                {label}
              </span>
              <div className="min-w-0 flex-1">
                <NumberInput
                  value={diagonalInertiaValues[index]}
                  min={0}
                  step={0.01}
                  precision={MAX_PROPERTY_DECIMALS}
                  compact
                  onChange={(value) => handleDiagonalInertiaChange(index as 0 | 1 | 2, value)}
                />
              </div>
            </div>
          ))}
        </div>
      </InlineInputGroup>

      <InlineInputGroup
        label={t.principalAxes}
        labelWidthClassName="w-16"
        align="start"
        className="mb-0"
      >
        <div className="min-w-0 w-full space-y-1.5">
          <ReadonlyVectorStatHeader />
          {principalAxisLabels.map((label, index) => {
            const axis = principalAxes[index];
            return (
              <ReadonlyVectorStatRow
                key={label}
                label={label}
                values={[
                  formatReadonlyNumber(axis?.x),
                  formatReadonlyNumber(axis?.y),
                  formatReadonlyNumber(axis?.z),
                ]}
              />
            );
          })}
        </div>
      </InlineInputGroup>
    </CollapsibleSection>
  );

  const inertialSection = (
    <>
      {inertialParametersSection}
      {derivedValuesSection}
    </>
  );

  const handleSelectCollisionGeometry = React.useCallback(
    (objectIndex: number) => {
      if (onSelectGeometry) {
        onSelectGeometry(data.id, 'collision', objectIndex);
        return;
      }

      onSelect?.('link', data.id, 'collision');
    },
    [data.id, onSelect, onSelectGeometry],
  );

  const handleAddCollisionBodyClick = React.useCallback(() => {
    if (onAddCollisionBody) {
      onAddCollisionBody(data.id);
      return;
    }

    const nextLink = appendCollisionBody(data);
    const nextEntries = getCollisionGeometryEntries(nextLink);
    const nextObjectIndex = Math.max(0, nextEntries.length - 1);

    onUpdate('link', data.id, nextLink);
    onSelectGeometry?.(data.id, 'collision', nextObjectIndex);
  }, [data, onAddCollisionBody, onSelectGeometry, onUpdate]);

  const handleDeleteCollisionBodyClick = React.useCallback(() => {
    if (collisionGeometryEntries.length === 0) {
      return;
    }

    const {
      link: nextLink,
      removed,
      nextObjectIndex,
    } = removeCollisionGeometryByObjectIndex(data, selectedCollisionObjectIndex);

    if (!removed) {
      return;
    }

    onUpdate('link', data.id, nextLink);

    if (nextObjectIndex === null) {
      onSelect?.('link', data.id);
      return;
    }

    if (onSelectGeometry) {
      onSelectGeometry(data.id, 'collision', nextObjectIndex);
      return;
    }

    onSelect?.('link', data.id, 'collision');
  }, [
    collisionGeometryEntries.length,
    data,
    onSelect,
    onSelectGeometry,
    onUpdate,
    selectedCollisionObjectIndex,
  ]);

  const collisionBodiesSection = (
    <div className="mb-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className={PROPERTY_EDITOR_SECTION_TITLE_CLASS}>{t.collisionBodiesList}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t.deleteCollisionGeometry}
            title={t.deleteCollisionGeometry}
            onClick={handleDeleteCollisionBodyClick}
            disabled={collisionGeometryEntries.length === 0}
            className={`${PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS} w-6 px-0`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t.addCollisionBody}
            title={t.addCollisionBody}
            onClick={handleAddCollisionBodyClick}
            className={`${PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS} w-6 px-0`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {collisionGeometryEntries.length ? (
        <div className="space-y-1">
          {collisionGeometryEntries.map((entry) => {
            const isSelected = selectedCollisionObjectIndex === entry.objectIndex;
            const geometryTypeLabel = getGeometryTypeLabel(entry.geometry.type, t);
            const collisionLabel = fillTemplate(t.collisionBodyItem, {
              index: String(entry.objectIndex + 1),
            });
            const isVisible = entry.geometry.visible !== false;

            return (
              <button
                key={`${data.id}:collision:${entry.objectIndex}`}
                type="button"
                aria-label={collisionLabel}
                aria-pressed={isSelected}
                onClick={() => handleSelectCollisionGeometry(entry.objectIndex)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                  isSelected
                    ? 'border-system-blue/50 bg-system-blue/10'
                    : 'border-border-black/60 bg-panel-bg hover:bg-element-hover'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold ${
                      isSelected
                        ? 'border-system-blue/40 bg-system-blue/15 text-system-blue'
                        : 'border-border-black/60 bg-element-bg/70 text-text-secondary'
                    }`}
                  >
                    {entry.objectIndex + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[10px] font-semibold text-text-primary">
                        {collisionLabel}
                      </span>
                      {entry.bodyIndex === null ? (
                        <span className="shrink-0 rounded-full bg-system-blue/10 px-1.5 py-px text-[9px] font-semibold text-system-blue">
                          {t.collisionBodyPrimary}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-[9px] text-text-tertiary">
                      <span className="truncate">{geometryTypeLabel}</span>
                      <span aria-hidden="true">•</span>
                      <span>{isVisible ? t.visible : t.hidden}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-text-tertiary">
                  {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border-black/60 bg-element-bg/60 px-3 py-2">
          <p className={PROPERTY_EDITOR_HELPER_TEXT_CLASS}>{t.collisionBodyEmpty}</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {nameField}

      {/* Viewer-side visual / collision / physics tabs */}
      <div>
        {/* Tab Navigation - Folder Style */}
        <div className="mb-0 flex items-stretch gap-0.5 rounded-t-lg border border-border-black bg-element-bg px-0.5 pt-0.5">
          <div className="w-px"></div>
          <DetailGeometryTabButton
            icon={Eye}
            isActive={linkTab === 'visual'}
            label={t.visualGeometry}
            onClick={() => handleTabChange('visual')}
          />
          <DetailGeometryTabButton
            icon={Box}
            isActive={linkTab === 'collision'}
            label={t.collisionGeometry}
            onClick={() => handleTabChange('collision')}
          />
          <DetailGeometryTabButton
            icon={Waypoints}
            isActive={linkTab === 'physics'}
            label={t.physics}
            onClick={() => handleTabChange('physics')}
          />
        </div>

        <DetailGeometryTabPanel activeTab={linkTab} tab="visual">
          {linkTab === 'visual' ? (
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
          ) : null}
        </DetailGeometryTabPanel>

        <DetailGeometryTabPanel activeTab={linkTab} tab="collision">
          {linkTab === 'collision' ? (
            <div className="space-y-2">
              {collisionBodiesSection}
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
                showCollisionDeleteAction={false}
              />
            </div>
          ) : null}
        </DetailGeometryTabPanel>

        <DetailGeometryTabPanel activeTab={linkTab} tab="physics">
          {inertialSection}
        </DetailGeometryTabPanel>
      </div>

      <Dialog
        isOpen={Boolean(pendingMassInertiaDecision)}
        onClose={() => {
          setPendingMassInertiaDecision(null);
          setRememberMassInertiaBehavior(false);
        }}
        title={t.massChangeInertiaDialogTitle}
        width="w-[520px]"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPendingMassInertiaDecision(null);
                setRememberMassInertiaBehavior(false);
              }}
            >
              {t.cancel}
            </Button>
            <Button type="button" onClick={handleConfirmMassInertiaDecision}>
              {t.confirm}
            </Button>
          </div>
        }
      >
        {pendingMassInertiaDecision ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-text-secondary">
              {fillTemplate(t.massChangeInertiaDialogMessage, {
                name: pendingMassInertiaDecision.linkSnapshot.name,
                mass: formatMassValue(pendingMassInertiaDecision.nextMass),
              })}
            </p>

            <div className="space-y-2">
              <SegmentedControl<ResolvedMassInertiaBehavior>
                size="sm"
                value={selectedMassInertiaBehavior}
                onChange={setSelectedMassInertiaBehavior}
                options={[
                  {
                    value: 'preserve',
                    label: t.massChangeInertiaKeep,
                  },
                  {
                    value: 'reestimate',
                    label: t.massChangeInertiaReestimate,
                    disabled: !pendingMassInertiaDecision.scaledEstimate,
                  },
                ]}
              />
              <div className="rounded-xl border border-border-black bg-element-bg/60 px-3 py-2.5">
                <div className="text-xs font-semibold text-text-primary">
                  {selectedMassInertiaBehavior === 'preserve'
                    ? t.massChangeInertiaKeepDescription
                    : t.massChangeInertiaReestimateDescription}
                </div>
                {selectedMassInertiaBehavior === 'reestimate' &&
                !pendingMassInertiaDecision.scaledEstimate ? (
                  <div className="mt-1.5 text-[11px] leading-5 text-danger">
                    {t.massChangeInertiaReestimateUnavailable}
                  </div>
                ) : null}
              </div>
            </div>

            <Checkbox
              checked={rememberMassInertiaBehavior}
              onChange={setRememberMassInertiaBehavior}
              label={t.massChangeInertiaRememberChoice}
            />
          </div>
        ) : null}
      </Dialog>

      {floatingMassInertiaNotice ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[140] max-w-[min(28rem,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start gap-2 rounded-2xl border border-border-black bg-panel-bg px-3 py-2.5 shadow-xl dark:shadow-black/40">
            <div
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                floatingMassInertiaNotice.tone === 'success' ? 'bg-emerald-500' : 'bg-system-blue'
              }`}
            />
            <div className="text-xs font-semibold leading-5 text-text-primary">
              {floatingMassInertiaNotice.message}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
