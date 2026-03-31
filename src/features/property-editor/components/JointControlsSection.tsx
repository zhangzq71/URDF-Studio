import React from 'react';
import { JointControlItem } from '@/shared/components/Panel/JointControlItem';
import { isSingleDofJoint } from '@/shared/utils/jointTypes';
import { translations } from '@/shared/i18n';
import { useRobotStore } from '@/store/robotStore';
import { StaticSection } from './FormControls';

interface JointControlData {
  id?: string;
  name?: string;
  angle?: number;
  limit?: {
    lower?: number;
    upper?: number;
    effort?: number;
    velocity?: number;
  };
}

interface JointControlsSectionProps {
  joint: JointControlData;
  selectionId: string;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  t: typeof translations['en'];
}

export const JointControlsSection: React.FC<JointControlsSectionProps> = ({
  joint,
  selectionId,
  onUpdate,
  t,
}) => {
  const [angleUnit, setAngleUnit] = React.useState<'rad' | 'deg'>('deg');
  const setJointAngle = useRobotStore((state) => state.setJointAngle);
  const jointName = joint.name?.trim() || selectionId;

  const handleJointAngleChange = React.useCallback((_: string, angle: number) => {
    setJointAngle(selectionId, angle);
  }, [selectionId, setJointAngle]);

  if (!isSingleDofJoint(joint)) {
    return null;
  }

  return (
    <StaticSection title={t.jointControls} className="mb-2.5" contentClassName="bg-panel-bg p-1.5">
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={() => setAngleUnit((current) => (current === 'rad' ? 'deg' : 'rad'))}
          className="rounded bg-element-bg px-1.5 py-0.5 font-mono text-[10px] text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary"
          title={t.switchUnit}
        >
          {angleUnit.toUpperCase()}
        </button>
      </div>

      <JointControlItem
        name={jointName}
        joint={joint}
        value={joint.angle ?? 0}
        angleUnit={angleUnit}
        isActive={true}
        setActiveJoint={() => {}}
        handleJointAngleChange={handleJointAngleChange}
        handleJointChangeCommit={handleJointAngleChange}
        isAdvanced={true}
        onUpdate={onUpdate}
      />
    </StaticSection>
  );
};
