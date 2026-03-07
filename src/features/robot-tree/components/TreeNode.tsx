import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Shapes,
  Shield,
  Trash2,
} from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import { matchesSelection, useSelectionStore } from '@/store/selectionStore';
import { GeometryType, JointType, type AppMode, type RobotState } from '@/types';
import { useShallow } from 'zustand/react/shallow';

export interface TreeNodeProps {
  linkId: string;
  robot: RobotState;
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

function getJointTypeLabel(type: JointType, t: TranslationKeys): string {
  switch (type) {
    case JointType.FIXED:
      return t.jointTypeFixed;
    case JointType.REVOLUTE:
      return t.jointTypeRevolute;
    case JointType.CONTINUOUS:
      return t.jointTypeContinuous;
    case JointType.PRISMATIC:
      return t.jointTypePrismatic;
    case JointType.PLANAR:
      return t.jointTypePlanar;
    case JointType.FLOATING:
      return t.jointTypeFloating;
    default:
      return type;
  }
}

function branchContainsSelection(robot: RobotState, branchLinkId: string): boolean {
  const { selection } = robot;
  if (!selection.type || !selection.id) return false;
  if (selection.type === 'link' && selection.id === branchLinkId) return true;

  const childJoints = Object.values(robot.joints).filter((joint) => joint.parentLinkId === branchLinkId);
  for (const joint of childJoints) {
    if (selection.type === 'joint' && selection.id === joint.id) return true;
    if (branchContainsSelection(robot, joint.childLinkId)) return true;
  }

  return false;
}

function scrollElementIntoView(element: HTMLElement | null) {
  if (!element) return;
  window.requestAnimationFrame(() => {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

const treeRowHoverClass = 'hover:bg-system-blue/10 hover:text-text-primary hover:ring-1 hover:ring-inset hover:ring-system-blue/15 dark:hover:bg-system-blue/20 dark:hover:ring-system-blue/25';
const treeRowHoveredClass = 'bg-system-blue/10 text-text-primary ring-1 ring-inset ring-system-blue/15 dark:bg-system-blue/18 dark:ring-system-blue/25';
const treeRowSelectedClass = 'bg-system-blue/10 text-text-primary shadow-sm ring-1 ring-inset ring-system-blue/20 dark:bg-system-blue/20 dark:ring-system-blue/30';
const treeRowAttentionClass = 'bg-system-blue/15 text-text-primary shadow-sm ring-1 ring-inset ring-system-blue/30 dark:bg-system-blue/25 dark:ring-system-blue/40';

function resolveTreeRowStateClass(
  baseClassName: string,
  state: {
    isHovered: boolean;
    isSelected: boolean;
    isAttentionHighlighted: boolean;
  }
) {
  if (state.isAttentionHighlighted) {
    return `${treeRowAttentionClass} ${baseClassName}`;
  }
  if (state.isSelected) {
    return `${treeRowSelectedClass} ${baseClassName}`;
  }
  if (state.isHovered) {
    return `${treeRowHoveredClass} ${baseClassName}`;
  }
  return `${treeRowHoverClass} ${baseClassName}`;
}

export const TreeNode = memo(({
  linkId,
  robot,
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
  const [editingTarget, setEditingTarget] = useState<{
    type: 'link' | 'joint';
    id: string;
    draft: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target:
      | { type: 'link'; id: string; name: string }
      | { type: 'joint'; id: string; name: string }
      | { type: 'mesh'; linkId: string; subType: 'visual' | 'collision' };
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const linkRowRef = useRef<HTMLDivElement>(null);
  const visualRowRef = useRef<HTMLDivElement>(null);
  const primaryCollisionRowRef = useRef<HTMLDivElement>(null);
  const collisionBodyRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const jointRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { hoveredSelection, attentionSelection, setHoveredSelection, clearHover } = useSelectionStore(
    useShallow((state) => ({
      hoveredSelection: state.hoveredSelection,
      attentionSelection: state.attentionSelection,
      setHoveredSelection: state.setHoveredSelection,
      clearHover: state.clearHover,
    }))
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

  const childJoints = Object.values(robot.joints).filter((joint) => joint.parentLinkId === linkId);
  const hasChildren = childJoints.length > 0;

  const isLinkSelected = robot.selection.type === 'link' && robot.selection.id === linkId;
  const isSkeleton = mode === 'skeleton';

  const isVisible = link.visible !== false;
  const isVisualVisible = link.visual.visible !== false;
  const isPrimaryCollisionVisible = link.collision.visible !== false;
  const hasPrimaryCollision = Boolean(link.collision?.type && link.collision.type !== GeometryType.NONE);
  const selectedObjectIndex = robot.selection.objectIndex ?? 0;
  const hasVisual = link.visual?.type && link.visual.type !== 'none';
  const collisionBodyCount = (link.collision?.type && link.collision.type !== 'none' ? 1 : 0)
    + (link.collisionBodies || []).filter((body) => body.type !== GeometryType.NONE).length;
  const visibleCollisionBodies = (link.collisionBodies || [])
    .map((body, bodyIndex) => ({ body, bodyIndex }))
    .filter(({ body }) => body.type !== GeometryType.NONE)
    .map((entry, visibleIndex) => ({
      ...entry,
      objectIndex: (hasPrimaryCollision ? 1 : 0) + visibleIndex,
    }));
  const hasCollision = collisionBodyCount > 0;
  const hasExpandableContent = hasVisual || hasCollision || hasChildren;
  const isEditingLink = editingTarget?.type === 'link' && editingTarget.id === linkId;
  const isLinkHovered = hoveredSelection.type === 'link' && hoveredSelection.id === linkId;
  const isLinkAttentionHighlighted = attentionSelection.type === 'link' && attentionSelection.id === linkId;
  const isVisualSelected = isLinkSelected
    && robot.selection.subType === 'visual'
    && (robot.selection.objectIndex === undefined || selectedObjectIndex === 0);
  const isVisualHovered = matchesSelection(
    hoveredSelection,
    { type: 'link', id: linkId, subType: 'visual', objectIndex: 0 }
  );
  const isVisualAttentionHighlighted = matchesSelection(
    attentionSelection,
    { type: 'link', id: linkId, subType: 'visual', objectIndex: 0 }
  );
  const isPrimaryCollisionSelected = isLinkSelected
    && robot.selection.subType === 'collision'
    && selectedObjectIndex === 0;
  const isPrimaryCollisionHovered = matchesSelection(
    hoveredSelection,
    { type: 'link', id: linkId, subType: 'collision', objectIndex: 0 }
  );
  const isPrimaryCollisionAttentionHighlighted = matchesSelection(
    attentionSelection,
    { type: 'link', id: linkId, subType: 'collision', objectIndex: 0 }
  );
  const selectionInBranch = branchContainsSelection(robot, linkId);
  const contextMenuLink = contextMenu?.target.type === 'link' ? robot.links[contextMenu.target.id] : null;
  const contextMenuHasVisual = Boolean(contextMenuLink?.visual?.type && contextMenuLink.visual.type !== GeometryType.NONE);
  const contextMenuHasCollision = Boolean(
    (contextMenuLink?.collision?.type && contextMenuLink.collision.type !== GeometryType.NONE)
      || (contextMenuLink?.collisionBodies || []).some((body) => body.type !== GeometryType.NONE)
  );

  useEffect(() => {
    if (selectionInBranch && hasExpandableContent) {
      setIsExpanded(true);
    }
  }, [selectionInBranch, hasExpandableContent]);

  useEffect(() => {
    if (isLinkSelected && !robot.selection.subType) {
      scrollElementIntoView(linkRowRef.current);
    }
  }, [isLinkSelected, robot.selection.subType]);

  useEffect(() => {
    if (isExpanded && isVisualSelected) {
      scrollElementIntoView(visualRowRef.current);
    }
  }, [isExpanded, isVisualSelected]);

  useEffect(() => {
    if (isExpanded && isPrimaryCollisionSelected) {
      scrollElementIntoView(primaryCollisionRowRef.current);
    }
  }, [isExpanded, isPrimaryCollisionSelected]);

  useEffect(() => {
    const hasSelectedExtraCollision = visibleCollisionBodies.some(({ objectIndex }) => objectIndex === selectedObjectIndex);
    if (!(isExpanded && isLinkSelected && robot.selection.subType === 'collision' && hasSelectedExtraCollision)) return;
    scrollElementIntoView(collisionBodyRowRefs.current[selectedObjectIndex]);
  }, [isExpanded, isLinkSelected, robot.selection.subType, selectedObjectIndex, visibleCollisionBodies]);

  useEffect(() => {
    if (!isExpanded || robot.selection.type !== 'joint' || !robot.selection.id) return;
    scrollElementIntoView(jointRowRefs.current[robot.selection.id] || null);
  }, [isExpanded, robot.selection.type, robot.selection.id]);

  const handleSelectVisual = () => {
    if (onSelectGeometry) {
      onSelectGeometry(linkId, 'visual', 0);
      return;
    }
    onSelect('link', linkId, 'visual');
  };

  const handleSelectPrimaryCollision = () => {
    if (onSelectGeometry) {
      onSelectGeometry(linkId, 'collision', 0);
      return;
    }
    onSelect('link', linkId, 'collision');
  };

  const handleSelectCollisionBody = (objectIndex: number) => {
    if (onSelectGeometry) {
      onSelectGeometry(linkId, 'collision', objectIndex);
      return;
    }
    onSelect('link', linkId, 'collision');
  };

  const toggleVisualVisibility = (event: React.MouseEvent) => {
    event.stopPropagation();
    onUpdate('link', linkId, {
      ...link,
      visual: {
        ...link.visual,
        visible: !isVisualVisible,
      },
    });
  };

  const togglePrimaryCollisionVisibility = (event: React.MouseEvent) => {
    event.stopPropagation();
    onUpdate('link', linkId, {
      ...link,
      collision: {
        ...link.collision,
        visible: !isPrimaryCollisionVisible,
      },
    });
  };

  const toggleCollisionBodyVisibility = (event: React.MouseEvent, bodyIndex: number) => {
    event.stopPropagation();
    const nextBodies = [...(link.collisionBodies || [])];
    const targetBody = nextBodies[bodyIndex];
    if (!targetBody) return;

    nextBodies[bodyIndex] = {
      ...targetBody,
      visible: targetBody.visible === false,
    };

    onUpdate('link', linkId, {
      ...link,
      collisionBodies: nextBodies,
    });
  };

  const geometryVisibilityButtonClass = (active: boolean) => `p-1 rounded transition-colors ${
    active
      ? 'text-text-tertiary hover:text-text-primary hover:bg-element-hover'
      : 'text-text-secondary hover:text-text-primary hover:bg-element-hover'
  }`;
  const jointRowIndent = '10px';
  const geometryRowIndent = '24px';
  const selectedLinkActionClass = 'text-system-blue hover:bg-system-blue/15 hover:text-system-blue-hover dark:hover:bg-system-blue/25';

  const beginRenaming = (
    type: 'link' | 'joint',
    id: string,
    currentName: string
  ) => {
    onSelect(type, id);
    setEditingTarget({ type, id, draft: currentName });
  };

  const cancelRenaming = () => {
    setEditingTarget(null);
  };

  const commitRenaming = () => {
    if (!editingTarget) return;
    const nextName = editingTarget.draft.trim();
    if (!nextName) {
      setEditingTarget(null);
      return;
    }

    if (editingTarget.type === 'link') {
      const targetLink = robot.links[editingTarget.id];
      if (targetLink && targetLink.name !== nextName) {
        onUpdate('link', editingTarget.id, { ...targetLink, name: nextName });
      }
    } else {
      const targetJoint = robot.joints[editingTarget.id];
      if (targetJoint && targetJoint.name !== nextName) {
        onUpdate('joint', editingTarget.id, { ...targetJoint, name: nextName });
      }
    }

    setEditingTarget(null);
  };

  const updateRenameDraft = (value: string) => {
    setEditingTarget((prev) => (prev ? { ...prev, draft: value } : prev));
  };

  const handleNameDoubleClick = (
    event: React.MouseEvent,
    type: 'link' | 'joint',
    id: string,
    currentName: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    beginRenaming(type, id, currentName);
  };

  const openContextMenu = (
    event: React.MouseEvent,
    target: { type: 'link'; id: string; name: string } | { type: 'joint'; id: string; name: string } | { type: 'mesh'; linkId: string; subType: 'visual' | 'collision' }
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 170;
    const menuHeight = target.type === 'mesh'
      ? 44
      : target.type === 'link'
        ? (isSkeleton ? 260 : 236)
        : (isSkeleton ? 176 : 144);
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    setContextMenu({
      target,
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
  };

  const handleRenameMenuAction = () => {
    if (!contextMenu || (contextMenu.target.type !== 'link' && contextMenu.target.type !== 'joint')) return;
    beginRenaming(contextMenu.target.type, contextMenu.target.id, contextMenu.target.name);
    setContextMenu(null);
  };

  const resolveContextMenuTargetLinkId = (): string | null => {
    if (!contextMenu) return null;
    if (contextMenu.target.type === 'link') return contextMenu.target.id;
    if (contextMenu.target.type === 'joint') {
      return robot.joints[contextMenu.target.id]?.childLinkId || null;
    }
    return null;
  };

  const handleAddChildMenuAction = () => {
    const targetLinkId = resolveContextMenuTargetLinkId();
    if (!targetLinkId) {
      setContextMenu(null);
      return;
    }
    onAddChild(targetLinkId);
    setIsExpanded(true);
    setContextMenu(null);
  };

  const handleDeleteMenuAction = () => {
    if (!contextMenu) return;
    if (contextMenu.target.type === 'link') {
      onDelete(contextMenu.target.id);
      setContextMenu(null);
      return;
    }
    if (contextMenu.target.type === 'joint') {
      const targetJoint = robot.joints[contextMenu.target.id];
      if (targetJoint) {
        onDelete(targetJoint.childLinkId);
      }
      setContextMenu(null);
    }
  };

  const handleAddCollisionMenuAction = () => {
    const targetLinkId = resolveContextMenuTargetLinkId();
    if (!targetLinkId) {
      setContextMenu(null);
      return;
    }
    onAddCollisionBody(targetLinkId);
    setIsExpanded(true);
    setContextMenu(null);
  };

  const handleDeleteMesh = () => {
    if (!contextMenu || contextMenu.target.type !== 'mesh') return;
    const targetLink = robot.links[contextMenu.target.linkId];
    if (!targetLink) {
      setContextMenu(null);
      return;
    }

    const geometry = targetLink[contextMenu.target.subType];
    if (geometry.type !== GeometryType.MESH) {
      setContextMenu(null);
      return;
    }

    onUpdate('link', contextMenu.target.linkId, {
      ...targetLink,
      [contextMenu.target.subType]: {
        ...geometry,
        type: GeometryType.NONE,
        meshPath: undefined,
      },
    });
    setContextMenu(null);
  };

  const handleDeleteLinkGeometry = (subType: 'visual' | 'collision') => {
    if (!contextMenu || contextMenu.target.type !== 'link') return;
    const targetLink = robot.links[contextMenu.target.id];
    if (!targetLink) {
      setContextMenu(null);
      return;
    }

    if (subType === 'collision') {
      const hasAnyCollision = targetLink.collision.type !== GeometryType.NONE
        || (targetLink.collisionBodies || []).some((body) => body.type !== GeometryType.NONE);
      if (!hasAnyCollision) {
        setContextMenu(null);
        return;
      }

      onUpdate('link', contextMenu.target.id, {
        ...targetLink,
        collision: {
          ...targetLink.collision,
          type: GeometryType.NONE,
          meshPath: undefined,
        },
        collisionBodies: [],
      });
      setContextMenu(null);
      return;
    }

    const geometry = targetLink[subType];
    if (!geometry || geometry.type === GeometryType.NONE) {
      setContextMenu(null);
      return;
    }

    onUpdate('link', contextMenu.target.id, {
      ...targetLink,
      [subType]: {
        ...geometry,
        type: GeometryType.NONE,
        meshPath: undefined,
      },
    });
    setContextMenu(null);
  };

  return (
    <div className="relative">
      <div
        ref={linkRowRef}
        className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-all duration-200 ${
          resolveTreeRowStateClass('text-text-primary dark:text-text-secondary', {
            isHovered: isLinkHovered,
            isSelected: isLinkSelected,
            isAttentionHighlighted: isLinkAttentionHighlighted,
          })
        }`}
        onClick={() => onSelect('link', linkId)}
        onDoubleClick={() => onFocus && onFocus(linkId)}
        onContextMenu={(event) => openContextMenu(event, { type: 'link', id: linkId, name: link.name })}
        onMouseEnter={() => setHoveredSelection({ type: 'link', id: linkId })}
        onMouseLeave={clearHover}
        title={link.name || linkId}
        style={{ marginLeft: depth > 0 ? '8px' : '0' }}
      >
        {depth > 0 && (
          <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
        )}

        <div
          className={`w-6 h-6 flex items-center justify-center shrink-0 mr-0.5 rounded
            ${hasExpandableContent
              ? (isLinkSelected || isLinkHovered || isLinkAttentionHighlighted)
                ? 'hover:bg-system-blue/15 dark:hover:bg-system-blue/25 cursor-pointer transition-colors'
                : 'hover:bg-element-hover cursor-pointer transition-colors'
              : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasExpandableContent) {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {hasExpandableContent
            && (isExpanded ? (
              <ChevronDown size={12} className={isLinkSelected ? 'text-text-secondary' : 'text-text-tertiary'} />
            ) : (
              <ChevronRight size={12} className={isLinkSelected ? 'text-text-secondary' : 'text-text-tertiary'} />
            ))}
        </div>

        <div
          className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0 border transition-colors
            ${(isLinkSelected || isLinkHovered || isLinkAttentionHighlighted)
              ? 'bg-system-blue/15 dark:bg-system-blue/20 border-system-blue/25 dark:border-system-blue/30'
              : 'bg-system-blue/10 dark:bg-system-blue/12 border-transparent'}`}
        >
          <Box size={12} className="text-system-blue" />
        </div>

        {isEditingLink ? (
          <input
            ref={renameInputRef}
            value={editingTarget?.draft ?? ''}
            onChange={(event) => updateRenameDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={commitRenaming}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitRenaming();
              } else if (event.key === 'Escape') {
                cancelRenaming();
              }
            }}
            className={`text-xs font-medium flex-1 min-w-0 px-1 py-0.5 rounded border outline-none transition-colors ${
              isLinkSelected
                ? 'bg-panel-bg border-border-strong text-text-primary focus:border-system-blue'
                : 'bg-input-bg border-border-strong text-text-primary focus:border-system-blue'
            }`}
          />
        ) : (
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="text-xs font-medium whitespace-nowrap select-none truncate"
              onDoubleClick={(event) => handleNameDoubleClick(event, 'link', linkId, link.name)}
              onDragStart={(event) => event.preventDefault()}
              title={link.name}
            >
              {link.name}
            </span>
            {hasVisual && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" title={t.visual} />}
            {hasCollision && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500" title={t.collision} />}
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          <button
            className={`p-1 rounded cursor-pointer transition-colors ${
              isLinkSelected
                ? selectedLinkActionClass
                : 'text-text-tertiary hover:bg-system-blue/10 hover:text-text-primary dark:hover:bg-system-blue/20'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onUpdate('link', linkId, { ...link, visible: !isVisible });
            }}
            title={isVisible ? t.hide : t.show}
          >
            {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {isSkeleton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(linkId);
                setIsExpanded(true);
              }}
              className={`p-1 rounded transition-all ${
                isLinkSelected
                  ? 'opacity-100 hover:bg-system-blue/15 dark:hover:bg-system-blue/25'
                  : 'opacity-0 group-hover:opacity-100 hover:bg-system-blue/10 dark:hover:bg-system-blue/20'
              }`}
              title={t.addChildJoint}
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>

      {hasExpandableContent && isExpanded && (
        <div className="relative ml-3">
          <div className="absolute left-0 top-0 bottom-2 w-px bg-border-black" />

          {hasVisual && (
            <div
              ref={visualRowRef}
              className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md cursor-pointer transition-all duration-200 ${
                resolveTreeRowStateClass('text-text-secondary dark:text-text-tertiary', {
                  isHovered: isVisualHovered,
                  isSelected: isVisualSelected,
                  isAttentionHighlighted: isVisualAttentionHighlighted,
                })
              }`}
              onClick={handleSelectVisual}
              onContextMenu={(event) => {
                if (link.visual.type === GeometryType.MESH) {
                  openContextMenu(event, { type: 'mesh', linkId, subType: 'visual' });
                }
              }}
              onMouseEnter={() => setHoveredSelection({ type: 'link', id: linkId, subType: 'visual', objectIndex: 0 })}
              onMouseLeave={clearHover}
              style={{ marginLeft: geometryRowIndent }}
              title={t.visualGeometry}
            >
              <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center mr-1 shrink-0 border transition-colors ${(isVisualSelected || isVisualHovered || isVisualAttentionHighlighted) ? 'bg-emerald-500/15 dark:bg-emerald-400/15 border-emerald-500/20 dark:border-emerald-400/20' : 'bg-emerald-500/10 dark:bg-emerald-400/10 border-transparent'}`}>
                <Shapes size={9} className={(isVisualSelected || isVisualHovered || isVisualAttentionHighlighted) ? 'text-emerald-700 dark:text-emerald-300' : 'text-emerald-500 dark:text-emerald-400'} />
              </div>
              <span className="text-[10px] font-medium truncate flex-1 min-w-0">
                {t.visualGeometry}
              </span>
              <button
                className={geometryVisibilityButtonClass(isVisualVisible)}
                onClick={toggleVisualVisibility}
                title={isVisualVisible ? t.hide : t.show}
              >
                {isVisualVisible ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>
            </div>
          )}

          {link.collision?.type && link.collision.type !== GeometryType.NONE && (
            <div
              ref={primaryCollisionRowRef}
              className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md cursor-pointer transition-all duration-200 ${
                resolveTreeRowStateClass('text-text-secondary dark:text-text-tertiary', {
                  isHovered: isPrimaryCollisionHovered,
                  isSelected: isPrimaryCollisionSelected,
                  isAttentionHighlighted: isPrimaryCollisionAttentionHighlighted,
                })
              }`}
              onClick={handleSelectPrimaryCollision}
              onContextMenu={(event) => {
                if (link.collision.type === GeometryType.MESH) {
                  openContextMenu(event, { type: 'mesh', linkId, subType: 'collision' });
                }
              }}
              onMouseEnter={() => setHoveredSelection({ type: 'link', id: linkId, subType: 'collision', objectIndex: 0 })}
              onMouseLeave={clearHover}
              style={{ marginLeft: geometryRowIndent }}
              title={t.collision}
            >
              <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center mr-1 shrink-0 border transition-colors ${(isPrimaryCollisionSelected || isPrimaryCollisionHovered || isPrimaryCollisionAttentionHighlighted) ? 'bg-amber-500/15 dark:bg-amber-400/15 border-amber-500/20 dark:border-amber-400/20' : 'bg-amber-500/10 dark:bg-amber-400/10 border-transparent'}`}>
                <Shield size={9} className={(isPrimaryCollisionSelected || isPrimaryCollisionHovered || isPrimaryCollisionAttentionHighlighted) ? 'text-amber-700 dark:text-amber-300' : 'text-amber-500 dark:text-amber-400'} />
              </div>
              <span className="text-[10px] font-medium truncate flex-1 min-w-0">
                {t.collision}
              </span>
              <button
                className={geometryVisibilityButtonClass(isPrimaryCollisionVisible)}
                onClick={togglePrimaryCollisionVisibility}
                title={isPrimaryCollisionVisible ? t.hide : t.show}
              >
                {isPrimaryCollisionVisible ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>
            </div>
          )}

          {visibleCollisionBodies.map(({ body, bodyIndex, objectIndex }, index) => {
            const isCollisionBodyHovered = matchesSelection(
              hoveredSelection,
              { type: 'link', id: linkId, subType: 'collision', objectIndex }
            );
            const isCollisionBodyAttentionHighlighted = matchesSelection(
              attentionSelection,
              { type: 'link', id: linkId, subType: 'collision', objectIndex }
            );
            const isCollisionBodySelected = isLinkSelected
              && robot.selection.subType === 'collision'
              && selectedObjectIndex === objectIndex;

            return (
              <div
                ref={(element) => {
                  collisionBodyRowRefs.current[objectIndex] = element;
                }}
                key={`collision-extra-${bodyIndex}`}
                className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md cursor-pointer transition-all duration-200 ${
                  resolveTreeRowStateClass('text-text-secondary dark:text-text-tertiary', {
                    isHovered: isCollisionBodyHovered,
                    isSelected: isCollisionBodySelected,
                    isAttentionHighlighted: isCollisionBodyAttentionHighlighted,
                  })
                }`}
                onClick={() => handleSelectCollisionBody(objectIndex)}
                onMouseEnter={() => setHoveredSelection({ type: 'link', id: linkId, subType: 'collision', objectIndex })}
                onMouseLeave={clearHover}
                style={{ marginLeft: geometryRowIndent }}
                title={`${t.collision} ${index + (hasPrimaryCollision ? 2 : 1)}`}
              >
                <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center mr-1 shrink-0 border transition-colors ${
                  (isCollisionBodySelected || isCollisionBodyHovered || isCollisionBodyAttentionHighlighted)
                    ? 'bg-amber-500/15 dark:bg-amber-400/15 border-amber-500/20 dark:border-amber-400/20'
                    : 'bg-amber-500/10 dark:bg-amber-400/10 border-transparent'
                }`}>
                  <Shield
                    size={9}
                    className={
                      (isCollisionBodySelected || isCollisionBodyHovered || isCollisionBodyAttentionHighlighted)
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-amber-500 dark:text-amber-400'
                    }
                  />
                </div>
                <span className="text-[10px] font-medium truncate flex-1 min-w-0">
                  {`${t.collision} ${index + (hasPrimaryCollision ? 2 : 1)}`}
                </span>
                <button
                  className={geometryVisibilityButtonClass(body.visible !== false)}
                  onClick={(event) => toggleCollisionBodyVisibility(event, bodyIndex)}
                  title={body.visible !== false ? t.hide : t.show}
                >
                  {body.visible !== false ? <Eye size={10} /> : <EyeOff size={10} />}
                </button>
              </div>
            );
          })}

          {childJoints.map((joint) => {
            const isJointSelected = robot.selection.type === 'joint' && robot.selection.id === joint.id;
            const isJointHovered = matchesSelection(hoveredSelection, { type: 'joint', id: joint.id });
            const isJointAttentionHighlighted = matchesSelection(attentionSelection, { type: 'joint', id: joint.id });
            const isEditingJoint = editingTarget?.type === 'joint' && editingTarget.id === joint.id;
            const jointTypeLabel = getJointTypeLabel(joint.type, t);

            return (
              <div key={joint.id} className="relative">
                <div
                  ref={(element) => {
                    jointRowRefs.current[joint.id] = element;
                  }}
                  className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-all duration-200 ${
                    resolveTreeRowStateClass('text-text-secondary dark:text-text-tertiary', {
                      isHovered: isJointHovered,
                      isSelected: isJointSelected,
                      isAttentionHighlighted: isJointAttentionHighlighted,
                    })
                  }`}
                  onClick={() => onSelect('joint', joint.id)}
                  onContextMenu={(event) => openContextMenu(event, { type: 'joint', id: joint.id, name: joint.name })}
                  onMouseEnter={() => setHoveredSelection({ type: 'joint', id: joint.id })}
                  onMouseLeave={clearHover}
                  title={`${joint.name || joint.id} · ${jointTypeLabel}`}
                  style={{ marginLeft: jointRowIndent }}
                >
                  <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />

                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0 border transition-colors
                      ${(isJointSelected || isJointHovered || isJointAttentionHighlighted) ? 'bg-orange-500/15 dark:bg-orange-400/15 border-orange-500/20 dark:border-orange-400/20' : 'bg-orange-500/10 dark:bg-orange-400/10 border-transparent'}`}
                  >
                    <ArrowRightLeft
                      size={10}
                      className={(isJointSelected || isJointHovered || isJointAttentionHighlighted) ? 'text-orange-700 dark:text-orange-300' : 'text-orange-600 dark:text-orange-300'}
                    />
                  </div>

                  {isEditingJoint ? (
                    <input
                      ref={renameInputRef}
                      value={editingTarget?.draft ?? ''}
                      onChange={(event) => updateRenameDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={commitRenaming}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitRenaming();
                        } else if (event.key === 'Escape') {
                          cancelRenaming();
                        }
                      }}
                      className={`text-[11px] font-medium flex-1 min-w-0 px-1 py-0.5 rounded border outline-none transition-colors ${
                        isJointSelected
                          ? 'bg-panel-bg border-border-strong text-text-primary focus:border-system-blue'
                          : 'bg-input-bg border-border-strong text-text-primary focus:border-system-blue'
                      }`}
                    />
                  ) : (
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <span
                        className="text-[11px] font-medium whitespace-nowrap select-none truncate"
                        onDoubleClick={(event) => handleNameDoubleClick(event, 'joint', joint.id, joint.name)}
                        onDragStart={(event) => event.preventDefault()}
                        title={joint.name}
                      >
                        {joint.name}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0 ${
                          isJointSelected
                            ? 'bg-orange-500/12 text-orange-700 dark:bg-orange-400/12 dark:text-orange-300'
                            : 'bg-orange-500/10 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300'
                        }`}
                      >
                        {jointTypeLabel}
                      </span>
                    </div>
                  )}

                  {isSkeleton && (
                    <div
                      className={`flex items-center gap-0.5 ml-1 ${
                        isJointSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(joint.childLinkId);
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          isJointSelected
                            ? 'hover:bg-panel-bg'
                            : 'hover:bg-element-hover'
                        }`}
                        title={t.deleteBranch}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <TreeNode
                  linkId={joint.childLinkId}
                  robot={robot}
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
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-[120] w-[170px] rounded-md border border-border-black bg-panel-bg shadow-xl p-1"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          {(contextMenu.target.type === 'link' || contextMenu.target.type === 'joint') && (
            <>
              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
                onClick={handleRenameMenuAction}
              >
                <Edit3 size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
                <span>{t.rename}</span>
              </button>

              {isSkeleton && (
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
                  onClick={handleAddChildMenuAction}
                >
                  <Plus size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
                  <span>{t.addChildLink}</span>
                </button>
              )}

              {contextMenu.target.type === 'link' && contextMenuHasVisual && (
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
                  onClick={() => handleDeleteLinkGeometry('visual')}
                >
                  <Shapes size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
                  <span>{t.deleteVisualGeometry}</span>
                </button>
              )}

              {contextMenu.target.type === 'link' && contextMenuHasCollision && (
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
                  onClick={() => handleDeleteLinkGeometry('collision')}
                >
                  <Shield size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
                  <span>{t.deleteCollisionGeometry}</span>
                </button>
              )}

              {(contextMenu.target.type === 'link' || contextMenu.target.type === 'joint') && (
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
                  onClick={handleAddCollisionMenuAction}
                >
                  <Shield size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
                  <span>{t.addCollisionBody}</span>
                </button>
              )}

              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
                onClick={handleDeleteMenuAction}
              >
                <Trash2 size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
                <span>{t.deleteBranch}</span>
              </button>
            </>
          )}

          {contextMenu.target.type === 'mesh' && (
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
              onClick={handleDeleteMesh}
            >
              <Trash2 size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
              <span>{t.deleteMesh}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

TreeNode.displayName = 'TreeNode';
