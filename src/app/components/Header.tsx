/**
 * App Header Component
 * Contains logo, menus, mode switcher, and action buttons
 */
import React from 'react';
import {
  Download,
  Activity,
  Box,
  Cpu,
  Upload,
  Check,
  Globe,
  ScanSearch,
  Info,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Briefcase,
  Undo,
  Redo,
  Code,
  Settings,
  Camera,
  Eye,
  MoreHorizontal,
  Folder,
  LayoutGrid,
} from 'lucide-react';
import { useUIStore, useCanUndo, useCanRedo, useRobotStore } from '@/store';
import { translations } from '@/shared/i18n';
import type { AppMode, Theme } from '@/types';

/**
 * Unified Header Button Component
 * Provides consistent styling for all navigation buttons
 */
function HeaderButton({
  isActive,
  onClick,
  children,
  className = '',
  title,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
        isActive
          ? 'bg-element-bg dark:bg-element-active text-text-primary dark:text-white'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-900 dark:hover:text-white'
      } ${className}`}
      title={title}
    >
      {children}
    </button>
  );
}

interface HeaderProps {
  // Import actions
  onImportFile: () => void;
  onImportFolder: () => void;
  onExport: () => void;
  onExportURDF: () => void;
  onExportMJCF: () => void;
  onExportProject: () => void;
  // Modal actions
  onOpenAI: () => void;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onOpenURDFGallery: () => void;
  // Snapshot
  onSnapshot: () => void;
  // View config
  viewConfig: {
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  };
  setViewConfig: React.Dispatch<React.SetStateAction<{
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  }>>;
}

export function Header({
  onImportFile,
  onImportFolder,
  onExport,
  onExportURDF,
  onExportMJCF,
  onExportProject,
  onOpenAI,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onOpenSettings,
  onOpenAbout,
  onOpenURDFGallery,
  onSnapshot,
  viewConfig,
  setViewConfig,
}: HeaderProps) {
  // Store state
  const appMode = useUIStore((state) => state.appMode);
  const setAppMode = useUIStore((state) => state.setAppMode);
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const lang = useUIStore((state) => state.lang);
  const setLang = useUIStore((state) => state.setLang);
  const activeMenu = useUIStore((state) => state.activeMenu);
  const setActiveMenu = useUIStore((state) => state.setActiveMenu);

  // Robot store
  const undo = useRobotStore((state) => state.undo);
  const redo = useRobotStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const t = translations[lang];
  const [isExportSubmenuOpen, setIsExportSubmenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (activeMenu !== 'file') {
      setIsExportSubmenuOpen(false);
    }
  }, [activeMenu]);

  return (
    <header className="h-12 border-b flex items-center px-3 shrink-0 relative bg-panel-bg dark:bg-panel-bg border-border-black">
      {/* Left Section - Logo & Menus */}
      <div className="flex items-center gap-1 shrink-0 flex-1 min-w-0">
        {/* Logo */}
        <div className="flex items-center gap-2 pr-3 mr-1 border-r border-border-black">
          <img src="/logos/logo.png" alt="Logo" className="w-7 h-7 object-contain" />
        </div>

        {/* Menu Buttons */}
        <div className="flex items-center">
          {/* File Menu */}
          <div className="relative">
            <HeaderButton
              isActive={activeMenu === 'file'}
              onClick={() => {
                const nextMenu = activeMenu === 'file' ? null : 'file';
                setActiveMenu(nextMenu);
                if (nextMenu !== 'file') {
                  setIsExportSubmenuOpen(false);
                }
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t.file}</span>
              <ChevronDown className={`w-3 h-3 opacity-60 transition-transform hidden md:inline ${activeMenu === 'file' ? 'rotate-180' : ''}`} />
            </HeaderButton>

            {activeMenu === 'file' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setActiveMenu(null); setIsExportSubmenuOpen(false); }} />
                <div className="absolute top-full left-0 mt-1 w-auto min-w-[10.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-visible py-1">
                  <button
                    onClick={() => { setActiveMenu(null); setTimeout(onImportFolder, 0); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center gap-2.5"
                  >
                    <Folder className="w-4 h-4 text-slate-400" />
                    {t.importFolder}
                  </button>
                  <button
                    onClick={() => { setActiveMenu(null); setTimeout(onImportFile, 0); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center gap-2.5"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    {lang === 'zh' ? '导入 USP / ZIP / 文件' : 'Import USP / ZIP / File'}
                  </button>
                  <div className="h-px bg-element-bg dark:bg-border-black my-1" />
                  <div
                    className="relative"
                    onMouseEnter={() => setIsExportSubmenuOpen(true)}
                    onMouseLeave={() => setIsExportSubmenuOpen(false)}
                  >
                    <button
                      onClick={() => setIsExportSubmenuOpen((prev) => !prev)}
                      className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2.5">
                        <Upload className="w-4 h-4 text-slate-400" />
                        {t.export}
                      </span>
                      <ChevronRight className={`w-3 h-3 opacity-60 transition-transform ${isExportSubmenuOpen ? 'text-system-blue dark:text-system-blue-light' : ''}`} />
                    </button>

                    {isExportSubmenuOpen && (
                      <div className="absolute top-0 left-full ml-1 w-auto min-w-[8.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-[60] py-1">
                        <button
                          onClick={() => { setIsExportSubmenuOpen(false); setActiveMenu(null); onExportURDF(); }}
                          className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200"
                        >
                          {lang === 'zh' ? 'URDF 导出 (ZIP)' : 'Export URDF (ZIP)'}
                        </button>
                        <button
                          onClick={() => { setIsExportSubmenuOpen(false); setActiveMenu(null); onExportMJCF(); }}
                          className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200"
                        >
                          {lang === 'zh' ? 'MJCF 导出 (ZIP)' : 'Export MJCF (ZIP)'}
                        </button>
                        <button
                          onClick={() => { setIsExportSubmenuOpen(false); setActiveMenu(null); onExport(); }}
                          className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200"
                        >
                          {lang === 'zh' ? '全部导出' : 'Export All'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setActiveMenu(null); onExportProject(); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center gap-2.5"
                  >
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    {t.exportProject}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Toolbox Menu */}
          <div className="relative">
            <HeaderButton
              isActive={activeMenu === 'toolbox'}
              onClick={() => setActiveMenu(activeMenu === 'toolbox' ? null : 'toolbox')}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t.toolbox}</span>
              <ChevronDown className={`w-3 h-3 opacity-60 transition-transform hidden md:inline ${activeMenu === 'toolbox' ? 'rotate-180' : ''}`} />
            </HeaderButton>

            {activeMenu === 'toolbox' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                <div className="absolute top-full left-0 mt-1 w-auto min-w-[14rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 p-2">
                  <div className="space-y-1">
                    <button
                      onClick={() => { setActiveMenu(null); onOpenAI(); }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-element-bg dark:hover:bg-element-bg transition-all group"
                    >
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-transparent text-system-blue dark:bg-element-bg dark:text-system-blue shrink-0">
                        <ScanSearch className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-medium text-text-primary dark:text-text-secondary">{t.aiAssistant}</div>
                        <div className="text-[10px] text-text-tertiary dark:text-text-tertiary">{t.aiAssistantDesc}</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setActiveMenu(null); window.open('https://motion-tracking.axell.top/', '_blank'); }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-element-bg dark:hover:bg-element-bg transition-all group"
                    >
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-transparent text-emerald-500 dark:bg-element-bg dark:text-emerald-400 shrink-0">
                        <RefreshCw className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-medium text-text-primary dark:text-text-secondary">{t.robotRedirect}</div>
                        <div className="text-[10px] text-text-tertiary dark:text-text-tertiary">{t.motionTrackingDesc}</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setActiveMenu(null); window.open('https://motion-editor.cyoahs.dev/', '_blank'); }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-element-bg dark:hover:bg-element-bg transition-all group"
                    >
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-transparent text-violet-500 dark:bg-element-bg dark:text-violet-400 shrink-0">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-medium text-text-primary dark:text-text-secondary">{t.trajectoryEditing}</div>
                        <div className="text-[10px] text-text-tertiary dark:text-text-tertiary">{t.trajectoryEditingDesc}</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setActiveMenu(null); window.open('https://engine.bridgedp.com/', '_blank'); }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-element-bg dark:hover:bg-element-bg transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-border-black bg-white dark:bg-element-bg p-1.5 shrink-0">
                        <img src="/logos/bridgedp-logo.png" alt="BridgeDP" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-medium text-text-primary dark:text-text-secondary">{t.bridgedpEngine}</div>
                        <div className="text-[10px] text-text-tertiary dark:text-text-tertiary">{t.bridgedpEngineDesc}</div>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <HeaderButton
              isActive={activeMenu === 'view'}
              onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{lang === 'zh' ? '视图' : 'View'}</span>
              <ChevronDown className={`w-3 h-3 opacity-60 transition-transform hidden md:inline ${activeMenu === 'view' ? 'rotate-180' : ''}`} />
            </HeaderButton>

            {activeMenu === 'view' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                <div className="absolute top-full left-0 mt-1 w-auto min-w-[10.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-hidden py-1">
                  <ViewMenuItem
                    checked={viewConfig.showToolbar}
                    label={lang === 'zh' ? '工具栏' : 'Toolbar'}
                    onClick={() => setViewConfig(prev => ({ ...prev, showToolbar: !prev.showToolbar }))}
                  />
                  <ViewMenuItem
                    checked={viewConfig.showOptionsPanel}
                    label={lang === 'zh' ? '细节选项' : 'Detail Options'}
                    onClick={() => setViewConfig(prev => ({ ...prev, showOptionsPanel: !prev.showOptionsPanel }))}
                  />
                  <ViewMenuItem
                    checked={viewConfig.showSkeletonOptionsPanel}
                    label={lang === 'zh' ? '骨架/硬件选项' : 'Skeleton/Hardware Options'}
                    onClick={() => setViewConfig(prev => ({ ...prev, showSkeletonOptionsPanel: !prev.showSkeletonOptionsPanel }))}
                  />
                  <ViewMenuItem
                    checked={viewConfig.showJointPanel}
                    label={lang === 'zh' ? '关节控制' : 'Joint Controls'}
                    onClick={() => setViewConfig(prev => ({ ...prev, showJointPanel: !prev.showJointPanel }))}
                  />
                </div>
              </>
            )}
          </div>

          <div className="w-px h-5 bg-border-black mx-1.5 hidden md:block" />

          {/* Source Code Button */}
          <div className="relative hidden md:block">
            <button
              onClick={onOpenCodeViewer}
              onMouseEnter={onPrefetchCodeViewer}
              onFocus={onPrefetchCodeViewer}
              onPointerDown={onPrefetchCodeViewer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-900 dark:hover:text-white"
            >
              <Code className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{lang === 'zh' ? '源代码' : 'Source Code'}</span>
            </button>
          </div>

          <div className="w-px h-5 bg-border-black mx-1.5 hidden md:block" />

          {/* Undo/Redo */}
          <div className="items-center gap-0.5 hidden md:flex">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 rounded-md transition-all ${
                !canUndo
                  ? 'text-slate-300 dark:text-element-hover cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-900 dark:hover:text-white'
              }`}
              title={lang === 'zh' ? '撤销 (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 rounded-md transition-all ${
                !canRedo
                  ? 'text-slate-300 dark:text-element-hover cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-900 dark:hover:text-white'
              }`}
              title={lang === 'zh' ? '重做 (Ctrl+Shift+Z)' : 'Redo (Ctrl+Shift+Z)'}
            >
              <Redo className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switcher - Inline on small screens */}
          <div className="flex items-center ml-2 lg:hidden">
            <ModeSwitcher appMode={appMode} setAppMode={setAppMode} t={t} compact />
          </div>
        </div>
      </div>

      {/* Center - Mode Switcher - Large screens only */}
      <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <ModeSwitcher appMode={appMode} setAppMode={setAppMode} t={t} />
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center gap-0.5 shrink-0 ml-auto">
        <button
          onClick={onOpenURDFGallery}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-system-blue dark:text-white hover:bg-system-blue-solid hover:text-white dark:hover:bg-system-blue-solid transition-all hidden sm:flex"
          title={t.urdfGallery}
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="hidden lg:inline">{t.gallery}</span>
        </button>

        <button
          onClick={onSnapshot}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={lang === 'zh' ? '快照' : 'Snapshot'}
        >
          <Camera className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={lang === 'zh' ? '设置' : 'Settings'}
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={lang === 'zh' ? '切换语言' : 'Switch Language'}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">{lang === 'en' ? 'EN' : '中'}</span>
        </button>

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
          title={lang === 'zh' ? '切换主题' : 'Toggle Theme'}
        >
          {theme === 'system' ? <Monitor className="w-4 h-4" /> : theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="w-px h-5 bg-border-black mx-1 hidden sm:block" />

        <button
          onClick={onOpenAbout}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
          title={lang === 'zh' ? '关于' : 'About'}
        >
          <Info className="w-4 h-4" />
        </button>

        {/* Mobile/Tablet "More" Menu */}
        <MobileMoreMenu
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
          onOpenCodeViewer={onOpenCodeViewer}
          onPrefetchCodeViewer={onPrefetchCodeViewer}
          onSnapshot={onSnapshot}
          onOpenSettings={onOpenSettings}
          onOpenAbout={onOpenAbout}
          t={t}
        />
      </div>
    </header>
  );
}

// Helper component for view menu items
function ViewMenuItem({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center justify-between group"
    >
      <div className="flex items-center gap-2">
        <div className={`w-4 h-4 flex items-center justify-center rounded border ${
          checked
            ? 'bg-system-blue border-system-blue text-white'
            : 'border-border-strong'
        }`}>
          {checked && <Check className="w-3 h-3" />}
        </div>
        <span>{label}</span>
      </div>
    </button>
  );
}

// Mode Switcher component
function ModeSwitcher({
  appMode,
  setAppMode,
  t,
  compact = false,
}: {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  t: typeof translations['en'];
  compact?: boolean;
}) {
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

function ModeButton({
  mode,
  current,
  setMode,
  icon,
  label,
  title,
}: {
  mode: AppMode;
  current: AppMode;
  setMode: (mode: AppMode) => void;
  icon: React.ReactNode;
  label?: string;
  title?: string;
}) {
  const isActive = current === mode;
  return (
    <button
      onClick={() => setMode(mode)}
      className={`flex items-center ${label ? 'gap-1.5 px-3' : 'justify-center'} p-1.5 rounded-md text-xs font-medium transition-all ${
        isActive
          ? 'bg-white dark:bg-segmented-active text-text-primary dark:text-white shadow-sm dark:shadow-md'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
      }`}
      title={title}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

// Mobile More Menu
function MobileMoreMenu({
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
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onSnapshot,
  onOpenSettings,
  onOpenAbout,
  t,
}: {
  lang: 'en' | 'zh';
  theme: Theme;
  appMode: AppMode;
  canUndo: boolean;
  canRedo: boolean;
  activeMenu: 'file' | 'toolbox' | 'view' | 'more' | null;
  setActiveMenu: (menu: 'file' | 'toolbox' | 'view' | 'more' | null) => void;
  setAppMode: (mode: AppMode) => void;
  setLang: (lang: 'en' | 'zh') => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  redo: () => void;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onSnapshot: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  t: typeof translations['en'];
}) {
  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setActiveMenu(activeMenu === 'more' ? null : 'more')}
        className={`relative z-50 flex items-center justify-center w-8 h-8 rounded-md transition-all ${
          activeMenu === 'more'
            ? 'bg-element-bg dark:bg-element-active text-text-primary dark:text-white'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg'
        }`}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {activeMenu === 'more' && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
          <div className="absolute top-full right-0 mt-1 w-auto min-w-[10.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-hidden py-1">
            {/* Mode Switcher for Mobile */}
            <div className="px-3 py-2 border-b border-border-black dark:border-border-black md:hidden">
              <div className="text-[10px] uppercase text-text-tertiary font-bold mb-1">{t.modeLabel}</div>
              <div className="flex gap-1 bg-element-bg dark:bg-app-bg p-0.5 rounded-lg border border-border-black">
                <button
                  onClick={() => { setAppMode('skeleton'); setActiveMenu(null); }}
                  className={`flex-1 p-1.5 rounded text-center text-xs ${appMode === 'skeleton' ? 'bg-white dark:bg-segmented-active text-system-blue dark:text-white shadow-sm' : 'text-text-secondary dark:text-text-tertiary'}`}
                >
                  <Activity className="w-4 h-4 mx-auto" />
                </button>
                <button
                  onClick={() => { setAppMode('detail'); setActiveMenu(null); }}
                  className={`flex-1 p-1.5 rounded text-center text-xs ${appMode === 'detail' ? 'bg-white dark:bg-segmented-active text-system-blue dark:text-white shadow-sm' : 'text-text-secondary dark:text-text-tertiary'}`}
                >
                  <Box className="w-4 h-4 mx-auto" />
                </button>
                <button
                  onClick={() => { setAppMode('hardware'); setActiveMenu(null); }}
                  className={`flex-1 p-1.5 rounded text-center text-xs ${appMode === 'hardware' ? 'bg-white dark:bg-segmented-active text-system-blue dark:text-white shadow-sm' : 'text-text-secondary dark:text-text-tertiary'}`}
                >
                  <Cpu className="w-4 h-4 mx-auto" />
                </button>
              </div>
            </div>

            <button
              onClick={() => { onOpenCodeViewer(); setActiveMenu(null); }}
              onMouseEnter={onPrefetchCodeViewer}
              onFocus={onPrefetchCodeViewer}
              onTouchStart={onPrefetchCodeViewer}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
            >
              <Code className="w-4 h-4" /> {lang === 'zh' ? '源代码' : 'Source Code'}
            </button>
            <button
              onClick={() => { undo(); setActiveMenu(null); }}
              disabled={!canUndo}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3 disabled:opacity-50"
            >
              <Undo className="w-4 h-4" /> {lang === 'zh' ? '撤销' : 'Undo'}
            </button>
            <button
              onClick={() => { redo(); setActiveMenu(null); }}
              disabled={!canRedo}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3 disabled:opacity-50"
            >
              <Redo className="w-4 h-4" /> {lang === 'zh' ? '重做' : 'Redo'}
            </button>

            <div className="h-px bg-element-bg dark:bg-border-black my-1" />

            <button
              onClick={() => { onSnapshot(); setActiveMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
            >
              <Camera className="w-4 h-4" /> {lang === 'zh' ? '快照' : 'Snapshot'}
            </button>
            <button
              onClick={() => { onOpenSettings(); setActiveMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
            >
              <Settings className="w-4 h-4" /> {lang === 'zh' ? '设置' : 'Settings'}
            </button>
            <button
              onClick={() => { setLang(lang === 'en' ? 'zh' : 'en'); setActiveMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
            >
              <Globe className="w-4 h-4" /> {lang === 'zh' ? '切换语言' : 'Switch Language'}
            </button>
            <button
              onClick={() => { 
                if (theme === 'system') {
                  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  setTheme(isSystemDark ? 'light' : 'dark');
                } else {
                  setTheme(theme === 'dark' ? 'light' : 'dark'); 
                }
                setActiveMenu(null); 
              }}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
            >
              {theme === 'system' ? <Monitor className="w-4 h-4" /> : theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} {lang === 'zh' ? '切换主题' : 'Toggle Theme'}
            </button>
            <button
              onClick={() => { onOpenAbout(); setActiveMenu(null); }}
              className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
            >
              <Info className="w-4 h-4" /> {lang === 'zh' ? '关于' : 'About'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Header;
