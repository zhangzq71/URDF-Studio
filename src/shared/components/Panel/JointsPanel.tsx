import React from 'react';
import { RotateCcw } from 'lucide-react';
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
}) => {
    // Condition to show
    const shouldShow = showJointControls && showJointPanel && robot?.joints && Object.keys(robot.joints).length > 0;

    const additionalControls = (
        <div className="flex items-center gap-1 mr-1">
             <button
                onClick={(e) => { e.stopPropagation(); handleResetJoints(); }}
                className="p-1 rounded bg-slate-200 dark:bg-google-dark-bg hover:bg-slate-300 dark:hover:bg-google-dark-border text-slate-700 dark:text-white transition-colors"
                title={t.resetJoints}
            >
                <RotateCcw className="w-3 h-3" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); setAngleUnit(angleUnit === 'rad' ? 'deg' : 'rad'); }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-google-dark-bg hover:bg-slate-300 dark:hover:bg-google-dark-border text-slate-700 dark:text-white font-mono transition-colors min-w-[32px]"
                title={t.switchUnit}
            >
                {angleUnit.toUpperCase()}
            </button>
        </div>
    );

    return (
        <OptionsPanel
            title={t.jointControls}
            show={!!shouldShow}
            panelRef={jointPanelRef}
            position={jointPanelPos}
            defaultPosition={{ bottom: '16px', right: '16px' }}
            isCollapsed={isJointsCollapsed}
            onToggleCollapse={toggleJointsCollapsed}
            onClose={() => setShowJointPanel && setShowJointPanel(false)}
            onMouseDown={onMouseDown}
            resizable={true} 
            additionalControls={additionalControls}
            zIndex={30}
        >
            <div className="p-2 space-y-2">
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
                        />
                    ))}
            </div>
        </OptionsPanel>
    );
};
