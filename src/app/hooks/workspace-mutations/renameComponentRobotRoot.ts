import type { RobotData, UrdfJoint, UrdfLink } from '@/types';
import type { MJCFRenameOperation } from '@/app/utils/mjcfEditableSourcePatch';

export interface RenamedComponentRobotRoot {
  nextRootName: string;
  nextLinks: Record<string, UrdfLink>;
  nextJoints: Record<string, UrdfJoint>;
  renameOperations: MJCFRenameOperation[];
}

export function renameComponentRobotRoot(
  robot: RobotData,
  nextRootNameRaw: string,
): RenamedComponentRobotRoot | null {
  const nextRootName = nextRootNameRaw.trim();
  if (!nextRootName) {
    return null;
  }

  const rootId = robot.rootLinkId;
  const rootLink = robot.links[rootId];
  if (!rootLink) {
    return null;
  }

  const oldRootName = rootLink.name;
  const oldPrefix = `${oldRootName}_`;
  const renameOperations: MJCFRenameOperation[] =
    oldRootName === nextRootName
      ? []
      : [{ kind: 'link', currentName: oldRootName, nextName: nextRootName }];

  const nextLinks: Record<string, UrdfLink> = { ...robot.links };
  nextLinks[rootId] = { ...rootLink, name: nextRootName };

  Object.entries(robot.links).forEach(([id, currentLink]) => {
    if (id === rootId || !currentLink.name.startsWith(oldPrefix)) {
      return;
    }

    const nextName = `${nextRootName}_${currentLink.name.slice(oldPrefix.length)}`;
    nextLinks[id] = {
      ...currentLink,
      name: nextName,
    };
    renameOperations.push({
      kind: 'link',
      currentName: currentLink.name,
      nextName,
    });
  });

  const nextJoints: Record<string, UrdfJoint> = { ...robot.joints };
  Object.entries(robot.joints).forEach(([id, joint]) => {
    if (!joint.name.startsWith(oldPrefix)) {
      return;
    }

    const nextName = `${nextRootName}_${joint.name.slice(oldPrefix.length)}`;
    nextJoints[id] = {
      ...joint,
      name: nextName,
    };
    renameOperations.push({
      kind: 'joint',
      currentName: joint.name,
      nextName,
    });
  });

  return {
    nextRootName,
    nextLinks,
    nextJoints,
    renameOperations,
  };
}
