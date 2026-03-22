import type { ReactNode } from 'react';
import { Activity, Box, Cpu } from 'lucide-react';
import { useSelectionStore } from '@/store';
import type { AppMode } from '@/types';
import type { HeaderTranslations } from './types';

interface ModeSwitcherProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  t: HeaderTranslations;
  compact?: boolean;
}

interface ModeButtonProps {
  mode: AppMode;
  current: AppMode;
  setMode: (mode: AppMode) => void;
  icon: ReactNode;
  label?: string;
  title?: string;
}

function ModeButton({ mode, current, setMode, icon, label, title }: ModeButtonProps) {
  const isActive = current === mode;
  const labelButtonClassName = label
    ? 'gap-1.5 px-2.5 py-1.5 whitespace-nowrap text-[11px] leading-none'
    : 'justify-center p-1.5 text-xs';

  return (
    <button
      onClick={() => {
        useSelectionStore.getState().setFocusTarget(null);
        setMode(mode);
      }}
      className={`flex items-center rounded-md font-medium transition-all ${labelButtonClassName} ${
        isActive
          ? 'bg-white dark:bg-segmented-active text-text-primary dark:text-white shadow-sm dark:shadow-md'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
      }`}
      title={title}
    >
      {icon}
      {label && <span className="leading-none">{label}</span>}
    </button>
  );
}

export function ModeSwitcher({
  appMode,
  setAppMode,
  t,
  compact = false,
}: ModeSwitcherProps) {
  if (compact) {
    return (
      <div className="flex items-center bg-element-bg dark:bg-app-bg rounded-lg p-0.5">
        <ModeButton mode="skeleton" current={appMode} setMode={setAppMode} icon={<Activity className="w-3.5 h-3.5" />} title={t.skeleton} />
        <ModeButton mode="detail" current={appMode} setMode={setAppMode} icon={<Box className="w-3.5 h-3.5" />} title={t.detail} />
        <ModeButton mode="hardware" current={appMode} setMode={setAppMode} icon={<Cpu className="w-3.5 h-3.5" />} title={t.hardware} />
      </div>
    );
  }

  return (
    <div className="flex items-center bg-element-bg dark:bg-app-bg rounded-lg p-0.5 pointer-events-auto border border-border-black">
      <ModeButton mode="skeleton" current={appMode} setMode={setAppMode} icon={<Activity className="w-3.5 h-3.5" />} label={t.skeleton} />
      <ModeButton mode="detail" current={appMode} setMode={setAppMode} icon={<Box className="w-3.5 h-3.5" />} label={t.detail} />
      <ModeButton mode="hardware" current={appMode} setMode={setAppMode} icon={<Cpu className="w-3.5 h-3.5" />} label={t.hardware} />
    </div>
  );
}
