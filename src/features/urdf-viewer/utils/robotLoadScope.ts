import {
  createStableJsonSnapshot,
  stripTransientJointMotionFromJoints,
} from '@/shared/utils/robot/semanticSnapshot';
import type { UrdfJoint, UrdfLink } from '@/types';

interface CreateViewerRobotLoadInputSignatureOptions {
  urdfContent: string;
  hasStructuredRobotState: boolean;
  robotLinks?: Record<string, UrdfLink>;
  robotJoints?: Record<string, UrdfJoint>;
}

function hashStringFNV1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createViewerRobotLoadInputSignature({
  urdfContent,
  hasStructuredRobotState,
  robotLinks,
  robotJoints,
}: CreateViewerRobotLoadInputSignatureOptions): string {
  if (hasStructuredRobotState && robotLinks && robotJoints) {
    const structuredSnapshot = createStableJsonSnapshot({
      links: robotLinks,
      joints: stripTransientJointMotionFromJoints(robotJoints),
    });
    return `structured:${hashStringFNV1a(structuredSnapshot)}`;
  }

  return `content:${hashStringFNV1a(urdfContent)}`;
}
