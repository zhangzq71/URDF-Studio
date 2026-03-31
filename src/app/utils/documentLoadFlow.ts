type DocumentLoadStatus = 'idle' | 'loading' | 'hydrating' | 'ready' | 'error';

interface DocumentLoadStateLike {
  status: DocumentLoadStatus;
  fileName: string | null;
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
