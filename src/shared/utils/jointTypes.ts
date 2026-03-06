const SINGLE_DOF_JOINT_TYPES = new Set(['revolute', 'continuous', 'prismatic']);

export const getJointType = (joint: any): string => {
    return String(joint?.jointType ?? joint?.type ?? '').toLowerCase();
};

export const isSingleDofJoint = (joint: any): boolean => {
    return SINGLE_DOF_JOINT_TYPES.has(getJointType(joint));
};
