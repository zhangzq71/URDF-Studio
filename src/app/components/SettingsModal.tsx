/**
 * Settings Modal Component
 * Draggable settings panel for UI configuration (Theme, Language, Text Size)
 */
import React from 'react';
import { Settings, X, Sun, Moon, Monitor, Type, Languages, RotateCcw, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { translations } from '@/shared/i18n';
import { SegmentedControl, Switch, Button, IconButton } from '@/shared/components/ui';
import { OptionsPanelContainer } from '@/shared/components/Panel';

const DEFAULT_SETTINGS_WIDTH = 296;
const DEFAULT_SETTINGS_MIN_WIDTH = 272;
const DEFAULT_SETTINGS_MAX_WIDTH = 420;
const DEFAULT_SETTINGS_MIN_HEIGHT = 256;
const DEFAULT_SETTINGS_MAX_HEIGHT = 560;
const SETTINGS_VIEWPORT_MARGIN = 12;
const SETTINGS_ESTIMATED_HEIGHT = 360;

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
};

interface SettingsSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ icon, title, children }: SettingsSectionProps) {
  return (
    <section className="rounded-xl border border-border-black bg-element-bg/55 px-2.5 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-black/70 bg-panel-bg/80 px-2.5 py-2">
      <span className="text-[11px] leading-4 text-text-secondary">{label}</span>
      <Switch checked={checked} onChange={onChange} size="sm" />
    </div>
  );
}

