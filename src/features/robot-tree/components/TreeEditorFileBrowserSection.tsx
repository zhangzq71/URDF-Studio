import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { RobotFile } from '@/types';
import type { FileTreeNode } from '../utils';
import { FileTreeNodeComponent, type LibraryDeleteTarget } from './FileTreeNode';
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
  previewFileName?: string;
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
  previewFileName,
  shouldFillSpace,
  t,
  toggleFolder,
}: TreeEditorFileBrowserSectionProps) {
  return (
    <>
      <div
        className={`flex flex-col bg-white dark:bg-panel-bg border-b border-border-black dark:border-border-black ${shouldFillSpace ? 'flex-1 min-h-0' : 'shrink-0'} ${isDragging ? '' : 'transition-all duration-200'}`}
        style={shouldFillSpace ? undefined : { height: isFileBrowserOpen ? `${fileBrowserHeight}px` : 'auto' }}
      >
        <div
          className="flex items-center justify-between px-3 py-2 bg-element-bg dark:bg-element-bg cursor-pointer select-none"
          onClick={onToggleOpen}
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
                  onOpenDeleteAllDialog();
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
                  onLoadRobot={onFileLoad}
                  onAddAsComponent={isProMode ? onAddComponent : undefined}
                  onDeleteFromLibrary={onDeleteFromLibrary}
                  onFileContextMenu={onFileContextMenu}
                  onFolderContextMenu={onFolderContextMenu}
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
          onMouseDown={onResizeMouseDown}
        />
      )}
    </>
  );
}
