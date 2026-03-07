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
  Pencil,
  Upload,
  Check,
  Globe,
  ScanSearch,
  Info,
  ChevronDown,
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
import { useUIStore, useCanUndo, useCanRedo, useRobotStore, useSelectionStore } from '@/store';
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
      className={`relative z-50 shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md whitespace-nowrap text-xs font-medium transition-all ${
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
  onOpenExport: () => void;
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
  onOptimizeCollisionCylinders: () => void;
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
  onOpenExport,
  onExportProject,
  onOpenAI,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onOpenSettings,
  onOpenAbout,
  onOpenURDFGallery,
  onSnapshot,
  onOptimizeCollisionCylinders,
  viewConfig,
  setViewConfig,
}: HeaderProps) {
  const headerRef = React.useRef<HTMLElement | null>(null);
  const [headerWidth, setHeaderWidth] = React.useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 0
  ));

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

  const {
    showMenuLabels,
    showSourceInline,
    showSourceText,
    showUndoRedoInline,
    showFullModeSwitcher,
    showGalleryInline,
    showGalleryLabel,
    showSnapshotInline,
    showSettingsInline,
    showLanguageInline,
    showThemeInline,
    showAboutInline,
    showDesktopOverflow,
  } = React.useMemo(() => {
    const width = headerWidth;

    const showMenuLabels = width >= 1080;
    const showSourceInline = width >= 1120;
    const showSourceText = width >= 1280;
    const showUndoRedoInline = width >= 1400;
    const showFullModeSwitcher = width >= 1280;
    const showGalleryInline = width >= 720;
    const showGalleryLabel = width >= 1360;
    const showSnapshotInline = width >= 1024;
    const showSettingsInline = width >= 960;
    const showLanguageInline = width >= 900;
    const showThemeInline = width >= 840;
    const showAboutInline = width >= 780;

    return {
      showMenuLabels,
      showSourceInline,
      showSourceText,
      showUndoRedoInline,
      showFullModeSwitcher,
      showGalleryInline,
      showGalleryLabel,
      showSnapshotInline,
      showSettingsInline,
      showLanguageInline,
      showThemeInline,
      showAboutInline,
      showDesktopOverflow:
        width >= 640 && (
          !showGalleryInline ||
          !showSourceInline ||
          !showUndoRedoInline ||
          !showSnapshotInline ||
          !showSettingsInline ||
          !showLanguageInline ||
          !showThemeInline ||
          !showAboutInline
        ),
    };
  }, [headerWidth]);

  React.useLayoutEffect(() => {
    const node = headerRef.current;

    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.round(node.getBoundingClientRect().width);
      setHeaderWidth((prevWidth) => (prevWidth === nextWidth ? prevWidth : nextWidth));
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="h-12 border-b shrink-0 bg-panel-bg dark:bg-panel-bg border-border-black grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3"
    >
      {/* Left Section - Logo & Menus */}
      <div className="flex items-center gap-1 min-w-0">
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
                setActiveMenu(activeMenu === 'file' ? null : 'file');
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              {showMenuLabels && <span>{t.file}</span>}
              {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'file' ? 'rotate-180' : ''}`} />}
            </HeaderButton>

            {activeMenu === 'file' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setActiveMenu(null); }} />
                <div className="absolute top-full left-0 mt-1 w-max bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-visible py-1">
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
                  <button
                    onClick={() => { setActiveMenu(null); onOpenExport(); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center gap-2.5"
                  >
                    <Upload className="w-4 h-4 text-slate-400" />
                    {t.export}
                  </button>
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

          {/* Edit Menu */}
          <div className="relative">
            <HeaderButton
              isActive={activeMenu === 'edit'}
              onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
            >
              <Pencil className="w-3.5 h-3.5" />
              {showMenuLabels && <span>{lang === 'zh' ? '编辑' : 'Edit'}</span>}
              {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'edit' ? 'rotate-180' : ''}`} />}
            </HeaderButton>

            {activeMenu === 'edit' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                <div className="absolute top-full left-0 mt-1 w-max bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-visible py-1">
                  <button
                    onClick={() => {
                      undo();
                      setActiveMenu(null);
                    }}
                    disabled={!canUndo}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center justify-between gap-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2.5">
                      <Undo className="w-4 h-4 text-slate-400" />
                      {lang === 'zh' ? '撤销' : 'Undo'}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => {
                      redo();
                      setActiveMenu(null);
                    }}
                    disabled={!canRedo}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center justify-between gap-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2.5">
                      <Redo className="w-4 h-4 text-slate-400" />
                      {lang === 'zh' ? '重做' : 'Redo'}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Ctrl+Shift+Z</span>
                  </button>
                  <div className="h-px bg-element-bg dark:bg-border-black my-1" />
                  <div className="relative group">
                    <button
                      onClick={() => {
                        onOptimizeCollisionCylinders();
                        setActiveMenu(null);
                      }}
                      title={lang === 'zh'
                        ? '将所有 cylinder 碰撞体一键转换为 capsule'
                        : 'One-click convert all cylinder collision bodies to capsule'}
                      className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-50 dark:hover:bg-element-bg text-slate-700 dark:text-slate-200 flex items-center gap-2.5"
                    >
                      <RefreshCw className="w-4 h-4 text-slate-400" />
                      {lang === 'zh' ? '碰撞体优化' : 'Collision Optimization'}
                    </button>
                    <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block z-[60]">
                      <div className="rounded-md border border-border-black bg-panel-bg dark:bg-panel-bg px-2 py-1 text-[10px] text-text-secondary whitespace-nowrap shadow-md dark:shadow-xl">
                        {lang === 'zh'
                          ? '一键将所有 Cylinder 碰撞体转换为 Capsule'
                          : 'Convert all cylinder collisions to capsule'}
                      </div>
                    </div>
                  </div>
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
              {showMenuLabels && <span>{t.toolbox}</span>}
              {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'toolbox' ? 'rotate-180' : ''}`} />}
            </HeaderButton>

            {activeMenu === 'toolbox' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                <div className="absolute top-full left-0 mt-1 w-max bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 p-2">
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
              {showMenuLabels && <span>{lang === 'zh' ? '视图' : 'View'}</span>}
              {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'view' ? 'rotate-180' : ''}`} />}
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

          {showSourceInline && (
            <div className="relative hidden sm:block shrink-0 ml-1">
              <button
                onClick={onOpenCodeViewer}
                onMouseEnter={onPrefetchCodeViewer}
                onFocus={onPrefetchCodeViewer}
                onPointerDown={onPrefetchCodeViewer}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md whitespace-nowrap text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-900 dark:hover:text-white"
                title={lang === 'zh' ? '源代码' : 'Source Code'}
              >
                <Code className="w-3.5 h-3.5" />
                {showSourceText && <span>{lang === 'zh' ? '源代码' : 'Source Code'}</span>}
              </button>
            </div>
          )}

          {showUndoRedoInline && <div className="w-px h-5 bg-border-black mx-1.5 hidden sm:block" />}

          {showUndoRedoInline && (
            <div className="items-center gap-0.5 hidden sm:flex">
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
          )}

        </div>
      </div>

      {/* Center - Mode Switcher */}
      <div className="hidden md:flex justify-self-center">
        <ModeSwitcher appMode={appMode} setAppMode={setAppMode} t={t} compact={!showFullModeSwitcher} />
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center gap-0.5 shrink-0 justify-self-end">
        {showGalleryInline && (
          <button
            onClick={onOpenURDFGallery}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-system-blue dark:text-white hover:bg-system-blue-solid hover:text-white dark:hover:bg-system-blue-solid transition-all hidden sm:flex"
            title={t.urdfGallery}
          >
            <LayoutGrid className="w-4 h-4" />
            {showGalleryLabel && <span>{t.gallery}</span>}
          </button>
        )}

        {showSnapshotInline && (
          <button
            onClick={onSnapshot}
            className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
            title={lang === 'zh' ? '快照' : 'Snapshot'}
          >
            <Camera className="w-4 h-4" />
          </button>
        )}

        {showSettingsInline && (
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
            title={lang === 'zh' ? '设置' : 'Settings'}
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {showLanguageInline && (
          <button
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
            title={lang === 'zh' ? '切换语言' : 'Switch Language'}
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
            title={lang === 'zh' ? '切换主题' : 'Toggle Theme'}
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
            onOpenURDFGallery={onOpenURDFGallery}
            onOpenCodeViewer={onOpenCodeViewer}
            onPrefetchCodeViewer={onPrefetchCodeViewer}
            onSnapshot={onSnapshot}
            onOpenSettings={onOpenSettings}
            onOpenAbout={onOpenAbout}
            t={t}
            showGallery={!showGalleryInline}
            showModeSwitcher={false}
            showSourceCode={!showSourceInline}
            showUndoRedo={!showUndoRedoInline}
            showSnapshot={!showSnapshotInline}
            showSettings={!showSettingsInline}
            showLanguage={!showLanguageInline}
            showTheme={!showThemeInline}
            showAbout={!showAboutInline}
          />
        )}

        {showAboutInline && (
          <button
            onClick={onOpenAbout}
            className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg hover:text-slate-700 dark:hover:text-slate-200 transition-all hidden sm:flex"
            title={lang === 'zh' ? '关于' : 'About'}
          >
            <Info className="w-4 h-4" />
          </button>
        )}

        {/* Mobile/Tablet "More" Menu */}
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
          onOpenURDFGallery={onOpenURDFGallery}
          onOpenCodeViewer={onOpenCodeViewer}
          onPrefetchCodeViewer={onPrefetchCodeViewer}
          onSnapshot={onSnapshot}
          onOpenSettings={onOpenSettings}
          onOpenAbout={onOpenAbout}
          t={t}
          showGallery
          showModeSwitcher
          showSourceCode
          showUndoRedo
          showSnapshot
          showSettings
          showLanguage
          showTheme
          showAbout
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
      onClick={() => {
        useSelectionStore.getState().setFocusTarget(null);
        setMode(mode);
      }}
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

// Responsive overflow menu
function HeaderOverflowMenu({
  className = '',
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
  onOpenURDFGallery,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onSnapshot,
  onOpenSettings,
  onOpenAbout,
  t,
  showGallery,
  showModeSwitcher,
  showSourceCode,
  showUndoRedo,
  showSnapshot,
  showSettings,
  showLanguage,
  showTheme,
  showAbout,
}: {
  className?: string;
  lang: 'en' | 'zh';
  theme: Theme;
  appMode: AppMode;
  canUndo: boolean;
  canRedo: boolean;
  activeMenu: 'file' | 'edit' | 'toolbox' | 'view' | 'more' | null;
  setActiveMenu: (menu: 'file' | 'edit' | 'toolbox' | 'view' | 'more' | null) => void;
  setAppMode: (mode: AppMode) => void;
  setLang: (lang: 'en' | 'zh') => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  redo: () => void;
  onOpenURDFGallery: () => void;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onSnapshot: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  t: typeof translations['en'];
  showGallery: boolean;
  showModeSwitcher: boolean;
  showSourceCode: boolean;
  showUndoRedo: boolean;
  showSnapshot: boolean;
  showSettings: boolean;
  showLanguage: boolean;
  showTheme: boolean;
  showAbout: boolean;
}) {
  const showPrimaryGroup = showGallery || showSourceCode || showUndoRedo;
  const showSecondaryGroup = showSnapshot || showSettings || showLanguage || showTheme || showAbout;

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        onClick={() => setActiveMenu(activeMenu === 'more' ? null : 'more')}
        className={`relative z-50 flex items-center justify-center w-8 h-8 rounded-md transition-all ${
          activeMenu === 'more'
            ? 'bg-element-bg dark:bg-element-active text-text-primary dark:text-white'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-bg'
        }`}
        title={lang === 'zh' ? '更多' : 'More'}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {activeMenu === 'more' && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
          <div className="absolute top-full right-0 mt-1 w-auto min-w-[10.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-hidden py-1">
            {/* Mode Switcher for Mobile */}
            {showModeSwitcher && (
              <div className="px-3 py-2 border-b border-border-black dark:border-border-black md:hidden">
                <div className="text-[10px] uppercase text-text-tertiary font-bold mb-1">{t.modeLabel}</div>
                <div className="flex gap-1 bg-element-bg dark:bg-app-bg p-0.5 rounded-lg border border-border-black">
                  <button
                    onClick={() => {
                      useSelectionStore.getState().setFocusTarget(null);
                      setAppMode('skeleton');
                      setActiveMenu(null);
                    }}
                    className={`flex-1 p-1.5 rounded text-center text-xs ${appMode === 'skeleton' ? 'bg-white dark:bg-segmented-active text-system-blue dark:text-white shadow-sm' : 'text-text-secondary dark:text-text-tertiary'}`}
                  >
                    <Activity className="w-4 h-4 mx-auto" />
                  </button>
                  <button
                    onClick={() => {
                      useSelectionStore.getState().setFocusTarget(null);
                      setAppMode('detail');
                      setActiveMenu(null);
                    }}
                    className={`flex-1 p-1.5 rounded text-center text-xs ${appMode === 'detail' ? 'bg-white dark:bg-segmented-active text-system-blue dark:text-white shadow-sm' : 'text-text-secondary dark:text-text-tertiary'}`}
                  >
                    <Box className="w-4 h-4 mx-auto" />
                  </button>
                  <button
                    onClick={() => {
                      useSelectionStore.getState().setFocusTarget(null);
                      setAppMode('hardware');
                      setActiveMenu(null);
                    }}
                    className={`flex-1 p-1.5 rounded text-center text-xs ${appMode === 'hardware' ? 'bg-white dark:bg-segmented-active text-system-blue dark:text-white shadow-sm' : 'text-text-secondary dark:text-text-tertiary'}`}
                  >
                    <Cpu className="w-4 h-4 mx-auto" />
                  </button>
                </div>
              </div>
            )}

            {showPrimaryGroup && (
              <>
                {showGallery && (
                  <button
                    onClick={() => { onOpenURDFGallery(); setActiveMenu(null); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <LayoutGrid className="w-4 h-4" /> {t.gallery}
                  </button>
                )}
                {showSourceCode && (
                  <button
                    onClick={() => { onOpenCodeViewer(); setActiveMenu(null); }}
                    onMouseEnter={onPrefetchCodeViewer}
                    onFocus={onPrefetchCodeViewer}
                    onTouchStart={onPrefetchCodeViewer}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Code className="w-4 h-4" /> {lang === 'zh' ? '源代码' : 'Source Code'}
                  </button>
                )}
                {showUndoRedo && (
                  <>
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
                  </>
                )}
              </>
            )}

            {showPrimaryGroup && showSecondaryGroup && (
              <div className="h-px bg-element-bg dark:bg-border-black my-1" />
            )}

            {showSecondaryGroup && (
              <>
                {showSnapshot && (
                  <button
                    onClick={() => { onSnapshot(); setActiveMenu(null); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Camera className="w-4 h-4" /> {lang === 'zh' ? '快照' : 'Snapshot'}
                  </button>
                )}
                {showSettings && (
                  <button
                    onClick={() => { onOpenSettings(); setActiveMenu(null); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4" /> {lang === 'zh' ? '设置' : 'Settings'}
                  </button>
                )}
                {showLanguage && (
                  <button
                    onClick={() => { setLang(lang === 'en' ? 'zh' : 'en'); setActiveMenu(null); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Globe className="w-4 h-4" /> {lang === 'zh' ? '切换语言' : 'Switch Language'}
                  </button>
                )}
                {showTheme && (
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
                )}
                {showAbout && (
                  <button
                    onClick={() => { onOpenAbout(); setActiveMenu(null); }}
                    className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center gap-3"
                  >
                    <Info className="w-4 h-4" /> {lang === 'zh' ? '关于' : 'About'}
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

export default Header;
