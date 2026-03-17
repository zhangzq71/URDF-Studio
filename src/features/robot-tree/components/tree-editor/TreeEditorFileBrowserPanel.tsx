import type { MouseEvent } from 'react';
import type { RobotFile } from '@/types';
import type { FileTreeNode } from '../../utils';
import type { LibraryDeleteTarget } from '../FileTreeNode';
import { TreeEditorFileBrowserContent } from '../TreeEditorFileBrowserContent';
import type { TreeEditorTranslations } from '../treeEditorTypes';

interface TreeEditorFileBrowserPanelProps {
  isOpen: boolean;
  isDragging: boolean;
  isProMode: boolean;
  height: number;
  shouldFillSpace: boolean;
  availableFiles: RobotFile[];
  fileTree: FileTreeNode[];
  expandedFolders: Set<string>;
  previewFileName?: string;
  canDeleteAllLibraryFiles: boolean;
  t: TreeEditorTranslations;
  onToggleOpen: () => void;
  onDeleteAll: () => void;
  onLoadRobot?: (file: RobotFile) => void;
  onPreviewFile?: (file: RobotFile) => void;
  onAddComponent?: (file: RobotFile) => void;
  onDeleteFromLibrary?: (target: LibraryDeleteTarget) => void;
  onFileContextMenu: (event: MouseEvent, file: RobotFile) => void;
  onFolderContextMenu: (event: MouseEvent, folderPath: string) => void;
  toggleFolder: (path: string) => void;
}

export function TreeEditorFileBrowserPanel({
  isOpen,
  isDragging,
  isProMode,
  height,
  shouldFillSpace,
  availableFiles,
  fileTree,
  expandedFolders,
  previewFileName,
  canDeleteAllLibraryFiles,
  t,
  onToggleOpen,
  onDeleteAll,
  onLoadRobot,
  onPreviewFile,
  onAddComponent,
  onDeleteFromLibrary,
  onFileContextMenu,
  onFolderContextMenu,
  toggleFolder,
}: TreeEditorFileBrowserPanelProps) {
  return (
    <TreeEditorFileBrowserContent
      availableFiles={availableFiles}
      canDeleteAllLibraryFiles={canDeleteAllLibraryFiles}
      expandedFolders={expandedFolders}
      fileTree={fileTree}
      height={height}
      isDragging={isDragging}
      isOpen={isOpen}
      isProMode={isProMode}
      onAddComponent={onAddComponent}
      onDeleteAll={onDeleteAll}
      onDeleteFromLibrary={onDeleteFromLibrary}
      onFileActivate={isProMode ? onPreviewFile : onLoadRobot}
      onFileContextMenu={onFileContextMenu}
      onFolderContextMenu={onFolderContextMenu}
      onToggleOpen={onToggleOpen}
      previewFileName={previewFileName}
      shouldFillSpace={shouldFillSpace}
      t={t}
      toggleFolder={toggleFolder}
    />
  );
}
