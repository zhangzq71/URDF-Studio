/**
 * LinkProperties - Property editing panel for Link elements.
 * Renders different content based on the current editor mode:
 * - Skeleton/Hardware: Name input
 * - Detail: Visual/Collision geometry tabs
 * - Hardware: Inertial properties (mass, CoM, inertia tensor)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Box } from 'lucide-react';
import type { RobotState, AppMode, UrdfLink } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import {
  MAX_PROPERTY_DECIMALS,
  formatNumberWithMaxDecimals,
} from '@/core/utils/numberPrecision';
import {
  computeInertialDerivedValues,
  computeLinkDensity,
} from '@/shared/utils/inertialDerived';
import {
  InputGroup,
  InlineInputGroup,
  NumberInput,
  PROPERTY_EDITOR_INPUT_CLASS,
  ReadonlyVectorStatHeader,
  ReadonlyVectorStatRow,
  ReadonlyValueField,
  StaticSection,
} from './FormControls';
import { GeometryEditor } from './GeometryEditor';
import { TransformFields } from './TransformFields';

type DetailGeometryTab = 'visual' | 'collision';

const DEFAULT_INERTIAL = {
  mass: 0,
  origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
  inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
};

const formatReadonlyNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }

  return formatNumberWithMaxDecimals(value, MAX_PROPERTY_DECIMALS);
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
    className={`relative flex flex-1 items-center justify-center gap-1 rounded-t-lg border-x border-t py-1 text-[10px] font-semibold transition-all ${
      isActive
        ? 'z-10 -mb-px border-border-black bg-panel-bg pb-1.5 text-system-blue dark:bg-segmented-active'
        : 'border-transparent bg-transparent text-text-tertiary hover:bg-element-hover hover:text-text-secondary'
    }`}
  >
    <Icon className="h-3 w-3" />
    {label}
  </button>
);

const DetailGeometryTabPanel = ({
  activeTab,
  children,
  tab,
}: {
  activeTab: DetailGeometryTab;
  children: React.ReactNode;
  tab: DetailGeometryTab;
}) => (
  <div
    style={{ display: activeTab === tab ? undefined : 'none' }}
    className="mb-2.5 animate-in rounded-b-lg border-x border-b border-border-black bg-panel-bg p-1.5 shadow-sm fade-in slide-in-from-bottom-1 duration-200"
  >
    {children}
  </div>
);

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
  const [linkTab, setLinkTab] = useState<DetailGeometryTab>('visual');
  const inertial = data.inertial ?? DEFAULT_INERTIAL;
  const densityResult = useMemo(() => computeLinkDensity(data), [data]);
  const derivedInertial = useMemo(() => computeInertialDerivedValues(data.inertial), [data.inertial]);
  const densityLabel = t.density;

  // Sync internal tab state with global selection subType
  useEffect(() => {
    if (selection.subType) {
      setLinkTab(selection.subType);
    }
  }, [selection.subType]);

  const handleTabChange = (tab: DetailGeometryTab) => {
    setLinkTab(tab);
    if (selection.id && onSelect) {
      onSelect('link', selection.id, tab);
    }
  };
  const inertiaTensorFields = ['ixx', 'ixy', 'ixz', 'iyy', 'iyz', 'izz'] as const;
  const diagonalInertiaLabels = ['I1', 'I2', 'I3'] as const;

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

  const inertialSection = (
    <StaticSection title={t.inertial} className="mb-2.5">
      <InlineInputGroup label={t.mass} labelWidthClassName="w-16">
        <NumberInput
          value={inertial.mass}
          min={0}
          onChange={(v: number) => onUpdate('link', selection.id!, {
            ...data,
            inertial: { ...inertial, mass: v }
          })}
        />
      </InlineInputGroup>

      <div className="mb-1 overflow-hidden rounded-md border border-border-black/60">
        <div className="bg-element-bg/70 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-text-secondary">
          {t.centerOfMass || "Center of Mass"}
        </div>
        <div className="border-t border-border-black/60 bg-panel-bg px-1.5 py-1">
          <TransformFields
            lang={lang}
            positionValue={inertial.origin?.xyz || { x: 0, y: 0, z: 0 }}
            rotationValue={inertial.origin?.rpy || { r: 0, p: 0, y: 0 }}
            compact={false}
            onPositionChange={(xyz) => onUpdate('link', selection.id!, {
              ...data,
              inertial: {
                ...inertial,
                origin: {
                  xyz: xyz as { x: number; y: number; z: number },
                  rpy: inertial.origin?.rpy || { r: 0, p: 0, y: 0 },
                },
              },
            })}
            onRotationChange={(rpy) => onUpdate('link', selection.id!, {
              ...data,
              inertial: {
                ...inertial,
                origin: {
                  xyz: inertial.origin?.xyz || { x: 0, y: 0, z: 0 },
                  rpy,
                },
              },
            })}
          />
        </div>
      </div>

      <div className="mt-3 border-t border-border-black/60 pt-2">
        <h4 className="mb-2 text-[10px] font-bold uppercase text-text-tertiary">{t.inertiaTensor}</h4>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {inertiaTensorFields.map((field) => (
            <InlineInputGroup key={field} label={field} labelWidthClassName="w-7" className="mb-0">
              <NumberInput
                value={inertial.inertia[field]}
                onChange={(v) => onUpdate('link', selection.id!, {
                  ...data,
                  inertial: { ...inertial, inertia: { ...inertial.inertia, [field]: v } }
                })}
              />
            </InlineInputGroup>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border-black/60">
        <div className="bg-element-bg/70 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-text-secondary">
          {t.derivedValues}
        </div>
        <div className="space-y-2 border-t border-border-black/60 bg-panel-bg px-1.5 py-1.5">
          <InlineInputGroup label={densityLabel} labelWidthClassName="w-16" align="start">
            <ReadonlyValueField>
              {formatReadonlyNumber(densityResult.value)}
            </ReadonlyValueField>
          </InlineInputGroup>

          <InputGroup label={t.diagonalInertia}>
            <div
              className="grid items-center gap-x-1 gap-y-1"
              style={{ gridTemplateColumns: 'max-content minmax(0, 1fr) max-content minmax(0, 1fr) max-content minmax(0, 1fr)' }}
            >
              {diagonalInertiaLabels.map((label, index) => (
                <React.Fragment key={label}>
                  <span className="whitespace-nowrap text-[8px] font-semibold leading-4 text-text-tertiary">
                    {label}
                  </span>
                  <ReadonlyValueField className="justify-center text-center">
                    {formatReadonlyNumber(derivedInertial?.diagonalInertia[index])}
                  </ReadonlyValueField>
                </React.Fragment>
              ))}
            </div>
          </InputGroup>

          <InputGroup label={t.principalAxes} className="mb-0">
            <div className="space-y-1.5">
              <ReadonlyVectorStatHeader />
              {['A1', 'A2', 'A3'].map((label, index) => {
                const axis = derivedInertial?.principalAxes[index];
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
          </InputGroup>
        </div>
      </div>
    </StaticSection>
  );

  return (
    <>
      {/* Name (Skeleton & Hardware Mode) */}
      {mode !== 'detail' && (
        nameField
      )}

      {/* Detail Mode: Visual & Collision Tabs */}
      {mode === 'detail' && (
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
          </div>

          {/* Visual Tab Content - always mounted to preserve snapshot cache */}
          <DetailGeometryTabPanel activeTab={linkTab} tab="visual">
            {nameField}

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
          </DetailGeometryTabPanel>

          {/* Collision Tab Content - always mounted to preserve snapshot cache */}
          <DetailGeometryTabPanel activeTab={linkTab} tab="collision">
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
          </DetailGeometryTabPanel>
        </div>
      )}
      {mode === 'detail' && linkTab === 'visual' && inertialSection}

      {mode === 'hardware' && inertialSection}
    </>
  );
};
