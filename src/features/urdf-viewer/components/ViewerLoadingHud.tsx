import { useEffect, useState } from 'react';

interface ViewerLoadingHudProps {
  title: string;
  detail: string;
  progress: number | null;
  statusLabel?: string | null;
  stageLabel?: string | null;
  delayMs?: number;
}

export function ViewerLoadingHud({
  title,
  detail,
  progress,
  statusLabel = null,
  stageLabel = null,
  delayMs = 300,
}: ViewerLoadingHudProps) {
  const [isVisible, setIsVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setIsVisible(true);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs]);

  if (!isVisible) {
    return null;
  }

  const progressWidth = progress !== null
    ? `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`
    : '38%';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none min-w-[220px] max-w-[280px] rounded-2xl border border-border-black bg-panel-bg/95 px-3.5 py-3 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-slider-accent motion-safe:animate-pulse"
            />
            <span className="truncate text-[11px] font-semibold text-text-primary">
              {title}
            </span>
          </div>
          {stageLabel ? (
            <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-border-black/70 bg-element-bg px-2 py-0.5 text-[10px] font-medium text-text-secondary">
              <span className="truncate">{stageLabel}</span>
            </div>
          ) : null}
        </div>
        {statusLabel ? (
          <div className="shrink-0 text-[11px] font-semibold tabular-nums text-text-secondary">
            {statusLabel}
          </div>
        ) : null}
      </div>
      <div className="mt-2 truncate text-[11px] font-medium text-text-secondary">
        {detail}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-border-black/50">
        <div
          aria-hidden="true"
          className={`h-full rounded-full bg-slider-accent ${progress === null ? 'motion-safe:animate-pulse' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'}`}
          style={{ width: progressWidth }}
        />
      </div>
    </div>
  );
}
