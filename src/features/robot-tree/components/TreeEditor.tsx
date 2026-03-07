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
  Trash2,
  Trees,
} from 'lucide-react';
import type { AppMode, AssemblyState, RobotFile, RobotState, Theme } from '@/types';
import { translations } from '@/shared/i18n';
import { Button, Dialog } from '@/shared/components/ui';
import { useAssemblyStore, useAssetsStore, useUIStore, type Language } from '@/store';
import { buildFileTree } from '../utils';
import { AssemblyTreeView } from './AssemblyTreeView';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { FileTreeNodeComponent, type LibraryDeleteTarget } from './FileTreeNode';
import { TreeNode } from './TreeNode';

export interface TreeEditorProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onSelectGeometry?: (linkId: string, subType: 'visual' | 'collision', objectIndex?: number) => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddCollisionBody: (parentId: string) => void;
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
  onDeleteLibraryFile?: (file: RobotFile) => void;
  onDeleteLibraryFolder?: (folderPath: string) => void;
  onDeleteAllLibraryFiles?: () => void;
  onExportLibraryFile?: (file: RobotFile, format: 'urdf' | 'mjcf') => void | Promise<void>;
  onCreateBridge?: () => void;
  onRemoveComponent?: (id: string) => void;
  onRemoveBridge?: (id: string) => void;
  onRenameComponent?: (id: string, name: string) => void;
  onPreviewFile?: (file: RobotFile) => void;
  previewFileName?: string;
}

