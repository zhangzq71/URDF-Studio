import React from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import type { RobotFile } from '@/types';
import { getFileIcon, type FileTreeNode } from '../utils';

export interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  depth: number;
  onLoadRobot?: (file: RobotFile) => void;
  onAddAsComponent?: (file: RobotFile) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  showAddAsComponent?: boolean;
  t: TranslationKeys;
}

export const FileTreeNodeComponent: React.FC<FileTreeNodeComponentProps> = ({
  node,
  depth,
  onLoadRobot,
  onAddAsComponent,
  expandedFolders,
  toggleFolder,
  showAddAsComponent,
  t,
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const paddingLeft = depth * 12 + 8;

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

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 pr-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#3A3A3C] transition-colors group rounded-sm"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
      >
        {node.isFolder ? (
          <span className="w-3 h-3 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-400" />
            )}
          </span>
        ) : (
          <span className="w-3 h-3" />
        )}

        {getFileIcon(node.name, node.isFolder, isExpanded)}

        <span
          className={`text-xs truncate flex-1 ${
            node.isFolder
              ? 'text-slate-700 dark:text-slate-300 font-medium'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {node.name}
        </span>

        {node.file && (
          <span
            className={`text-[9px] px-1 rounded font-medium ${
              node.file.format === 'urdf'
                ? 'bg-blue-100 dark:bg-slate-700 text-blue-600 dark:text-slate-300'
                : node.file.format === 'xacro'
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  : node.file.format === 'mjcf'
                    ? 'bg-orange-100 dark:bg-slate-700 text-orange-600 dark:text-slate-300'
                    : node.file.format === 'mesh'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
            }`}
          >
            {node.file.format === 'mesh'
              ? node.file.name.split('.').pop()?.toUpperCase() ?? 'MESH'
              : node.file.format.toUpperCase()}
          </span>
        )}

        {showAddAsComponent && node.file && onAddAsComponent && (
          <button
            onClick={handleAddAsComponent}
            className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/50 flex items-center gap-1 transition-colors group/btn"
            title={t.addComponent}
          >
            <Plus size={10} strokeWidth={3} className="group-hover/btn:scale-110 transition-transform" />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t.add}</span>
          </button>
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
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              showAddAsComponent={showAddAsComponent}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};
