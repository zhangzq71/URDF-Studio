import React from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';

export interface FileTreeContextMenuProps {
  position: { x: number; y: number } | null;
  addLabel?: string;
  exportAsURDFLabel?: string;
  exportAsMJCFLabel?: string;
  deleteLabel: string;
  onAdd?: () => void;
  onExportAsURDF?: () => void;
  onExportAsMJCF?: () => void;
  onDelete: () => void;
  showAddAction?: boolean;
  showExportAsURDFAction?: boolean;
  showExportAsMJCFAction?: boolean;
  showDeleteAction?: boolean;
}

export const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({
  position,
  addLabel,
  exportAsURDFLabel,
  exportAsMJCFLabel,
  deleteLabel,
  onAdd,
  onExportAsURDF,
  onExportAsMJCF,
  onDelete,
  showAddAction = true,
  showExportAsURDFAction = false,
  showExportAsMJCFAction = false,
  showDeleteAction = true,
}) => {
  if (!position) return null;
  if (!showAddAction && !showExportAsURDFAction && !showExportAsMJCFAction && !showDeleteAction) return null;

  return (
    <div
      className="fixed z-[120] w-44 rounded-md border border-border-black bg-panel-bg shadow-xl p-1"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      {showAddAction && addLabel && onAdd && (
        <button
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
          onClick={onAdd}
        >
          <Plus size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
          <span>{addLabel}</span>
        </button>
      )}
      {showExportAsURDFAction && exportAsURDFLabel && onExportAsURDF && (
        <button
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
          onClick={onExportAsURDF}
        >
          <Download size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
          <span>{exportAsURDFLabel}</span>
        </button>
      )}
      {showExportAsMJCFAction && exportAsMJCFLabel && onExportAsMJCF && (
        <button
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
          onClick={onExportAsMJCF}
        >
          <Download size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
          <span>{exportAsMJCFLabel}</span>
        </button>
      )}
      {showDeleteAction && (
        <button
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
          onClick={onDelete}
        >
          <Trash2 size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
          <span>{deleteLabel}</span>
        </button>
      )}
    </div>
  );
};
