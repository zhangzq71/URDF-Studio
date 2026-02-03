import React from 'react';
import { Move, ArrowUpRight } from 'lucide-react';
import { useUIStore } from '@/store';
import {
    CheckboxOption,
    SliderOption,
    OptionsPanelContainer,
    OptionsPanelHeader,
    OptionsPanelContent,
    SegmentedControl,
    CollapsibleSection,
    ModelHeaderBadge
} from '@/shared/components/Panel/OptionsPanel';

interface ViewerOptionsPanelProps {
    showOptionsPanel: boolean;
    optionsPanelRef: React.RefObject<HTMLDivElement>;
    optionsPanelPos: { x: number; y: number } | null;
    onMouseDown: (e: React.MouseEvent) => void;
    mode: 'detail' | 'hardware';
    t: any;
    isOptionsCollapsed: boolean;
    toggleOptionsCollapsed: () => void;
    setShowOptionsPanel?: (show: boolean) => void;
    fileName?: string;
    lang: string;
    highlightMode: 'link' | 'collision';
    setHighlightMode: (mode: 'link' | 'collision') => void;
    showJointControls: boolean;
    setShowJointControls: (show: boolean) => void;
    showVisual: boolean;
    setShowVisual: (show: boolean) => void;
    showCollision: boolean;
    setShowCollision: (show: boolean) => void;
    modelOpacity: number;
    setModelOpacity: (opacity: number) => void;
    showOrigins: boolean;
    setShowOrigins: (show: boolean) => void;
    showOriginsOverlay: boolean;
    setShowOriginsOverlay: (show: boolean) => void;
    originSize: number;
    setOriginSize: (size: number) => void;
    showJointAxes: boolean;
    setShowJointAxes: (show: boolean) => void;
    showJointAxesOverlay: boolean;
    setShowJointAxesOverlay: (show: boolean) => void;
    jointAxisSize: number;
    setJointAxisSize: (size: number) => void;
    showCenterOfMass: boolean;
    setShowCenterOfMass: (show: boolean) => void;
    showCoMOverlay: boolean;
    setShowCoMOverlay: (show: boolean) => void;
    centerOfMassSize: number;
    setCenterOfMassSize: (size: number) => void;
    showInertia: boolean;
    setShowInertia: (show: boolean) => void;
    showInertiaOverlay: boolean;
    setShowInertiaOverlay: (show: boolean) => void;
}

