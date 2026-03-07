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
import { GeometryType, type AppMode, type RobotState } from '@/types';

export interface TreeNodeProps {
  linkId: string;
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
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
  onSelect,
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
  const hasVisual = link.visual?.type && link.visual.type !== 'none';
  const collisionBodyCount = (link.collision?.type && link.collision.type !== 'none' ? 1 : 0)
    + (link.collisionBodies || []).filter((body) => body.type !== GeometryType.NONE).length;
  const hasCollision = collisionBodyCount > 0;
  const hasExpandableContent = hasVisual || hasCollision || hasChildren;
  const isEditingLink = editingTarget?.type === 'link' && editingTarget.id === linkId;
  const isVisualSelected = isLinkSelected && robot.selection.subType === 'visual';
  const isCollisionSelected = isLinkSelected && robot.selection.subType === 'collision';
  const contextMenuLink = contextMenu?.target.type === 'link' ? robot.links[contextMenu.target.id] : null;
  const contextMenuHasVisual = Boolean(contextMenuLink?.visual?.type && contextMenuLink.visual.type !== GeometryType.NONE);
  const contextMenuHasCollision = Boolean(
    (contextMenuLink?.collision?.type && contextMenuLink.collision.type !== GeometryType.NONE)
      || (contextMenuLink?.collisionBodies || []).some((body) => body.type !== GeometryType.NONE)
  );

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
        className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-colors
          ${
            isLinkSelected
              ? 'bg-system-blue-solid text-white shadow-sm dark:bg-system-blue-solid'
              : 'hover:bg-element-hover text-text-primary dark:text-text-secondary dark:hover:bg-element-hover'
          }`}
        onClick={() => onSelect('link', linkId)}
        onDoubleClick={() => onFocus && onFocus(linkId)}
        onContextMenu={(event) => openContextMenu(event, { type: 'link', id: linkId, name: link.name })}
        title={link.name || linkId}
        style={{ marginLeft: depth > 0 ? '8px' : '0' }}
      >
        {depth > 0 && (
          <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
        )}

        <div
          className={`w-6 h-6 flex items-center justify-center shrink-0 mr-0.5 rounded
            ${hasExpandableContent
              ? isLinkSelected
                ? 'hover:bg-on-accent-hover cursor-pointer transition-colors'
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
              <ChevronDown size={12} className={isLinkSelected ? 'text-white/90' : 'text-text-tertiary'} />
            ) : (
              <ChevronRight size={12} className={isLinkSelected ? 'text-white/90' : 'text-text-tertiary'} />
            ))}
        </div>

        <div
          className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
            ${isLinkSelected ? 'bg-white/25' : 'bg-system-blue/10 dark:bg-element-bg'}`}
        >
          <Box size={12} className={isLinkSelected ? 'text-white' : 'text-system-blue'} />
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
                ? 'bg-white/20 border-white/40 text-white placeholder:text-white/70 focus:border-white'
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
            {hasVisual && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLinkSelected ? 'bg-white/60' : 'bg-emerald-500'}`} title={t.visual} />}
            {hasCollision && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLinkSelected ? 'bg-white/60' : 'bg-amber-500'}`} title={t.collision} />}
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          <button
            className={`p-1 rounded cursor-pointer transition-colors ${
              isLinkSelected
                ? 'text-white hover:bg-on-accent-hover'
                : 'text-text-tertiary hover:bg-element-hover hover:text-text-primary'
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
                  ? 'opacity-100 hover:bg-on-accent-hover'
                  : 'opacity-0 group-hover:opacity-100 hover:bg-element-hover'
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
              className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md cursor-pointer transition-colors
                ${isVisualSelected
                  ? 'bg-system-blue/15 dark:bg-system-blue/20 text-system-blue'
                  : 'hover:bg-element-hover text-text-secondary dark:text-text-tertiary dark:hover:bg-element-hover'
                }`}
              onClick={() => onSelect('link', linkId, 'visual')}
              onContextMenu={(event) => {
                if (link.visual.type === GeometryType.MESH) {
                  openContextMenu(event, { type: 'mesh', linkId, subType: 'visual' });
                }
              }}
              style={{ marginLeft: '8px' }}
              title={`${t.visual}: ${link.visual.type}${link.visual.meshPath ? ` (${link.visual.meshPath})` : ''}`}
            >
              <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
              <div className={`w-4 h-4 rounded flex items-center justify-center mr-1.5 shrink-0 ${isVisualSelected ? 'bg-system-blue/20' : 'bg-emerald-500/10 dark:bg-element-bg'}`}>
                <Shapes size={10} className={isVisualSelected ? 'text-system-blue' : 'text-emerald-500'} />
              </div>
              <span className="text-[11px] font-medium truncate">
                {link.visual.type === GeometryType.MESH && link.visual.meshPath
                  ? link.visual.meshPath.split('/').pop()
                  : `Visual · ${link.visual.type}`}
              </span>
            </div>
          )}

          {link.collision?.type && link.collision.type !== GeometryType.NONE && (
            <div
              className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md cursor-pointer transition-colors
                ${isCollisionSelected
                  ? 'bg-system-blue/15 dark:bg-system-blue/20 text-system-blue'
                  : 'hover:bg-element-hover text-text-secondary dark:text-text-tertiary dark:hover:bg-element-hover'
                }`}
              onClick={() => onSelect('link', linkId, 'collision')}
              onContextMenu={(event) => {
                if (link.collision.type === GeometryType.MESH) {
                  openContextMenu(event, { type: 'mesh', linkId, subType: 'collision' });
                }
              }}
              style={{ marginLeft: '8px' }}
              title={`${t.collision}: ${link.collision.type}${link.collision.meshPath ? ` (${link.collision.meshPath})` : ''}`}
            >
              <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
              <div className={`w-4 h-4 rounded flex items-center justify-center mr-1.5 shrink-0 ${isCollisionSelected ? 'bg-system-blue/20' : 'bg-amber-500/10 dark:bg-element-bg'}`}>
                <Shield size={10} className={isCollisionSelected ? 'text-system-blue' : 'text-amber-500'} />
              </div>
              <span className="text-[11px] font-medium truncate">
                {link.collision.type === GeometryType.MESH && link.collision.meshPath
                  ? link.collision.meshPath.split('/').pop()
                  : `Collision · ${link.collision.type}`}
              </span>
            </div>
          )}

          {(link.collisionBodies || [])
            .filter((body) => body.type !== GeometryType.NONE)
            .map((body, index) => (
              <div
                key={`collision-extra-${index}`}
                className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md cursor-pointer transition-colors
                  ${isCollisionSelected
                    ? 'bg-system-blue/15 dark:bg-system-blue/20 text-system-blue'
                    : 'hover:bg-element-hover text-text-secondary dark:text-text-tertiary dark:hover:bg-element-hover'
                  }`}
                onClick={() => onSelect('link', linkId, 'collision')}
                style={{ marginLeft: '8px' }}
                title={`${t.collision}: ${body.type}`}
              >
                <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
                <div className={`w-4 h-4 rounded flex items-center justify-center mr-1.5 shrink-0 ${isCollisionSelected ? 'bg-system-blue/20' : 'bg-amber-500/10 dark:bg-element-bg'}`}>
                  <Shield size={10} className={isCollisionSelected ? 'text-system-blue' : 'text-amber-500'} />
                </div>
                <span className="text-[11px] font-medium truncate">
                  {body.type === GeometryType.MESH && body.meshPath
                    ? body.meshPath.split('/').pop()
                    : `Collision · ${body.type}`}
                </span>
              </div>
            ))
          }

          {childJoints.map((joint) => {
            const isJointSelected = robot.selection.type === 'joint' && robot.selection.id === joint.id;
            const isEditingJoint = editingTarget?.type === 'joint' && editingTarget.id === joint.id;

            return (
              <div key={joint.id} className="relative">
                <div
                  className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-colors
                    ${
                      isJointSelected
                        ? 'bg-orange-500 text-white shadow-sm dark:bg-orange-500'
                        : 'hover:bg-element-hover text-text-secondary dark:text-text-tertiary dark:hover:bg-element-hover'
                    }`}
                  onClick={() => onSelect('joint', joint.id)}
                  onContextMenu={(event) => openContextMenu(event, { type: 'joint', id: joint.id, name: joint.name })}
                  title={joint.name || joint.id}
                  style={{ marginLeft: '8px' }}
                >
                  <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />

                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
                      ${isJointSelected ? 'bg-white/25' : 'bg-orange-100 dark:bg-element-bg'}`}
                  >
                    <ArrowRightLeft
                      size={10}
                      className={isJointSelected ? 'text-white' : 'text-orange-600 dark:text-orange-300'}
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
                          ? 'bg-white/20 border-white/40 text-white placeholder:text-white/70 focus:border-white'
                          : 'bg-input-bg border-border-strong text-text-primary focus:border-system-blue'
                      }`}
                    />
                  ) : (
                    <span
                      className="text-[11px] font-medium whitespace-nowrap select-none"
                      onDoubleClick={(event) => handleNameDoubleClick(event, 'joint', joint.id, joint.name)}
                      onDragStart={(event) => event.preventDefault()}
                      title={joint.name}
                    >
                      {joint.name}
                    </span>
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
                            ? 'hover:bg-on-accent-hover'
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
