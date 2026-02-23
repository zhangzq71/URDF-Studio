import React, { memo, useState } from 'react';
import {
  ArrowRightLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Cuboid,
  Eye,
  EyeOff,
  Folder,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import type { AppMode, AssemblyState, RobotState } from '@/types';
import { TreeNode } from './TreeNode';

export interface AssemblyTreeViewProps {
  assemblyState: AssemblyState;
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  onRemoveComponent?: (id: string) => void;
  onRemoveBridge?: (id: string) => void;
  onCreateBridge?: () => void;
  onToggleComponentVisibility?: (id: string) => void;
  mode: AppMode;
  t: TranslationKeys;
}

export const AssemblyTreeView = memo(({
  assemblyState,
  robot,
  onSelect,
  onFocus,
  onAddChild,
  onDelete,
  onUpdate,
  onRemoveComponent,
  onRemoveBridge,
  onCreateBridge,
  onToggleComponentVisibility,
  mode,
  t,
}: AssemblyTreeViewProps) => {
  const [isComponentsExpanded, setIsComponentsExpanded] = useState(true);
  const [isBridgesExpanded, setIsBridgesExpanded] = useState(true);
  const [expandedComponents, setExpandedComponents] = useState<Record<string, boolean>>({});

  const toggleComponent = (id: string) => {
    setExpandedComponents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const components = Object.values(assemblyState.components);
  const bridges = Object.values(assemblyState.bridges);

  return (
    <div className="space-y-1">
      <div className="flex items-center py-1 px-2 mx-1 my-0.5 rounded-md bg-slate-100 dark:bg-[#2C2C2E] text-slate-700 dark:text-slate-200">
        <Cuboid size={14} className="mr-1.5 text-blue-500" />
        <span className="text-xs font-bold uppercase tracking-wider truncate">{assemblyState.name}</span>
      </div>

      <div className="mt-2">
        <div
          className="flex items-center gap-1.5 py-1 px-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#3A3A3C] transition-colors group"
          onClick={() => setIsComponentsExpanded(!isComponentsExpanded)}
        >
          {isComponentsExpanded ? (
            <ChevronDown size={12} className="text-slate-400" />
          ) : (
            <ChevronRight size={12} className="text-slate-400" />
          )}
          <Folder size={12} className="text-amber-500" />
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t.components}
          </span>
          <span className="text-[10px] text-slate-400 ml-auto">{components.length}</span>
        </div>

        {isComponentsExpanded && (
          <div className="ml-2 border-l border-slate-200 dark:border-slate-700 space-y-0.5 mt-0.5">
            {components.length === 0 && (
              <div className="px-4 py-3 text-[11px] text-slate-400 italic text-center">{t.emptyAssemblyHint}</div>
            )}

            {components.map((component) => {
              const isExpanded = expandedComponents[component.id] ?? false;
              const isVisible = component.visible !== false;

              return (
                <div key={component.id}>
                  <div
                    className={`flex items-center gap-1.5 py-1 px-2 mx-1 rounded-md cursor-pointer group hover:bg-slate-100 dark:hover:bg-[#3A3A3C]
                      ${!isVisible ? 'opacity-60' : ''}`}
                    onClick={() => {
                      toggleComponent(component.id);
                      if (!isVisible && onToggleComponentVisibility) {
                        onToggleComponentVisibility(component.id);
                      }
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown size={12} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={12} className="text-slate-400" />
                    )}
                    <Box size={12} className="text-blue-500" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1">
                      {component.name}
                    </span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleComponentVisibility?.(component.id);
                        }}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
                        title={isVisible ? t.hide : t.show}
                      >
                        {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveComponent?.(component.id);
                        }}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                        title={t.deleteBranch}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-2">
                      <TreeNode
                        linkId={component.robot.rootLinkId}
                        robot={robot}
                        onSelect={onSelect}
                        onFocus={onFocus}
                        onAddChild={onAddChild}
                        onDelete={onDelete}
                        onUpdate={onUpdate}
                        mode={mode}
                        t={t}
                        depth={0}
                      />
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
          className="flex items-center gap-1.5 py-1 px-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#3A3A3C] transition-colors group"
          onClick={() => setIsBridgesExpanded(!isBridgesExpanded)}
        >
          {isBridgesExpanded ? (
            <ChevronDown size={12} className="text-slate-400" />
          ) : (
            <ChevronRight size={12} className="text-slate-400" />
          )}
          <Link2 size={12} className="text-green-500" />
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t.bridges}
          </span>
          <span className="text-[10px] text-slate-400 ml-auto mr-1">{bridges.length}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateBridge?.();
            }}
            className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 flex items-center gap-1 transition-colors group/btn"
            title={t.createBridge}
          >
            <Plus size={10} strokeWidth={3} className="group-hover/btn:scale-110 transition-transform" />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t.add}</span>
          </button>
        </div>

        {isBridgesExpanded && (
          <div className="ml-2 border-l border-slate-200 dark:border-slate-700 space-y-0.5 mt-0.5">
            {bridges.length === 0 ? (
              <div className="px-4 py-2 text-[10px] italic text-slate-400">{t.none}</div>
            ) : (
              bridges.map((bridge) => (
                <div
                  key={bridge.id}
                  className={`flex items-center gap-1.5 py-1 px-2 mx-1 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-[#3A3A3C] group
                    ${
                      robot.selection.type === 'joint' && robot.selection.id === bridge.id
                        ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600'
                        : ''
                    }`}
                  onClick={() => onSelect('joint', bridge.id)}
                >
                  <ArrowRightLeft size={12} className="text-orange-500" />
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
    </div>
  );
});

AssemblyTreeView.displayName = 'AssemblyTreeView';
