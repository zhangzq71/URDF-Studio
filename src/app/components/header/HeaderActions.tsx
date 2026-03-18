import { Camera, Globe, Info, Moon, Monitor, Settings, Sun, User } from 'lucide-react';
import type { AppMode, Theme } from '@/types';
import type { HeaderQuickAction, HeaderResponsiveLayout, HeaderTranslations, HeaderMenuKey } from './types';
import { HeaderOverflowMenu } from './HeaderOverflowMenu';

interface HeaderActionsProps {
  responsive: HeaderResponsiveLayout;
  lang: 'en' | 'zh';
  theme: Theme;
  appMode: AppMode;
  canUndo: boolean;
  canRedo: boolean;
  activeMenu: HeaderMenuKey;
  setActiveMenu: (menu: HeaderMenuKey) => void;
  setAppMode: (mode: AppMode) => void;
  setLang: (lang: 'en' | 'zh') => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  redo: () => void;
  quickAction?: HeaderQuickAction;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onSnapshot: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onOpenUser?: React.MouseEventHandler;
  t: HeaderTranslations;
}

export function HeaderActions({
  responsive,
  lang,
  theme,
  appMode,
  canUndo,
  canRedo,
  activeMenu,
  setActiveMenu,
  setAppMode,
  setLang,
  setTheme,
  undo,
  redo,
  quickAction,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onSnapshot,
  onOpenSettings,
  onOpenAbout,
  onOpenUser,
  t,
}: HeaderActionsProps) {
  const {
    showQuickActionInline,
    showQuickActionLabel,
    showSnapshotInline,
    showSettingsInline,
    showLanguageInline,
    showThemeInline,
    showAboutInline,
    showUserInline,
    showDesktopOverflow,
  } = responsive;
  const QuickActionIcon = quickAction?.icon;

  return (
    <div className="flex items-center gap-0.5 shrink-0 justify-self-end">
      {showQuickActionInline && quickAction && QuickActionIcon && (
        <button
          onClick={quickAction.onClick}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-system-blue dark:text-white hover:bg-system-blue-solid hover:text-white dark:hover:bg-system-blue-solid transition-all hidden sm:flex"
          title={quickAction.title ?? quickAction.label}
        >
          <QuickActionIcon className="w-4 h-4" />
          {showQuickActionLabel && <span>{quickAction.label}</span>}
        </button>
      )}

      {showSnapshotInline && (
        <button
          onClick={onSnapshot}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={t.snapshot}
        >
          <Camera className="w-4 h-4" />
        </button>
      )}

      {showSettingsInline && (
        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={t.settings}
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {showLanguageInline && (
        <button
          onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={t.switchLanguage}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">{lang === 'en' ? 'EN' : '中'}</span>
        </button>
      )}

      {showThemeInline && (
        <button
          onClick={() => {
            if (theme === 'system') {
              const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              setTheme(isSystemDark ? 'light' : 'dark');
            } else {
              setTheme(theme === 'dark' ? 'light' : 'dark');
            }
          }}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={t.toggleTheme}
        >
          {theme === 'system' ? <Monitor className="w-4 h-4" /> : theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}

      {(showThemeInline || showDesktopOverflow || showAboutInline) && <div className="w-px h-5 bg-border-black mx-1 hidden sm:block" />}

      {showDesktopOverflow && (
        <HeaderOverflowMenu
          className="hidden sm:block"
          lang={lang}
          theme={theme}
          appMode={appMode}
          canUndo={canUndo}
          canRedo={canRedo}
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          setAppMode={setAppMode}
          setLang={setLang}
          setTheme={setTheme}
          undo={undo}
          redo={redo}
          quickAction={quickAction}
          onOpenCodeViewer={onOpenCodeViewer}
          onPrefetchCodeViewer={onPrefetchCodeViewer}
          onSnapshot={onSnapshot}
          onOpenSettings={onOpenSettings}
          onOpenAbout={onOpenAbout}
          onOpenUser={onOpenUser}
          t={t}
          showQuickAction={Boolean(quickAction) && !showQuickActionInline}
          showModeSwitcher={false}
          showSourceCode={!responsive.showSourceInline}
          showUndoRedo={!responsive.showUndoRedoInline}
          showSnapshot={!showSnapshotInline}
          showSettings={!showSettingsInline}
          showLanguage={!showLanguageInline}
          showTheme={!showThemeInline}
          showAbout={!showAboutInline}
          showUser={!showUserInline}
        />
      )}

      {showAboutInline && (
        <button
          onClick={onOpenAbout}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={t.about}
        >
          <Info className="w-4 h-4" />
        </button>
      )}

      {showUserInline && (
        <button
          onClick={onOpenUser}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-system-blue dark:text-white hover:bg-system-blue-solid hover:text-white dark:hover:bg-system-blue-solid transition-all hidden sm:flex"
          title={t.user}
        >
          <User className="w-4 h-4" />
          <span className="hidden lg:inline">{t.user}</span>
        </button>
      )}

      <HeaderOverflowMenu
        className="sm:hidden"
        lang={lang}
        theme={theme}
        appMode={appMode}
        canUndo={canUndo}
        canRedo={canRedo}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        setAppMode={setAppMode}
        setLang={setLang}
        setTheme={setTheme}
        undo={undo}
        redo={redo}
        quickAction={quickAction}
        onOpenCodeViewer={onOpenCodeViewer}
        onPrefetchCodeViewer={onPrefetchCodeViewer}
        onSnapshot={onSnapshot}
        onOpenSettings={onOpenSettings}
        onOpenAbout={onOpenAbout}
        onOpenUser={onOpenUser}
        t={t}
        showQuickAction={Boolean(quickAction)}
        showModeSwitcher
        showSourceCode
        showUndoRedo
        showSnapshot
        showSettings
        showLanguage
        showTheme
        showAbout
        showUser
      />
    </div>
  );
}
