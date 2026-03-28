export interface ScheduleUsdResolvedRobotRepublishOptions {
  isActive: () => boolean;
  requestAnimationFrame: (callback: () => void) => unknown;
  startWarmups: () => Array<Promise<unknown> | null | undefined>;
  onSettled: () => void;
}

export function scheduleUsdResolvedRobotRepublishAfterWarmup({
  isActive,
  requestAnimationFrame,
  startWarmups,
  onSettled,
}: ScheduleUsdResolvedRobotRepublishOptions): void {
  requestAnimationFrame(() => {
    if (!isActive()) {
      return;
    }

    let warmups: Array<Promise<unknown>>;
    try {
      warmups = Array.from(startWarmups() || [])
        .filter((candidate): candidate is Promise<unknown> => Boolean(candidate));
    } catch {
      warmups = [];
    }

    if (warmups.length === 0) {
      if (isActive()) {
        onSettled();
      }
      return;
    }

    void Promise.allSettled(warmups).then(() => {
      if (!isActive()) {
        return;
      }

      onSettled();
    });
  });
}
