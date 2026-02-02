/**
 * Settings Modal Component
 * Draggable settings panel for UI configuration (Theme, Language, Scale)
 */
import React from 'react';
import { Settings, X, Sun, Moon, Monitor, Type, Languages, RotateCcw, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store';
import { SegmentedControl } from '@/shared/components/Panel';

export function SettingsModal() {
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const settingsPos = useUIStore((state) => state.settingsPos);
  const closeSettings = useUIStore((state) => state.closeSettings);
  const setSettingsPos = useUIStore((state) => state.setSettingsPos);
  
  const uiScale = useUIStore((state) => state.uiScale);
  const setUiScale = useUIStore((state) => state.setUiScale);
  
  const lang = useUIStore((state) => state.lang);
  const setLang = useUIStore((state) => state.setLang);
  
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  const showImportWarning = useUIStore((state) => state.showImportWarning);
  const setShowImportWarning = useUIStore((state) => state.setShowImportWarning);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = settingsPos.x;
    const initialY = settingsPos.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setSettingsPos({ x: initialX + dx, y: initialY + dy });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isSettingsOpen) {
    return null;
  }

  return (
    <div
      style={{ left: settingsPos.x, top: settingsPos.y }}
      className="fixed z-[100] w-[320px] bg-white dark:bg-panel-bg rounded-xl shadow-2xl border border-slate-200 dark:border-border-black overflow-hidden"
    >
      {/* Header */}
      <div
        onMouseDown={handleDragStart}
        className="bg-slate-50 dark:bg-element-active px-4 py-3 border-b border-slate-200 dark:border-border-black flex items-center justify-between cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">
            {lang === 'zh' ? '设置' : 'Settings'}
          </h2>
        </div>
        <button
          onClick={closeSettings}
          className="p-1.5 text-slate-500 hover:bg-red-500 hover:text-white dark:text-slate-400 dark:hover:bg-red-600 dark:hover:text-white rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-5">
        
        {/* Language Setting */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <Languages className="w-3.5 h-3.5" />
            {lang === 'zh' ? '语言' : 'Language'}
          </label>
          <SegmentedControl
            options={[
              { value: 'en', label: 'English' },
              { value: 'zh', label: '中文' },
            ]}
            value={lang}
            onChange={(val) => setLang(val as 'en' | 'zh')}
          />
        </div>

        {/* Theme Setting */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            {lang === 'zh' ? '主题' : 'Theme'}
          </label>
          <SegmentedControl
            options={[
              { value: 'light', label: lang === 'zh' ? '亮色' : 'Light', icon: <Sun className="w-3 h-3" /> },
              { value: 'dark', label: lang === 'zh' ? '暗色' : 'Dark', icon: <Moon className="w-3 h-3" /> },
              { value: 'system', label: lang === 'zh' ? '系统' : 'System', icon: <Monitor className="w-3 h-3" /> },
            ]}
            value={theme}
            onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 dark:bg-border-black" />

        {/* Import Warning Setting */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {lang === 'zh' ? '导入时提示' : 'Import Warning'}
          </label>
          <button
            onClick={() => setShowImportWarning(!showImportWarning)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none p-0.5 ${
              showImportWarning ? 'bg-[#0060FA]' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <span
              className={`${
                showImportWarning ? 'translate-x-4' : 'translate-x-0'
              } inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200`}
            />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 dark:bg-border-black" />

        {/* UI Scale Setting */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Type className="w-3.5 h-3.5" />
              {lang === 'zh' ? '界面缩放' : 'Interface Scale'}
            </label>
            <span className="text-xs text-slate-500 font-mono">
              {(uiScale * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.5"
            step="0.05"
            value={uiScale}
            onChange={(e) => setUiScale(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-black border border-slate-200 dark:border-element-hover rounded-lg appearance-none cursor-pointer accent-[#0060FA]"
          />
          <div className="relative h-4 text-[10px] text-slate-400 select-none">
            <span className="absolute left-0">80%</span>
            <span className="absolute left-[28.57%] -translate-x-1/2">100%</span>
            <span className="absolute right-0">150%</span>
          </div>
        </div>

        {/* Reset Button */}
        <button
          onClick={() => setUiScale(1.0)}
          className="w-full py-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-element-bg hover:bg-slate-200 dark:hover:bg-element-hover rounded flex items-center justify-center gap-2 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          {lang === 'zh' ? '重置缩放' : 'Reset Scale'}
        </button>
      </div>
    </div>
  );
}

export default SettingsModal;
