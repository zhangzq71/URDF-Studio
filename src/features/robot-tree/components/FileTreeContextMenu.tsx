import React from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { ContextMenuFrame, ContextMenuItem } from '@/shared/components/ui';

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
    <ContextMenuFrame position={position} widthClassName="w-44">
      {showAddAction && addLabel && onAdd && (
        <ContextMenuItem onClick={onAdd} icon={<Plus size={12} />}>
          {addLabel}
        </ContextMenuItem>
      )}
      {showExportAsURDFAction && exportAsURDFLabel && onExportAsURDF && (
        <ContextMenuItem onClick={onExportAsURDF} icon={<Download size={12} />}>
          {exportAsURDFLabel}
        </ContextMenuItem>
      )}
      {showExportAsMJCFAction && exportAsMJCFLabel && onExportAsMJCF && (
        <ContextMenuItem onClick={onExportAsMJCF} icon={<Download size={12} />}>
          {exportAsMJCFLabel}
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
