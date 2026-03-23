/**
 * Settings Modal Component
 * Draggable settings panel for UI configuration (Theme, Language, Text Size)
 */
import React from 'react';
import { Settings, X, Sun, Moon, Monitor, Type, Languages, RotateCcw, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store';
import { translations } from '@/shared/i18n';
import { 
  SegmentedControl, 
  Switch, 
  Button, 
  IconButton,
  Separator, 
  Label 
} from '@/shared/components/ui';

export function SettingsModal() {
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const settingsPos = useUIStore((state) => state.settingsPos);
  const closeSettings = useUIStore((state) => state.closeSettings);
  const setSettingsPos = useUIStore((state) => state.setSettingsPos);

  const lang = useUIStore((state) => state.lang);
  const setLang = useUIStore((state) => state.setLang);
  
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  const showImportWarning = useUIStore((state) => state.showImportWarning);
  const setShowImportWarning = useUIStore((state) => state.setShowImportWarning);


  const fontSize = useUIStore((state) => state.fontSize);
  const setFontSize = useUIStore((state) => state.setFontSize);
  const t = translations[lang];

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = settingsPos.x;
    const initialY = settingsPos.y;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setSettingsPos({ x: initialX + dx, y: initialY + dy });
    };

    const handleMouseUp = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
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
      className="fixed z-[100] w-[320px] bg-panel-bg rounded-2xl shadow-xl border border-border-black overflow-hidden"
    >
      {/* Header */}
      <div
        onMouseDown={handleDragStart}
        className="bg-element-bg px-3.5 py-2.5 border-b border-border-black flex items-center justify-between cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 text-text-tertiary" />
          <h2 className="text-[13px] font-semibold text-text-primary">
            {t.settings}
          </h2>
        </div>
        <IconButton
          onClick={closeSettings}
          size="sm"
          variant="close"
          aria-label={t.close}
        >
          <X className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-4">
        
        {/* Language Setting */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-[11px]">
            <Languages className="w-3 h-3" />
            {t.language}
          </Label>
          <SegmentedControl
            options={[
              { value: 'en', label: 'English' },
              { value: 'zh', label: '中文' },
            ]}
            value={lang}
            onChange={(val) => setLang(val as 'en' | 'zh')}
            size="xs"
          />
        </div>

        {/* Theme Setting */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-[11px]">
            {theme === 'light' ? <Sun className="w-3 h-3" /> : theme === 'dark' ? <Moon className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            {t.theme}
          </Label>
          <SegmentedControl
            options={[
              { value: 'light', label: t.light, icon: <Sun className="w-3 h-3" /> },
              { value: 'dark', label: t.dark, icon: <Moon className="w-3 h-3" /> },
              { value: 'system', label: t.system, icon: <Monitor className="w-3 h-3" /> },
            ]}
            value={theme}
            onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
            size="xs"
          />
        </div>

        {/* Divider */}
        <Separator />

        {/* Import Warning Setting */}
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 mb-0 text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            {t.importWarning}
          </Label>
          <Switch
            checked={showImportWarning}
            onChange={setShowImportWarning}
            size="sm"
          />
        </div>

        {/* Divider */}
        <Separator />

        {/* Font Size Setting (Global Text Size) */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-[11px]">
             <Type className="w-3 h-3" />
             {t.fontSize}
          </Label>
          <SegmentedControl
            options={[
              { value: 'small', label: t.small },
              { value: 'medium', label: t.medium },
              { value: 'large', label: t.large },
            ]}
            value={fontSize}
            onChange={(val) => setFontSize(val as 'small' | 'medium' | 'large')}
            size="xs"
          />
        </div>

        {/* Reset Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setFontSize('medium');
          }}
          className="w-full justify-center"
          icon={<RotateCcw className="w-3 h-3" />}
        >
          {t.resetFontSize}
        </Button>
      </div>
    </div>
  );
}

export default SettingsModal;
