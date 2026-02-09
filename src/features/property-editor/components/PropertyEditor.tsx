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

  const { width, displayWidth, isDragging, handleResizeMouseDown } = useResizablePanel(collapsed);

  return (
    <div
      className={`bg-slate-50 dark:bg-google-dark-bg border-l border-slate-200 dark:border-google-dark-border flex flex-col h-full z-20 relative will-change-[width,flex] ${isDragging ? '' : 'transition-[width,min-width,flex] duration-200 ease-out'}`}
      style={{
        width: `${displayWidth}px`,
        minWidth: `${displayWidth}px`,
        flex: `0 0 ${displayWidth}px`,
        overflow: 'visible'
      }}
    >
      {/* Side Toggle Button (Centered & Protruding Left) */}
      <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-white dark:bg-[#2C2C2E] hover:bg-blue-500 dark:hover:bg-blue-600 hover:text-white border border-slate-300 dark:border-[#000000] rounded-l-lg shadow-md flex flex-col items-center justify-center z-50 cursor-pointer text-slate-400 hover:text-white transition-all group"
          title={collapsed ? t.properties : t.collapseSidebar}
      >
          <div className="flex flex-col gap-0.5 items-center">
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-200" />
            {collapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-200" />
          </div>
      </button>

      <div className="h-full w-full overflow-hidden flex flex-col relative bg-slate-50 dark:bg-google-dark-bg">
        <div style={{ width: `${Math.max(width, 280)}px`, minWidth: `${Math.max(width, 280)}px` }} className="h-full flex flex-col">
          {/* Header */}
          <div className="w-full flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-google-dark-border bg-white dark:bg-[#2C2C2E] shrink-0 relative z-30">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.properties}</span>
            {data && (
              <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${isLink ? 'bg-blue-100 dark:bg-slate-700 text-blue-700 dark:text-slate-300' : 'bg-orange-100 dark:bg-slate-700 text-orange-700 dark:text-slate-300'}`}>
                  {selection.type}
                </span>
                <h2 className="font-semibold text-slate-900 dark:text-white truncate">{data.name}</h2>
              </div>
            )}
          </div>

          {/* Content */}
          {!data ? (
            <div className="w-full flex-1 flex items-center justify-center p-8 text-slate-500 text-center">
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
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-40"
            onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
};
