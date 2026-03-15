import { memo } from 'react';
import { Edit3, Plus, Shapes, Shield, Trash2 } from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import { GeometryType } from '@/types';
import type { TreeNodeContextMenuState } from './types';

interface TreeNodeContextMenuProps {
  contextMenu: TreeNodeContextMenuState | null;
  contextMenuHasVisual: boolean;
  contextMenuHasCollision: boolean;
  contextMenuGeometryType: GeometryType | null;
  isSkeleton: boolean;
  t: TranslationKeys;
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
  isSkeleton,
  t,
  onRenameMenuAction,
  onAddChildMenuAction,
  onDeleteMenuAction,
  onAddCollisionMenuAction,
  onDeleteGeometryMenuAction,
  onDeleteLinkGeometry,
}: TreeNodeContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <div
      className="fixed z-[120] w-[170px] rounded-md border border-border-black bg-panel-bg shadow-xl p-1"
      style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      {(contextMenu.target.type === 'link' || contextMenu.target.type === 'joint') && (
        <>
          <button
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
            onClick={onRenameMenuAction}
          >
            <Edit3 size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
            <span>{t.rename}</span>
          </button>

          {isSkeleton && (
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
              onClick={onAddChildMenuAction}
            >
              <Plus size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
              <span>{t.addChildLink}</span>
            </button>
          )}

          {contextMenu.target.type === 'link' && contextMenuHasVisual && (
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
              onClick={() => onDeleteLinkGeometry('visual')}
            >
              <Shapes size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
              <span>{t.deleteVisualGeometry}</span>
            </button>
          )}

          {contextMenu.target.type === 'link' && contextMenuHasCollision && (
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
              onClick={() => onDeleteLinkGeometry('collision')}
            >
              <Shield size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
              <span>{t.deleteCollisionGeometry}</span>
            </button>
          )}

          <button
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
            onClick={onAddCollisionMenuAction}
          >
            <Shield size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
            <span>{t.addCollisionBody}</span>
          </button>

          <button
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
            onClick={onDeleteMenuAction}
          >
            <Trash2 size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
            <span>{t.deleteBranch}</span>
          </button>
        </>
      )}

      {contextMenu.target.type === 'geometry' && contextMenuGeometryType !== null && (
        <button
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
          onClick={onDeleteGeometryMenuAction}
        >
          <Trash2 size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
          <span>
            {contextMenu.target.subType === 'visual' && contextMenuGeometryType === GeometryType.MESH
              ? t.deleteMesh
              : contextMenu.target.subType === 'visual'
                ? t.deleteVisualGeometry
                : t.deleteCollisionGeometry}
          </span>
        </button>
      )}
    </div>
  );
});
