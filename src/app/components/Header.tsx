/**
 * App Header Component
 * Contains logo, menus, mode switcher, and action buttons
 */
import React from 'react';
import { useUIStore } from '@/store';
import { translations } from '@/shared/i18n';
import { useActiveHistory } from '../hooks/useActiveHistory';
import { HeaderActions } from './header/HeaderActions';
import { HeaderMenus } from './header/HeaderMenus';
import { ModeSwitcher } from './header/ModeSwitcher';
import { useHeaderResponsiveLayout } from './header/useHeaderResponsiveLayout';
import type { HeaderAction, HeaderMenuKey, HeaderViewConfig } from './header/types';

interface HeaderProps {
  // Import actions
  onImportFile: () => void;
  onImportFolder: () => void;
  onOpenExport: () => void;
  onExportProject: () => void;
  // Modal actions
  onOpenAI: () => void;
  onOpenMeasureTool: () => void;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  quickAction?: HeaderAction;
  secondaryAction?: HeaderAction;
  // Snapshot
  onSnapshot: () => void;
  onOpenCollisionOptimizer: () => void;
  // View config
  viewConfig: {
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  };
  setViewConfig: React.Dispatch<React.SetStateAction<HeaderViewConfig>>;
}

export function Header({
  onImportFile,
  onImportFolder,
  onOpenExport,
  onExportProject,
  onOpenAI,
  onOpenMeasureTool,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  onOpenSettings,
  onOpenAbout,
  quickAction,
  secondaryAction,
  onSnapshot,
  onOpenCollisionOptimizer,
  viewConfig,
  setViewConfig,
}: HeaderProps) {
  const headerRef = React.useRef<HTMLElement | null>(null);
  const [activeMenu, setActiveMenu] = React.useState<HeaderMenuKey>(null);

  const appMode = useUIStore((state) => state.appMode);
  const setAppMode = useUIStore((state) => state.setAppMode);
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const lang = useUIStore((state) => state.lang);
  const setLang = useUIStore((state) => state.setLang);
  const { undo, redo, canUndo, canRedo } = useActiveHistory();
  const responsive = useHeaderResponsiveLayout(headerRef);
  const t = translations[lang];

  return (
    <header
      ref={headerRef}
      className="h-12 border-b shrink-0 bg-panel-bg dark:bg-panel-bg border-border-black grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3"
    >
      {/* Left Section - Logo & Menus */}
      <div className="flex items-center gap-1 min-w-0">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r border-border-black">
          <img src="/logos/logo.png" alt="Logo" className="w-7 h-7 object-contain" />
        </div>

        <HeaderMenus
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          showMenuLabels={responsive.showMenuLabels}
          showSourceInline={responsive.showSourceInline}
          showSourceText={responsive.showSourceText}
          showUndoRedoInline={responsive.showUndoRedoInline}
          t={t}
          viewConfig={viewConfig}
          setViewConfig={setViewConfig}
          onImportFile={onImportFile}
          onImportFolder={onImportFolder}
          onOpenExport={onOpenExport}
          onExportProject={onExportProject}
          onOpenAI={onOpenAI}
          onOpenMeasureTool={onOpenMeasureTool}
          onOpenCollisionOptimizer={onOpenCollisionOptimizer}
          onOpenCodeViewer={onOpenCodeViewer}
          onPrefetchCodeViewer={onPrefetchCodeViewer}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      </div>

      {/* Center - Mode Switcher */}
      <div className="hidden md:flex justify-self-center">
        <ModeSwitcher appMode={appMode} setAppMode={setAppMode} t={t} compact={!responsive.showFullModeSwitcher} />
      </div>

      <HeaderActions
        responsive={responsive}
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
        secondaryAction={secondaryAction}
        onOpenCodeViewer={onOpenCodeViewer}
        onPrefetchCodeViewer={onPrefetchCodeViewer}
        onSnapshot={onSnapshot}
        onOpenSettings={onOpenSettings}
        onOpenAbout={onOpenAbout}
        t={t}
      />
    </header>
  );
}

export default Header;
