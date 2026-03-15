import { memo, type MouseEvent, type RefObject } from 'react';
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, Plus, Shapes, Shield } from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import type { TreeNodeEditingTarget } from './types';
import {
  getTreeConnectorElbowClass,
  getTreeConnectorElbowStyle,
  resolveTreeRowStateClass,
} from './presentation';

interface TreeNodeLinkRowProps {
  linkId: string;
  linkName: string;
  depth: number;
  linkRowIndentPx: number;
  hasExpandableContent: boolean;
  isExpanded: boolean;
  isEditingLink: boolean;
  editingTarget: TreeNodeEditingTarget | null;
  renameInputRef: RefObject<HTMLInputElement | null>;
  hasGeometry: boolean;
  hasVisual: boolean;
  hasCollision: boolean;
  geometryCount: number;
  isGeometryExpanded: boolean;
  isVisible: boolean;
  isSkeleton: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isAttentionHighlighted: boolean;
  isConnectorHighlighted: boolean;
  t: TranslationKeys;
  onSelect: () => void;
  onFocus?: () => void;
  onToggleExpanded: () => void;
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onUpdateRenameDraft: (value: string) => void;
  onCommitRenaming: () => void;
  onCancelRenaming: () => void;
  onNameDoubleClick: (event: MouseEvent) => void;
  onToggleGeometryExpanded: () => void;
  onToggleVisibility: (event: MouseEvent) => void;
  onAddChild: (event: MouseEvent) => void;
}

export const TreeNodeLinkRow = memo(function TreeNodeLinkRow({
  linkId,
  linkName,
  depth,
  linkRowIndentPx,
  hasExpandableContent,
  isExpanded,
  isEditingLink,
  editingTarget,
  renameInputRef,
  hasGeometry,
  hasVisual,
  hasCollision,
  geometryCount,
  isGeometryExpanded,
  isVisible,
  isSkeleton,
  isSelected,
  isHovered,
  isAttentionHighlighted,
  isConnectorHighlighted,
  t,
  onSelect,
  onFocus,
  onToggleExpanded,
  onOpenContextMenu,
  onMouseEnter,
  onMouseLeave,
  onUpdateRenameDraft,
  onCommitRenaming,
  onCancelRenaming,
  onNameDoubleClick,
  onToggleGeometryExpanded,
  onToggleVisibility,
  onAddChild,
}: TreeNodeLinkRowProps) {
  const selectedLinkActionClass = 'text-system-blue hover:bg-system-blue/15 hover:text-system-blue-hover dark:hover:bg-system-blue/25';

  return (
    <div
      className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-all duration-200 ${
        resolveTreeRowStateClass('text-text-primary dark:text-text-secondary', {
          isHovered,
          isSelected,
          isAttentionHighlighted,
        })
      }`}
      onClick={onSelect}
      onDoubleClick={onFocus}
      onContextMenu={onOpenContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={linkName || linkId}
      style={{ marginLeft: depth > 0 ? `${linkRowIndentPx}px` : '0' }}
    >
      {depth > 0 && (
        <div
          className={getTreeConnectorElbowClass(isConnectorHighlighted)}
          style={getTreeConnectorElbowStyle(linkRowIndentPx)}
        />
      )}

      <button
        type="button"
        className={`w-6 h-6 flex items-center justify-center shrink-0 mr-0.5 rounded
          ${hasExpandableContent
            ? (isSelected || isHovered || isAttentionHighlighted)
              ? 'hover:bg-system-blue/15 dark:hover:bg-system-blue/25 cursor-pointer transition-colors'
              : 'hover:bg-element-hover cursor-pointer transition-colors'
            : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          if (hasExpandableContent) {
            onToggleExpanded();
          }
        }}
        aria-label={`${isExpanded ? t.hide : t.show} ${linkName || linkId}`}
        title={`${isExpanded ? t.hide : t.show} ${linkName || linkId}`}
        disabled={!hasExpandableContent}
      >
        {hasExpandableContent
          && (isExpanded ? (
            <ChevronDown size={12} className={isSelected ? 'text-text-secondary' : 'text-text-tertiary'} />
          ) : (
            <ChevronRight size={12} className={isSelected ? 'text-text-secondary' : 'text-text-tertiary'} />
          ))}
      </button>

      <div
        className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0 border transition-colors
          ${(isSelected || isHovered || isAttentionHighlighted)
            ? 'bg-system-blue/15 dark:bg-system-blue/20 border-system-blue/25 dark:border-system-blue/30'
            : 'bg-system-blue/10 dark:bg-system-blue/12 border-transparent'}`}
      >
        <Box size={12} className="text-system-blue" />
      </div>

      {isEditingLink ? (
        <input
          ref={renameInputRef}
          value={editingTarget?.draft ?? ''}
          onChange={(event) => onUpdateRenameDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={onCommitRenaming}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCommitRenaming();
            } else if (event.key === 'Escape') {
              onCancelRenaming();
            }
          }}
          className={`text-xs font-medium flex-1 min-w-0 px-1 py-0.5 rounded border outline-none transition-colors ${
            isSelected
              ? 'bg-panel-bg border-border-strong text-text-primary focus:border-system-blue'
              : 'bg-input-bg border-border-strong text-text-primary focus:border-system-blue'
          }`}
        />
      ) : (
        <div className="flex items-center gap-1 min-w-0">
          <span
            className="text-xs font-medium whitespace-nowrap select-none truncate"
            onDoubleClick={onNameDoubleClick}
            onDragStart={(event) => event.preventDefault()}
            title={linkName}
          >
            {linkName}
          </span>
        </div>
      )}

      <div className="flex items-center gap-0.5 ml-1 shrink-0">
        {hasGeometry && (
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
              isGeometryExpanded
                ? 'bg-element-hover text-text-primary ring-1 ring-inset ring-border-black/60'
                : 'text-text-tertiary hover:bg-element-hover hover:text-text-primary'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleGeometryExpanded();
            }}
            title={`${isGeometryExpanded ? t.collapse : t.expand} ${t.visualGeometry} / ${t.collisionGeometry}`}
            aria-label={`${isGeometryExpanded ? t.collapse : t.expand} ${t.visualGeometry} / ${t.collisionGeometry}`}
          >
            {hasVisual && <Shapes size={10} className="text-emerald-500 dark:text-emerald-400" />}
            {hasCollision && <Shield size={10} className="text-amber-500 dark:text-amber-400" />}
            <span className="text-[9px] font-semibold tabular-nums text-text-secondary">
              {geometryCount}
            </span>
            {isGeometryExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        )}

        <button
          type="button"
          className={`p-1 rounded cursor-pointer transition-colors ${
            isSelected
              ? selectedLinkActionClass
              : 'text-text-tertiary hover:bg-system-blue/10 hover:text-text-primary dark:hover:bg-system-blue/20'
          }`}
          onClick={onToggleVisibility}
          title={isVisible ? t.hide : t.show}
          aria-label={isVisible ? t.hide : t.show}
        >
          {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>

        {isSkeleton && (
          <button
            type="button"
            onClick={onAddChild}
            className={`p-1 rounded transition-all ${
              isSelected
                ? 'opacity-100 hover:bg-system-blue/15 dark:hover:bg-system-blue/25'
                : 'opacity-0 group-hover:opacity-100 hover:bg-system-blue/10 dark:hover:bg-system-blue/20'
            }`}
            title={t.addChildJoint}
            aria-label={t.addChildJoint}
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    </div>
  );
});
