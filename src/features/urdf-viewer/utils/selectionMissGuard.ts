export interface SelectionMissGuardRef {
  current: boolean;
}

export interface SelectionMissGuardTimerRef {
  current: ReturnType<typeof setTimeout> | null;
}

interface ScheduleSelectionMissGuardResetOptions {
  justSelectedRef?: SelectionMissGuardRef | null;
  timerRef: SelectionMissGuardTimerRef;
  delayMs?: number;
  onReset?: () => void;
}

const DEFAULT_SELECTION_SETTLE_MS = 100;

export function armSelectionMissGuard(justSelectedRef?: SelectionMissGuardRef | null): void {
  if (!justSelectedRef) return;
  justSelectedRef.current = true;
}

export function clearSelectionMissGuardTimer(timerRef: SelectionMissGuardTimerRef): void {
  if (timerRef.current === null) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}

export function scheduleSelectionMissGuardReset({
  justSelectedRef,
  timerRef,
  delayMs = DEFAULT_SELECTION_SETTLE_MS,
  onReset,
}: ScheduleSelectionMissGuardResetOptions): void {
  if (!justSelectedRef) return;

  clearSelectionMissGuardTimer(timerRef);
  timerRef.current = setTimeout(() => {
    justSelectedRef.current = false;
    timerRef.current = null;
    onReset?.();
  }, delayMs);
}
