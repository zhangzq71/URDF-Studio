import React, { memo, useEffect, useRef, useState } from 'react';
import type { TranslationKeys } from '@/shared/i18n';
import { getCollisionGeometryByObjectIndex, isTransparentDisplayLink } from '@/core/robot';
import { matchesSelection, useSelectionStore } from '@/store/selectionStore';
import { GeometryType, type AppMode, type RobotState } from '@/types';
import { useShallow } from 'zustand/react/shallow';
import { TreeNodeContextMenu } from './tree-node/TreeNodeContextMenu';
import { TreeNodeGeometrySection } from './tree-node/TreeNodeGeometrySection';
import { TreeNodeJointBranchList } from './tree-node/TreeNodeJointBranchList';
import { TreeNodeLinkRow } from './tree-node/TreeNodeLinkRow';
import { getTreeConnectorRailClass, scrollElementIntoView } from './tree-node/presentation';
import { shouldAutoExpandTreeGeometryDetails } from './tree-node/treeGeometryDisclosure';
import type {
  TreeNodeContextMenuState,
  TreeNodeEditingTarget,
  VisibleCollisionBody,
} from './tree-node/types';
import { useTreeNodeActions } from './tree-node/useTreeNodeActions';

export interface TreeNodeProps {
  linkId: string;
  robot: RobotState;
  showGeometryDetailsByDefault?: boolean;
  childJointsByParent?: Record<string, RobotState['joints'][string][]>;
  selectionBranchLinkIds?: Set<string>;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onSelectGeometry?: (linkId: string, subType: 'visual' | 'collision', objectIndex?: number) => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddCollisionBody: (parentId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  mode: AppMode;
  t: TranslationKeys;
  depth?: number;
}

export const TreeNode = memo(({
  linkId,
  robot,
  showGeometryDetailsByDefault = false,
  childJointsByParent,
  selectionBranchLinkIds,
  onSelect,
  onSelectGeometry,
  onFocus,
  onAddChild,
  onAddCollisionBody,
  onDelete,
  onUpdate,
  mode,
  t,
  depth = 0,
}: TreeNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGeometryExpanded, setIsGeometryExpanded] = useState(showGeometryDetailsByDefault);
  const [editingTarget, setEditingTarget] = useState<TreeNodeEditingTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<TreeNodeContextMenuState | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const linkRowRef = useRef<HTMLDivElement>(null);
  const visualRowRef = useRef<HTMLDivElement>(null);
  const primaryCollisionRowRef = useRef<HTMLDivElement>(null);
  const collisionBodyRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const jointRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { hoveredSelection, attentionSelection, setHoveredSelection, clearHover, setSelection } = useSelectionStore(
    useShallow((state) => ({
      hoveredSelection: state.hoveredSelection,
      attentionSelection: state.attentionSelection,
      setHoveredSelection: state.setHoveredSelection,
      clearHover: state.clearHover,
      setSelection: state.setSelection,
    })),
  );

  const link = robot.links[linkId];

  useEffect(() => {
    if (!editingTarget) return;
    const id = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editingTarget]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  if (!link) {
    return null;
  }

  const linkRowIndentPx = 8;
  const jointRowIndentPx = 10;
  const geometryRowIndentPx = 24;
  const childJoints = childJointsByParent?.[linkId] ?? [];
  const hasChildren = childJoints.length > 0;
  const hasExpandableContent = hasChildren;
  const isTransparentLink = isTransparentDisplayLink(robot, linkId);
  const isSkeleton = mode === 'skeleton';
  const isVisible = link.visible !== false;
  const isVisualVisible = link.visual.visible !== false;
  const isPrimaryCollisionVisible = link.collision.visible !== false;
  const hasPrimaryCollision = Boolean(link.collision?.type && link.collision.type !== GeometryType.NONE);
  const hasVisual = Boolean(link.visual?.type && link.visual.type !== GeometryType.NONE);
  const selectedObjectIndex = robot.selection.objectIndex ?? 0;
  const collisionBodyCount = (hasPrimaryCollision ? 1 : 0)
    + (link.collisionBodies || []).filter((body) => body.type !== GeometryType.NONE).length;
  const visibleCollisionBodies: VisibleCollisionBody[] = (link.collisionBodies || [])
    .map((body, bodyIndex) => ({ body, bodyIndex }))
    .filter(({ body }) => body.type !== GeometryType.NONE)
    .map((entry, visibleIndex) => ({
      ...entry,
      objectIndex: (hasPrimaryCollision ? 1 : 0) + visibleIndex,
    }));
  const hasCollision = collisionBodyCount > 0;
  const hasGeometry = hasVisual || hasCollision;
  const isLinkSelected = robot.selection.type === 'link' && robot.selection.id === linkId;
  const isEditingLink = editingTarget?.type === 'link' && editingTarget.id === linkId;
  const isLinkHovered = hoveredSelection.type === 'link' && hoveredSelection.id === linkId;
  const isLinkAttentionHighlighted = attentionSelection.type === 'link' && attentionSelection.id === linkId;
  const isVisualSelected = isLinkSelected
    && robot.selection.subType === 'visual'
    && (robot.selection.objectIndex === undefined || selectedObjectIndex === 0);
  const isPrimaryCollisionSelected = isLinkSelected
    && robot.selection.subType === 'collision'
    && selectedObjectIndex === 0;
  const hasSelectedExtraCollision = visibleCollisionBodies.some(
    ({ objectIndex }) => objectIndex === selectedObjectIndex,
  );
  const shouldAutoExpandGeometryDetails = shouldAutoExpandTreeGeometryDetails({
    showGeometryDetailsByDefault,
    selectionSubType: isLinkSelected ? robot.selection.subType : undefined,
    hasSelectedExtraCollision: isLinkSelected && robot.selection.subType === 'collision' && hasSelectedExtraCollision,
  });
  const selectionInBranch = selectionBranchLinkIds?.has(linkId) ?? false;
  const contextMenuLink = contextMenu?.target.type === 'link' ? robot.links[contextMenu.target.id] : null;
  const contextMenuHasVisual = Boolean(contextMenuLink?.visual?.type && contextMenuLink.visual.type !== GeometryType.NONE);
  const contextMenuHasCollision = Boolean(
    (contextMenuLink?.collision?.type && contextMenuLink.collision.type !== GeometryType.NONE)
      || (contextMenuLink?.collisionBodies || []).some((body) => body.type !== GeometryType.NONE),
  );
  const contextMenuGeometryType = contextMenu?.target.type === 'geometry'
    ? (() => {
      const targetLink = robot.links[contextMenu.target.linkId];
      if (!targetLink) return null;
      return contextMenu.target.subType === 'visual'
        ? targetLink.visual?.type ?? null
        : getCollisionGeometryByObjectIndex(targetLink, contextMenu.target.objectIndex)?.geometry?.type ?? null;
    })()
    : null;
  const isLinkConnectorHighlighted = isLinkSelected
    || isLinkHovered
    || isLinkAttentionHighlighted
    || selectionInBranch;

  useEffect(() => {
    if (selectionInBranch && hasExpandableContent) {
      setIsExpanded(true);
    }
  }, [selectionInBranch, hasExpandableContent]);

  useEffect(() => {
    setIsGeometryExpanded(showGeometryDetailsByDefault);
  }, [showGeometryDetailsByDefault]);

  useEffect(() => {
    if (shouldAutoExpandGeometryDetails) {
      setIsGeometryExpanded(true);
    }
  }, [shouldAutoExpandGeometryDetails]);

  useEffect(() => {
    if (isLinkSelected && !robot.selection.subType) {
      scrollElementIntoView(linkRowRef.current);
    }
  }, [isLinkSelected, robot.selection.subType]);

  useEffect(() => {
    if (isGeometryExpanded && isVisualSelected) {
      scrollElementIntoView(visualRowRef.current);
    }
  }, [isGeometryExpanded, isVisualSelected]);

  useEffect(() => {
    if (isGeometryExpanded && isPrimaryCollisionSelected) {
      scrollElementIntoView(primaryCollisionRowRef.current);
    }
  }, [isGeometryExpanded, isPrimaryCollisionSelected]);

  useEffect(() => {
    if (!(isGeometryExpanded && isLinkSelected && robot.selection.subType === 'collision' && hasSelectedExtraCollision)) {
      return;
    }
    scrollElementIntoView(collisionBodyRowRefs.current[selectedObjectIndex]);
  }, [isGeometryExpanded, isLinkSelected, robot.selection.subType, selectedObjectIndex, hasSelectedExtraCollision]);

  useEffect(() => {
    if (!isExpanded || robot.selection.type !== 'joint' || !robot.selection.id) return;
    scrollElementIntoView(jointRowRefs.current[robot.selection.id] || null);
  }, [isExpanded, robot.selection.type, robot.selection.id]);
  const {
    handleSelectVisual,
    handleSelectPrimaryCollision,
    handleSelectCollisionBody,
    toggleVisualVisibility,
    togglePrimaryCollisionVisibility,
    toggleCollisionBodyVisibility,
    commitRenaming,
    cancelRenaming,
    updateRenameDraft,
    handleNameDoubleClick,
    openContextMenu,
    handleRenameMenuAction,
    handleAddChildMenuAction,
    handleDeleteMenuAction,
    handleAddCollisionMenuAction,
    handleDeleteGeometryMenuAction,
    handleDeleteLinkGeometry,
  } = useTreeNodeActions({
    linkId,
    link,
    robot,
    isSkeleton,
    isVisualVisible,
    isPrimaryCollisionVisible,
    editingTarget,
    contextMenu,
    onSelect,
    onSelectGeometry,
    onAddChild,
    onAddCollisionBody,
    onDelete,
    onUpdate,
    setSelection,
    setIsExpanded,
    setIsGeometryExpanded,
    setEditingTarget,
    setContextMenu,
  });

  if (isTransparentLink) {
    if (!hasChildren) {
      return null;
    }

    return (
      <TreeNodeJointBranchList
        childJoints={childJoints}
        robotSelection={robot.selection}
        hoveredSelection={hoveredSelection}
        attentionSelection={attentionSelection}
        selectionBranchLinkIds={selectionBranchLinkIds}
        editingTarget={editingTarget}
        renameInputRef={renameInputRef}
        jointRowRefs={jointRowRefs}
        jointRowIndentPx={jointRowIndentPx}
        isSkeleton={isSkeleton}
        t={t}
        onSelect={onSelect}
        onDelete={onDelete}
        onSetHoveredSelection={setHoveredSelection}
        onClearHover={clearHover}
        onOpenContextMenu={openContextMenu}
        onUpdateRenameDraft={updateRenameDraft}
        onCommitRenaming={commitRenaming}
        onCancelRenaming={cancelRenaming}
        onNameDoubleClick={handleNameDoubleClick}
        renderChildNode={(childLinkId) => (
          <TreeNode
            linkId={childLinkId}
            robot={robot}
            showGeometryDetailsByDefault={showGeometryDetailsByDefault}
            childJointsByParent={childJointsByParent}
            selectionBranchLinkIds={selectionBranchLinkIds}
            onSelect={onSelect}
            onSelectGeometry={onSelectGeometry}
            onFocus={onFocus}
            onAddChild={onAddChild}
            onAddCollisionBody={onAddCollisionBody}
            onDelete={onDelete}
            onUpdate={onUpdate}
            mode={mode}
            t={t}
            depth={depth}
          />
        )}
      />
    );
  }

  return (
    <div className="relative">
      <div ref={linkRowRef}>
        <TreeNodeLinkRow
          linkId={linkId}
          linkName={link.name}
          depth={depth}
          linkRowIndentPx={linkRowIndentPx}
          hasExpandableContent={hasExpandableContent}
          isExpanded={isExpanded}
          isEditingLink={isEditingLink}
          editingTarget={editingTarget}
          renameInputRef={renameInputRef}
          hasGeometry={hasGeometry}
          hasVisual={hasVisual}
          hasCollision={hasCollision}
          geometryCount={Number(Boolean(hasVisual)) + collisionBodyCount}
          isGeometryExpanded={isGeometryExpanded}
          isVisible={isVisible}
          isSkeleton={isSkeleton}
          isSelected={isLinkSelected}
          isHovered={isLinkHovered}
          isAttentionHighlighted={isLinkAttentionHighlighted}
          isConnectorHighlighted={isLinkConnectorHighlighted}
          t={t}
          onSelect={() => onSelect('link', linkId)}
          onFocus={onFocus ? () => onFocus(linkId) : undefined}
          onToggleExpanded={() => setIsExpanded(!isExpanded)}
          onOpenContextMenu={(event) => openContextMenu(event, { type: 'link', id: linkId, name: link.name })}
          onMouseEnter={() => setHoveredSelection({ type: 'link', id: linkId })}
          onMouseLeave={clearHover}
          onUpdateRenameDraft={updateRenameDraft}
          onCommitRenaming={commitRenaming}
          onCancelRenaming={cancelRenaming}
          onNameDoubleClick={(event) => handleNameDoubleClick(event, 'link', linkId, link.name)}
          onToggleGeometryExpanded={() => setIsGeometryExpanded((prev) => !prev)}
          onToggleVisibility={(event) => {
            event.stopPropagation();
            onUpdate('link', linkId, { ...link, visible: !isVisible });
          }}
          onAddChild={(event) => {
            event.stopPropagation();
            onAddChild(linkId);
            setIsExpanded(true);
          }}
        />
      </div>

      {(isExpanded || isGeometryExpanded) && (
        <div className="relative ml-3">
          <div
            className={`absolute left-0 top-0 bottom-2 w-[1.5px] rounded-full ${getTreeConnectorRailClass(isLinkConnectorHighlighted)}`}
          />

          {isGeometryExpanded && hasGeometry && (
            <TreeNodeGeometrySection
              linkId={linkId}
              link={link}
              robotSelection={robot.selection}
              hoveredSelection={hoveredSelection}
              attentionSelection={attentionSelection}
              visualRowRef={visualRowRef}
              primaryCollisionRowRef={primaryCollisionRowRef}
              collisionBodyRowRefs={collisionBodyRowRefs}
              geometryRowIndentPx={geometryRowIndentPx}
              hasPrimaryCollision={hasPrimaryCollision}
              visibleCollisionBodies={visibleCollisionBodies}
              isLinkSelected={isLinkSelected}
              selectedObjectIndex={selectedObjectIndex}
              t={t}
              onSetHoveredSelection={setHoveredSelection}
              onClearHover={clearHover}
              onOpenContextMenu={openContextMenu}
              onSelectVisual={handleSelectVisual}
              onSelectPrimaryCollision={handleSelectPrimaryCollision}
              onSelectCollisionBody={handleSelectCollisionBody}
              onToggleVisualVisibility={toggleVisualVisibility}
              onTogglePrimaryCollisionVisibility={togglePrimaryCollisionVisibility}
              onToggleCollisionBodyVisibility={toggleCollisionBodyVisibility}
            />
          )}

          {isExpanded && hasChildren && (
            <TreeNodeJointBranchList
              childJoints={childJoints}
              robotSelection={robot.selection}
              hoveredSelection={hoveredSelection}
              attentionSelection={attentionSelection}
              selectionBranchLinkIds={selectionBranchLinkIds}
              editingTarget={editingTarget}
              renameInputRef={renameInputRef}
              jointRowRefs={jointRowRefs}
              jointRowIndentPx={jointRowIndentPx}
              isSkeleton={isSkeleton}
              t={t}
              onSelect={onSelect}
              onDelete={onDelete}
              onSetHoveredSelection={setHoveredSelection}
              onClearHover={clearHover}
              onOpenContextMenu={openContextMenu}
              onUpdateRenameDraft={updateRenameDraft}
              onCommitRenaming={commitRenaming}
              onCancelRenaming={cancelRenaming}
              onNameDoubleClick={handleNameDoubleClick}
              renderChildNode={(childLinkId) => (
                <TreeNode
                  linkId={childLinkId}
                  robot={robot}
                  showGeometryDetailsByDefault={showGeometryDetailsByDefault}
                  childJointsByParent={childJointsByParent}
                  selectionBranchLinkIds={selectionBranchLinkIds}
                  onSelect={onSelect}
                  onSelectGeometry={onSelectGeometry}
                  onFocus={onFocus}
                  onAddChild={onAddChild}
                  onAddCollisionBody={onAddCollisionBody}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  mode={mode}
                  t={t}
                  depth={depth + 1}
                />
              )}
            />
          )}
        </div>
      )}

      <TreeNodeContextMenu
        contextMenu={contextMenu}
        contextMenuHasVisual={contextMenuHasVisual}
        contextMenuHasCollision={contextMenuHasCollision}
        contextMenuGeometryType={contextMenuGeometryType}
        isSkeleton={isSkeleton}
        t={t}
        onRenameMenuAction={handleRenameMenuAction}
        onAddChildMenuAction={handleAddChildMenuAction}
        onDeleteMenuAction={handleDeleteMenuAction}
        onAddCollisionMenuAction={handleAddCollisionMenuAction}
        onDeleteGeometryMenuAction={handleDeleteGeometryMenuAction}
        onDeleteLinkGeometry={handleDeleteLinkGeometry}
      />
    </div>
  );
});

TreeNode.displayName = 'TreeNode';
