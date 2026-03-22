import React from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { ContextMenuFrame, ContextMenuItem } from '@/shared/components/ui';

export interface FileTreeContextMenuProps {
  position: { x: number; y: number } | null;
  addLabel?: string;
  exportLabel?: string;
  deleteLabel: string;
  onAdd?: () => void;
  onExport?: () => void;
  onDelete: () => void;
  showAddAction?: boolean;
  showExportAction?: boolean;
  showDeleteAction?: boolean;
}

export const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({
  position,
  addLabel,
  exportLabel,
  deleteLabel,
  onAdd,
  onExport,
  onDelete,
  showAddAction = true,
  showExportAction = false,
  showDeleteAction = true,
}) => {
  if (!position) return null;
  if (!showAddAction && !showExportAction && !showDeleteAction) return null;

  return (
    <ContextMenuFrame position={position} widthClassName="w-44">
      {showAddAction && addLabel && onAdd && (
        <ContextMenuItem onClick={onAdd} icon={<Plus size={12} />}>
          {addLabel}
        </ContextMenuItem>
      )}
      {showExportAction && exportLabel && onExport && (
        <ContextMenuItem onClick={onExport} icon={<Download size={12} />}>
          {exportLabel}
        </ContextMenuItem>
      )}
      {showDeleteAction && (
        <ContextMenuItem onClick={onDelete} icon={<Trash2 size={12} />} tone="danger">
          {deleteLabel}
        </ContextMenuItem>
      )}
    </ContextMenuFrame>
  );
};
