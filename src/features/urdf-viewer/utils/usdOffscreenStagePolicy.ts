import type { ToolMode, URDFViewerProps } from '../types';
import { supportsUsdWorkerRenderer } from './usdWorkerRendererSupport.ts';

interface OffscreenUsdFileLike {
  name: string;
  content?: string | null;
  format?: string;
}

interface ShouldUseUsdOffscreenStageOptions {
  toolMode: ToolMode;
  selection?: URDFViewerProps['selection'];
  hoveredSelection?: URDFViewerProps['hoveredSelection'];
  focusTarget?: string | null;
  sourceFile?: OffscreenUsdFileLike | null;
  availableFiles?: OffscreenUsdFileLike[];
  showOrigins?: boolean;
  showJointAxes?: boolean;
  showCenterOfMass?: boolean;
  showInertia?: boolean;
  workerRendererSupported?: boolean;
}

const HAND_ARTICULATION_TOKEN_PATTERN =
  /\b(?:[LR]_(?:thumb|index|middle|ring|pinky)(?:_|\b)|(?:left|right)_(?:thumb|index|middle|ring|pinky)(?:_|\b))/i;
const KNOWN_UNSUPPORTED_OFFSCREEN_BUNDLE_PATTERNS = [
  /(?:^|\/)h1_2(?:\/|$)/i,
];

function normalizeUsdFileName(name: string | null | undefined): string {
  return String(name || '').trim().replace(/\\/g, '/');
}

function getBundlePrefix(sourceFile: OffscreenUsdFileLike | null | undefined): string | null {
  const normalizedName = normalizeUsdFileName(sourceFile?.name);
  if (!normalizedName) {
    return null;
  }

  const lastSlashIndex = normalizedName.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return '';
  }

  return normalizedName.slice(0, lastSlashIndex + 1);
}

function isUsdFileLike(file: OffscreenUsdFileLike | null | undefined): boolean {
  return Boolean(file && (file.format === 'usd' || /\.usd[a-z]?$/i.test(file.name)));
}

function hasUnsupportedHandArticulation({
  sourceFile,
  availableFiles = [],
}: Pick<ShouldUseUsdOffscreenStageOptions, 'sourceFile' | 'availableFiles'>): boolean {
  if (!isUsdFileLike(sourceFile)) {
    return false;
  }

  const candidateFileNames = [sourceFile, ...availableFiles]
    .map((file) => normalizeUsdFileName(file?.name))
    .filter((name) => name.length > 0);
  if (
    candidateFileNames.some((name) => (
      KNOWN_UNSUPPORTED_OFFSCREEN_BUNDLE_PATTERNS.some((pattern) => pattern.test(name))
    ))
  ) {
    return true;
  }

  const bundlePrefix = getBundlePrefix(sourceFile);
  const candidateFiles = [
    sourceFile,
    ...availableFiles.filter((file) => (
      isUsdFileLike(file)
      && file.name !== sourceFile?.name
      && (bundlePrefix === null || normalizeUsdFileName(file.name).startsWith(bundlePrefix))
    )),
  ];

  return candidateFiles.some((file) => {
    if (typeof file.content !== 'string' || file.content.length === 0) {
      return false;
    }
    return HAND_ARTICULATION_TOKEN_PATTERN.test(file.content);
  });
}

export function shouldUseUsdOffscreenStage({
  toolMode,
  selection,
  hoveredSelection,
  focusTarget,
  sourceFile,
  availableFiles,
  showOrigins = false,
  showJointAxes = false,
  showCenterOfMass = false,
  showInertia = false,
  workerRendererSupported = supportsUsdWorkerRenderer(),
}: ShouldUseUsdOffscreenStageOptions): boolean {
  void selection;
  void hoveredSelection;

  if (!workerRendererSupported) {
    return false;
  }

  if (toolMode !== 'view' && toolMode !== 'select') {
    return false;
  }

  if (showOrigins || showJointAxes || showCenterOfMass || showInertia) {
    return false;
  }

  if (hasUnsupportedHandArticulation({ sourceFile, availableFiles })) {
    return false;
  }

  if (typeof focusTarget === 'string' && focusTarget.trim() !== '') {
    return false;
  }

  return true;
}

export function shouldBootstrapUsdOffscreenStage({
  toolMode,
  selection,
  hoveredSelection,
  focusTarget,
  workerRendererSupported = supportsUsdWorkerRenderer(),
}: ShouldUseUsdOffscreenStageOptions): boolean {
  void toolMode;
  void selection;
  void hoveredSelection;
  void focusTarget;
  void workerRendererSupported;

  // The offscreen bootstrap path opens the same USD stage twice during the
  // default interactive load: once in the worker bootstrap renderer and again
  // in the main-thread interactive renderer. That duplicate stage-open work
  // increases USDA load time and can expose transient scene swaps. Keep select
  // mode on the single proven interactive path until the bootstrap handoff is
  // reworked around shared stage-open data and a stable first-frame policy.
  return false;
}
