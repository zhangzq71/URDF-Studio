import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface JointPanelItemBindingProps {
    name: string;
    joint: any;
    angleUnit: 'rad' | 'deg';
    jointPanelStore: JointPanelStore;
    setActiveJoint: (name: string | null) => void;
    handleJointAngleChange: (name: string, angle: number) => void;
    handleJointChangeCommit: (name: string, angle: number) => void;
    onSelect?: (type: 'link' | 'joint', id: string) => void;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => void;
    isAdvanced?: boolean;
    onUpdate?: (type: 'link' | 'joint', id: string, data: unknown) => void;
}

interface JointPanelItemSnapshot {
    value: number;
    isActive: boolean;
}

function areJointPanelItemSnapshotsEqual(a: JointPanelItemSnapshot, b: JointPanelItemSnapshot) {
    return a.value === b.value && a.isActive === b.isActive;
}

function resolveJointPanelItemSnapshot(
    jointPanelStore: JointPanelStore,
    name: string,
    joint: any,
): JointPanelItemSnapshot {
    const snapshot = jointPanelStore.getSnapshot();

    return {
        value: resolveViewerJointAngleValue(snapshot.jointAngles, name, joint, 0),
        isActive: snapshot.activeJoint === name,
    };
}

function useJointPanelItemSnapshot(
    jointPanelStore: JointPanelStore,
    name: string,
    joint: any,
) {
    const getSnapshot = useCallback(
        () => resolveJointPanelItemSnapshot(jointPanelStore, name, joint),
        [jointPanelStore, joint, name],
    );

    const [itemSnapshot, setItemSnapshot] = useState<JointPanelItemSnapshot>(() => getSnapshot());

    useEffect(() => {
        const syncSnapshot = () => {
            setItemSnapshot((previousSnapshot) => {
                const nextSnapshot = getSnapshot();
                return areJointPanelItemSnapshotsEqual(previousSnapshot, nextSnapshot)
                    ? previousSnapshot
                    : nextSnapshot;
            });
        };

        syncSnapshot();
        return jointPanelStore.subscribe(syncSnapshot);
    }, [getSnapshot, jointPanelStore]);

    return itemSnapshot;
}

const JointPanelItemBinding = React.memo(function JointPanelItemBinding({
    name,
    joint,
    angleUnit,
    jointPanelStore,
    setActiveJoint,
    handleJointAngleChange,
    handleJointChangeCommit,
    onSelect,
    onHover,
    isAdvanced = false,
    onUpdate,
}: JointPanelItemBindingProps) {
    const { value, isActive } = useJointPanelItemSnapshot(jointPanelStore, name, joint);

    return (
        <JointControlItem
            name={name}
            joint={joint}
            value={value}
            angleUnit={angleUnit}
            isActive={isActive}
            setActiveJoint={setActiveJoint}
            handleJointAngleChange={handleJointAngleChange}
            handleJointChangeCommit={handleJointChangeCommit}
            onSelect={onSelect}
            onHover={onHover}
            isAdvanced={isAdvanced}
            onUpdate={onUpdate}
        />
    );
});

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
    const jointEntries = useMemo(
        () => Object.entries(robot?.joints ?? {}).filter(([_, joint]) => isSingleDofJoint(joint)),
        [robot?.joints],
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
                {jointEntries.map(([name, joint]: [string, any]) => (
                    <JointPanelItemBinding
                        key={name}
                        name={name}
                        joint={joint}
                        angleUnit={angleUnit}
                        jointPanelStore={jointPanelStore}
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
