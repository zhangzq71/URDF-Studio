import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Cuboid,
  Edit3,
  Eye,
  EyeOff,
  Folder,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import { getTreeRenderRootLinkIds } from '@/core/robot';
import { ContextMenuFrame, ContextMenuItem } from '@/shared/components/ui';
import type { TranslationKeys } from '@/shared/i18n';
import { matchesSelection, useSelectionStore } from '@/store/selectionStore';
import type { AppMode, AssemblyState, RobotData, RobotState } from '@/types';
import { useShallow } from 'zustand/react/shallow';
import { TreeNode } from './TreeNode';
import { EMPTY_TREE_SELECTION, buildParentLinkByChild } from '../utils/treeSelectionScope';

export interface AssemblyTreeViewProps {
  assemblyState: AssemblyState;
  robot?: RobotData | RobotState;
  showGeometryDetailsByDefault?: boolean;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onSelectGeometry?: (linkId: string, subType: 'visual' | 'collision', objectIndex?: number) => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddCollisionBody: (parentId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  onRemoveComponent?: (id: string) => void;
  onRemoveBridge?: (id: string) => void;
  onRenameComponent?: (id: string, name: string) => void;
  onCreateBridge?: () => void;
  onToggleComponentVisibility?: (id: string) => void;
  mode: AppMode;
  t: TranslationKeys;
}

export const AssemblyTreeView = memo(({
  assemblyState,
  showGeometryDetailsByDefault = false,
  onSelect,
  onSelectGeometry,
  onFocus,
  onAddChild,
  onAddCollisionBody,
  onDelete,
  onUpdate,
  onRemoveComponent,
  onRemoveBridge,
  onRenameComponent,
  onCreateBridge,
  onToggleComponentVisibility,
  mode,
  t,
}: AssemblyTreeViewProps) => {
  const { selection, hoveredSelection, attentionSelection, setHoveredSelection, clearHover } = useSelectionStore(
    useShallow((state) => ({
      selection: state.selection,
      hoveredSelection: state.hoveredSelection,
      attentionSelection: state.attentionSelection,
      setHoveredSelection: state.setHoveredSelection,
      clearHover: state.clearHover,
    })),
  );
  const [isComponentsExpanded, setIsComponentsExpanded] = useState(true);
  const [isBridgesExpanded, setIsBridgesExpanded] = useState(true);
  const [expandedComponents, setExpandedComponents] = useState<Record<string, boolean>>({});
  const [editingComponent, setEditingComponent] = useState<{ id: string; draft: string } | null>(null);
  const [componentContextMenu, setComponentContextMenu] = useState<{
    x: number;
    y: number;
    componentId: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const components = useMemo(() => Object.values(assemblyState.components), [assemblyState.components]);
  const bridges = useMemo(() => Object.values(assemblyState.bridges), [assemblyState.bridges]);
  const robotSelection = robot?.selection ?? EMPTY_TREE_SELECTION;
  const componentRootLinkIds = useMemo<Record<string, string[]>>(() => {
    const rootLinkIdsByComponent: Record<string, string[]> = {};

    components.forEach((component) => {
      rootLinkIdsByComponent[component.id] = getTreeRenderRootLinkIds({
        ...component.robot,
        selection: EMPTY_TREE_SELECTION,
      });
    });

    return rootLinkIdsByComponent;
  }, [components]);
  const componentParentLinkByChild = useMemo<Record<string, Record<string, string>>>(() => {
    const parentLinkByChildByComponent: Record<string, Record<string, string>> = {};

    components.forEach((component) => {
      parentLinkByChildByComponent[component.id] = buildParentLinkByChild(component.robot.joints);
    });

    return parentLinkByChildByComponent;
  }, [components]);

  const toggleComponent = (id: string) => {
    setExpandedComponents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (!editingComponent) return;
    const id = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editingComponent]);

  useEffect(() => {
    if (!componentContextMenu) return;
    const closeMenu = () => setComponentContextMenu(null);
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
  }, [componentContextMenu]);

  const beginComponentRename = (componentId: string, currentName: string) => {
    setEditingComponent({ id: componentId, draft: currentName });
  };

  const commitComponentRename = () => {
    if (!editingComponent) return;
    const nextName = editingComponent.draft.trim();
    if (nextName) {
      onRenameComponent?.(editingComponent.id, nextName);
    }
    setEditingComponent(null);
  };

  const cancelComponentRename = () => {
    setEditingComponent(null);
  };

  const openComponentContextMenu = (event: React.MouseEvent, componentId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 170;
    const menuHeight = 88;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    setComponentContextMenu({
      componentId,
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
  };

  const handleComponentRenameFromMenu = () => {
    if (!componentContextMenu) return;
    const component = assemblyState.components[componentContextMenu.componentId];
    if (!component) return;
    beginComponentRename(component.id, component.name);
    setComponentContextMenu(null);
  };

  const handleComponentDeleteFromMenu = () => {
    if (!componentContextMenu) return;
    onRemoveComponent?.(componentContextMenu.componentId);
    setComponentContextMenu(null);
  };

  const sectionHoverClass = 'hover:bg-system-blue/10 hover:ring-1 hover:ring-inset hover:ring-system-blue/15 dark:hover:bg-system-blue/20 dark:hover:ring-system-blue/25';
  const itemHoverClass = 'hover:bg-system-blue/10 hover:text-text-primary hover:ring-1 hover:ring-inset hover:ring-system-blue/15 dark:hover:bg-system-blue/20 dark:hover:ring-system-blue/25';
  const itemSelectedClass = 'bg-system-blue/10 text-text-primary shadow-sm ring-1 ring-inset ring-system-blue/20 dark:bg-system-blue/20 dark:ring-system-blue/30';
  const itemAttentionClass = 'bg-system-blue/15 text-text-primary shadow-sm ring-1 ring-inset ring-system-blue/30 dark:bg-system-blue/25 dark:ring-system-blue/40';

  return (
    <div className="space-y-1">
      <div className="flex items-center py-1 px-2 mx-1 my-0.5 rounded-md bg-element-bg text-text-primary">
        <Cuboid size={14} className="mr-1.5 text-system-blue" />
        <span className="text-xs font-bold uppercase tracking-wider truncate">{assemblyState.name}</span>
      </div>

      <div className="mt-2">
        <div
          className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-all duration-200 group rounded-md ${sectionHoverClass}`}
          onClick={() => setIsComponentsExpanded(!isComponentsExpanded)}
        >
          {isComponentsExpanded ? (
            <ChevronDown size={12} className="text-text-tertiary" />
          ) : (
            <ChevronRight size={12} className="text-text-tertiary" />
          )}
          <Folder size={12} className="text-amber-500" />
          <span className="text-[11px] font-bold text-text-tertiary dark:text-text-tertiary uppercase tracking-wider">
            {t.components}
          </span>
          <span className="text-[10px] text-text-tertiary ml-auto">{components.length}</span>
        </div>

        {isComponentsExpanded && (
          <div className="ml-2 border-l border-border-black space-y-0.5 mt-0.5">
            {components.length === 0 && (
              <div className="px-4 py-3 text-[11px] text-text-tertiary italic text-center">{t.emptyAssemblyHint}</div>
            )}

            {components.map((component) => {
              const isExpanded = expandedComponents[component.id] ?? false;
              const isVisible = component.visible !== false;
              const isEditingComponent = editingComponent?.id === component.id;
              const componentRobotState: RobotState = {
                ...component.robot,
                selection: robotSelection,
              };

              return (
                <div key={component.id}>
                  <div
                    className={`flex items-center gap-1.5 py-1 px-2 mx-1 rounded-md cursor-pointer group transition-all duration-200 ${itemHoverClass}
                      ${!isVisible ? 'opacity-60' : ''}`}
                    onClick={() => {
                      toggleComponent(component.id);
                      if (!isVisible && onToggleComponentVisibility) {
                        onToggleComponentVisibility(component.id);
                      }
                    }}
                    onContextMenu={(event) => openComponentContextMenu(event, component.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={12} className="text-text-tertiary" />
                    ) : (
                      <ChevronRight size={12} className="text-text-tertiary" />
                    )}
                    <Box size={12} className="text-system-blue" />

                    {isEditingComponent ? (
                      <input
                        ref={renameInputRef}
                        value={editingComponent?.draft ?? ''}
                        onChange={(event) => {
                          setEditingComponent((prev) => (prev ? { ...prev, draft: event.target.value } : prev));
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={commitComponentRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            commitComponentRename();
                          } else if (event.key === 'Escape') {
                            cancelComponentRename();
                          }
                        }}
                        className="text-xs font-medium flex-1 min-w-0 px-1 py-0.5 rounded border outline-none transition-colors bg-input-bg border-border-strong text-text-primary focus:border-system-blue"
                      />
                    ) : (
                      <span className="text-xs font-medium text-text-primary truncate flex-1">
                        {component.name}
                      </span>
                    )}

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleComponentVisibility?.(component.id);
                        }}
                        className="p-1 rounded hover:bg-element-hover text-text-tertiary transition-colors"
                        title={isVisible ? t.hide : t.show}
                      >
                        {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveComponent?.(component.id);
                        }}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                        title={t.deleteBranch}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      className="ml-2"
                      style={{ containIntrinsicSize: '280px', contentVisibility: 'auto' }}
                    >
                      {componentRootLinkIds[component.id]?.map((treeRootLinkId) => (
                        <TreeNode
                          key={treeRootLinkId}
                          linkId={treeRootLinkId}
                          robot={component.robot}
                          showGeometryDetailsByDefault={showGeometryDetailsByDefault}
                          parentLinkByChild={componentParentLinkByChild[component.id]}
                          onSelect={onSelect}
                          onSelectGeometry={onSelectGeometry}
                          onFocus={onFocus}
                          onAddChild={onAddChild}
                          onAddCollisionBody={onAddCollisionBody}
                          onDelete={onDelete}
                          onUpdate={onUpdate}
                          mode={mode}
                          t={t}
                          depth={0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2">
        <div
          className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-all duration-200 group rounded-md ${sectionHoverClass}`}
          onClick={() => setIsBridgesExpanded(!isBridgesExpanded)}
        >
          {isBridgesExpanded ? (
            <ChevronDown size={12} className="text-text-tertiary" />
          ) : (
            <ChevronRight size={12} className="text-text-tertiary" />
          )}
          <Link2 size={12} className="text-green-500" />
          <span className="text-[11px] font-bold text-text-tertiary dark:text-text-tertiary uppercase tracking-wider">
            {t.bridges}
          </span>
          <span className="text-[10px] text-text-tertiary ml-auto mr-1">{bridges.length}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateBridge?.();
            }}
            className="px-1.5 py-0.5 rounded bg-system-blue/10 dark:bg-system-blue/20 hover:bg-system-blue/15 dark:hover:bg-system-blue/25 text-system-blue border border-system-blue/25 dark:border-system-blue/35 flex items-center gap-1 transition-colors group/btn"
            title={t.createBridge}
          >
            <Plus size={10} strokeWidth={3} className="group-hover/btn:scale-110 transition-transform" />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t.add}</span>
          </button>
        </div>

        {isBridgesExpanded && (
          <div className="ml-2 border-l border-border-black space-y-0.5 mt-0.5">
            {bridges.length === 0 ? (
              <div className="px-4 py-2 text-[10px] italic text-text-tertiary">{t.none}</div>
            ) : (
              bridges.map((bridge) => (
                <div
                  key={bridge.id}
                  className={`flex items-center gap-1.5 py-1 px-2 mx-1 rounded-md cursor-pointer group transition-all duration-200 ${
                    matchesSelection(attentionSelection, { type: 'joint', id: bridge.id })
                      ? itemAttentionClass
                      : selection.type === 'joint' && selection.id === bridge.id
                        ? itemSelectedClass
                        : matchesSelection(hoveredSelection, { type: 'joint', id: bridge.id })
                          ? itemSelectedClass
                          : `text-text-secondary dark:text-text-secondary ${itemHoverClass}`
                  }`}
                  onClick={() => onSelect('joint', bridge.id)}
                  onMouseEnter={() => setHoveredSelection({ type: 'joint', id: bridge.id })}
                  onMouseLeave={clearHover}
                >
                  <ArrowRightLeft size={12} className="text-orange-500 dark:text-orange-300" />
                  <span className="text-xs font-medium truncate flex-1">{bridge.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBridge?.(bridge.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
                    title={t.deleteBranch}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ContextMenuFrame
        position={componentContextMenu ? { x: componentContextMenu.x, y: componentContextMenu.y } : null}
      >
        <ContextMenuItem onClick={handleComponentRenameFromMenu} icon={<Edit3 size={12} />}>
          {t.rename}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleComponentDeleteFromMenu} icon={<Trash2 size={12} />} tone="danger">
          {t.deleteBranch}
        </ContextMenuItem>
      </ContextMenuFrame>
    </div>
  );
});

AssemblyTreeView.displayName = 'AssemblyTreeView';
