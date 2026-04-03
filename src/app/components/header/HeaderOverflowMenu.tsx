import {
  Camera,
  Code,
  Globe,
  Moon,
  Monitor,
  MoreHorizontal,
  Redo,
  Settings,
  Sun,
  Undo,
} from 'lucide-react';
import type { HeaderOverflowMenuProps } from './types';

export function HeaderOverflowMenu({
  className = '',
  lang,
  theme,
  canUndo,
  canRedo,
  activeMenu,
  setActiveMenu,
  setLang,
  setTheme,
  undo,
  redo,
  quickAction,
  secondaryAction,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onSnapshot,
  onOpenSettings,
  t,
  showQuickAction,
  showSourceCode,
  showUndoRedo,
  showSnapshot,
  showSettings,
  showLanguage,
  showTheme,
  showSecondaryAction,
}: HeaderOverflowMenuProps) {
  const QuickActionIcon = quickAction?.icon;
  const SecondaryActionIcon = secondaryAction?.icon;
  const showPrimaryGroup = showQuickAction || showSourceCode || showUndoRedo;
  const showSecondaryGroup =
    showSnapshot || showSettings || showLanguage || showTheme || showSecondaryAction;

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setActiveMenu(activeMenu === 'more' ? null : 'more')}
        className={`relative z-50 flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
          activeMenu === 'more'
            ? 'bg-element-bg dark:bg-element-active text-text-primary dark:text-white'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg'
        }`}
        title={t.more}
        aria-label={t.more}
        aria-haspopup="menu"
        aria-expanded={activeMenu === 'more'}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {activeMenu === 'more' && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
          <div
            className="absolute top-full right-0 mt-1 w-auto min-w-[10.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-hidden py-1"
            role="menu"
            aria-label={t.more}
          >
            {showPrimaryGroup && (
              <>
                {showQuickAction && quickAction && QuickActionIcon && (
                  <button
                    type="button"
                    onClick={(event) => {
                      quickAction.onClick(event);
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <QuickActionIcon className="w-4 h-4" /> {quickAction.label}
                  </button>
                )}
                {showSourceCode && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenCodeViewer();
                      setActiveMenu(null);
                    }}
                    onMouseEnter={onPrefetchCodeViewer}
                    onFocus={onPrefetchCodeViewer}
                    onTouchStart={onPrefetchCodeViewer}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Code className="w-4 h-4" /> {t.sourceCode}
                  </button>
                )}
                {showUndoRedo && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        undo();
                        setActiveMenu(null);
                      }}
                      disabled={!canUndo}
                      className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3 disabled:opacity-50"
                    >
                      <Undo className="w-4 h-4" /> {t.undo}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        redo();
                        setActiveMenu(null);
                      }}
                      disabled={!canRedo}
                      className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3 disabled:opacity-50"
                    >
                      <Redo className="w-4 h-4" /> {t.redo}
                    </button>
                  </>
                )}
              </>
            )}

            {showPrimaryGroup && showSecondaryGroup && (
              <div className="h-px bg-element-bg dark:bg-border-black my-1" />
            )}

            {showSecondaryGroup && (
              <>
                {showSecondaryAction && secondaryAction && SecondaryActionIcon && (
                  <button
                    type="button"
                    onClick={(event) => {
                      secondaryAction.onClick(event);
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <SecondaryActionIcon className="w-4 h-4" /> {secondaryAction.label}
                  </button>
                )}
                {showSnapshot && (
                  <button
                    type="button"
                    onClick={() => {
                      onSnapshot();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Camera className="w-4 h-4" /> {t.snapshot}
                  </button>
                )}
                {showSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettings();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4" /> {t.settings}
                  </button>
                )}
                {showLanguage && (
                  <button
                    type="button"
                    onClick={() => {
                      setLang(lang === 'en' ? 'zh' : 'en');
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Globe className="w-4 h-4" /> {t.switchLanguage}
                  </button>
                )}
                {showTheme && (
                  <button
                    type="button"
                    onClick={() => {
                      if (theme === 'system') {
                        const isSystemDark = window.matchMedia(
                          '(prefers-color-scheme: dark)',
                        ).matches;
                        setTheme(isSystemDark ? 'light' : 'dark');
                      } else {
                        setTheme(theme === 'dark' ? 'light' : 'dark');
                      }
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    {theme === 'system' ? (
                      <Monitor className="w-4 h-4" />
                    ) : theme === 'dark' ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}{' '}
                    {t.toggleTheme}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
