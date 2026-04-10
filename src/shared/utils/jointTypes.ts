const SINGLE_DOF_JOINT_TYPES = new Set(['revolute', 'continuous', 'prismatic']);

export const getJointType = (joint: any): string => {
  return String(joint?.jointType ?? joint?.type ?? '').toLowerCase();
};

export const isSingleDofJoint = (joint: any): boolean => {
  return SINGLE_DOF_JOINT_TYPES.has(getJointType(joint));
};

export const getSingleDofJointEntries = <TJoint>(
  joints: Record<string, TJoint> | null | undefined,
): Array<[string, TJoint]> => {
  return Object.entries(joints ?? {}).filter(([, joint]) => isSingleDofJoint(joint));
};

export const hasSingleDofJoints = <TJoint>(
  joints: Record<string, TJoint> | null | undefined,
): boolean => {
  return getSingleDofJointEntries(joints).length > 0;
};
