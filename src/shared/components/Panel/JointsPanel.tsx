import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Settings } from 'lucide-react';
import { OptionsPanel } from './OptionsPanel';
import { JointControlItem } from '@/features/urdf-viewer/components/JointControlItem';

interface JointsPanelProps {
    showJointControls: boolean;
    showJointPanel: boolean;
    robot: any;
    jointPanelRef: React.RefObject<HTMLDivElement>;
    jointPanelPos: { x: number; y: number } | null;
    onMouseDown: (e: React.MouseEvent) => void;
    t: any;
    handleResetJoints: () => void;
    angleUnit: 'rad' | 'deg';
    setAngleUnit: (unit: 'rad' | 'deg') => void;
    isJointsCollapsed: boolean;
    toggleJointsCollapsed: () => void;
    setShowJointPanel?: (show: boolean) => void;
    jointAngles: Record<string, number>;
    activeJoint: string | null;
    setActiveJoint: (name: string | null) => void;
    handleJointAngleChange: (name: string, angle: number) => void;
    handleJointChangeCommit: (name: string, angle: number) => void;
    onSelect?: (type: 'link' | 'joint', id: string) => void;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => void;
}

export const JointsPanel: React.FC<JointsPanelProps> = ({
    showJointControls,
    showJointPanel,
    robot,
    jointPanelRef,
    jointPanelPos,
    onMouseDown,
    t,
    handleResetJoints,
    angleUnit,
    setAngleUnit,
    isJointsCollapsed,
    toggleJointsCollapsed,
    setShowJointPanel,
    jointAngles,
    activeJoint,
    setActiveJoint,
    handleJointAngleChange,
    handleJointChangeCommit,
    onSelect,
    onHover,
}) => {
    // Condition to show
    const shouldShow = showJointControls && showJointPanel && robot?.joints && Object.keys(robot.joints).length > 0;
    const [isAdvanced, setIsAdvanced] = useState(false);
    const onHoverRef = useRef(onHover);

    useEffect(() => {
        onHoverRef.current = onHover;
    }, [onHover]);

    useEffect(() => {
        return () => {
            onHoverRef.current?.(null, null);
        };
    }, []);

    const additionalControls = (
        <div className="flex items-center gap-1 mr-1">
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
            defaultPosition={{ top: '50%', left: '16px', transform: 'translateY(-50%)' }}
            isCollapsed={isJointsCollapsed}
            onToggleCollapse={toggleJointsCollapsed}
            onClose={() => setShowJointPanel && setShowJointPanel(false)}
            onMouseDown={onMouseDown}
            resizable={true}
            additionalControls={additionalControls}
            zIndex={40}
        >
            <div className="p-2 space-y-2" onMouseLeave={() => onHover?.(null, null)}>
                {robot?.joints && Object.entries(robot.joints)
                    .filter(([_, joint]: [string, any]) => joint.jointType !== 'fixed')
                    .map(([name, joint]: [string, any]) => (
                        <JointControlItem
                            key={name}
                            name={name}
                            joint={joint}
                            jointAngles={jointAngles}
                            angleUnit={angleUnit}
                            activeJoint={activeJoint}
                            setActiveJoint={setActiveJoint}
                            handleJointAngleChange={handleJointAngleChange}
                            handleJointChangeCommit={handleJointChangeCommit}
                            onSelect={onSelect}
                            onHover={onHover}
                            isAdvanced={isAdvanced}
                        />
                    ))}
            </div>
        </OptionsPanel>
    );
};