export const ViewerOptionsPanel: React.FC<ViewerOptionsPanelProps> = ({
    showOptionsPanel,
    optionsPanelRef,
    optionsPanelPos,
    onMouseDown,
    mode,
    t,
    isOptionsCollapsed,
    toggleOptionsCollapsed,
    setShowOptionsPanel,
    fileName,
    lang,
    highlightMode,
    setHighlightMode,
    showJointControls,
    setShowJointControls,
    showVisual,
    setShowVisual,
    showCollision,
    setShowCollision,
    modelOpacity,
    setModelOpacity,
    showOrigins,
    setShowOrigins,
    showOriginsOverlay,
    setShowOriginsOverlay,
    originSize,
    setOriginSize,
    showJointAxes,
    setShowJointAxes,
    showJointAxesOverlay,
    setShowJointAxesOverlay,
    jointAxisSize,
    setJointAxisSize,
    showCenterOfMass,
    setShowCenterOfMass,
    showCoMOverlay,
    setShowCoMOverlay,
    centerOfMassSize,
    setCenterOfMassSize,
    showInertia,
    setShowInertia,
    showInertiaOverlay,
    setShowInertiaOverlay,
}) => {
    const panelSections = useUIStore((state) => state.panelSections);
    const setPanelSection = useUIStore((state) => state.setPanelSection);

    if (!showOptionsPanel) return null;

    return (
        <div
            ref={optionsPanelRef}
            className="absolute z-30 pointer-events-auto"
            style={optionsPanelPos
                ? { left: optionsPanelPos.x, top: optionsPanelPos.y, right: 'auto' }
                : { top: '16px', right: '16px' }
            }
        >
            <OptionsPanelContainer>
                <OptionsPanelHeader
                    title={mode === 'hardware' ? t.hardwareOptions : t.detailOptions}
                    isCollapsed={isOptionsCollapsed}
                    onToggleCollapse={toggleOptionsCollapsed}
                    onClose={() => setShowOptionsPanel && setShowOptionsPanel(false)}
                    onMouseDown={onMouseDown}
                />

                <OptionsPanelContent isCollapsed={isOptionsCollapsed}>
                        {/* Loaded File Display */}
                        {fileName && <ModelHeaderBadge fileName={fileName} />}

                        <div className="p-2 pb-0">
                            <SegmentedControl
                                options={[
                                    { value: 'link', label: t.linkMode },
                                    { value: 'collision', label: t.collisionMode },
                                ]}
                                value={highlightMode}
                                onChange={setHighlightMode}
                                size="xs"
                            />
                        </div>

                        {/* General Visuals */}
                        <CollapsibleSection
                            title={t.visuals}
                            isCollapsed={panelSections['viewer_visuals'] ?? false}
                            onToggle={() => setPanelSection('viewer_visuals', !(panelSections['viewer_visuals'] ?? false))}
                        >
                            <CheckboxOption checked={showJointControls} onChange={setShowJointControls} label={t.showJointControls} />
                            <CheckboxOption checked={showVisual} onChange={setShowVisual} label={t.showVisual} />
                            <CheckboxOption checked={showCollision} onChange={setShowCollision} label={t.showCollision} />
                            
                            {/* Model Transparency */}
                            <div className="pt-2">
                                <SliderOption
                                    label={lang === 'zh' ? '模型不透明度' : 'Model Opacity'}
                                    value={modelOpacity}
                                    onChange={setModelOpacity}
                                    min={0.1}
                                    max={1.0}
                                    step={0.01}
                                    showPercentage
                                    compact
                                />
                            </div>
                        </CollapsibleSection>

                        {/* Coordinate Axes Section */}
                        <CollapsibleSection
                            title={lang === 'zh' ? '坐标系显示' : 'Coordinate Axes'}
                            isCollapsed={panelSections['viewer_coords'] ?? true}
                            onToggle={() => setPanelSection('viewer_coords', !(panelSections['viewer_coords'] ?? true))}
                        >
                            <div className="flex items-center justify-between pr-1">
                                <CheckboxOption
                                    checked={showOrigins}
                                    onChange={setShowOrigins}
                                    label={t.showOrigin}
                                    icon={<Move className="w-3 h-3 text-slate-500" />}
                                />
                                {showOrigins && (
                                    <button
                                        className={`p-0.5 rounded transition-colors ${showOriginsOverlay ? 'text-google-blue bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                        onClick={() => setShowOriginsOverlay(!showOriginsOverlay)}
                                        title={lang === 'zh' ? "显示在最前" : "Always on top"}
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {showOrigins && (
                                <SliderOption label={t.size} value={originSize} onChange={setOriginSize} min={0.01} max={0.5} step={0.01} compact indent />
                            )}

                            <div className="flex items-center justify-between pr-1 mt-1">
                                <CheckboxOption
                                    checked={showJointAxes}
                                    onChange={setShowJointAxes}
                                    label={t.showJointAxes}
                                    icon={<ArrowUpRight className="w-3 h-3 text-red-500" />}
                                />
                                {showJointAxes && (
                                    <button
                                        className={`p-0.5 rounded transition-colors ${showJointAxesOverlay ? 'text-google-blue bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                        onClick={() => setShowJointAxesOverlay(!showJointAxesOverlay)}
                                        title={lang === 'zh' ? "显示在最前" : "Always on top"}
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {showJointAxes && (
                                <SliderOption label={t.size} value={jointAxisSize} onChange={setJointAxisSize} min={0.01} max={2.0} step={0.01} compact indent />
                            )}
                        </CollapsibleSection>

                        {/* Physics Visualization Section */}
                        <CollapsibleSection
                            title={lang === 'zh' ? '物理可视化' : 'Physics'}
                            isCollapsed={panelSections['viewer_physics'] ?? true}
                            onToggle={() => setPanelSection('viewer_physics', !(panelSections['viewer_physics'] ?? true))}
                        >
                            <div className="flex items-center justify-between pr-1">
                                <CheckboxOption
                                    checked={showCenterOfMass}
                                    onChange={setShowCenterOfMass}
                                    label={t.showCenterOfMass}
                                    icon={<div className="w-3 h-3 rounded-full border border-slate-500 flex items-center justify-center"><div className="w-1 h-1 bg-slate-500 rounded-full"></div></div>}
                                />
                                {showCenterOfMass && (
                                    <button
                                        className={`p-0.5 rounded transition-colors ${showCoMOverlay ? 'text-google-blue bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                        onClick={() => setShowCoMOverlay(!showCoMOverlay)}
                                        title={lang === 'zh' ? "显示在最前" : "Always on top"}
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            {showCenterOfMass && (
                                <SliderOption label={t.size} value={centerOfMassSize} onChange={setCenterOfMassSize} min={0.005} max={0.1} step={0.005} decimals={3} compact indent />
                            )}

                            <div className="flex items-center justify-between pr-1 mt-1">
                                <CheckboxOption
                                    checked={showInertia}
                                    onChange={setShowInertia}
                                    label={t.showInertia}
                                    icon={<div className="w-3 h-3 border border-dashed border-slate-500"></div>}
                                />
                                {showInertia && (
                                    <button
                                        className={`p-0.5 rounded transition-colors ${showInertiaOverlay ? 'text-google-blue bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                        onClick={() => setShowInertiaOverlay(!showInertiaOverlay)}
                                        title={lang === 'zh' ? "显示在最前" : "Always on top"}
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </CollapsibleSection>
                </OptionsPanelContent>
            </OptionsPanelContainer>
        </div>
    );
};