export function SettingsModal() {
  const {
    isSettingsOpen,
    settingsPos,
    closeSettings,
    setSettingsPos,
    lang,
    setLang,
    theme,
    setTheme,
    showImportWarning,
    setShowImportWarning,
    showWorldOriginAxes,
    showUsageGuide,
    setViewOption,
    fontSize,
    setFontSize,
  } = useUIStore(
    useShallow((state) => ({
      isSettingsOpen: state.isSettingsOpen,
      settingsPos: state.settingsPos,
      closeSettings: state.closeSettings,
      setSettingsPos: state.setSettingsPos,
      lang: state.lang,
      setLang: state.setLang,
      theme: state.theme,
      setTheme: state.setTheme,
      showImportWarning: state.showImportWarning,
      setShowImportWarning: state.setShowImportWarning,
      showWorldOriginAxes: state.viewOptions.showAxes,
      showUsageGuide: state.viewOptions.showUsageGuide,
      setViewOption: state.setViewOption,
      fontSize: state.fontSize,
      setFontSize: state.setFontSize,
    })),
  );
  const t = translations[lang];
  const panelRef = React.useRef<HTMLDivElement>(null);

  const maxPanelWidth = typeof window !== 'undefined'
    ? Math.max(DEFAULT_SETTINGS_MIN_WIDTH, Math.min(DEFAULT_SETTINGS_MAX_WIDTH, window.innerWidth - SETTINGS_VIEWPORT_MARGIN * 2))
    : DEFAULT_SETTINGS_MAX_WIDTH;

  const maxPanelHeight = typeof window !== 'undefined'
    ? Math.max(DEFAULT_SETTINGS_MIN_HEIGHT, Math.min(DEFAULT_SETTINGS_MAX_HEIGHT, window.innerHeight - SETTINGS_VIEWPORT_MARGIN * 2))
    : DEFAULT_SETTINGS_MAX_HEIGHT;

  const clampSettingsPosition = React.useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') {
      return { x, y };
    }

    const rect = panelRef.current?.getBoundingClientRect();
    const width = rect?.width ?? DEFAULT_SETTINGS_WIDTH;
    const height = rect?.height ?? SETTINGS_ESTIMATED_HEIGHT;

    return {
      x: clamp(x, SETTINGS_VIEWPORT_MARGIN, window.innerWidth - width - SETTINGS_VIEWPORT_MARGIN),
      y: clamp(y, SETTINGS_VIEWPORT_MARGIN, window.innerHeight - height - SETTINGS_VIEWPORT_MARGIN),
    };
  }, []);

  React.useEffect(() => {
    if (!isSettingsOpen || typeof window === 'undefined' || !panelRef.current) {
      return undefined;
    }

    const syncPosition = () => {
      const currentPos = useUIStore.getState().settingsPos;
      const nextPos = clampSettingsPosition(currentPos.x, currentPos.y);

      if (nextPos.x !== currentPos.x || nextPos.y !== currentPos.y) {
        setSettingsPos(nextPos);
      }
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', syncPosition);
      };
    }

    const observer = new ResizeObserver(() => {
      syncPosition();
    });

    observer.observe(panelRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncPosition);
    };
  }, [clampSettingsPosition, isSettingsOpen, setSettingsPos]);

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
      const nextPosition = clampSettingsPosition(initialX + dx, initialY + dy);
      setSettingsPos(nextPosition);
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
      ref={panelRef}
      style={{ left: settingsPos.x, top: settingsPos.y }}
      className="fixed z-[100] pointer-events-auto"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <OptionsPanelContainer
        width={DEFAULT_SETTINGS_WIDTH}
        minWidth={DEFAULT_SETTINGS_MIN_WIDTH}
        maxWidth={maxPanelWidth}
        minHeight={DEFAULT_SETTINGS_MIN_HEIGHT}
        maxHeight={maxPanelHeight}
        resizable
        resizeTitle={t.resize}
        className="overflow-hidden rounded-2xl shadow-xl"
      >
        <div
          onMouseDown={handleDragStart}
          className="flex cursor-move select-none items-center justify-between gap-3 border-b border-border-black bg-element-bg px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="rounded-md border border-border-black bg-panel-bg p-1 text-system-blue shadow-sm">
              <Settings className="h-3.5 w-3.5" />
            </div>
            <h2 className="truncate text-[13px] font-semibold text-text-primary">
              {t.settings}
            </h2>
          </div>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <IconButton
              onClick={closeSettings}
              size="sm"
              variant="close"
              aria-label={t.close}
            >
              <X className="w-3.5 h-3.5" />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3">
          <SettingsSection
            icon={<Languages className="h-3 w-3" />}
            title={t.language}
          >
            <SegmentedControl
              options={[
                { value: 'en', label: 'English' },
                { value: 'zh', label: '中文' },
              ]}
              value={lang}
              onChange={(val) => setLang(val as 'en' | 'zh')}
              size="xs"
              className="w-full"
            />
          </SettingsSection>

          <SettingsSection
            icon={theme === 'light' ? <Sun className="h-3 w-3" /> : theme === 'dark' ? <Moon className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
            title={t.theme}
          >
            <SegmentedControl
              options={[
                { value: 'light', label: t.light, icon: <Sun className="h-3 w-3" /> },
                { value: 'dark', label: t.dark, icon: <Moon className="h-3 w-3" /> },
                { value: 'system', label: t.system, icon: <Monitor className="h-3 w-3" /> },
              ]}
              value={theme}
              onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
              size="xs"
              className="w-full"
            />
          </SettingsSection>

          <div className="rounded-xl border border-border-black bg-element-bg/55 px-2.5 py-2.5">
            <ToggleRow
              label={t.importWarning}
              checked={showImportWarning}
              onChange={setShowImportWarning}
            />
          </div>

          <SettingsSection
            icon={<Monitor className="h-3 w-3" />}
            title={t.viewOptions}
          >
            <div className="space-y-1.5">
              <ToggleRow
                label={t.showWorldOriginAxes}
                checked={showWorldOriginAxes}
                onChange={(checked) => setViewOption('showAxes', checked)}
              />
              <ToggleRow
                label={t.showUsageGuide}
                checked={showUsageGuide}
                onChange={(checked) => setViewOption('showUsageGuide', checked)}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Type className="h-3 w-3" />}
            title={t.fontSize}
          >
            <div className="space-y-2">
              <SegmentedControl
                options={[
                  { value: 'small', label: t.small },
                  { value: 'medium', label: t.medium },
                  { value: 'large', label: t.large },
                ]}
                value={fontSize}
                onChange={(val) => setFontSize(val as 'small' | 'medium' | 'large')}
                size="xs"
                className="w-full"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFontSize('medium');
                }}
                className="w-full justify-center"
                icon={<RotateCcw className="h-3 w-3" />}
              >
                {t.resetFontSize}
              </Button>
            </div>
          </SettingsSection>
        </div>
      </OptionsPanelContainer>
    </div>
  );
}

export default SettingsModal;
