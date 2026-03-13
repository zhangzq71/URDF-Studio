import { GeometryType, type RobotState, type UrdfLink } from '@/types';

function hasRenderableGeometry(link: UrdfLink | undefined): boolean {
  if (!link) {
    return false;
  }

  if (link.visual.type !== GeometryType.NONE) {
    return true;
  }

  if (link.collision.type !== GeometryType.NONE) {
    return true;
  }

  return (link.collisionBodies || []).some((body) => body.type !== GeometryType.NONE);
}

export function isSyntheticWorldRoot(robot: RobotState, linkId: string): boolean {
  if (robot.rootLinkId !== linkId) {
    return false;
  }

  const link = robot.links[linkId];
  if (!link) {
    return false;
  }

  if ((link.name || '').trim().toLowerCase() !== 'world') {
    return false;
  }

  if ((link.inertial?.mass || 0) > 0) {
    return false;
  }

  if (hasRenderableGeometry(link)) {
    return false;
  }

  return Object.values(robot.joints).some((joint) => joint.parentLinkId === linkId);
}

export function getTreeDisplayRootLinkIds(robot: RobotState): string[] {
  if (!isSyntheticWorldRoot(robot, robot.rootLinkId)) {
    return robot.links[robot.rootLinkId] ? [robot.rootLinkId] : [];
  }

  const childRootIds = Object.values(robot.joints)
    .filter((joint) => joint.parentLinkId === robot.rootLinkId)
    .map((joint) => joint.childLinkId)
    .filter((linkId, index, ids) => ids.indexOf(linkId) === index && Boolean(robot.links[linkId]));

  return childRootIds.length > 0 ? childRootIds : [robot.rootLinkId];
}

export function getPrimaryTreeDisplayRootLinkId(robot: RobotState): string | null {
  return getTreeDisplayRootLinkIds(robot)[0] ?? null;
}
