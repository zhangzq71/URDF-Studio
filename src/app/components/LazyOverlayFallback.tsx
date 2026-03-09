import React from 'react';

interface LazyOverlayFallbackProps {
  label: string;
}

export function LazyOverlayFallback({ label }: LazyOverlayFallbackProps) {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-xl border border-border-black bg-panel-bg px-4 py-3 text-sm font-medium text-text-primary shadow-xl"
      >
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-system-blue" />
        <span>{label}</span>
      </div>
    </div>
  );
}
