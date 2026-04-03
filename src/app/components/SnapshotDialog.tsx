import React, { useEffect, useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button, Select, type SelectOption } from '@/shared/components/ui';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import {
  DEFAULT_SNAPSHOT_CAPTURE_OPTIONS,
  type SnapshotCaptureOptions,
} from '@/shared/components/3d';
import { translations, type Language } from '@/shared/i18n';

const SNAPSHOT_RESOLUTION_OPTIONS = [
  { value: '1280', label: '720p' },
  { value: '1920', label: '1080p' },
  { value: '2560', label: '2K' },
  { value: '3840', label: '4K' },
  { value: '7680', label: '8K' },
] as const;

const PANEL_SECTION_CLASS_NAME =
  'rounded-lg border border-border-black bg-panel-bg px-3 py-2 shadow-sm';
const FIELD_ROW_CLASS_NAME = 'grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2';
const FIELD_LABEL_CLASS_NAME =
  'truncate text-[10px] font-medium tracking-[0.01em] text-text-secondary';
const FIELD_SELECT_CLASS_NAME = [
  'h-[25px]',
  'rounded-md',
  'border-border-black',
  'bg-input-bg',
  'px-2',
  'pr-6',
  'text-[12px]',
  'font-medium',
  'leading-none',
  'shadow-sm',
  'focus:border-system-blue',
  'focus:ring-1',
  'focus:ring-system-blue/30',
].join(' ');

interface SnapshotDialogProps {
  isOpen: boolean;
  isCapturing: boolean;
  lang: Language;
  onClose: () => void;
  onCapture: (options: SnapshotCaptureOptions) => Promise<void> | void;
}

interface SnapshotToggleOption<T extends string | number | boolean> {
  value: T;
  label: string;
  disabled?: boolean;
}

function SnapshotSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={PANEL_SECTION_CLASS_NAME}>
      <div className="mb-1.5 text-[10px] font-semibold tracking-[0.02em] text-text-tertiary">
        {title}
      </div>
      {children}
    </div>
  );
}

