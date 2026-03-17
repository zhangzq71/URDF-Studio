import React, { useRef, useState, useEffect } from 'react';
import { Move, MousePointer2, View as ViewIcon, Scan, Ruler, X } from 'lucide-react';
import Draggable from 'react-draggable';
import { translations } from '@/shared/i18n';
import { IconButton } from '@/shared/components/ui';
import type { ViewerToolbarProps, ToolMode } from '../types';

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({ activeMode, setMode, onClose, lang = 'en' }) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [initialPosition, setInitialPosition] = useState<{ x: number; y: number } | null>(null);
    const t = translations[lang];
    const tools = [
        { id: 'view', icon: ViewIcon, label: t.viewMode },
        { id: 'select', icon: MousePointer2, label: t.selectMode },
        { id: 'universal', icon: Move, label: t.transformMode },
        { id: 'face', icon: Scan, label: t.faceMode },
        { id: 'measure', icon: Ruler, label: t.measureMode },
    ];

    useEffect(() => {
        if (nodeRef.current && initialPosition === null) {
            const parent = nodeRef.current.parentElement;
            if (parent) {
                const parentRect = parent.getBoundingClientRect();
                const toolbarRect = nodeRef.current.getBoundingClientRect();
                const centerX = (parentRect.width - toolbarRect.width) / 2;
                setInitialPosition({ x: centerX, y: 4 });
            }
        }
    }, [initialPosition]);

    const toolbarContent = (
        <>
            <div className="drag-handle cursor-move px-1 text-text-tertiary/50 flex items-center h-full mr-1 hover:text-text-tertiary transition-colors">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
            </div>
            {tools.map((tool) => {
                const isActive = activeMode === tool.id;
                const Icon = tool.icon;
                return (
                    <div key={tool.id} className="group relative">
                        <IconButton
                            onClick={() => setMode(tool.id as ToolMode)}
                            variant="toolbar"
                            isActive={isActive}
                            aria-label={tool.label}
                            title={tool.label}
                        >
                            <Icon className="w-4 h-4" />
                        </IconButton>
                        <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-element-active text-text-primary text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none whitespace-nowrap z-50 shadow-md border border-border-black">
                            {tool.label}
                        </span>
                    </div>
                );
            })}
            {onClose && (
                <>
                    <div className="w-px h-4 bg-border-black mx-1"></div>
                    <div className="group relative">
                        <IconButton onClick={onClose} variant="close" aria-label={t.closeToolbar} title={t.closeToolbar}>
                            <X className="w-4 h-4" />
                        </IconButton>
                        <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-element-active text-text-primary text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none whitespace-nowrap z-50 shadow-md border border-border-black">
                            {t.closeToolbar}
                        </span>
                    </div>
                </>
            )}
        </>
    );

    if (initialPosition === null) {
        return (
            <div ref={nodeRef} className="urdf-toolbar absolute z-40 bg-panel-bg rounded-lg border border-border-black shadow-2xl dark:shadow-black flex items-center p-1 gap-1 cursor-auto" style={{ left: '50%', top: '4px', transform: 'translateX(-50%)' }}>
                {toolbarContent}
            </div>
        );
    }

    return (
        <Draggable bounds="parent" handle=".drag-handle" nodeRef={nodeRef} defaultPosition={initialPosition}>
            <div ref={nodeRef} className="urdf-toolbar absolute z-40 bg-panel-bg rounded-lg border border-border-black shadow-2xl dark:shadow-black flex items-center p-1 gap-1 cursor-auto">
                {toolbarContent}
            </div>
        </Draggable>
    );
};
