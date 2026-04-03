import { resolveViewerJointKey } from '@/shared/utils/jointPanelState';
import { isSingleDofJoint } from './jointTypes';

type ViewerSelection = {
  type: 'link' | 'joint' | null;
  id: string | null;
};

type ViewerJointLike = {
  childLinkId?: string;
  childName?: string;
  name?: string;
  type?: string;
  jointType?: string;
  child?: {
    name?: string;
  };
};

function resolveViewerJointChildLinkIdentity(joint: ViewerJointLike | null | undefined): string | null {
  return joint?.child?.name ?? joint?.childLinkId ?? joint?.childName ?? null;
}

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
    resolveViewerJointChildLinkIdentity(joint) === selection.id && isSingleDofJoint(joint)
  );

  return resolvedEntry?.[0] ?? null;
}
