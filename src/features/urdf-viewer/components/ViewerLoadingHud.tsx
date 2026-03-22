import { useEffect, useState } from 'react';

interface ViewerLoadingHudProps {
  title: string;
  detail: string;
  progress: number | null;
  delayMs?: number;
}

export function ViewerLoadingHud({
  title,
  detail,
  progress,
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
      className="pointer-events-none min-w-[180px] max-w-[220px] rounded-xl border border-border-black bg-panel-bg/90 px-3 py-2 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-slider-accent motion-safe:animate-pulse"
        />
        <span className="truncate text-[11px] font-semibold text-text-primary">
          {title}
        </span>
      </div>
      <div className="mt-1 truncate pl-4 text-[10px] font-medium text-text-secondary">
        {detail}
      </div>
      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-border-black/50">
        <div
          aria-hidden="true"
          className={`h-full rounded-full bg-slider-accent ${progress === null ? 'motion-safe:animate-pulse' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'}`}
          style={{ width: progressWidth }}
        />
      </div>
    </div>
  );
}
