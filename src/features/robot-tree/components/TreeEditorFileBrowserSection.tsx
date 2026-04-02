import type { MouseEvent as ReactMouseEvent } from 'react';
import type { RobotFile } from '@/types';
import type { FileTreeNode } from '../utils';
import type { LibraryDeleteTarget } from './FileTreeNode';
import { TreeEditorFileBrowserContent } from './TreeEditorFileBrowserContent';
import type { TreeEditorTranslations } from './treeEditorTypes';

interface TreeEditorFileBrowserSectionProps {
  availableFiles: RobotFile[];
  canDeleteAllLibraryFiles: boolean;
  expandedFolders: Set<string>;
  fileBrowserHeight: number;
  fileTree: FileTreeNode[];
  isDragging: boolean;
  isFileBrowserOpen: boolean;
  isProMode: boolean;
  isStructureOpen: boolean;
  onAddComponent?: (file: RobotFile) => void;
  onDeleteFromLibrary?: (target: LibraryDeleteTarget) => void;
  onFileContextMenu: (event: ReactMouseEvent, file: RobotFile) => void;
  onFileLoad?: (file: RobotFile) => void;
  onFolderContextMenu: (event: ReactMouseEvent, folderPath: string) => void;
  onOpenDeleteAllDialog: () => void;
  onResizeMouseDown: (event: ReactMouseEvent) => void;
  onToggleOpen: () => void;
  shouldFillSpace: boolean;
  t: TreeEditorTranslations;
  toggleFolder: (path: string) => void;
}

export function TreeEditorFileBrowserSection({
  availableFiles,
  canDeleteAllLibraryFiles,
  expandedFolders,
  fileBrowserHeight,
  fileTree,
  isDragging,
  isFileBrowserOpen,
  isProMode,
  isStructureOpen,
  onAddComponent,
  onDeleteFromLibrary,
  onFileContextMenu,
  onFileLoad,
  onFolderContextMenu,
  onOpenDeleteAllDialog,
  onResizeMouseDown,
  onToggleOpen,
  shouldFillSpace,
  t,
  toggleFolder,
}: TreeEditorFileBrowserSectionProps) {
  return (
    <>
      <TreeEditorFileBrowserContent
        availableFiles={availableFiles}
        canDeleteAllLibraryFiles={canDeleteAllLibraryFiles}
        expandedFolders={expandedFolders}
        fileTree={fileTree}
        height={fileBrowserHeight}
        isDragging={isDragging}
        isOpen={isFileBrowserOpen}
        isProMode={isProMode}
        onAddComponent={onAddComponent}
        onDeleteAll={onOpenDeleteAllDialog}
        onDeleteFromLibrary={onDeleteFromLibrary}
        onFileActivate={onFileLoad}
        onFileContextMenu={onFileContextMenu}
        onFolderContextMenu={onFolderContextMenu}
        onToggleOpen={onToggleOpen}
        shouldFillSpace={shouldFillSpace}
        t={t}
        toggleFolder={toggleFolder}
      />

      {isFileBrowserOpen && isStructureOpen && (
        <div
          className="h-1 bg-border-black cursor-row-resize hover:bg-system-blue transition-colors shrink-0 z-10"
          onMouseDown={onResizeMouseDown}
        />
      )}
    </>
  );
}
