import { normalizeMergedAppMode } from '@/shared/utils/appMode';
import type { AppMode } from '@/types';
import { resolveUnifiedViewerSceneMode } from './unifiedViewerSceneMode';

export type UnifiedViewerMode = AppMode;

export interface UnifiedViewerMountState {
  viewerMounted: boolean;
  visualizerMounted: boolean;
}

export interface UnifiedViewerMountStateInput {
  mode: UnifiedViewerMode;
  isPreviewing: boolean;
  forceViewerSession?: boolean;
}

export interface UnifiedViewerSessionState<TPreview> {
  activePreview: TPreview | undefined;
  isPreviewing: boolean;
  isViewerMode: boolean;
  viewerSceneMode: 'editor';
}

export function isUnifiedViewerMode({
  mode,
  isPreviewing,
  forceViewerSession = false,
}: UnifiedViewerMountStateInput): boolean {
  return forceViewerSession || isPreviewing || normalizeMergedAppMode(mode) === 'editor';
}

export function resolveUnifiedViewerSessionState<TPreview>({
  mode,
  filePreview,
  forceViewerSession = false,
}: {
  mode: UnifiedViewerMode;
  filePreview?: TPreview;
  forceViewerSession?: boolean;
}): UnifiedViewerSessionState<TPreview> {
  const activePreview = filePreview;
  const isPreviewing = Boolean(activePreview);

  return {
    activePreview,
    isPreviewing,
    isViewerMode: isUnifiedViewerMode({ mode, isPreviewing, forceViewerSession }),
    viewerSceneMode: resolveUnifiedViewerSceneMode(mode),
  };
}

export function createInitialUnifiedViewerMountState(
  input: UnifiedViewerMountStateInput,
): UnifiedViewerMountState {
  const viewerMode = isUnifiedViewerMode(input);

  return {
    viewerMounted: viewerMode,
    visualizerMounted: !viewerMode,
  };
}

export function resolveUnifiedViewerMountState(
  currentState: UnifiedViewerMountState,
  input: UnifiedViewerMountStateInput,
): UnifiedViewerMountState {
  const viewerMode = isUnifiedViewerMode(input);

  return {
    viewerMounted: currentState.viewerMounted || viewerMode,
    visualizerMounted: currentState.visualizerMounted || !viewerMode,
  };
}
