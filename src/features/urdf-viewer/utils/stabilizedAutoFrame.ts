export interface StabilizedAutoFrameSample<TState> {
  stabilityKey: string | null;
  state: TState;
}

export interface ScheduleStabilizedAutoFrameOptions<TState> {
  sample: () => StabilizedAutoFrameSample<TState>;
  applyFrame: (sample: StabilizedAutoFrameSample<TState>) => boolean;
  isActive: () => boolean;
  delays?: readonly number[];
  onSettled?: (reason: 'stable' | 'exhausted') => void;
  scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearScheduledTimeout?: (handle: unknown) => void;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export function scheduleStabilizedAutoFrame<TState>({
  sample,
  applyFrame,
  isActive,
  delays = [0, 96, 224],
  onSettled,
  scheduleTimeout = (callback, delayMs) => setTimeout(callback, delayMs),
  clearScheduledTimeout = (handle) => clearTimeout(handle as TimerHandle),
}: ScheduleStabilizedAutoFrameOptions<TState>): () => void {
  const handles = new Set<unknown>();
  let disposed = false;
  let lastStabilityKey: string | null = null;
  let stablePassCount = 0;
  let settled = false;

  const settle = (reason: 'stable' | 'exhausted') => {
    if (disposed || settled) {
      return;
    }

    settled = true;
    onSettled?.(reason);
  };

  const scheduleAttempt = (index: number) => {
    if (disposed || index >= delays.length) {
      return;
    }

    const handle = scheduleTimeout(() => {
      handles.delete(handle);
      if (disposed || !isActive()) {
        return;
      }

      const nextSample = sample();
      const didApply = applyFrame(nextSample);
      const stabilityKeyChanged = nextSample.stabilityKey !== lastStabilityKey;

      lastStabilityKey = nextSample.stabilityKey;
      stablePassCount = didApply && !stabilityKeyChanged ? stablePassCount + 1 : 0;

      if (stablePassCount >= 1) {
        settle('stable');
        return;
      }

      if (index >= delays.length - 1) {
        settle('exhausted');
        return;
      }

      scheduleAttempt(index + 1);
    }, delays[index] ?? 0);

    handles.add(handle);
  };

  scheduleAttempt(0);

  return () => {
    disposed = true;
    handles.forEach((handle) => clearScheduledTimeout(handle));
    handles.clear();
  };
}
