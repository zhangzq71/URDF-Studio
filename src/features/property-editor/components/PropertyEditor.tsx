/**
 * PropertyEditor - Main orchestrator for link and joint property editing.
 * Delegates to LinkProperties or JointProperties based on selection,
 * wrapped in a resizable sidebar panel.
 */
import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { RobotState, AppMode, UrdfLink, MotorSpec, Theme } from '@/types';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import { useResizablePanel } from '../hooks/useResizablePanel';
import { LinkProperties } from './LinkProperties';
import { JointProperties } from './JointProperties';

export interface PropertyEditorProps {
  robot: RobotState;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  onSelect?: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => void;
  mode: AppMode;
  assets: Record<string, string>;
  onUploadAsset: (file: File) => void;
  motorLibrary: Record<string, MotorSpec[]>;
  lang: Language;
  collapsed?: boolean;
  onToggle?: () => void;
  theme: Theme;
}

export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  robot,
  onUpdate,
  onSelect,
  mode,
  assets,
  onUploadAsset,
  motorLibrary,
  lang,
  collapsed,
  onToggle,
}) => {
  const { selection } = robot;
  const isLink = selection.type === 'link';
  const data = selection.id ? (isLink ? robot.links[selection.id] : robot.joints[selection.id]) : null;
  const t = translations[lang];

  const { displayWidth, isDragging, handleResizeMouseDown } = useResizablePanel(collapsed);

  return (
    <div
      className={`bg-element-bg dark:bg-panel-bg border-l border-border-black flex flex-col h-full z-20 relative will-change-[width,flex] ${isDragging ? '' : 'transition-[width,min-width,flex] duration-200 ease-out'}`}
      style={{
        width: `${displayWidth}px`,
        minWidth: `${displayWidth}px`,
        flex: `0 0 ${displayWidth}px`,
      }}
    >
      {/* Side Toggle Button (Centered & Protruding Left) */}
      <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-panel-bg hover:bg-system-blue-solid hover:text-white border border-border-strong rounded-l-lg shadow-md flex flex-col items-center justify-center z-50 cursor-pointer text-text-tertiary transition-all group"
          title={collapsed ? t.properties : t.collapseSidebar}
      >
          <div className="flex flex-col gap-0.5 items-center">
            <div className="w-1 h-1 rounded-full bg-text-tertiary/40 group-hover:bg-white/80" />
            {collapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <div className="w-1 h-1 rounded-full bg-text-tertiary/40 group-hover:bg-white/80" />
          </div>
      </button>

      {/* Content Container - use visibility to prevent flash but allow smooth transition */}
      <div className="h-full w-full flex flex-col overflow-hidden">
        <div style={{ width: `${displayWidth}px` }} className="h-full flex flex-col bg-element-bg dark:bg-panel-bg transition-all duration-200 ease-out">
          {/* Header */}
          <div className="w-full flex items-center justify-between px-4 py-2 border-b border-border-black bg-panel-bg shrink-0 relative z-30">
            <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">{t.properties}</span>
            {data && (
              <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${isLink ? 'bg-system-blue/10 dark:bg-system-blue/20 text-system-blue' : 'bg-orange-100 dark:bg-orange-900/25 text-orange-700 dark:text-orange-300'}`}>
                  {selection.type}
                </span>
                <h2 className="font-semibold text-text-primary truncate">{data.name}</h2>
              </div>
            )}
          </div>

          {/* Content */}
          {!data ? (
            <div className="w-full flex-1 flex items-center justify-center p-8 text-text-tertiary text-center">
              <p>{t.selectLinkOrJoint}</p>
            </div>
          ) : (
            <div className="w-full flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
              {isLink ? (
                <LinkProperties
                  data={data as UrdfLink}
                  robot={robot}
                  mode={mode}
                  selection={selection}
                  onUpdate={onUpdate}
                  onSelect={onSelect}
                  assets={assets}
                  onUploadAsset={onUploadAsset}
                  t={t}
                />
              ) : (
                <JointProperties
                  data={data}
                  mode={mode}
                  selection={selection}
                  onUpdate={onUpdate}
                  motorLibrary={motorLibrary}
                  t={t}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle - only show when expanded */}
      {!collapsed && (
        <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-system-blue/40 transition-colors z-40"
            onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
};
