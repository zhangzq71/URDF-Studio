import { resolveDirectManipulableLinkIkDescriptor } from '@/core/robot';
import type { InteractionSelection, UrdfJoint, UrdfLink } from '@/types';

interface ResolveSelectedIkDragLinkIdOptions {
  selection: InteractionSelection | null | undefined;
  ikDragActive?: boolean;
  robotLinks?: Record<string, UrdfLink> | null;
  robotJoints?: Record<string, UrdfJoint> | null;
  rootLinkId?: string | null;
}

export function resolveSelectedIkDragLinkId({
  selection,
  ikDragActive = false,
  robotLinks,
  robotJoints,
  rootLinkId,
}: ResolveSelectedIkDragLinkIdOptions): string | null {
  if (selection?.type !== 'link' || !selection.id) {
    return null;
  }

  if (selection.helperKind === 'ik-handle') {
    return selection.id;
  }

  if (!ikDragActive || !robotLinks || !robotJoints || !rootLinkId) {
    return null;
  }

  return resolveDirectManipulableLinkIkDescriptor(
    {
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
    },
    selection.id,
  )
    ? selection.id
    : null;
}
