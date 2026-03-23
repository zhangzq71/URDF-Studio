import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCcw, Settings } from 'lucide-react';
import { OptionsPanel } from './OptionsPanel';
import { JointControlItem } from './JointControlItem';
import { isSingleDofJoint } from '@/shared/utils/jointTypes';
import { resolveViewerJointAngleValue } from '@/shared/utils/jointPanelState';
import type { JointPanelStore } from '@/shared/utils/jointPanelStore';

interface JointsPanelProps {
    showJointPanel: boolean;
    robot: any;
    jointPanelRef: React.RefObject<HTMLDivElement>;
    jointPanelPos: { x: number; y: number } | null;
    defaultPosition?: { top?: string; right?: string; left?: string; bottom?: string; transform?: string };
    maxHeight?: number;
    onMouseDown: (e: React.MouseEvent) => void;
    t: any;
    handleResetJoints: () => void;
    angleUnit: 'rad' | 'deg';
    setAngleUnit: (unit: 'rad' | 'deg') => void;
    isJointsCollapsed: boolean;
    toggleJointsCollapsed: () => void;
    setShowJointPanel?: (show: boolean) => void;
    jointPanelStore: JointPanelStore;
    setActiveJoint: (name: string | null) => void;
    handleJointAngleChange: (name: string, angle: number) => void;
    handleJointChangeCommit: (name: string, angle: number) => void;
    onSelect?: (type: 'link' | 'joint', id: string) => void;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => void;
    onUpdate?: (type: 'link' | 'joint', id: string, data: unknown) => void;
}

export const JointsPanel: React.FC<JointsPanelProps> = ({
    showJointPanel,
    robot,
    jointPanelRef,
    jointPanelPos,
    defaultPosition,
    maxHeight,
    onMouseDown,
    t,
    handleResetJoints,
    angleUnit,
    setAngleUnit,
    isJointsCollapsed,
    toggleJointsCollapsed,
    setShowJointPanel,
    jointPanelStore,
    setActiveJoint,
    handleJointAngleChange,
    handleJointChangeCommit,
    onSelect,
    onHover,
    onUpdate,
}) => {
    // Condition to show
    const shouldShow = showJointPanel && robot?.joints && Object.keys(robot.joints).length > 0;
    const [isAdvanced, setIsAdvanced] = useState(false);
    const onHoverRef = useRef(onHover);
    const { jointAngles, activeJoint } = useSyncExternalStore(
        jointPanelStore.subscribe,
        jointPanelStore.getSnapshot,
        jointPanelStore.getSnapshot,
    );

    useEffect(() => {
        onHoverRef.current = onHover;
    }, [onHover]);

    useEffect(() => {
        return () => {
            onHoverRef.current?.(null, null);
        };
    }, []);

    const additionalControls = (
        <div className="mr-1 flex shrink-0 items-center gap-1">
            <button
                onClick={(e) => { e.stopPropagation(); handleResetJoints(); }}
                className="flex items-center gap-1.5 p-1 px-2 rounded border border-border-black/60 bg-panel-bg text-text-secondary hover:bg-system-blue/10 hover:text-system-blue transition-colors"
                title={t.resetJoints}
            >
                <RotateCcw className="w-3 h-3" />
                <span className="text-[10px] hidden @[300px]:inline whitespace-nowrap">{t.reset || 'Reset'}</span>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); setIsAdvanced(!isAdvanced); }}
                className={`flex items-center gap-1.5 p-1 px-2 rounded border border-border-black/60 transition-colors ${
                    isAdvanced
                        ? 'bg-system-blue-solid text-white border-system-blue-solid'
                        : 'bg-panel-bg text-text-secondary hover:bg-system-blue/10 hover:text-system-blue'
                }`}
                title={t.advanced || "Advanced"}
            >
                <Settings className="w-3 h-3" />
                <span className="text-[10px] hidden @[300px]:inline whitespace-nowrap">{t.advanced || 'Advanced'}</span>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); setAngleUnit(angleUnit === 'rad' ? 'deg' : 'rad'); }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-element-bg hover:bg-element-hover text-text-secondary dark:text-text-secondary font-mono transition-colors min-w-[32px]"
                title={t.switchUnit}
            >
                {angleUnit.toUpperCase()}
            </button>
        </div>
    );

    return (
        <OptionsPanel
            title={t.joints || "Joints"}
            show={!!shouldShow}
            panelRef={jointPanelRef}
            position={jointPanelPos}
            defaultPosition={defaultPosition ?? { top: '50%', left: '16px', transform: 'translateY(-50%)' }}
            isCollapsed={isJointsCollapsed}
            onToggleCollapse={toggleJointsCollapsed}
            onClose={() => setShowJointPanel && setShowJointPanel(false)}
            onMouseDown={onMouseDown}
            resizable={true}
            maxHeight={maxHeight}
            additionalControls={additionalControls}
            zIndex={40}
            resizeTitle={t.resize}
            panelClassName="urdf-joint-panel"
        >
            <div className="px-1 py-1.5 space-y-1" onMouseLeave={() => onHover?.(null, null)}>
                {robot?.joints && Object.entries(robot.joints)
                    .filter(([_, joint]: [string, any]) => isSingleDofJoint(joint))
                    .map(([name, joint]: [string, any]) => (
                        <JointControlItem
                            key={name}
                            name={name}
                            joint={joint}
                            value={resolveViewerJointAngleValue(jointAngles, name, joint, 0)}
                            angleUnit={angleUnit}
                            isActive={activeJoint === name}
                            setActiveJoint={setActiveJoint}
                            handleJointAngleChange={handleJointAngleChange}
                            handleJointChangeCommit={handleJointChangeCommit}
                            onSelect={onSelect}
                            onHover={onHover}
                            isAdvanced={isAdvanced}
                            onUpdate={onUpdate}
                        />
                    ))}
            </div>
        </OptionsPanel>
    );
};
