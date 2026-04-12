import { memo } from 'react';
import { Edit3, Plus, Shapes, Shield, Trash2 } from 'lucide-react';
import { ContextMenuFrame, ContextMenuItem } from '@/shared/components/ui';
import type { TranslationKeys } from '@/shared/i18n';
import { GeometryType } from '@/types';
import type { TreeNodeContextMenuState } from './types';

interface TreeNodeContextMenuProps {
  contextMenu: TreeNodeContextMenuState | null;
  contextMenuHasVisual: boolean;
  contextMenuHasCollision: boolean;
  contextMenuGeometryType: GeometryType | null;
  t: TranslationKeys;
  readOnly: boolean;
  onRenameMenuAction: () => void;
  onAddChildMenuAction: () => void;
  onDeleteMenuAction: () => void;
  onAddCollisionMenuAction: () => void;
  onDeleteGeometryMenuAction: () => void;
  onDeleteLinkGeometry: (subType: 'visual' | 'collision') => void;
}

export const TreeNodeContextMenu = memo(function TreeNodeContextMenu({
  contextMenu,
  contextMenuHasVisual,
  contextMenuHasCollision,
  contextMenuGeometryType,
  t,
  readOnly,
  onRenameMenuAction,
  onAddChildMenuAction,
  onDeleteMenuAction,
  onAddCollisionMenuAction,
  onDeleteGeometryMenuAction,
  onDeleteLinkGeometry,
}: TreeNodeContextMenuProps) {
  if (!contextMenu || readOnly) {
    return null;
  }

  return (
    <ContextMenuFrame position={{ x: contextMenu.x, y: contextMenu.y }}>
      {(contextMenu.target.type === 'link' || contextMenu.target.type === 'joint') && (
        <>
          <ContextMenuItem onClick={onRenameMenuAction} icon={<Edit3 size={12} />}>
            {t.rename}
          </ContextMenuItem>

          <ContextMenuItem onClick={onAddChildMenuAction} icon={<Plus size={12} />}>
            {t.addChildLink}
          </ContextMenuItem>

          {contextMenu.target.type === 'link' && contextMenuHasVisual && (
            <ContextMenuItem
              onClick={() => onDeleteLinkGeometry('visual')}
              icon={<Shapes size={12} />}
              tone="danger"
            >
              {t.deleteVisualGeometry}
            </ContextMenuItem>
          )}

          {contextMenu.target.type === 'link' && contextMenuHasCollision && (
            <ContextMenuItem
              onClick={() => onDeleteLinkGeometry('collision')}
              icon={<Shield size={12} />}
              tone="danger"
            >
              {t.deleteCollisionGeometry}
            </ContextMenuItem>
          )}

          <ContextMenuItem onClick={onAddCollisionMenuAction} icon={<Shield size={12} />}>
            {t.addCollisionBody}
          </ContextMenuItem>

          <ContextMenuItem onClick={onDeleteMenuAction} icon={<Trash2 size={12} />} tone="danger">
            {t.deleteBranch}
          </ContextMenuItem>
        </>
      )}

      {contextMenu.target.type === 'geometry' && (
        <>
          <ContextMenuItem onClick={onRenameMenuAction} icon={<Edit3 size={12} />}>
            {t.rename}
          </ContextMenuItem>

          {contextMenuGeometryType !== null && (
            <ContextMenuItem
              onClick={onDeleteGeometryMenuAction}
              icon={<Trash2 size={12} />}
              tone="danger"
            >
              {contextMenu.target.subType === 'visual' &&
              contextMenuGeometryType === GeometryType.MESH
                ? t.deleteMesh
                : contextMenu.target.subType === 'visual'
                  ? t.deleteVisualGeometry
                  : t.deleteCollisionGeometry}
            </ContextMenuItem>
          )}
        </>
      )}
    </ContextMenuFrame>
  );
});
