import { Briefcase, ChevronDown, Code, Download, Eye, FileText, Folder, Pencil, Redo, Undo, Upload } from 'lucide-react';
import { ToolboxMenu } from './ToolboxMenu';
import { HeaderButton } from './HeaderButton';
import { ViewMenuItem } from './ViewMenuItem';
import { ensureViewPanelVisible } from './viewMenuState.js';
import type { HeaderMenuKey, HeaderSetViewConfig, HeaderTranslations, HeaderViewConfig } from './types';

interface HeaderMenusProps {
  activeMenu: HeaderMenuKey;
  setActiveMenu: (menu: HeaderMenuKey) => void;
  showMenuLabels: boolean;
  showSourceInline: boolean;
  showSourceText: boolean;
  showUndoRedoInline: boolean;
  t: HeaderTranslations;
  viewConfig: HeaderViewConfig;
  setViewConfig: HeaderSetViewConfig;
  onImportFile: () => void;
  onImportFolder: () => void;
  onOpenExport: () => void;
  onExportProject: () => void;
  onOpenAI: () => void;
  onOpenMeasureTool: () => void;
  onOpenCollisionOptimizer: () => void;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function MenuOverlay({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-40" onClick={onClose} />;
}

export function HeaderMenus({
  activeMenu,
  setActiveMenu,
  showMenuLabels,
  showSourceInline,
  showSourceText,
  showUndoRedoInline,
  t,
  viewConfig,
  setViewConfig,
  onImportFile,
  onImportFolder,
  onOpenExport,
  onExportProject,
  onOpenAI,
  onOpenMeasureTool,
  onOpenCollisionOptimizer,
  onOpenCodeViewer,
  onPrefetchCodeViewer,
  undo,
  redo,
  canUndo,
  canRedo,
}: HeaderMenusProps) {
  const toggleMenu = (menu: Exclude<HeaderMenuKey, null>) => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const showViewPanel = (key: keyof HeaderViewConfig) => {
    setViewConfig((prev) => ensureViewPanelVisible(prev, key));
    setActiveMenu(null);
  };

  return (
    <div className="flex items-center">
      <div className="relative">
        <HeaderButton isActive={activeMenu === 'file'} onClick={() => toggleMenu('file')}>
          <FileText className="w-3.5 h-3.5" />
          {showMenuLabels && <span>{t.file}</span>}
          {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'file' ? 'rotate-180' : ''}`} />}
        </HeaderButton>

        {activeMenu === 'file' && (
          <>
            <MenuOverlay onClose={() => setActiveMenu(null)} />
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
                {t.importUspZipFile}
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

      <div className="relative">
        <HeaderButton isActive={activeMenu === 'edit'} onClick={() => toggleMenu('edit')}>
          <Pencil className="w-3.5 h-3.5" />
          {showMenuLabels && <span>{t.edit}</span>}
          {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'edit' ? 'rotate-180' : ''}`} />}
        </HeaderButton>

        {activeMenu === 'edit' && (
          <>
            <MenuOverlay onClose={() => setActiveMenu(null)} />
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
                  {t.undo}
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
                  {t.redo}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Ctrl+Shift+Z</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <HeaderButton isActive={activeMenu === 'toolbox'} onClick={() => toggleMenu('toolbox')}>
          <Briefcase className="w-3.5 h-3.5" />
          {showMenuLabels && <span>{t.toolbox}</span>}
          {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'toolbox' ? 'rotate-180' : ''}`} />}
        </HeaderButton>

        {activeMenu === 'toolbox' && (
          <ToolboxMenu
            t={t}
            onClose={() => setActiveMenu(null)}
            onOpenAI={onOpenAI}
            onOpenMeasureTool={onOpenMeasureTool}
            onOpenCollisionOptimizer={onOpenCollisionOptimizer}
          />
        )}
      </div>

      <div className="relative">
        <HeaderButton isActive={activeMenu === 'view'} onClick={() => toggleMenu('view')}>
          <Eye className="w-3.5 h-3.5" />
          {showMenuLabels && <span>{t.view}</span>}
          {showMenuLabels && <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${activeMenu === 'view' ? 'rotate-180' : ''}`} />}
        </HeaderButton>

        {activeMenu === 'view' && (
          <>
            <MenuOverlay onClose={() => setActiveMenu(null)} />
            <div className="absolute top-full left-0 mt-1 w-auto min-w-[10.5rem] bg-panel-bg dark:bg-panel-bg rounded-lg shadow-md dark:shadow-xl border border-border-black z-50 overflow-hidden py-1">
              <ViewMenuItem
                checked={viewConfig.showToolbar}
                label={t.toolbar}
                onClick={() => showViewPanel('showToolbar')}
              />
              <ViewMenuItem
                checked={viewConfig.showOptionsPanel}
                label={t.detailOptions}
                onClick={() => showViewPanel('showOptionsPanel')}
              />
              <ViewMenuItem
                checked={viewConfig.showSkeletonOptionsPanel}
                label={t.skeletonHardwareOptions}
                onClick={() => showViewPanel('showSkeletonOptionsPanel')}
              />
              <ViewMenuItem
                checked={viewConfig.showJointPanel}
                label={t.jointControls}
                onClick={() => showViewPanel('showJointPanel')}
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
            title={t.sourceCode}
          >
            <Code className="w-3.5 h-3.5" />
            {showSourceText && <span>{t.sourceCode}</span>}
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
            title={`${t.undo} (Ctrl+Z)`}
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
            title={`${t.redo} (Ctrl+Shift+Z)`}
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
