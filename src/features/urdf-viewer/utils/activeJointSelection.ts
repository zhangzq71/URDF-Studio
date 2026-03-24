import { resolveViewerJointKey } from '@/shared/utils/jointPanelState';
import { isSingleDofJoint } from './jointTypes';

type ViewerSelection = {
  type: 'link' | 'joint' | null;
  id: string | null;
};

type ViewerJointLike = {
  name?: string;
  child?: {
    name?: string;
  };
};

export function resolveActiveViewerJointKeyFromSelection(
  joints: Record<string, ViewerJointLike> | null | undefined,
  selection: ViewerSelection | null | undefined,
): string | null {
  if (!joints || !selection?.type || !selection.id) {
    return null;
  }

  if (selection.type === 'joint') {
    const jointKey = resolveViewerJointKey(joints, selection.id);
    const joint = jointKey ? joints[jointKey] : undefined;
    return isSingleDofJoint(joint) ? jointKey : null;
  }

  const resolvedEntry = Object.entries(joints).find(([, joint]) =>
    joint?.child?.name === selection.id && isSingleDofJoint(joint)
  );

  return resolvedEntry?.[0] ?? null;
}
