import React, { useState, useCallback } from 'react';
import { Upload, Package, FileCode, Layers, Lock, Braces } from 'lucide-react';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import { translations, type TranslationKeys } from '@/shared/i18n';
import type { MjcfActuatorType } from '@/core/parsers/mjcf/mjcfGenerator';

export type ExportFormat = 'mjcf' | 'urdf' | 'xacro' | 'usd';

export interface MjcfExportConfig {
  meshdir: string;
  addFloatBase: boolean;
  includeActuators: boolean;
  actuatorType: MjcfActuatorType;
  includeMeshes: boolean;
  compressSTL: boolean;
  stlQuality: number;
}

export interface UrdfExportConfig {
  includeExtended: boolean;
  includeBOM: boolean;
  useRelativePaths: boolean;
  includeMeshes: boolean;
  compressSTL: boolean;
  stlQuality: number;
}

export type RosVersion = 'ros1' | 'ros2';
export type RosHwInterface = 'effort' | 'position' | 'velocity';

export interface XacroExportConfig {
  rosVersion: RosVersion;
  rosHardwareInterface: RosHwInterface;
  useRelativePaths: boolean;
  includeMeshes: boolean;
  compressSTL: boolean;
  stlQuality: number;
}

export interface ExportDialogConfig {
  format: ExportFormat;
  mjcf: MjcfExportConfig;
  urdf: UrdfExportConfig;
  xacro: XacroExportConfig;
}

const MJCF_SUPPORTS = ['MuJoCo', 'Motphys', 'Genesis'];
const URDF_SUPPORTS = ['Isaac Sim', 'Isaac Gym', 'Genesis', 'PyBullet', 'ManiSkill', 'Motphys'];
const XACRO_SUPPORTS = ['Gazebo', 'ROS1', 'ROS2'];

const DEFAULT_CONFIG: ExportDialogConfig = {
  format: 'mjcf',
  mjcf: {
    meshdir: 'meshes/',
    addFloatBase: false,
    includeActuators: true,
    actuatorType: 'position',
    includeMeshes: true,
    compressSTL: false,
    stlQuality: 50,
  },
  urdf: {
    includeExtended: false,
    includeBOM: false,
    useRelativePaths: true,
    includeMeshes: true,
    compressSTL: false,
    stlQuality: 50,
  },
  xacro: {
    rosVersion: 'ros2',
    rosHardwareInterface: 'effort',
    useRelativePaths: true,
    includeMeshes: true,
    compressSTL: false,
    stlQuality: 50,
  },
};

