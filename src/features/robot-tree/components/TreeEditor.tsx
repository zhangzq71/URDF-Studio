/**
 * TreeEditor - Robot tree structure editor with file browser
 * Features: File tree, robot structure tree, link/joint management
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPrimaryTreeRenderRootLinkId, getTreeRenderRootLinkIds } from '@/core/robot';
import type { AppMode, AssemblyState, RobotFile, RobotState, Theme } from '@/types';
import { translations } from '@/shared/i18n';
import { Button, Dialog } from '@/shared/components/ui';
import { useAssemblyStore, useUIStore, type Language } from '@/store';
import { buildFileTree } from '../utils';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import type { LibraryDeleteTarget } from './FileTreeNode';
import { TreeEditorFileBrowserPanel } from './tree-editor/TreeEditorFileBrowserPanel';
import { TreeEditorSidebarHeader } from './tree-editor/TreeEditorSidebarHeader';
import { useTreeEditorLayout } from './tree-editor/useTreeEditorLayout';
import { TreeEditorStructureSection } from './tree-editor/TreeEditorStructureSection';

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
  const structureTreeShowGeometryDetails = useUIStore((state) => state.structureTreeShowGeometryDetails);
  const setStructureTreeShowGeometryDetails = useUIStore((state) => state.setStructureTreeShowGeometryDetails);
  const toggleComponentVisibility = useAssemblyStore((state) => state.toggleComponentVisibility);
  const initAssembly = useAssemblyStore((state) => state.initAssembly);

  const {
    width,
    fileBrowserHeight,
    isDragging,
    isFileBrowserOpen,
    isStructureOpen,
    setIsFileBrowserOpen,
    setIsStructureOpen,
    handleHorizontalResizeStart,
    handleVerticalResizeStart,
  } = useTreeEditorLayout();

  const isProMode = sidebarTab === 'workspace';
  const isAssemblyView = sidebarTab === 'workspace' && Boolean(assemblyState);

  const handleSwitchToProMode = useCallback(() => {
    if (!assemblyState) {
      initAssembly(robot.name || 'assembly');
    }
    setSidebarTab('workspace');
  }, [assemblyState, initAssembly, robot.name, setSidebarTab]);

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
  const showStructureFilePath = Boolean(currentFileName && sidebarTab === 'structure');

  const fileTree = useMemo(() => buildFileTree(availableFiles), [availableFiles]);
  const topLevelLibraryFoldersKey = useMemo(() => {
    const firstLevel = new Set<string>();

    availableFiles.forEach((file) => {
      const firstPart = file.name.split('/')[0];
      if (firstPart) {
        firstLevel.add(firstPart);
      }
    });

    return Array.from(firstLevel).sort().join('\u0000');
  }, [availableFiles]);

  const childJointsByParent = useMemo<Record<string, RobotState['joints'][string][]>>(() => {
    const grouped: Record<string, RobotState['joints'][string][]> = {};

    Object.values(robot.joints).forEach((joint) => {
      if (!grouped[joint.parentLinkId]) {
        grouped[joint.parentLinkId] = [];
      }
      grouped[joint.parentLinkId].push(joint);
    });

    return grouped;
  }, [robot.joints]);

  const treeRootLinkIds = useMemo(() => getTreeRenderRootLinkIds(robot), [robot]);

  const selectionBranchLinkIds = useMemo(() => {
    const branchLinkIds = new Set<string>();
    const { selection } = robot;
    const parentLinkByChild = new Map<string, string>();
    const jointsByIdentity = new Map<string, RobotState['joints'][string]>();

    Object.values(robot.joints).forEach((joint) => {
      parentLinkByChild.set(joint.childLinkId, joint.parentLinkId);
      jointsByIdentity.set(joint.id, joint);
      jointsByIdentity.set(joint.name, joint);
    });

    const markAncestors = (startLinkId: string | null | undefined) => {
      let currentLinkId = startLinkId ?? null;

      while (currentLinkId) {
        branchLinkIds.add(currentLinkId);
        currentLinkId = parentLinkByChild.get(currentLinkId) ?? null;
      }
    };

    if (selection.type === 'link' && selection.id) {
      markAncestors(selection.id);
    } else if (selection.type === 'joint' && selection.id) {
      const selectedJoint = jointsByIdentity.get(selection.id);
      if (selectedJoint) {
        markAncestors(selectedJoint.parentLinkId);
      }
    }

    return branchLinkIds;
  }, [robot.joints, robot.selection]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!topLevelLibraryFoldersKey) {
      return;
    }

    const topLevelLibraryFolders = topLevelLibraryFoldersKey.split('\u0000');
    const topLevelLibraryFolderSet = new Set(topLevelLibraryFolders);

    setExpandedFolders((prev) => {
      const next = new Set<string>();

      prev.forEach((path) => {
        const topLevelPath = path.split('/')[0];
        if (topLevelLibraryFolderSet.has(topLevelPath)) {
          next.add(path);
        }
      });

      topLevelLibraryFolders.forEach((folder) => {
        next.add(folder);
      });

      if (next.size === prev.size && Array.from(next).every((path) => prev.has(path))) {
        return prev;
      }

      return next;
    });
  }, [topLevelLibraryFoldersKey]);

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

  const handleDeleteFromLibrary = useCallback((target: LibraryDeleteTarget) => {
    if (target.type === 'file') {
      if (!onDeleteLibraryFile) return;
      onDeleteLibraryFile(target.file);
    } else {
      if (!onDeleteLibraryFolder) return;
      onDeleteLibraryFolder(target.path);
    }

    setFileContextMenu(null);
  }, [onDeleteLibraryFile, onDeleteLibraryFolder]);

  const handleConfirmDeleteAllLibraryFiles = useCallback(() => {
    if (!onDeleteAllLibraryFiles || availableFiles.length === 0) return;
    onDeleteAllLibraryFiles();
    setIsDeleteAllLibraryDialogOpen(false);
  }, [availableFiles.length, onDeleteAllLibraryFiles]);

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
      <TreeEditorSidebarHeader
        collapsed={collapsed}
        onToggle={onToggle}
        isProMode={isProMode}
        simpleModeLabel={t.simpleMode}
        proModeLabel={t.proMode}
        collapseTitle={t.collapseSidebar}
        expandTitle={t.structure}
        nameLabel={nameLabel}
        currentName={currentName}
        namePlaceholder={namePlaceholder}
        isEditingName={isEditingName}
        nameDraft={nameDraft}
        nameInputRef={nameInputRef}
        onSwitchToStructure={() => setSidebarTab('structure')}
        onSwitchToWorkspace={handleSwitchToProMode}
        onNameDraftChange={setNameDraft}
        onStartNameEditing={startNameEditing}
        onCommitNameEditing={commitNameEditing}
        onCancelNameEditing={cancelNameEditing}
      />

      {!collapsed && (
        <div className="flex flex-col h-full overflow-hidden w-full relative">
          <TreeEditorFileBrowserPanel
            isOpen={isFileBrowserOpen}
            isDragging={isDragging}
            isProMode={isProMode}
            height={fileBrowserHeight}
            shouldFillSpace={shouldFileBrowserFillSpace}
            availableFiles={availableFiles}
            fileTree={fileTree}
            expandedFolders={expandedFolders}
            previewFileName={previewFileName}
            canDeleteAllLibraryFiles={canDeleteAllLibraryFiles}
            t={t}
            onToggleOpen={() => setIsFileBrowserOpen(!isFileBrowserOpen)}
            onDeleteAll={() => {
              setFileContextMenu(null);
              setIsDeleteAllLibraryDialogOpen(true);
            }}
            onLoadRobot={onLoadRobot}
            onPreviewFile={handlePreviewFile}
            onAddComponent={onAddComponent}
            onDeleteFromLibrary={
              onDeleteLibraryFile || onDeleteLibraryFolder ? handleDeleteFromLibrary : undefined
            }
            onFileContextMenu={handleFileContextMenu}
            onFolderContextMenu={handleFolderContextMenu}
            toggleFolder={toggleFolder}
          />

          {isFileBrowserOpen && isStructureOpen && (
            <div
              className="h-1 bg-border-black cursor-row-resize hover:bg-system-blue transition-colors shrink-0 z-10"
              onMouseDown={handleVerticalResizeStart}
            />
          )}

          <TreeEditorStructureSection
            isOpen={isStructureOpen}
            isAssemblyView={isAssemblyView}
            structureTreeShowGeometryDetails={structureTreeShowGeometryDetails}
            showVisual={showVisual}
            showStructureFilePath={showStructureFilePath}
            currentFileName={currentFileName}
            mode={mode}
            assemblyState={assemblyState}
            robot={robot}
            treeRootLinkIds={treeRootLinkIds}
            childJointsByParent={childJointsByParent}
            selectionBranchLinkIds={selectionBranchLinkIds}
            t={t}
            onToggleOpen={() => setIsStructureOpen(!isStructureOpen)}
            onToggleGeometryDetails={() => setStructureTreeShowGeometryDetails(!structureTreeShowGeometryDetails)}
            onAddChildFromSelection={() => {
              let targetId = getPrimaryTreeRenderRootLinkId(robot) ?? robot.rootLinkId;
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
            onToggleVisuals={() => setShowVisual(!showVisual)}
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
          />

          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-system-blue-solid/50 transition-colors z-20"
            onMouseDown={handleHorizontalResizeStart}
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
            <Button type="button" variant="secondary" onClick={() => setIsDeleteAllLibraryDialogOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmDeleteAllLibraryFiles}>
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
