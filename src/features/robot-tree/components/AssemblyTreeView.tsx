import React, { memo, useEffect, useRef, useState } from 'react';
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
import type { TranslationKeys } from '@/shared/i18n';
import { matchesSelection, useSelectionStore } from '@/store/selectionStore';
import type { AppMode, AssemblyState, RobotState } from '@/types';
import { useShallow } from 'zustand/react/shallow';
import { TreeNode } from './TreeNode';

export interface AssemblyTreeViewProps {
  assemblyState: AssemblyState;
  robot: RobotState;
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
  robot,
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
  const { hoveredSelection, attentionSelection, setHoveredSelection, clearHover } = useSelectionStore(
    useShallow((state) => ({
      hoveredSelection: state.hoveredSelection,
      attentionSelection: state.attentionSelection,
      setHoveredSelection: state.setHoveredSelection,
      clearHover: state.clearHover,
    }))
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

  const components = Object.values(assemblyState.components);
  const bridges = Object.values(assemblyState.bridges);
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
                    <div className="ml-2">
                      {getTreeRenderRootLinkIds(component.robot).map((treeRootLinkId) => (
                        <TreeNode
                          key={treeRootLinkId}
                          linkId={treeRootLinkId}
                          robot={robot}
                          showGeometryDetailsByDefault={showGeometryDetailsByDefault}
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
                      : robot.selection.type === 'joint' && robot.selection.id === bridge.id
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

      {componentContextMenu && (
        <div
          className="fixed z-[120] w-[170px] rounded-md border border-border-black bg-panel-bg shadow-xl p-1"
          style={{ left: `${componentContextMenu.x}px`, top: `${componentContextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-text-secondary hover:bg-system-blue/10 dark:hover:bg-system-blue/20 hover:text-system-blue transition-colors group/menu-item"
            onClick={handleComponentRenameFromMenu}
          >
            <Edit3 size={12} className="text-system-blue transition-colors group-hover/menu-item:text-system-blue-hover" />
            <span>{t.rename}</span>
          </button>
          <button
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors group/menu-item"
            onClick={handleComponentDeleteFromMenu}
          >
            <Trash2 size={12} className="transition-colors group-hover/menu-item:text-red-700 dark:group-hover/menu-item:text-red-300" />
            <span>{t.deleteBranch}</span>
          </button>
        </div>
      )}
    </div>
  );
});

AssemblyTreeView.displayName = 'AssemblyTreeView';
