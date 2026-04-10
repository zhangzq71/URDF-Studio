interface ImportPreparationProgressLike {
  progressPercent: number | null;
  processedEntries: number;
  totalEntries: number;
  processedBytes: number;
  totalBytes: number;
}

function clampImportProgressPercent(value: number | null): number | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

export function createImportProgressEmitter<T extends ImportPreparationProgressLike>(
  onProgress?: (progress: T) => void,
): (progress: T) => void {
  let lastSignature: string | null = null;

  return (progress) => {
    if (!onProgress) {
      return;
    }

    const nextProgress = {
      ...progress,
      progressPercent: clampImportProgressPercent(progress.progressPercent),
      processedEntries: Math.max(0, Math.round(progress.processedEntries)),
      totalEntries: Math.max(0, Math.round(progress.totalEntries)),
      processedBytes: Math.max(0, Math.round(progress.processedBytes)),
      totalBytes: Math.max(0, Math.round(progress.totalBytes)),
    } as T;
    const signature = JSON.stringify(nextProgress);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    onProgress(nextProgress);
  };
}

export function mapImportProgressToPercentRange<T extends ImportPreparationProgressLike>(
  progress: T,
  rangeStart: number,
  rangeEnd: number,
): T {
  if (progress.progressPercent == null) {
    return progress;
  }

  const clampedPercent = clampImportProgressPercent(progress.progressPercent) ?? 0;
  const progressRatio = clampedPercent / 100;

  return {
    ...progress,
    progressPercent: rangeStart + progressRatio * (rangeEnd - rangeStart),
  };
}
