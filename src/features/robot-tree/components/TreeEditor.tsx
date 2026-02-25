/**
 * TreeEditor - Robot tree structure editor with file browser
 * Features: File tree, robot structure tree, link/joint management
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileCode,
  LayoutGrid,
  Plus,
  Trees,
} from 'lucide-react';
import type { AppMode, AssemblyState, RobotFile, RobotState, Theme } from '@/types';
import { translations } from '@/shared/i18n';
import { useAssemblyStore, useAssetsStore, useUIStore, type Language } from '@/store';
import { buildFileTree } from '../utils';
import { AssemblyTreeView } from './AssemblyTreeView';
import { FilePreviewWindow } from './FilePreviewWindow';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { FileTreeNodeComponent } from './FileTreeNode';
import { TreeNode } from './TreeNode';

export interface TreeEditorProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onNameChange: (name: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  showVisual: boolean;
  setShowVisual: (show: boolean) => void;
  mode: AppMode;
  lang: Language;
  collapsed?: boolean;
  onToggle?: () => void;
  theme: Theme;
  availableFiles?: RobotFile[];
  onLoadRobot?: (file: RobotFile) => void;
  currentFileName?: string;
  // Assembly mode
  assemblyState?: AssemblyState | null;
  onAddComponent?: (file: RobotFile) => void;
  onCreateBridge?: () => void;
  onRemoveComponent?: (id: string) => void;
  onRemoveBridge?: (id: string) => void;
}

export const TreeEditor: React.FC<TreeEditorProps> = ({
  robot,
  onSelect,
  onFocus,
  onAddChild,
  onDelete,
  onNameChange,
  onUpdate,
  showVisual,
  setShowVisual,
  mode,
  lang,
  collapsed,
  onToggle,
  theme: _theme,
  availableFiles = [],
  onLoadRobot,
  currentFileName,
  assemblyState,
  onAddComponent,
  onCreateBridge,
  onRemoveComponent,
  onRemoveBridge,
}) => {
  const t = translations[lang];
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);
  const toggleComponentVisibility = useAssemblyStore((state) => state.toggleComponentVisibility);
  const initAssembly = useAssemblyStore((state) => state.initAssembly);
  const assets = useAssetsStore((state) => state.assets);

  const isProMode = sidebarTab === 'workspace';

  // Switch to Pro mode: auto-init assembly if not yet created
  const handleSwitchToProMode = useCallback(() => {
    if (!assemblyState) {
      initAssembly(robot.name || 'assembly');
    }
    setSidebarTab('workspace');
  }, [assemblyState, initAssembly, robot.name, setSidebarTab]);

  const [width, setWidth] = useState(288);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const [fileBrowserHeight, setFileBrowserHeight] = useState(250);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(true);
  const [isStructureOpen, setIsStructureOpen] = useState(true);
  const isVerticalResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<RobotFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    file: RobotFile;
  } | null>(null);

  const fileTree = useMemo(() => buildFileTree(availableFiles), [availableFiles]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  useEffect(() => {
    if (availableFiles.length > 0) {
      const firstLevel = new Set<string>();
      availableFiles.forEach((file) => {
        const firstPart = file.name.split('/')[0];
        if (firstPart) {
          firstLevel.add(firstPart);
        }
      });
      setExpandedFolders(firstLevel);
    }
  }, [availableFiles]);

  useEffect(() => {
    if (!previewFile) return;
    const exists = availableFiles.some((file) => file.name === previewFile.name);
    if (!exists) {
      setPreviewFile(null);
      setIsPreviewOpen(false);
    }
  }, [availableFiles, previewFile]);

  useEffect(() => {
    if (!isProMode) {
      setIsPreviewOpen(false);
      setFileContextMenu(null);
    }
  }, [isProMode]);

  useEffect(() => {
    if (!fileContextMenu) return;

    const closeMenu = () => setFileContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fileContextMenu]);

  const handlePreviewFile = useCallback((file: RobotFile) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  }, []);

  const handleFileContextMenu = useCallback((event: React.MouseEvent, file: RobotFile) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 44;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

    setFileContextMenu({
      file,
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
  }, []);

  const handleAddFileToAssembly = useCallback(() => {
    if (!fileContextMenu?.file || !onAddComponent) return;
    onAddComponent(fileContextMenu.file);
    setFileContextMenu(null);
  }, [fileContextMenu, onAddComponent]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isResizing.current = true;
      setIsDragging(true);
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width],
  );

  const handleVerticalMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      isVerticalResizing.current = true;
      setIsDragging(true);
      startY.current = e.clientY;
      startHeight.current = fileBrowserHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [fileBrowserHeight],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing.current) {
        const delta = e.clientX - startX.current;
        const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
        setWidth(newWidth);
      }

      if (isVerticalResizing.current) {
        const delta = e.clientY - startY.current;
        const newHeight = Math.max(100, Math.min(600, startHeight.current + delta));
        setFileBrowserHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      isVerticalResizing.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const actualWidth = collapsed ? 0 : width;

  return (
    <div
      className={`bg-slate-50 dark:bg-google-dark-bg border-r border-slate-200 dark:border-google-dark-border flex flex-col h-full shrink-0 relative ${isDragging ? '' : 'transition-[width,min-width,flex] duration-200 ease-out'}`}
      style={{
        width: `${actualWidth}px`,
        minWidth: `${actualWidth}px`,
        flex: `0 0 ${actualWidth}px`,
        overflow: 'visible',
      }}
    >
      <button
        onClick={onToggle}
        className="absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-white dark:bg-[#2C2C2E] hover:bg-blue-500 dark:hover:bg-blue-600 hover:text-white border border-slate-300 dark:border-[#000000] rounded-r-lg shadow-md flex flex-col items-center justify-center z-50 cursor-pointer text-slate-400 hover:text-white transition-all group"
        title={collapsed ? t.structure : t.collapseSidebar}
      >
        <div className="flex flex-col gap-0.5 items-center">
          <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-200" />
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-200" />
        </div>
      </button>

      {!collapsed && (
        <div className="flex flex-col h-full overflow-hidden w-full relative">
          <div className="px-3 py-2 bg-white dark:bg-google-dark-bg border-b border-slate-200 dark:border-google-dark-border shrink-0">
            <div className="flex bg-slate-100 dark:bg-[#1C1C1E] p-1 rounded-lg">
              <button
                onClick={() => setSidebarTab('structure')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all
                ${
                  sidebarTab === 'structure'
                    ? 'bg-white dark:bg-[#3A3A3C] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Trees size={14} />
                {t.simpleMode}
              </button>
              <button
                onClick={handleSwitchToProMode}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all
                ${
                  sidebarTab === 'workspace'
                    ? 'bg-white dark:bg-[#3A3A3C] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid size={14} />
                {t.proMode}
              </button>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 bg-white dark:bg-google-dark-bg border-b border-slate-200 dark:border-google-dark-border shrink-0">
            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">
              {sidebarTab === 'workspace' && assemblyState ? t.projectName : t.robotName}
            </label>
            <input
              type="text"
              value={sidebarTab === 'workspace' && assemblyState ? assemblyState.name : robot.name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#000000] focus:bg-white dark:focus:bg-[#000000] text-sm text-slate-900 dark:text-white px-3 py-2 rounded-lg border border-slate-300 dark:border-[#48484A] focus:border-google-blue outline-none transition-colors"
              placeholder={
                sidebarTab === 'workspace' && assemblyState ? t.enterProjectName : t.enterRobotName
              }
            />

            {currentFileName && sidebarTab === 'structure' && !assemblyState && (
              <div className="mt-2 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span
                  className="text-[11px] text-slate-600 dark:text-slate-400 truncate"
                  title={currentFileName}
                >
                  {currentFileName}
                </span>
              </div>
            )}
          </div>

          <div
            className={`flex flex-col shrink-0 bg-white dark:bg-google-dark-bg border-b border-slate-200 dark:border-google-dark-border ${isDragging ? '' : 'transition-all duration-200'}`}
            style={{ height: isFileBrowserOpen ? `${fileBrowserHeight}px` : 'auto' }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-[#2C2C2E] cursor-pointer select-none"
              onClick={() => setIsFileBrowserOpen(!isFileBrowserOpen)}
            >
              <div className="flex items-center gap-2">
                {isFileBrowserOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  {t.fileBrowser}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">{availableFiles.length}</span>
            </div>

            {isFileBrowserOpen && isProMode && availableFiles.length > 0 && (
              <div className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
                <span className="text-[10px] text-blue-600 dark:text-blue-400">{t.clickToAddComponent}</span>
              </div>
            )}

            {isFileBrowserOpen && (
              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-1">
                {availableFiles.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-4 italic">{t.dropOrImport}</div>
                ) : (
                  fileTree.map((node) => (
                    <FileTreeNodeComponent
                      key={node.path}
                      node={node}
                      depth={0}
                      onLoadRobot={isProMode ? handlePreviewFile : onLoadRobot}
                      onAddAsComponent={isProMode ? onAddComponent : undefined}
                      onFileContextMenu={isProMode ? handleFileContextMenu : undefined}
                      expandedFolders={expandedFolders}
                      toggleFolder={toggleFolder}
                      showAddAsComponent={isProMode}
                      selectedFileName={isProMode ? previewFile?.name : undefined}
                      t={t}
                    />
                  ))
                )}
              </div>
            )}

          </div>

          {isFileBrowserOpen && isStructureOpen && (
            <div
              className="h-1 bg-slate-200 dark:bg-google-dark-border cursor-row-resize hover:bg-blue-400 transition-colors shrink-0 z-10"
              onMouseDown={handleVerticalMouseDown}
            />
          )}

          <div className="flex flex-col min-h-0 transition-all flex-1" style={{ flex: isStructureOpen ? '1 1 0%' : '0 0 auto' }}>
            <div
              className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-[#2C2C2E] cursor-pointer select-none border-b border-slate-200 dark:border-google-dark-border"
              onClick={() => setIsStructureOpen(!isStructureOpen)}
            >
              <div className="flex items-center gap-2">
                {isStructureOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  {sidebarTab === 'workspace' && assemblyState ? t.assemblyTree : t.structureTree}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {mode === 'skeleton' && sidebarTab === 'structure' && !assemblyState && (
                  <button
                    className="p-1 hover:bg-blue-600 bg-blue-700 text-white rounded-md transition-colors shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      let targetId = robot.rootLinkId;
                      if (robot.selection.type === 'link' && robot.selection.id) {
                        targetId = robot.selection.id;
                      } else if (robot.selection.type === 'joint' && robot.selection.id) {
                        const selectedJoint = robot.joints[robot.selection.id];
                        if (selectedJoint) {
                          targetId = selectedJoint.childLinkId;
                        }
                      }
                      onAddChild(targetId);
                    }}
                    title={t.addChildLink}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}

                <div
                  className="flex items-center justify-center w-5 h-5 rounded hover:bg-black/10 dark:hover:bg-[#48484A] cursor-pointer text-slate-500 dark:text-slate-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowVisual(!showVisual);
                  }}
                  title={showVisual ? t.hideAllVisuals : t.showAllVisuals}
                >
                  {showVisual ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
              </div>
            </div>

            {isStructureOpen && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-auto py-2 custom-scrollbar bg-white dark:bg-google-dark-bg">
                  {sidebarTab === 'workspace' && assemblyState ? (
                    <AssemblyTreeView
                      assemblyState={assemblyState}
                      robot={robot}
                      onSelect={onSelect}
                      onFocus={onFocus}
                      onAddChild={onAddChild}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      onRemoveComponent={onRemoveComponent}
                      onRemoveBridge={onRemoveBridge}
                      onCreateBridge={onCreateBridge}
                      onToggleComponentVisibility={toggleComponentVisibility}
                      mode={mode}
                      t={t}
                    />
                  ) : (
                    <TreeNode
                      linkId={robot.rootLinkId}
                      robot={robot}
                      onSelect={onSelect}
                      onFocus={onFocus}
                      onAddChild={onAddChild}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      mode={mode}
                      t={t}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
            onMouseDown={handleMouseDown}
          />
        </div>
      )}

      <FileTreeContextMenu
        position={fileContextMenu ? { x: fileContextMenu.x, y: fileContextMenu.y } : null}
        addLabel={t.addComponent}
        onAdd={handleAddFileToAssembly}
      />

      <FilePreviewWindow
        isOpen={isPreviewOpen && isProMode}
        file={previewFile}
        availableFiles={availableFiles}
        assets={assets}
        lang={lang}
        theme={_theme}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  );
};
