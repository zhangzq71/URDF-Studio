export interface AutoFrameRobotChangeOptions {
  autoFrameOnRobotChange: boolean;
  currentScopeKey: string | null;
  lastAutoFramedScopeKey: string | null;
  focusTarget: string | null | undefined;
  mode?: 'detail' | 'hardware';
}

export function resolveCameraAutoFrameScopeKey(
  autoFrameScopeKey: string | null | undefined,
  robotUuid: string,
): string {
  return autoFrameScopeKey && autoFrameScopeKey.length > 0
    ? autoFrameScopeKey
    : robotUuid;
}

export function shouldAutoFrameRobotChange({
  autoFrameOnRobotChange,
  currentScopeKey,
  lastAutoFramedScopeKey,
  focusTarget,
  mode,
}: AutoFrameRobotChangeOptions): boolean {
  if (!autoFrameOnRobotChange) return false;
  if (!currentScopeKey) return false;
  if (focusTarget) return false;
  if (mode === 'hardware') return false;

  return currentScopeKey !== lastAutoFramedScopeKey;
}
