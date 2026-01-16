import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RobotState, AppMode, Theme, RobotFile } from '../types';
import { Box, ArrowRightLeft, Plus, Trash2, ChevronDown, ChevronRight, ChevronLeft, PanelLeftOpen, FileCode, Folder } from 'lucide-react';
import { translations, Language } from '../services/i18n';

interface TreeEditorProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string) => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onNameChange: (name: string) => void;
  mode: AppMode;
  lang: Language;
  collapsed?: boolean;
  onToggle?: () => void;
  theme: Theme;
  availableFiles?: RobotFile[];
  onLoadRobot?: (file: RobotFile) => void;
}

// --- Structure View Components ---

const TreeNode = ({ 
  linkId, 
  robot, 
  onSelect, 
  onFocus,
  onAddChild, 
  onDelete,
  mode,
  t,
  depth = 0
}: { 
  linkId: string; 
  robot: RobotState; 
  onSelect: any; 
  onFocus?: any;
  onAddChild: any;
  onDelete: any;
  mode: AppMode;
  t: any;
  depth?: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const link = robot.links[linkId];
  if (!link) return null;

  const childJoints = Object.values(robot.joints).filter(j => j.parentLinkId === linkId);
  const hasChildren = childJoints.length > 0;
  
  const isLinkSelected = robot.selection.type === 'link' && robot.selection.id === linkId;
  const isSkeleton = mode === 'skeleton';

  return (
    <div className="relative">
      {/* Link Node - Compact card style */}
      <div 
        className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group
          ${isLinkSelected 
            ? 'bg-blue-500 text-white shadow-sm' 
            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
        onClick={() => onSelect('link', linkId)}
        onDoubleClick={() => onFocus && onFocus(linkId)}
        style={{ marginLeft: depth > 0 ? '8px' : '0' }}
      >
        {/* Tree line connector */}
        {depth > 0 && (
          <div className="absolute -left-2 top-1/2 w-2 h-px bg-slate-300 dark:bg-slate-600" />
        )}
        
        {/* Expand toggle */}
        <div 
          className={`w-4 h-4 flex items-center justify-center shrink-0 mr-1 rounded
            ${hasChildren ? 'hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setIsExpanded(!isExpanded); }}
        >
          {hasChildren && (
            isExpanded 
              ? <ChevronDown size={12} className={isLinkSelected ? 'text-blue-200' : 'text-slate-400'} /> 
              : <ChevronRight size={12} className={isLinkSelected ? 'text-blue-200' : 'text-slate-400'} />
          )}
        </div>

        {/* Link icon */}
        <div className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
          ${isLinkSelected ? 'bg-blue-400' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
          <Box size={12} className={isLinkSelected ? 'text-white' : 'text-blue-500 dark:text-blue-400'} />
        </div>
        
        <span className="text-xs font-medium truncate flex-1">{link.name}</span>
        
        {/* Actions */}
        {isSkeleton && (
          <div className={`flex items-center gap-0.5 ml-1 ${isLinkSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <button 
              onClick={(e) => { e.stopPropagation(); onAddChild(linkId); setIsExpanded(true); }}
              className={`p-0.5 rounded ${isLinkSelected ? 'hover:bg-blue-400' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              title={t.addChildJoint}
            >
              <Plus size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative ml-3">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-0 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
          
          {childJoints.map((joint, idx) => {
            const isJointSelected = robot.selection.type === 'joint' && robot.selection.id === joint.id;
            const isLast = idx === childJoints.length - 1;
            
            return (
              <div key={joint.id} className="relative">
                {/* Joint Node - Inline compact style */}
                <div 
                  className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group
                    ${isJointSelected 
                      ? 'bg-orange-500 text-white shadow-sm' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                  onClick={() => onSelect('joint', joint.id)}
                  style={{ marginLeft: '8px' }}
                >
                  {/* Connector */}
                  <div className="absolute -left-2 top-1/2 w-2 h-px bg-slate-300 dark:bg-slate-600" />
                  
                  {/* Joint icon */}
                  <div className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
                    ${isJointSelected ? 'bg-orange-400' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                    <ArrowRightLeft size={10} className={isJointSelected ? 'text-white' : 'text-orange-500 dark:text-orange-400'} />
                  </div>
                  
                  <span className="text-xs truncate flex-1">{joint.name}</span>
                  
                  {/* Actions */}
                  {isSkeleton && (
                    <div className={`flex items-center gap-0.5 ml-1 ${isJointSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(joint.childLinkId); }}
                        className={`p-0.5 rounded ${isJointSelected ? 'hover:bg-orange-400' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        title={t.deleteBranch}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Child Link - Recursive */}
                <TreeNode 
                  linkId={joint.childLinkId} 
                  robot={robot} 
                  onSelect={onSelect}
                  onFocus={onFocus}
                  onAddChild={onAddChild}
                  onDelete={onDelete}
                  mode={mode}
                  t={t}
                  depth={depth + 1}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TreeEditor: React.FC<TreeEditorProps> = ({ 
    robot, onSelect, onFocus, onAddChild, onDelete, onNameChange, mode, lang, collapsed, onToggle, theme,
    availableFiles = [], onLoadRobot
}) => {
  const t = translations[lang];
  const [width, setWidth] = useState(288);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Vertical resizing state
  const [fileBrowserHeight, setFileBrowserHeight] = useState(200);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(true);
  const [isStructureOpen, setIsStructureOpen] = useState(true);
  const isVerticalResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Horizontal resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    setIsDragging(true);
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  // Vertical resizing
  const handleVerticalMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    isVerticalResizing.current = true;
    setIsDragging(true);
    startY.current = e.clientY;
    startHeight.current = fileBrowserHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [fileBrowserHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing.current) {
        const delta = e.clientX - startX.current;
        const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
        setWidth(newWidth);
      }
      if (isVerticalResizing.current) {
          const delta = e.clientY - startY.current;
          // Min 50, Max 500 or constraint by container
          const newHeight = Math.max(100, Math.min(600, startHeight.current + delta));
          setFileBrowserHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      isVerticalResizing.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const actualWidth = collapsed ? 0 : width;

  return (
    <div 
      className={`bg-slate-50 dark:bg-google-dark-bg border-r border-slate-200 dark:border-google-dark-border flex flex-col h-full shrink-0 relative ${isDragging ? '' : 'transition-[width,min-width,flex] duration-200 ease-out'}`}
      style={{ width: `${actualWidth}px`, minWidth: `${actualWidth}px`, flex: `0 0 ${actualWidth}px`, overflow: 'visible' }}
    >
      {/* Side Toggle Button */}
      <button
          onClick={onToggle}
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-16 bg-white dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-600 hover:text-white border border-slate-300 dark:border-slate-600 rounded-r-lg shadow-md flex flex-col items-center justify-center z-50 cursor-pointer text-slate-400 hover:text-white transition-all group"
          title={collapsed ? t.structure : t.collapseSidebar}
      >
          <div className="flex flex-col gap-0.5 items-center">
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-200" />
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-200" />
          </div>
      </button>

      {!collapsed && (
        <div className="flex flex-col h-full overflow-hidden w-full relative">
            {/* Top: File Browser */}
            <div 
                className={`flex flex-col shrink-0 bg-white dark:bg-google-dark-bg border-b border-slate-200 dark:border-google-dark-border ${isDragging ? '' : 'transition-all duration-200'}`}
                style={{ height: isFileBrowserOpen ? `${fileBrowserHeight}px` : 'auto' }}
            >
                <div 
                    className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-google-dark-surface cursor-pointer select-none"
                    onClick={() => setIsFileBrowserOpen(!isFileBrowserOpen)}
                >
                     <div className="flex items-center gap-2">
                        {isFileBrowserOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{lang === 'zh' ? '文件浏览' : 'File Browser'}</span>
                     </div>
                     <span className="text-[10px] text-slate-400">{availableFiles.length}</span>
                </div>
                
                {isFileBrowserOpen && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {availableFiles.length === 0 ? (
                            <div className="text-xs text-slate-400 text-center py-4 italic">
                                {lang === 'zh' ? '无文件' : 'No files imported'}
                            </div>
                        ) : (
                            availableFiles.map((file, idx) => (
                                <div 
                                    key={idx}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                                    onClick={() => onLoadRobot && onLoadRobot(file)}
                                >
                                    <FileCode className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-500" />
                                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">{file.name}</span>
                                    <span className="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500">{file.format.toUpperCase()}</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Vertical Resizer */}
            {isFileBrowserOpen && isStructureOpen && (
                <div 
                    className="h-1 bg-slate-200 dark:bg-google-dark-border cursor-row-resize hover:bg-blue-400 transition-colors shrink-0 z-10"
                    onMouseDown={handleVerticalMouseDown}
                />
            )}

            {/* Bottom: Structure Tree */}
            <div 
                className="flex flex-col min-h-0 transition-all flex-1"
                style={{ flex: isStructureOpen ? '1 1 0%' : '0 0 auto' }}
            >
                <div 
                    className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-google-dark-surface cursor-pointer select-none border-b border-slate-200 dark:border-google-dark-border"
                    onClick={() => setIsStructureOpen(!isStructureOpen)}
                >
                     <div className="flex items-center gap-2">
                        {isStructureOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{t.structure}</span>
                     </div>
                </div>

                {isStructureOpen && (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        {/* 1. Robot Name Input */}
                        <div className="px-4 pt-2 pb-2 bg-slate-50 dark:bg-google-dark-bg border-b border-slate-200 dark:border-google-dark-border shrink-0">
                             <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">{t.robotName}</label>
                             <input 
                                type="text" 
                                value={robot.name}
                                onChange={(e) => onNameChange(e.target.value)}
                                className="w-full bg-white dark:bg-google-dark-surface focus:bg-white dark:focus:bg-google-dark-surface text-sm text-slate-900 dark:text-white px-3 py-2 rounded-lg border border-slate-300 dark:border-google-dark-border focus:border-google-blue outline-none transition-colors"
                                placeholder={t.enterRobotName}
                            />
                        </div>

                        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-google-dark-surface border-b border-slate-200 dark:border-google-dark-border shrink-0">
                             <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.structure}</span>
                             {mode === 'skeleton' && (
                                 <button 
                                    className="p-1 hover:bg-blue-600 bg-blue-700 text-white rounded-md transition-colors shadow-sm"
                                    onClick={() => {
                                        let targetId = robot.rootLinkId;
                                        if (robot.selection.type === 'link' && robot.selection.id) {
                                            targetId = robot.selection.id;
                                        } else if (robot.selection.type === 'joint' && robot.selection.id) {
                                            const selectedJoint = robot.joints[robot.selection.id];
                                            if (selectedJoint) targetId = selectedJoint.childLinkId;
                                        }
                                        onAddChild(targetId);
                                    }}
                                    title={t.addChildLink}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                             )}
                        </div>

                        {/* 3. Content Area */}
                        <div className="flex-1 overflow-y-auto overflow-x-auto py-2 custom-scrollbar bg-white dark:bg-google-dark-bg">
                             <TreeNode 
                                linkId={robot.rootLinkId} 
                                robot={robot} 
                                onSelect={onSelect} 
                                onFocus={onFocus}
                                onAddChild={onAddChild}
                                onDelete={onDelete}
                                mode={mode}
                                t={t}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Horizontal Resize Handle */}
            <div 
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
                onMouseDown={handleMouseDown}
            />
        </div>
      )}
    </div>
  );
};