function SnapshotField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={FIELD_ROW_CLASS_NAME}>
      <div className={FIELD_LABEL_CLASS_NAME}>{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SnapshotToggleGroup<T extends string | number | boolean>({
  value,
  options,
  disabled = false,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<SnapshotToggleOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border-black bg-input-bg shadow-sm">
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled || option.disabled}
            onClick={() => {
              if (!disabled && !option.disabled) {
                onChange(option.value);
              }
            }}
            className={[
              'h-[25px] min-w-0 flex-1 border-l border-border-black px-2 text-[11px] font-medium transition-colors duration-150 first:border-l-0',
              disabled || option.disabled ? 'cursor-not-allowed opacity-45' : '',
              isSelected
                ? 'bg-element-bg text-text-primary'
                : 'bg-transparent text-text-secondary hover:bg-element-hover hover:text-text-primary',
            ].join(' ')}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SnapshotDialog({
  isOpen,
  isCapturing,
  lang,
  onClose,
  onCapture,
}: SnapshotDialogProps) {
  const t = translations[lang];
  const [resolutionPreset, setResolutionPreset] = useState(
    String(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.longEdgePx),
  );
  const [imageFormat, setImageFormat] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.imageFormat);
  const [imageQuality, setImageQuality] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.imageQuality);
  const [detailLevel, setDetailLevel] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.detailLevel);
  const [environmentPreset, setEnvironmentPreset] = useState(
    DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.environmentPreset,
  );
  const [shadowStyle, setShadowStyle] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.shadowStyle);
  const [groundStyle, setGroundStyle] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.groundStyle);
  const [dofMode, setDofMode] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.dofMode);
  const [backgroundStyle, setBackgroundStyle] = useState(
    DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.backgroundStyle,
  );
  const [hideGrid, setHideGrid] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.hideGrid);

  const windowState = useDraggableWindow({
    isOpen,
    defaultSize: { width: 560, height: 332 },
    minSize: { width: 500, height: 308 },
    centerOnMount: true,
    enableMinimize: false,
    enableMaximize: false,
    clampResizeToViewport: true,
    dragBounds: {
      allowNegativeX: false,
      minVisibleWidth: 280,
      topMargin: 12,
      bottomMargin: 56,
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setResolutionPreset(String(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.longEdgePx));
    setImageFormat(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.imageFormat);
    setImageQuality(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.imageQuality);
    setDetailLevel(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.detailLevel);
    setEnvironmentPreset(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.environmentPreset);
    setShadowStyle(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.shadowStyle);
    setGroundStyle(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.groundStyle);
    setDofMode(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.dofMode);
    setBackgroundStyle(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.backgroundStyle);
    setHideGrid(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.hideGrid);
  }, [isOpen]);

  useEffect(() => {
    if (imageFormat === 'jpeg' && backgroundStyle === 'transparent') {
      setBackgroundStyle(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.backgroundStyle);
    }
  }, [backgroundStyle, imageFormat]);

  useEffect(() => {
    if (backgroundStyle === 'transparent' && dofMode !== 'off') {
      setDofMode('off');
    }
  }, [backgroundStyle, dofMode]);

  const resolvedOptions = useMemo<SnapshotCaptureOptions>(
    () => ({
      longEdgePx: Number(resolutionPreset),
      imageFormat,
      imageQuality,
      detailLevel,
      environmentPreset,
      shadowStyle,
      groundStyle,
      dofMode,
      backgroundStyle,
      hideGrid,
    }),
    [
      backgroundStyle,
      detailLevel,
      dofMode,
      environmentPreset,
      groundStyle,
      hideGrid,
      imageFormat,
      imageQuality,
      resolutionPreset,
      shadowStyle,
    ],
  );

  const supportsLossyCompression = imageFormat !== 'png';
  const resolutionOptions = useMemo<SelectOption[]>(
    () =>
      SNAPSHOT_RESOLUTION_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [],
  );
  const formatOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'png', label: t.snapshotFormatPng },
      { value: 'jpeg', label: t.snapshotFormatJpeg },
      { value: 'webp', label: t.snapshotFormatWebp },
    ],
    [t],
  );
  const environmentOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'viewport', label: t.snapshotEnvironmentViewport },
      { value: 'studio', label: t.snapshotEnvironmentStudio },
      { value: 'city', label: t.snapshotEnvironmentCity },
      { value: 'contrast', label: t.snapshotEnvironmentContrast },
    ],
    [t],
  );
  const backgroundOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [
      { value: 'viewport', label: t.snapshotBackgroundViewport },
      { value: 'studio', label: t.snapshotBackgroundStudio },
      { value: 'sky', label: t.snapshotBackgroundSky },
      { value: 'dark', label: t.snapshotBackgroundDark },
    ];

    if (imageFormat !== 'jpeg') {
      options.push({ value: 'transparent', label: t.snapshotBackgroundTransparent });
    }

    return options;
  }, [imageFormat, t]);
  const shadowOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'soft', label: t.snapshotShadowSoft },
      { value: 'balanced', label: t.snapshotShadowBalanced },
      { value: 'crisp', label: t.snapshotShadowCrisp },
    ],
    [t],
  );
  const groundOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'shadow', label: t.snapshotFloorShadow },
      { value: 'contact', label: t.snapshotFloorContact },
      { value: 'reflective', label: t.snapshotFloorReflective },
    ],
    [t],
  );
  const dofOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [{ value: 'off', label: t.snapshotDofOff }];

    if (backgroundStyle !== 'transparent') {
      options.push(
        { value: 'subtle', label: t.snapshotDofSubtle },
        { value: 'hero', label: t.snapshotDofHero },
      );
    }

    return options;
  }, [backgroundStyle, t]);
  const antialiasOptions = useMemo<
    ReadonlyArray<SnapshotToggleOption<SnapshotCaptureOptions['detailLevel']>>
  >(
    () => [
      { value: 'viewport', label: '1x AA' },
      { value: 'high', label: '2x AA' },
      { value: 'ultra', label: '4x AA' },
    ],
    [],
  );
  const compressionOptions = useMemo<ReadonlyArray<SnapshotToggleOption<number | 'lossless'>>>(
    () =>
      supportsLossyCompression
        ? [
            { value: 60, label: t.compressionLevelCompact },
            { value: 80, label: t.compressionLevelBalanced },
            { value: 96, label: t.compressionLevelPreserve },
          ]
        : [{ value: 'lossless', label: t.snapshotCompressionLossless, disabled: true }],
    [supportsLossyCompression, t],
  );
  const gridOptions = useMemo<ReadonlyArray<SnapshotToggleOption<boolean>>>(
    () => [
      { value: false, label: lang === 'zh' ? '显示' : 'Show' },
      { value: true, label: lang === 'zh' ? '隐藏' : 'Hide' },
    ],
    [lang],
  );
  const compactLabels = useMemo(
    () => ({
      output: lang === 'zh' ? '输出' : 'Output',
      scene: lang === 'zh' ? '场景' : 'Scene',
      resolution: lang === 'zh' ? '分辨率' : 'Resolution',
      format: lang === 'zh' ? '格式' : 'Format',
      aa: 'AA',
      quality: lang === 'zh' ? '压缩' : 'Compression',
      lighting: lang === 'zh' ? '灯光' : 'Lighting',
      background: lang === 'zh' ? '背景' : 'Background',
      shadow: lang === 'zh' ? '阴影' : 'Shadow',
      ground: lang === 'zh' ? '地面' : 'Ground',
      dof: lang === 'zh' ? '景深' : 'DoF',
      grid: lang === 'zh' ? '网格' : 'Grid',
    }),
    [lang],
  );
  const selectedAntialiasOption =
    antialiasOptions.find((option) => option.value === detailLevel) ?? antialiasOptions[1];
  const selectedResolutionLabel =
    SNAPSHOT_RESOLUTION_OPTIONS.find((option) => option.value === resolutionPreset)?.label ??
    `${resolutionPreset}px`;
  const captureSummary = [
    selectedResolutionLabel,
    imageFormat.toUpperCase(),
    selectedAntialiasOption.label,
  ].join(' · ');
  const compressionPreset = supportsLossyCompression
    ? imageQuality >= 90
      ? 96
      : imageQuality >= 70
        ? 80
        : 60
    : 'lossless';

  if (!isOpen) {
    return null;
  }

  return (
    <DraggableWindow
      window={windowState}
      onClose={() => {
        if (!isCapturing) {
          onClose();
        }
      }}
      title={
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border-black bg-panel-bg p-1 text-system-blue shadow-sm">
            <Camera className="h-3 w-3" />
          </div>
          <div className="text-[12px] font-semibold tracking-[0.01em] text-text-primary">
            {t.snapshotCapture}
          </div>
        </div>
      }
      className="z-[95] overflow-hidden rounded-2xl border border-border-black bg-panel-bg text-text-primary shadow-xl pointer-events-auto"
      headerClassName="flex h-10 items-center justify-between border-b border-border-black bg-element-bg px-3"
      headerDraggableClassName="cursor-grab"
      headerDraggingClassName="cursor-grabbing"
      interactionClassName="select-none"
      controlButtonClassName="rounded-md p-1 text-text-tertiary transition-colors hover:bg-panel-bg hover:text-text-primary"
      closeButtonClassName="rounded-md p-1 text-text-tertiary transition-colors hover:bg-danger hover:text-white"
      controlIcons={{ close: <X className="h-3.5 w-3.5" /> }}
      showMinimizeButton={false}
      showMaximizeButton={false}
      showResizeHandles
      leftResizeHandleClassName="hidden"
      rightResizeHandleClassName="absolute right-0 top-0 bottom-3 w-2 cursor-ew-resize transition-colors hover:bg-system-blue/15 active:bg-system-blue/20 z-20"
      bottomResizeHandleClassName="absolute bottom-0 left-0 right-3 h-2 cursor-ns-resize transition-colors hover:bg-system-blue/15 active:bg-system-blue/20 z-20"
      cornerResizeHandleClassName="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize transition-colors hover:bg-system-blue/20 active:bg-system-blue/25 z-30"
      cornerResizeHandle={
        <div className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-border-strong/80" />
      }
      closeTitle={t.close}
    >
      <div className="flex h-[calc(100%-40px)] min-h-0 flex-col overflow-hidden bg-panel-bg">
        <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto px-2.5 py-2">
          <SnapshotSection title={compactLabels.output}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <SnapshotField label={compactLabels.resolution}>
                <Select
                  value={resolutionPreset}
                  options={resolutionOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) => setResolutionPreset(event.target.value)}
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.format}>
                <Select
                  value={imageFormat}
                  options={formatOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) =>
                    setImageFormat(event.target.value as SnapshotCaptureOptions['imageFormat'])
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.aa}>
                <SnapshotToggleGroup
                  value={detailLevel}
                  options={antialiasOptions}
                  disabled={isCapturing}
                  onChange={(value) =>
                    setDetailLevel(value as SnapshotCaptureOptions['detailLevel'])
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.quality}>
                <SnapshotToggleGroup
                  value={compressionPreset}
                  options={compressionOptions}
                  disabled={isCapturing || !supportsLossyCompression}
                  onChange={(value) => {
                    if (typeof value === 'number') {
                      setImageQuality(value);
                    }
                  }}
                />
              </SnapshotField>
            </div>
          </SnapshotSection>

          <SnapshotSection title={compactLabels.scene}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <SnapshotField label={compactLabels.lighting}>
                <Select
                  value={environmentPreset}
                  options={environmentOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) =>
                    setEnvironmentPreset(
                      event.target.value as SnapshotCaptureOptions['environmentPreset'],
                    )
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.background}>
                <Select
                  value={backgroundStyle}
                  options={backgroundOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) =>
                    setBackgroundStyle(
                      event.target.value as SnapshotCaptureOptions['backgroundStyle'],
                    )
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.shadow}>
                <Select
                  value={shadowStyle}
                  options={shadowOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) =>
                    setShadowStyle(event.target.value as SnapshotCaptureOptions['shadowStyle'])
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.ground}>
                <Select
                  value={groundStyle}
                  options={groundOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) =>
                    setGroundStyle(event.target.value as SnapshotCaptureOptions['groundStyle'])
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.dof}>
                <Select
                  value={dofMode}
                  options={dofOptions}
                  disabled={isCapturing}
                  className={FIELD_SELECT_CLASS_NAME}
                  onChange={(event) =>
                    setDofMode(event.target.value as SnapshotCaptureOptions['dofMode'])
                  }
                />
              </SnapshotField>
              <SnapshotField label={compactLabels.grid}>
                <SnapshotToggleGroup
                  value={hideGrid}
                  options={gridOptions}
                  disabled={isCapturing}
                  onChange={(value) => setHideGrid(value)}
                />
              </SnapshotField>
            </div>
          </SnapshotSection>
        </div>

        <div className="shrink-0 border-t border-border-black bg-element-bg/95 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate text-[10px] font-medium text-text-secondary">
              {captureSummary}
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isCapturing}
                className="h-[26px] rounded-lg px-2.5 text-[11px]"
              >
                {t.close}
              </Button>
              <Button
                type="button"
                onClick={() => void onCapture(resolvedOptions)}
                isLoading={isCapturing}
                disabled={isCapturing}
                icon={<Camera className="h-3 w-3" />}
                className="h-[26px] min-w-[118px] rounded-lg px-3 text-[11px]"
              >
                {isCapturing ? t.snapshotCapturing : t.snapshotCapture}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
}

export default SnapshotDialog;