export const TreeEditor: React.FC<TreeEditorProps> = ({
  robot,
  onSelect,
  onSelectGeometry,
  onFocus,
  onAddChild,
  onAddCollisionBody,
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
  onDeleteLibraryFile,
  onDeleteLibraryFolder,
  onDeleteAllLibraryFiles,
  onExportLibraryFile,
  onCreateBridge,
  onRemoveComponent,
  onRemoveBridge,
  onRenameComponent,
  onPreviewFile,
  previewFileName,
}) => {
  const t = translations[lang];
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);
  const toggleComponentVisibility = useAssemblyStore((state) => state.toggleComponentVisibility);
  const initAssembly = useAssemblyStore((state) => state.initAssembly);
  const assets = useAssetsStore((state) => state.assets);

  const isProMode = sidebarTab === 'workspace';
  const isAssemblyView = sidebarTab === 'workspace' && Boolean(assemblyState);

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
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    target: LibraryDeleteTarget;
  } | null>(null);
  const [isDeleteAllLibraryDialogOpen, setIsDeleteAllLibraryDialogOpen] = useState(false);

  const nameLabel = sidebarTab === 'workspace' && assemblyState ? t.projectName : t.robotName;
  const currentName = sidebarTab === 'workspace' && assemblyState ? assemblyState.name : robot.name;
  const namePlaceholder = sidebarTab === 'workspace' && assemblyState ? t.enterProjectName : t.enterRobotName;

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
    if (!isProMode) {
      setFileContextMenu(null);
    }
  }, [isProMode]);

  useEffect(() => {
    if (availableFiles.length === 0) {
      setIsDeleteAllLibraryDialogOpen(false);
    }
  }, [availableFiles.length]);

  useEffect(() => {
    if (!isEditingName) return;
    const id = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isEditingName]);

  const startNameEditing = useCallback(() => {
    setNameDraft(currentName || '');
    setIsEditingName(true);
  }, [currentName]);

  const cancelNameEditing = useCallback(() => {
    setNameDraft('');
    setIsEditingName(false);
  }, []);

  const commitNameEditing = useCallback(() => {
    const nextName = nameDraft.trim();
    if (nextName && nextName !== currentName) {
      onNameChange(nextName);
    }
    setNameDraft('');
    setIsEditingName(false);
  }, [currentName, nameDraft, onNameChange]);

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
    onPreviewFile?.(file);
  }, [onPreviewFile]);

  const handleFileContextMenu = useCallback((event: React.MouseEvent, file: RobotFile) => {
    event.preventDefault();
    event.stopPropagation();

    const supportsExport = file.format === 'urdf' || file.format === 'mjcf';
    const actionCount = (isProMode ? 1 : 0) + (supportsExport ? 2 : 0);
    if (actionCount === 0) return;

    const menuWidth = 180;
    const menuHeight = actionCount * 32 + 8;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

    setFileContextMenu({
      target: { type: 'file', file },
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
  }, [isProMode]);

  const handleFolderContextMenu = useCallback((event: React.MouseEvent, folderPath: string) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 44;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

    setFileContextMenu({
      target: { type: 'folder', path: folderPath },
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
  }, []);

  const handleAddFileToAssembly = useCallback(() => {
    if (!fileContextMenu || fileContextMenu.target.type !== 'file' || !onAddComponent) return;
    onAddComponent(fileContextMenu.target.file);
    setFileContextMenu(null);
  }, [fileContextMenu, onAddComponent]);

  const handleExportLibraryFile = useCallback((format: 'urdf' | 'mjcf') => {
    if (!fileContextMenu || fileContextMenu.target.type !== 'file' || !onExportLibraryFile) return;
    void onExportLibraryFile(fileContextMenu.target.file, format);
    setFileContextMenu(null);
  }, [fileContextMenu, onExportLibraryFile]);

  const handleDeleteFromLibrary = useCallback(
    (target: LibraryDeleteTarget) => {
      if (target.type === 'file') {
        if (!onDeleteLibraryFile) return;
        onDeleteLibraryFile(target.file);
      } else {
        if (!onDeleteLibraryFolder) return;
        onDeleteLibraryFolder(target.path);
      }

      setFileContextMenu(null);
    },
    [onDeleteLibraryFile, onDeleteLibraryFolder],
  );

  const handleConfirmDeleteAllLibraryFiles = useCallback(() => {
    if (!onDeleteAllLibraryFiles || availableFiles.length === 0) return;
    onDeleteAllLibraryFiles();
    setIsDeleteAllLibraryDialogOpen(false);
  }, [availableFiles.length, onDeleteAllLibraryFiles]);

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
  const shouldFileBrowserFillSpace = isFileBrowserOpen && !isStructureOpen;
  const canDeleteAllLibraryFiles = Boolean(onDeleteAllLibraryFiles && availableFiles.length > 0);

  return (
    <div
      className={`bg-element-bg dark:bg-panel-bg border-r border-border-black flex flex-col h-full shrink-0 relative ${isDragging ? '' : 'transition-[width,min-width,flex] duration-200 ease-out'}`}
      style={{
        width: `${actualWidth}px`,
        minWidth: `${actualWidth}px`,
        flex: `0 0 ${actualWidth}px`,
        overflow: 'visible',
      }}
    >
      <button
        onClick={onToggle}
        className="absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-panel-bg hover:bg-system-blue-solid hover:text-white border border-border-strong rounded-r-lg shadow-md flex flex-col items-center justify-center z-50 cursor-pointer text-text-tertiary transition-all group"
        title={collapsed ? t.structure : t.collapseSidebar}
      >
        <div className="flex flex-col gap-0.5 items-center">
          <div className="w-1 h-1 rounded-full bg-text-tertiary/40 group-hover:bg-white/80" />
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          <div className="w-1 h-1 rounded-full bg-text-tertiary/40 group-hover:bg-white/80" />
        </div>
      </button>

      {!collapsed && (
        <div className="flex flex-col h-full overflow-hidden w-full relative">
          <div className="px-3 py-2 bg-white dark:bg-panel-bg border-b border-border-black dark:border-border-black shrink-0">
            <div className="flex bg-element-bg p-0.5 rounded-lg">
              <button
                onClick={() => setSidebarTab('structure')}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                ${
                  sidebarTab === 'structure'
                    ? 'bg-panel-bg dark:bg-segmented-active text-system-blue shadow-sm'
                    : 'text-text-tertiary hover:text-text-primary dark:text-text-tertiary dark:hover:text-text-secondary'
                }`}
              >
                <Trees size={13} />
                {t.simpleMode}
              </button>
              <button
                onClick={handleSwitchToProMode}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                ${
                  sidebarTab === 'workspace'
                    ? 'bg-panel-bg dark:bg-segmented-active text-system-blue shadow-sm'
                    : 'text-text-tertiary hover:text-text-primary dark:text-text-tertiary dark:hover:text-text-secondary'
                }`}
              >
                <LayoutGrid size={13} />
                {t.proMode}
              </button>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 bg-white dark:bg-panel-bg border-b border-border-black dark:border-border-black shrink-0">
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-[10px] text-text-tertiary uppercase font-bold tracking-wider">
                {nameLabel}
              </label>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitNameEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitNameEditing();
                    } else if (e.key === 'Escape') {
                      cancelNameEditing();
                    }
                  }}
                  className="flex-1 min-w-0 bg-input-bg focus:bg-panel-bg text-[13px] font-medium text-text-primary px-2 py-1 rounded-md border border-border-strong focus:border-system-blue outline-none transition-colors"
                  placeholder={namePlaceholder}
                />
              ) : (
                <button
                  type="button"
                  onClick={startNameEditing}
                  className="flex-1 min-w-0 text-left text-[13px] font-medium text-text-primary hover:text-system-blue transition-colors truncate"
                  title={currentName || namePlaceholder}
                >
                  {currentName || namePlaceholder}
                </button>
              )}
            </div>

            {currentFileName && sidebarTab === 'structure' && (
              <div className="mt-2 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-system-blue shrink-0" />
                <span
                  className="text-[11px] text-text-secondary dark:text-text-tertiary truncate"
                  title={currentFileName}
                >
                  {currentFileName}
                </span>
              </div>
            )}
          </div>

          <div
            className={`flex flex-col bg-white dark:bg-panel-bg border-b border-border-black dark:border-border-black ${shouldFileBrowserFillSpace ? 'flex-1 min-h-0' : 'shrink-0'} ${isDragging ? '' : 'transition-all duration-200'}`}
            style={
              shouldFileBrowserFillSpace
                ? undefined
                : { height: isFileBrowserOpen ? `${fileBrowserHeight}px` : 'auto' }
            }
          >
            <div
              className="flex items-center justify-between px-3 py-2 bg-element-bg dark:bg-element-bg cursor-pointer select-none"
              onClick={() => setIsFileBrowserOpen(!isFileBrowserOpen)}
            >
              <div className="flex items-center gap-2">
                {isFileBrowserOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                )}
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  {t.fileBrowser}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary">{availableFiles.length}</span>
                {canDeleteAllLibraryFiles && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFileContextMenu(null);
                      setIsDeleteAllLibraryDialogOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                    title={t.deleteAllLibraryFiles}
                  >
                    <Trash2 size={10} strokeWidth={2.25} />
                    <span>{t.deleteAllLibraryFiles}</span>
                  </button>
                )}
              </div>
            </div>

            {isFileBrowserOpen && isProMode && availableFiles.length > 0 && (
              <div className="px-3 py-1 bg-system-blue/10 dark:bg-system-blue/20 border-b border-system-blue/20 dark:border-system-blue/30">
                <span className="text-[10px] text-system-blue">{t.clickToAddComponent}</span>
              </div>
            )}

            {isFileBrowserOpen && (
              <div
                className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-1"
                onContextMenu={(event) => {
                  event.preventDefault();
                }}
              >
                {availableFiles.length === 0 ? (
                  <div className="text-xs text-text-tertiary text-center py-4 italic">{t.dropOrImport}</div>
                ) : (
                  fileTree.map((node) => (
                    <FileTreeNodeComponent
                      key={node.path}
                      node={node}
                      depth={0}
                      onLoadRobot={isProMode ? handlePreviewFile : onLoadRobot}
                      onAddAsComponent={isProMode ? onAddComponent : undefined}
                      onDeleteFromLibrary={
                        onDeleteLibraryFile || onDeleteLibraryFolder
                          ? handleDeleteFromLibrary
                          : undefined
                      }
                      onFileContextMenu={handleFileContextMenu}
                      onFolderContextMenu={handleFolderContextMenu}
                      expandedFolders={expandedFolders}
                      toggleFolder={toggleFolder}
                      showAddAsComponent={isProMode}
                      selectedFileName={isProMode ? previewFileName : undefined}
                      t={t}
                    />
                  ))
                )}
              </div>
            )}

          </div>

          {isFileBrowserOpen && isStructureOpen && (
            <div
              className="h-1 bg-border-black cursor-row-resize hover:bg-system-blue transition-colors shrink-0 z-10"
              onMouseDown={handleVerticalMouseDown}
            />
          )}

          <div className="flex flex-col min-h-0 transition-all flex-1" style={{ flex: isStructureOpen ? '1 1 0%' : '0 0 auto' }}>
            <div
              className="flex items-center justify-between px-3 py-2 bg-element-bg dark:bg-element-bg cursor-pointer select-none border-b border-border-black dark:border-border-black"
              onClick={() => setIsStructureOpen(!isStructureOpen)}
            >
              <div className="flex items-center gap-2">
                {isStructureOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                )}
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  {isAssemblyView ? t.assemblyTree : t.structureTree}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {mode === 'skeleton' && sidebarTab === 'structure' && (
                  <button
                    className="p-1 bg-system-blue-solid hover:bg-system-blue-hover text-white rounded-md transition-colors shadow-sm"
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

                {!isAssemblyView && (
                  <div
                    className="flex items-center justify-center w-5 h-5 rounded hover:bg-element-hover cursor-pointer text-text-tertiary transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVisual(!showVisual);
                    }}
                    title={showVisual ? t.hideAllVisuals : t.showAllVisuals}
                  >
                    {showVisual ? <Eye size={14} /> : <EyeOff size={14} />}
                  </div>
                )}
              </div>
            </div>

            {isStructureOpen && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-auto py-2 custom-scrollbar bg-white dark:bg-panel-bg">
                  <div className="min-w-max">
                  {isAssemblyView && assemblyState ? (
                    <AssemblyTreeView
                      assemblyState={assemblyState}
                      robot={robot}
                      onSelect={onSelect}
                      onSelectGeometry={onSelectGeometry}
                      onFocus={onFocus}
                      onAddChild={onAddChild}
                      onAddCollisionBody={onAddCollisionBody}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      onRemoveComponent={onRemoveComponent}
                      onRemoveBridge={onRemoveBridge}
                      onRenameComponent={onRenameComponent}
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
                      onSelectGeometry={onSelectGeometry}
                      onFocus={onFocus}
                      onAddChild={onAddChild}
                      onAddCollisionBody={onAddCollisionBody}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      mode={mode}
                      t={t}
                    />
                  )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-system-blue-solid/50 transition-colors z-20"
            onMouseDown={handleMouseDown}
          />
        </div>
      )}

      <FileTreeContextMenu
        position={fileContextMenu ? { x: fileContextMenu.x, y: fileContextMenu.y } : null}
        addLabel={t.addComponent}
        exportAsURDFLabel={`${t.export} URDF`}
        exportAsMJCFLabel={`${t.export} MJCF`}
        deleteLabel={t.removeFromLibrary}
        onAdd={handleAddFileToAssembly}
        onExportAsURDF={() => handleExportLibraryFile('urdf')}
        onExportAsMJCF={() => handleExportLibraryFile('mjcf')}
        showAddAction={isProMode && fileContextMenu?.target.type === 'file'}
        showExportAsURDFAction={
          fileContextMenu?.target.type === 'file'
          && (fileContextMenu.target.file.format === 'urdf' || fileContextMenu.target.file.format === 'mjcf')
        }
        showExportAsMJCFAction={
          fileContextMenu?.target.type === 'file'
          && (fileContextMenu.target.file.format === 'urdf' || fileContextMenu.target.file.format === 'mjcf')
        }
        showDeleteAction={fileContextMenu?.target.type === 'folder'}
        onDelete={() => {
          if (fileContextMenu?.target) {
            handleDeleteFromLibrary(fileContextMenu.target);
          }
        }}
      />

      <Dialog
        isOpen={isDeleteAllLibraryDialogOpen}
        onClose={() => setIsDeleteAllLibraryDialogOpen(false)}
        title={t.deleteAllLibraryFilesConfirmTitle}
        width="w-[420px]"
        footer={(
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDeleteAllLibraryDialogOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDeleteAllLibraryFiles}
            >
              {t.confirm}
            </Button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-text-secondary">
          {t.deleteAllLibraryFilesConfirmMessage}
        </p>
      </Dialog>
    </div>
  );
};
