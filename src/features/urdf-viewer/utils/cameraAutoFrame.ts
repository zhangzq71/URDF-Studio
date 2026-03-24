export interface AutoFrameRobotChangeOptions {
  autoFrameOnRobotChange: boolean;
  currentScopeKey: string | null;
  lastAutoFramedScopeKey: string | null;
  focusTarget: string | null | undefined;
  mode?: 'detail' | 'hardware';
  active?: boolean;
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
  active = true,
}: AutoFrameRobotChangeOptions): boolean {
  if (!active) return false;
  if (!autoFrameOnRobotChange) return false;
  if (!currentScopeKey) return false;
  if (focusTarget) return false;
  if (mode === 'hardware') return false;

  return currentScopeKey !== lastAutoFramedScopeKey;
}