interface ExportDialogProps {
  onClose: () => void;
  onExport: (config: ExportDialogConfig) => void;
  lang: 'en' | 'zh';
  isExporting?: boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] uppercase tracking-widest font-semibold text-text-tertiary mb-1.5 mt-3 first:mt-0">
      {children}
    </div>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border-black last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] text-text-primary leading-tight">{label}</span>
        {desc && <span className="text-[9px] text-text-tertiary leading-tight">{desc}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        value ? 'bg-system-blue' : 'bg-switch-off'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-transform ${
          value ? 'translate-x-4 bg-white' : 'translate-x-0 bg-white dark:bg-element-bg'
        }`}
      />
    </button>
  );
}

function SelectField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-input-bg border border-border-black text-text-primary text-xs rounded-md px-2 py-1 focus:ring-2 focus:ring-system-blue/25 focus:border-system-blue transition-all"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}


function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 bg-input-bg border border-border-black text-text-primary text-xs rounded-md px-2 py-1 focus:ring-2 focus:ring-system-blue/25 focus:border-system-blue transition-all"
    />
  );
}

const STL_QUALITY_PRESETS = [
  { key: 'none', quality: 100, compress: false },
  { key: 'light', quality: 75, compress: true },
  { key: 'medium', quality: 50, compress: true },
  { key: 'high', quality: 25, compress: true },
] as const;

type StlPresetKey = typeof STL_QUALITY_PRESETS[number]['key'];

function getStlPreset(compressSTL: boolean, stlQuality: number): StlPresetKey {
  if (!compressSTL) return 'none';
  if (stlQuality >= 75) return 'light';
  if (stlQuality >= 50) return 'medium';
  return 'high';
}

function STLQualitySelector({
  compressSTL,
  stlQuality,
  t,
  onCompressChange,
  onQualityChange,
}: {
  compressSTL: boolean;
  stlQuality: number;
  t: TranslationKeys;
  onCompressChange: (v: boolean) => void;
  onQualityChange: (v: number) => void;
}) {
  const active = getStlPreset(compressSTL, stlQuality);
  const presetLabels: Record<StlPresetKey, string> = {
    none: t.stlQualityOriginal,
    light: t.stlQualityLight,
    medium: t.stlQualityMedium,
    high: t.stlQualityHigh,
  };
  return (
    <div className="py-2">
      <div className="text-xs text-text-primary mb-0.5">
        {t.stlMeshQuality}
      </div>
      <div className="text-[10px] text-text-tertiary mb-2">
        {t.stlMeshQualityDesc}
      </div>
      <div className="flex gap-1 p-1 bg-segmented-bg rounded-xl border border-border-black">
        {STL_QUALITY_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              onCompressChange(p.compress);
              if (p.compress) onQualityChange(p.quality);
            }}
            className={`flex-1 py-1 px-2.5 text-xs rounded-lg transition-all font-medium ${
              active === p.key
                ? 'bg-white dark:bg-segmented-active text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-element-hover'
            }`}
          >
            {presetLabels[p.key]}
          </button>
        ))}
      </div>
    </div>
  );
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  onClose,
  onExport,
  lang,
  isExporting = false,
}) => {
  const t = translations[lang];
  const [config, setConfig] = useState<ExportDialogConfig>(DEFAULT_CONFIG);

  const windowState = useDraggableWindow({
    defaultSize: { width: 440, height: 560 },
    minSize: { width: 380, height: 440 },
    centerOnMount: true,
    enableMinimize: false,
    enableMaximize: false,
  });

  const setFormat = useCallback((fmt: ExportFormat) => {
    if (fmt === 'usd') return;
    setConfig((prev) => ({ ...prev, format: fmt }));
  }, []);

  const updateMjcf = useCallback(<K extends keyof MjcfExportConfig>(key: K, value: MjcfExportConfig[K]) => {
    setConfig((prev) => ({ ...prev, mjcf: { ...prev.mjcf, [key]: value } }));
  }, []);

  const updateUrdf = useCallback(<K extends keyof UrdfExportConfig>(key: K, value: UrdfExportConfig[K]) => {
    setConfig((prev) => ({ ...prev, urdf: { ...prev.urdf, [key]: value } }));
  }, []);

  const updateXacro = useCallback(<K extends keyof XacroExportConfig>(key: K, value: XacroExportConfig[K]) => {
    setConfig((prev) => ({ ...prev, xacro: { ...prev.xacro, [key]: value } }));
  }, []);

  const actuatorTypeOptions = [
    { value: 'position', label: t.exportActuatorPosition },
    { value: 'velocity', label: t.exportActuatorVelocity },
    { value: 'motor', label: t.exportActuatorMotor },
  ];

  const formatExt = config.format === 'mjcf' ? '.xml' : config.format === 'xacro' ? '.urdf.xacro' : '.urdf';

  return (
    <>
      <DraggableWindow
        window={windowState}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-element-bg text-text-secondary border border-border-black">
              <Upload className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-text-primary">{t.exportDialog}</span>
          </div>
        }
        className="z-[100] bg-panel-bg flex flex-col text-text-primary overflow-hidden rounded-2xl shadow-xl border border-border-black"
        headerClassName="h-10 border-b border-border-black flex items-center justify-between px-3 bg-element-bg shrink-0"
        interactionClassName="select-none"
        headerDraggableClassName="cursor-grab"
        headerDraggingClassName="cursor-grabbing"
        showMinimizeButton={false}
        showMaximizeButton={false}
        closeTitle={t.close}
        closeButtonClassName="p-1.5 text-text-tertiary hover:bg-red-500 hover:text-white rounded transition-colors"
        showResizeHandles={true}
      >
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">

          {/* Format Selector */}
          <SectionLabel>{t.exportFormat}</SectionLabel>
          <div className="flex gap-1 p-1 bg-segmented-bg rounded-xl border border-border-black">
            {(['mjcf', 'urdf', 'xacro', 'usd'] as ExportFormat[]).map((fmt) => {
              const isDisabled = fmt === 'usd';
              const isActive = config.format === fmt;
              const label: Record<ExportFormat, string> = { mjcf: t.exportFormatMJCF, urdf: t.exportFormatURDF, xacro: 'Xacro', usd: t.exportFormatUSD };
              return (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  disabled={isDisabled}
                  className={`relative flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-medium transition-all ${
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed text-text-tertiary'
                      : isActive
                      ? 'bg-white dark:bg-segmented-active text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-element-hover'
                  }`}
                >
                  {fmt === 'mjcf' && <FileCode className="w-3.5 h-3.5" />}
                  {fmt === 'urdf' && <Layers className="w-3.5 h-3.5" />}
                  {fmt === 'xacro' && <Braces className="w-3.5 h-3.5" />}
                  {fmt === 'usd' && <Package className="w-3.5 h-3.5" />}
                  <span>{label[fmt]}</span>
                  {isDisabled && (
                    <span className="absolute -top-1.5 -right-1 bg-element-hover text-text-tertiary text-[8px] px-1 py-0.5 rounded border border-border-black flex items-center gap-0.5">
                      <Lock className="w-2 h-2" />{t.exportComingSoon}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Compatible simulators */}
          <div className="flex flex-wrap gap-1 pt-1 pb-0.5">
            {(config.format === 'mjcf' ? MJCF_SUPPORTS : config.format === 'urdf' ? URDF_SUPPORTS : config.format === 'xacro' ? XACRO_SUPPORTS : []).map((name) => (
              <span key={name} className="px-2 py-0.5 bg-element-bg border border-border-black rounded-full text-[10px] text-text-tertiary">
                {name}
              </span>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-border-black my-3" />

          {/* MJCF Options */}
          {config.format === 'mjcf' && (
            <>
              <SectionLabel>{t.exportOptionsSection}</SectionLabel>
              <div className="bg-element-bg rounded-xl border border-border-black px-3 divide-y divide-border-black">
                <Row label={t.exportMeshdir}>
                  <TextField
                    value={config.mjcf.meshdir}
                    onChange={(v) => updateMjcf('meshdir', v)}
                    placeholder="meshes/"
                  />
                </Row>
                <Row label={t.exportFloatBase} desc={t.exportFloatBaseDesc}>
                  <Toggle value={config.mjcf.addFloatBase} onChange={(v) => updateMjcf('addFloatBase', v)} />
                </Row>
                <Row label={t.exportIncludeActuators}>
                  <Toggle value={config.mjcf.includeActuators} onChange={(v) => updateMjcf('includeActuators', v)} />
                </Row>
                {config.mjcf.includeActuators && (
                  <Row label={t.exportActuatorType}>
                    <SelectField
                      value={config.mjcf.actuatorType}
                      options={actuatorTypeOptions}
                      onChange={(v) => updateMjcf('actuatorType', v as MjcfActuatorType)}
                    />
                  </Row>
                )}
              </div>

              <SectionLabel>{t.exportOutputSection}</SectionLabel>
              <div className="bg-element-bg rounded-xl border border-border-black px-3 divide-y divide-border-black">
                <Row label={t.exportIncludeMeshes}>
                  <Toggle value={config.mjcf.includeMeshes} onChange={(v) => updateMjcf('includeMeshes', v)} />
                </Row>
                {config.mjcf.includeMeshes && (
                  <STLQualitySelector
                    compressSTL={config.mjcf.compressSTL}
                    stlQuality={config.mjcf.stlQuality}
                    t={t}
                    onCompressChange={(v) => updateMjcf('compressSTL', v)}
                    onQualityChange={(v) => updateMjcf('stlQuality', v)}
                  />
                )}
              </div>
            </>
          )}

          {/* URDF Options */}
          {config.format === 'urdf' && (
            <>
              <SectionLabel>{t.exportOptionsSection}</SectionLabel>
              <div className="bg-element-bg rounded-xl border border-border-black px-3 divide-y divide-border-black">
                <Row label={t.exportIncludeExtended} desc={t.exportIncludeExtendedDesc}>
                  <Toggle value={config.urdf.includeExtended} onChange={(v) => updateUrdf('includeExtended', v)} />
                </Row>
                <Row label={t.exportIncludeBOM} desc={t.exportIncludeBOMDesc}>
                  <Toggle value={config.urdf.includeBOM} onChange={(v) => updateUrdf('includeBOM', v)} />
                </Row>
                <Row label={t.exportRelativePaths} desc={t.exportRelativePathsDesc}>
                  <Toggle value={config.urdf.useRelativePaths} onChange={(v) => updateUrdf('useRelativePaths', v)} />
                </Row>
              </div>
              <SectionLabel>{t.exportOutputSection}</SectionLabel>
              <div className="bg-element-bg rounded-xl border border-border-black px-3 divide-y divide-border-black">
                <Row label={t.exportIncludeMeshes}>
                  <Toggle value={config.urdf.includeMeshes} onChange={(v) => updateUrdf('includeMeshes', v)} />
                </Row>
                {config.urdf.includeMeshes && (
                  <STLQualitySelector
                    compressSTL={config.urdf.compressSTL}
                    stlQuality={config.urdf.stlQuality}
                    t={t}
                    onCompressChange={(v) => updateUrdf('compressSTL', v)}
                    onQualityChange={(v) => updateUrdf('stlQuality', v)}
                  />
                )}
              </div>
            </>
          )}

          {/* Xacro Options */}
          {config.format === 'xacro' && (
            <>
              <SectionLabel>{t.exportOptionsSection}</SectionLabel>
              <div className="bg-element-bg rounded-xl border border-border-black px-3 divide-y divide-border-black">
                <Row label={t.rosVersion}>
                  <div className="flex gap-1 p-1 bg-segmented-bg rounded-xl border border-border-black">
                    {(['ros1', 'ros2'] as RosVersion[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => updateXacro('rosVersion', v)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          config.xacro.rosVersion === v
                            ? 'bg-white dark:bg-segmented-active text-text-primary shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row
                  label={t.hardwareInterface}
                  desc={config.xacro.rosVersion === 'ros1' ? 'hardware_interface/...' : 'command_interface name'}
                >
                  <SelectField
                    value={config.xacro.rosHardwareInterface}
                    options={[
                      { value: 'effort', label: t.hardwareInterfaceEffort },
                      { value: 'position', label: t.hardwareInterfacePosition },
                      { value: 'velocity', label: t.hardwareInterfaceVelocity },
                    ]}
                    onChange={(v) => updateXacro('rosHardwareInterface', v as RosHwInterface)}
                  />
                </Row>
                <Row label={t.exportRelativePaths} desc={t.exportRelativePathsDesc}>
                  <Toggle value={config.xacro.useRelativePaths} onChange={(v) => updateXacro('useRelativePaths', v)} />
                </Row>
              </div>
              <SectionLabel>{t.exportOutputSection}</SectionLabel>
              <div className="bg-element-bg rounded-xl border border-border-black px-3 divide-y divide-border-black">
                <Row label={t.exportIncludeMeshes}>
                  <Toggle value={config.xacro.includeMeshes} onChange={(v) => updateXacro('includeMeshes', v)} />
                </Row>
                {config.xacro.includeMeshes && (
                  <STLQualitySelector
                    compressSTL={config.xacro.compressSTL}
                    stlQuality={config.xacro.stlQuality}
                    t={t}
                    onCompressChange={(v) => updateXacro('compressSTL', v)}
                    onQualityChange={(v) => updateXacro('stlQuality', v)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-border-black bg-element-bg">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-text-tertiary text-[10px]">
              {config.format === 'mjcf' ? <FileCode className="w-4 h-4" /> : config.format === 'xacro' ? <Braces className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
              <span className="font-mono">{formatExt} + meshes → .zip</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => onExport(config)}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-system-blue-solid hover:bg-system-blue text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              {isExporting ? t.exporting : t.exportDoExport}
            </button>
          </div>
        </div>
      </DraggableWindow>
    </>
  );
};
