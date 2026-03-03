import React from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import type { RobotFile } from '@/types';
import { getFileIcon, type FileTreeNode } from '../utils';

export type LibraryDeleteTarget =
  | { type: 'file'; file: RobotFile }
  | { type: 'folder'; path: string };

export interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  depth: number;
  onLoadRobot?: (file: RobotFile) => void;
  onAddAsComponent?: (file: RobotFile) => void;
  onDeleteFromLibrary?: (target: LibraryDeleteTarget) => void;
  onFileContextMenu?: (event: React.MouseEvent, file: RobotFile) => void;
  onFolderContextMenu?: (event: React.MouseEvent, folderPath: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  showAddAsComponent?: boolean;
  selectedFileName?: string;
  t: TranslationKeys;
}

export const FileTreeNodeComponent: React.FC<FileTreeNodeComponentProps> = ({
  node,
  depth,
  onLoadRobot,
  onAddAsComponent,
  onDeleteFromLibrary,
  onFileContextMenu,
  onFolderContextMenu,
  expandedFolders,
  toggleFolder,
  showAddAsComponent,
  selectedFileName,
  t,
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isSelectedFile = Boolean(node.file && selectedFileName === node.file.name);
  const paddingLeft = depth * 12 + 8;
  const canDeleteRootFolder = Boolean(onDeleteFromLibrary && node.isFolder && depth === 0);
  const showAddButton = Boolean(node.file && showAddAsComponent && onAddAsComponent);
  const showDeleteButton = canDeleteRootFolder;

  const handleClick = () => {
    if (node.isFolder) {
      toggleFolder(node.path);
      return;
    }

    if (node.file && onLoadRobot) {
      onLoadRobot(node.file);
    }
  };

  const handleAddAsComponent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.file && onAddAsComponent) {
      onAddAsComponent(node.file);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (node.isFolder) {
      if (canDeleteRootFolder && onFolderContextMenu) {
        onFolderContextMenu(e, node.path);
      }
      return;
    }

    if (node.file && onFileContextMenu) {
      onFileContextMenu(e, node.file);
    }
  };

  const handleDeleteFromLibrary = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteFromLibrary) return;
    if (node.file) {
      onDeleteFromLibrary({ type: 'file', file: node.file });
      return;
    }
    if (canDeleteRootFolder) {
      onDeleteFromLibrary({ type: 'folder', path: node.path });
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 pr-2 cursor-pointer transition-colors group rounded-sm
          ${
            isSelectedFile
              ? 'bg-system-blue/10 dark:bg-system-blue/20'
              : 'hover:bg-element-bg dark:hover:bg-element-hover'
          }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {node.isFolder ? (
          <span className="w-3 h-3 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-text-tertiary" />
            ) : (
              <ChevronRight className="w-3 h-3 text-text-tertiary" />
            )}
          </span>
        ) : (
          <span className="w-3 h-3" />
        )}

        {getFileIcon(node.name, node.isFolder, isExpanded)}

        <span
          className={`text-xs truncate flex-1 ${
            node.isFolder
              ? 'text-text-primary font-medium'
              : 'text-text-secondary dark:text-text-secondary'
          }`}
        >
          {node.name}
        </span>

        {node.file && (
          <span
            className={`text-[9px] px-1 rounded font-medium ${
              node.file.format === 'urdf'
                ? 'bg-system-blue/10 dark:bg-system-blue/20 text-system-blue'
                : node.file.format === 'xacro'
                  ? 'bg-element-bg dark:bg-element-hover text-text-secondary'
                  : node.file.format === 'mjcf'
                    ? 'bg-orange-100 dark:bg-orange-900/25 text-orange-600 dark:text-orange-300'
                    : node.file.format === 'mesh'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-element-bg dark:bg-element-hover text-text-tertiary'
            }`}
          >
            {node.file.format === 'mesh'
              ? node.file.name.split('.').pop()?.toUpperCase() ?? 'MESH'
              : node.file.format.toUpperCase()}
          </span>
        )}

        {(showAddButton || showDeleteButton) && (
          <div className="flex items-center gap-1">
            {showAddButton && (
              <button
                onClick={handleAddAsComponent}
                className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/50 flex items-center gap-1 transition-colors group/btn"
                title={t.addComponent}
              >
                <Plus size={10} strokeWidth={3} className="group-hover/btn:scale-110 transition-transform" />
                <span className="text-[9px] font-bold uppercase tracking-tighter">{t.add}</span>
              </button>
            )}

            {showDeleteButton && (
              <button
                onClick={handleDeleteFromLibrary}
                className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 flex items-center transition-colors group/btn"
                title={t.removeFromLibrary}
              >
                <Trash2 size={10} strokeWidth={2.5} className="group-hover/btn:scale-110 transition-transform" />
              </button>
            )}
          </div>
        )}
      </div>

      {node.isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              onLoadRobot={onLoadRobot}
              onAddAsComponent={onAddAsComponent}
              onDeleteFromLibrary={onDeleteFromLibrary}
              onFileContextMenu={onFileContextMenu}
              onFolderContextMenu={onFolderContextMenu}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              showAddAsComponent={showAddAsComponent}
              selectedFileName={selectedFileName}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};
