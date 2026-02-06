/**
 * Settings Modal Component
 * Draggable settings panel for UI configuration (Theme, Language, Scale)
 */
import React from 'react';
import { Settings, X, Sun, Moon, Monitor, Type, Languages, RotateCcw, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store';
import { 
  SegmentedControl, 
  Switch, 
  Slider, 
  Button, 
  Separator, 
  Label 
} from '@/shared/components/ui';

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

  const viewOptions = useUIStore((state) => state.viewOptions);
  const setViewOption = useUIStore((state) => state.setViewOption);

  const fontSize = useUIStore((state) => state.fontSize);
  const setFontSize = useUIStore((state) => state.setFontSize);

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
      className="fixed z-[100] w-[320px] bg-white dark:bg-[#2C2C2E] rounded-[16px] shadow-[0_12px_32px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-black/50 overflow-hidden"
    >
      {/* Header */}
      <div
        onMouseDown={handleDragStart}
        className="bg-slate-50 dark:bg-[#2C2C2E] px-4 py-3 border-b border-slate-200 dark:border-black/50 flex items-center justify-between cursor-move select-none"
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
          <Label className="flex items-center gap-2">
            <Languages className="w-3.5 h-3.5" />
            {lang === 'zh' ? '语言' : 'Language'}
          </Label>
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
          <Label className="flex items-center gap-2">
            {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            {lang === 'zh' ? '主题' : 'Theme'}
          </Label>
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
        <Separator />

        {/* Import Warning Setting */}
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 mb-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            {lang === 'zh' ? '导入时提示' : 'Import Warning'}
          </Label>
          <Switch
            checked={showImportWarning}
            onChange={setShowImportWarning}
          />
        </div>

        {/* Divider */}
        <Separator />

        {/* UI Scale Setting */}
        <div className="space-y-2">
          <Slider
            label={lang === 'zh' ? '界面缩放' : 'Interface Scale'}
            icon={<Type className="w-3.5 h-3.5" />}
            min={0.8}
            max={1.5}
            step={0.05}
            value={uiScale}
            onChange={setUiScale}
            showValue={true}
            formatValue={(val) => `${(val * 100).toFixed(0)}%`}
          />
          <div className="relative h-4 text-[10px] text-slate-400 select-none px-1">
            <span className="absolute left-0">80%</span>
            <span className="absolute left-[28.57%] -translate-x-1/2">100%</span>
            <span className="absolute right-0">150%</span>
          </div>
        </div>

        {/* Font Size Setting (Global Text Size) */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
             <Type className="w-3.5 h-3.5" />
             {lang === 'zh' ? '字体大小' : 'Font Size'}
          </Label>
          <SegmentedControl
            options={[
              { value: 'small', label: lang === 'zh' ? '小' : 'Small' },
              { value: 'medium', label: lang === 'zh' ? '中' : 'Medium' },
              { value: 'large', label: lang === 'zh' ? '大' : 'Large' },
            ]}
            value={fontSize}
            onChange={(val) => setFontSize(val as 'small' | 'medium' | 'large')}
          />
        </div>

        {/* Reset Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setUiScale(1.0);
            setFontSize('medium');
          }}
          className="w-full justify-center"
          icon={<RotateCcw className="w-3 h-3" />}
        >
          {lang === 'zh' ? '重置缩放' : 'Reset Scale'}
        </Button>
      </div>
    </div>
  );
}

export default SettingsModal;
