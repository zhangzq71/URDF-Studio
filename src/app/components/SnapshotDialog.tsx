import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronRight } from 'lucide-react';
import {
  Button,
  Checkbox,
  Select,
  SegmentedControl,
  Slider,
  type SelectOption,
  type SliderMark,
} from '@/shared/components/ui';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import {
  DEFAULT_SNAPSHOT_CAPTURE_OPTIONS,
  SNAPSHOT_IMAGE_QUALITY_MAX,
  SNAPSHOT_IMAGE_QUALITY_MIN,
  SNAPSHOT_IMAGE_QUALITY_STEP,
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

const FIELD_SELECT_CLASS_NAME = 'h-7 rounded-lg px-2.5 pr-8 text-[11px] leading-tight';
const FIELD_SELECT_LABEL_CLASS_NAME = 'mb-1 text-[10px] font-semibold tracking-[0.01em] text-text-secondary';

interface SnapshotDialogProps {
  isOpen: boolean;
  isCapturing: boolean;
  lang: Language;
  onClose: () => void;
  onCapture: (options: SnapshotCaptureOptions) => Promise<void> | void;
}

interface SnapshotAntialiasOption {
  value: SnapshotCaptureOptions['detailLevel'];
  label: string;
  hint: string;
}

function SnapshotSection({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border-black bg-element-bg/65 p-2.5 ${className}`.trim()}>
      {children}
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
  const [resolutionPreset, setResolutionPreset] = useState(String(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.longEdgePx));
  const [imageFormat, setImageFormat] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.imageFormat);
  const [imageQuality, setImageQuality] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.imageQuality);
  const [detailLevel, setDetailLevel] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.detailLevel);
  const [environmentPreset, setEnvironmentPreset] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.environmentPreset);
  const [shadowStyle, setShadowStyle] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.shadowStyle);
  const [groundStyle, setGroundStyle] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.groundStyle);
  const [dofMode, setDofMode] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.dofMode);
  const [backgroundStyle, setBackgroundStyle] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.backgroundStyle);
  const [hideGrid, setHideGrid] = useState(DEFAULT_SNAPSHOT_CAPTURE_OPTIONS.hideGrid);
  const [showAdvancedLook, setShowAdvancedLook] = useState(false);

  const windowState = useDraggableWindow({
    isOpen,
    defaultSize: { width: 340, height: 400 },
    minSize: { width: 320, height: 380 },
    centerOnMount: true,
    enableMinimize: false,
    enableMaximize: false,
    clampResizeToViewport: true,
    dragBounds: {
      allowNegativeX: false,
      minVisibleWidth: 240,
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
    setShowAdvancedLook(false);
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

  const resolvedOptions = useMemo<SnapshotCaptureOptions>(() => ({
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
  }), [
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
  ]);

  const supportsLossyCompression = imageFormat !== 'png';
  const resolutionOptions = useMemo<SelectOption[]>(
    () => SNAPSHOT_RESOLUTION_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    [],
  );
  const formatOptions = useMemo<SelectOption[]>(() => ([
    { value: 'png', label: t.snapshotFormatPng },
    { value: 'jpeg', label: t.snapshotFormatJpeg },
    { value: 'webp', label: t.snapshotFormatWebp },
  ]), [t]);
  const environmentOptions = useMemo<SelectOption[]>(() => ([
    { value: 'viewport', label: t.snapshotEnvironmentViewport },
    { value: 'studio', label: t.snapshotEnvironmentStudio },
    { value: 'city', label: t.snapshotEnvironmentCity },
    { value: 'contrast', label: t.snapshotEnvironmentContrast },
  ]), [t]);
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
  const shadowOptions = useMemo<SelectOption[]>(() => ([
    { value: 'soft', label: t.snapshotShadowSoft },
    { value: 'balanced', label: t.snapshotShadowBalanced },
    { value: 'crisp', label: t.snapshotShadowCrisp },
  ]), [t]);
  const groundOptions = useMemo<SelectOption[]>(() => ([
    { value: 'shadow', label: t.snapshotFloorShadow },
    { value: 'contact', label: t.snapshotFloorContact },
    { value: 'reflective', label: t.snapshotFloorReflective },
  ]), [t]);
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
  const antialiasOptions = useMemo<SnapshotAntialiasOption[]>(() => ([
    {
      value: 'viewport',
      label: '1x AA',
      hint: t.snapshotDetailViewportHint,
    },
    {
      value: 'high',
      label: '2x AA',
      hint: t.snapshotDetailHighHint,
    },
    {
      value: 'ultra',
      label: '4x AA',
      hint: t.snapshotDetailUltraHint,
    },
  ]), [t]);
  const antialiasIndex = Math.max(
    0,
    antialiasOptions.findIndex((option) => option.value === detailLevel),
  );

  const selectedAntialiasOption = antialiasOptions[antialiasIndex] ?? antialiasOptions[1];
  const selectedResolutionLabel = SNAPSHOT_RESOLUTION_OPTIONS.find((option) => option.value === resolutionPreset)?.label ?? `${resolutionPreset}px`;
  const selectedShadowLabel = shadowOptions.find((option) => option.value === shadowStyle)?.label ?? t.snapshotShadowBalanced;
  const selectedGroundLabel = groundOptions.find((option) => option.value === groundStyle)?.label ?? t.snapshotFloorContact;
  const selectedDofLabel = dofOptions.find((option) => option.value === dofMode)?.label ?? t.snapshotDofOff;
  const captureSummary = [
    selectedResolutionLabel,
    imageFormat.toUpperCase(),
    supportsLossyCompression ? `Q${imageQuality}` : null,
    selectedAntialiasOption.label,
  ].filter(Boolean).join(' · ');
  const advancedLookSummary = `${selectedShadowLabel} · ${selectedGroundLabel} · ${selectedDofLabel}`;

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
      title={(
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-border-black bg-panel-bg p-1 text-system-blue shadow-sm">
            <Camera className="h-3 w-3" />
          </div>
          <div className="text-[13px] font-semibold text-text-primary">{t.snapshot}</div>
        </div>
      )}
      className="z-[95] overflow-hidden rounded-2xl border border-border-black bg-panel-bg text-text-primary shadow-2xl pointer-events-auto"
      headerClassName="flex h-10 items-center justify-between border-b border-border-black bg-element-bg px-3"
      headerDraggableClassName="cursor-grab"
      headerDraggingClassName="cursor-grabbing"
      interactionClassName="select-none"
      showMinimizeButton={false}
      showMaximizeButton={false}
      showResizeHandles={false}
      closeTitle={t.close}
    >
      <div className="flex h-[calc(100%-40px)] min-h-0 flex-col overflow-hidden bg-panel-bg">
        <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto px-3 py-3">
          <SnapshotSection>
            <div className="grid grid-cols-2 gap-1.5">
              <Select
                label={t.snapshotResolutionLongEdge}
                value={resolutionPreset}
                options={resolutionOptions}
                disabled={isCapturing}
                labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                className={FIELD_SELECT_CLASS_NAME}
                onChange={(event) => setResolutionPreset(event.target.value)}
              />
              <Select
                label={t.snapshotImageFormat}
                value={imageFormat}
                options={formatOptions}
                disabled={isCapturing}
                labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                className={FIELD_SELECT_CLASS_NAME}
                onChange={(event) => setImageFormat(event.target.value as SnapshotCaptureOptions['imageFormat'])}
              />
              <Select
                label={t.snapshotEnvironment}
                value={environmentPreset}
                options={environmentOptions}
                disabled={isCapturing}
                labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                className={FIELD_SELECT_CLASS_NAME}
                onChange={(event) => setEnvironmentPreset(event.target.value as SnapshotCaptureOptions['environmentPreset'])}
              />
              <Select
                label={t.snapshotBackground}
                value={backgroundStyle}
                options={backgroundOptions}
                disabled={isCapturing}
                labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                className={FIELD_SELECT_CLASS_NAME}
                onChange={(event) => setBackgroundStyle(event.target.value as SnapshotCaptureOptions['backgroundStyle'])}
              />
            </div>
          </SnapshotSection>

          <SnapshotSection className="space-y-3.5">
            <div>
              <div className={FIELD_SELECT_LABEL_CLASS_NAME}>
                {t.snapshotAAMode}
              </div>
              <SegmentedControl
                value={detailLevel}
                options={antialiasOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                onChange={(value) => setDetailLevel(value as SnapshotCaptureOptions['detailLevel'])}
                disabled={isCapturing}
                size="xs"
              />
              <div className="mt-2 text-[10px] leading-4 text-text-tertiary">
                {selectedAntialiasOption.hint}
              </div>
            </div>

            <div>
              <div className={FIELD_SELECT_LABEL_CLASS_NAME}>
                {t.snapshotCompressionQuality}
              </div>
              <SegmentedControl
                value={supportsLossyCompression ? (imageQuality >= 90 ? 96 : imageQuality >= 70 ? 80 : 60) : 'lossless'}
                options={supportsLossyCompression ? [
                  { value: 60, label: t.compressionLevelCompact },
                  { value: 80, label: t.compressionLevelBalanced },
                  { value: 96, label: t.compressionLevelPreserve },
                ] : [
                  { value: 'lossless', label: t.snapshotCompressionLossless, disabled: true },
                ]}
                onChange={(value) => {
                  if (typeof value === 'number') {
                    setImageQuality(value);
                  }
                }}
                disabled={isCapturing || !supportsLossyCompression}
                size="xs"
              />
              {supportsLossyCompression && (
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-tertiary">
                  <span>{t.compressionSmallerFile}</span>
                  <span>{t.compressionMoreDetail}</span>
                </div>
              )}
            </div>
          </SnapshotSection>

          <div className="rounded-xl border border-border-black bg-element-bg/65">
            <button
              type="button"
              disabled={isCapturing}
              onClick={() => setShowAdvancedLook((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-element-hover/60 disabled:cursor-default disabled:opacity-60"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  {t.snapshotAdvancedLook}
                </div>
                <div className="truncate text-[10px] text-text-secondary">
                  {advancedLookSummary}
                </div>
              </div>
              <ChevronRight
                className={[
                  'h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150',
                  showAdvancedLook ? 'rotate-90' : '',
                ].join(' ')}
              />
            </button>

            {showAdvancedLook && (
              <div className="border-t border-border-black px-3 py-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  <Select
                    label={t.snapshotShadowStyle}
                    value={shadowStyle}
                    options={shadowOptions}
                    disabled={isCapturing}
                    labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                    className={FIELD_SELECT_CLASS_NAME}
                    onChange={(event) => setShadowStyle(event.target.value as SnapshotCaptureOptions['shadowStyle'])}
                  />
                  <Select
                    label={t.snapshotFloorStyle}
                    value={groundStyle}
                    options={groundOptions}
                    disabled={isCapturing}
                    labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                    className={FIELD_SELECT_CLASS_NAME}
                    onChange={(event) => setGroundStyle(event.target.value as SnapshotCaptureOptions['groundStyle'])}
                  />
                  <Select
                    label={t.snapshotDof}
                    value={dofMode}
                    options={dofOptions}
                    disabled={isCapturing}
                    labelClassName={FIELD_SELECT_LABEL_CLASS_NAME}
                    className={FIELD_SELECT_CLASS_NAME}
                    onChange={(event) => setDofMode(event.target.value as SnapshotCaptureOptions['dofMode'])}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border-black bg-panel-bg px-3 py-2">
            <Checkbox
              checked={resolvedOptions.hideGrid}
              onChange={setHideGrid}
              disabled={isCapturing}
              label={t.snapshotHideGrid}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-border-black bg-element-bg/95 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                {t.snapshot}
              </div>
              <div className="truncate text-[11px] font-medium text-text-secondary">
                {captureSummary}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isCapturing}
                className="h-[26px] px-2.5 text-[11px]"
              >
                {t.close}
              </Button>
              <Button
                type="button"
                onClick={() => void onCapture(resolvedOptions)}
                isLoading={isCapturing}
                disabled={isCapturing}
                icon={<Camera className="h-3 w-3" />}
                className="h-[26px] min-w-20 px-3 text-[11px]"
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
