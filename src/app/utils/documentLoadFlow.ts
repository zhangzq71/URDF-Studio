type DocumentLoadStatus = 'idle' | 'loading' | 'hydrating' | 'ready' | 'error';

interface DocumentLoadStateLike {
  status: DocumentLoadStatus;
  fileName: string | null;
  format?: string | null;
  phase?: string | null;
  message?: string | null;
  progressPercent?: number | null;
  loadedCount?: number | null;
  totalCount?: number | null;
}

interface RobotImportResultLike {
  status: 'ready' | 'needs_hydration' | 'error';
  reason?: string;
}

interface StaleViewerDocumentLoadEventInput {
  isPreviewing: boolean;
  activeDocumentFileName: string | null;
  documentLoadState: DocumentLoadStateLike;
}

interface PreserveDocumentLoadProgressInput<TDocumentLoadState extends DocumentLoadStateLike> {
  currentState: TDocumentLoadState;
  nextState: TDocumentLoadState;
}

interface ViewerLoadRegressionAfterReadyInput<TDocumentLoadState extends DocumentLoadStateLike> {
  currentState: TDocumentLoadState;
  nextState: TDocumentLoadState;
}

export function shouldCommitResolvedRobotSelection(importResult: RobotImportResultLike): boolean {
  return importResult.status === 'ready'
    || importResult.status === 'needs_hydration'
    || importResult.reason === 'source_only_fragment';
}

export function shouldIgnoreStaleViewerDocumentLoadEvent({
  isPreviewing,
  activeDocumentFileName,
  documentLoadState,
}: StaleViewerDocumentLoadEventInput): boolean {
  if (isPreviewing || !activeDocumentFileName) {
    return false;
  }

  return (documentLoadState.status === 'loading' || documentLoadState.status === 'hydrating')
    && Boolean(documentLoadState.fileName)
    && documentLoadState.fileName !== activeDocumentFileName;
}

export function preserveDocumentLoadProgressForSameFile<TDocumentLoadState extends DocumentLoadStateLike>({
  currentState,
  nextState,
}: PreserveDocumentLoadProgressInput<TDocumentLoadState>): TDocumentLoadState {
  const currentStateIsActive = currentState.status === 'loading' || currentState.status === 'hydrating';
  const nextStateIsActive = nextState.status === 'loading' || nextState.status === 'hydrating';
  const sameFile =
    Boolean(currentState.fileName)
    && currentState.fileName === nextState.fileName
    && (currentState.format ?? null) === (nextState.format ?? null);
  const currentHasAdvancedProgress =
    (currentState.phase ?? null) !== 'checking-path'
    || Number(currentState.progressPercent ?? 0) > 0
    || Number(currentState.loadedCount ?? 0) > 0;
  const nextStateWouldResetBootstrapProgress =
    (nextState.phase ?? null) === 'checking-path'
    && !nextState.message
    && !Number.isFinite(nextState.progressPercent)
    && !Number.isFinite(nextState.loadedCount)
    && !Number.isFinite(nextState.totalCount);

  if (!sameFile || !currentStateIsActive || !nextStateIsActive || !currentHasAdvancedProgress || !nextStateWouldResetBootstrapProgress) {
    return nextState;
  }

  return {
    ...nextState,
    phase: currentState.phase ?? nextState.phase ?? null,
    message: currentState.message ?? nextState.message ?? null,
    progressPercent: currentState.progressPercent ?? nextState.progressPercent ?? null,
    loadedCount: currentState.loadedCount ?? nextState.loadedCount ?? null,
    totalCount: currentState.totalCount ?? nextState.totalCount ?? null,
  };
}

export function shouldIgnoreViewerLoadRegressionAfterReadySameFile<TDocumentLoadState extends DocumentLoadStateLike>({
  currentState,
  nextState,
}: ViewerLoadRegressionAfterReadyInput<TDocumentLoadState>): boolean {
  const sameFile =
    Boolean(currentState.fileName)
    && currentState.fileName === nextState.fileName
    && (currentState.format ?? null) === (nextState.format ?? null);

  return sameFile
    && currentState.status === 'ready'
    && nextState.status === 'loading';
}
