import React from 'react';
import { Plus } from 'lucide-react';

export interface FileTreeContextMenuProps {
  position: { x: number; y: number } | null;
  addLabel: string;
  onAdd: () => void;
}

export const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({
  position,
  addLabel,
  onAdd,
}) => {
  if (!position) return null;

  return (
    <div
      className="fixed z-[120] w-44 rounded-md border border-slate-200 dark:border-[#3A3A3C] bg-white dark:bg-[#1E1E20] shadow-xl p-1"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
        onClick={onAdd}
      >
        <Plus size={12} className="text-green-600 dark:text-green-400" />
        <span>{addLabel}</span>
      </button>
    </div>
  );
};
