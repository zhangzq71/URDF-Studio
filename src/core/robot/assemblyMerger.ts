/**
 * Assembly Merger - Merges AssemblyState into a single RobotData
 * Used for rendering and URDF export
 */
import type { AssemblyState, RobotClosedLoopConstraint, RobotData, UrdfJoint } from '@/types';

import { rerootAssemblyComponentRobot } from './assemblyReroot';

function resolveAssemblyBridgeLinkId(
  componentId: string,
  robot: RobotData,
  linkId: string,
): string | null {
  if (robot.links[linkId]) {
    return linkId;
  }

  const namespacedLinkId = `${componentId}_${linkId}`;
  if (robot.links[namespacedLinkId]) {
    return namespacedLinkId;
  }

  return null;
}

function requireAssemblyBridgeLinkId(
  assemblyName: string,
  bridgeId: string,
  bridgeSide: 'parent' | 'child',
  componentId: string,
  robot: RobotData,
  linkId: string,
): string {
  const resolvedLinkId = resolveAssemblyBridgeLinkId(componentId, robot, linkId);
  if (resolvedLinkId) {
    return resolvedLinkId;
  }

  throw new Error(
    `Cannot merge assembly "${assemblyName}" because bridge "${bridgeId}" references missing ${bridgeSide} link "${linkId}" on component "${componentId}"`,
  );
}

function assertMergedLinksHaveSingleParentJoint(
  assemblyName: string,
  joints: RobotData['joints'],
): void {
  const incomingJointIdsByChildLinkId = new Map<string, string[]>();

  Object.values(joints).forEach((joint) => {
    const incomingJointIds = incomingJointIdsByChildLinkId.get(joint.childLinkId) ?? [];
    incomingJointIds.push(joint.id);
    incomingJointIdsByChildLinkId.set(joint.childLinkId, incomingJointIds);
  });

  for (const [childLinkId, incomingJointIds] of incomingJointIdsByChildLinkId.entries()) {
    if (incomingJointIds.length <= 1) {
      continue;
    }

    throw new Error(
      `Cannot merge assembly "${assemblyName}" because link "${childLinkId}" would have multiple parent joints: ${incomingJointIds.join(', ')}`,
    );
  }
}

export function mergeAssembly(assembly: AssemblyState): RobotData {
  const links: RobotData['links'] = {};
  const joints: RobotData['joints'] = {};
  const materials: RobotData['materials'] = {};
  const closedLoopConstraints: RobotClosedLoopConstraint[] = [];
  const componentVersions = new Set<string>();
  const effectiveRobotByComponentId = new Map<string, RobotData>();
  let fallbackRootLinkId = '';

  const comps = Object.values(assembly.components).filter((c) => c.visible !== false);
  const visibleCompIds = new Set(comps.map((c) => c.id));
  if (comps.length === 0) {
    return {
      name: assembly.name,
      links: {},
      joints: {},
      rootLinkId: '',
    };
  }

  comps.forEach((component) => {
    effectiveRobotByComponentId.set(component.id, component.robot);
  });

  for (const bridge of Object.values(assembly.bridges)) {
    if (
      !visibleCompIds.has(bridge.parentComponentId) ||
      !visibleCompIds.has(bridge.childComponentId)
    ) {
      continue;
    }

    const childRobot = effectiveRobotByComponentId.get(bridge.childComponentId);
    if (!childRobot) {
      throw new Error(
        `Cannot merge assembly "${assembly.name}" because bridge "${bridge.id}" references missing child component "${bridge.childComponentId}"`,
      );
    }

    const resolvedChildLinkId = requireAssemblyBridgeLinkId(
      assembly.name,
      bridge.id,
      'child',
      bridge.childComponentId,
      childRobot,
      bridge.childLinkId,
    );
    if (resolvedChildLinkId === childRobot.rootLinkId) {
      continue;
    }

    effectiveRobotByComponentId.set(
      bridge.childComponentId,
      rerootAssemblyComponentRobot(childRobot, resolvedChildLinkId, bridge.childComponentId),
    );
  }

  // 1. Merge all component links/joints (already prefixed)
  for (const comp of comps) {
    const robot = effectiveRobotByComponentId.get(comp.id) ?? comp.robot;
    const version = robot.version?.trim();
    if (version) {
      componentVersions.add(version);
    }
    for (const [id, link] of Object.entries(robot.links)) {
      links[id] = link;
    }
    for (const [id, joint] of Object.entries(robot.joints)) {
      joints[id] = joint;
    }
    closedLoopConstraints.push(...(robot.closedLoopConstraints || []));
    if (robot.materials) {
      Object.assign(materials, robot.materials);
    }
    if (!fallbackRootLinkId) {
      fallbackRootLinkId = robot.rootLinkId;
    }
  }

  // 2. Add bridge joints (parentLinkId/childLinkId are prefixed ids from component.robot)
  for (const bridge of Object.values(assembly.bridges)) {
    // Only add bridge if both components are visible
    if (
      !visibleCompIds.has(bridge.parentComponentId) ||
      !visibleCompIds.has(bridge.childComponentId)
    ) {
      continue;
    }

    const j = bridge.joint;
    const parentRobot =
      effectiveRobotByComponentId.get(bridge.parentComponentId) ??
      assembly.components[bridge.parentComponentId]?.robot;
    const childRobot =
      effectiveRobotByComponentId.get(bridge.childComponentId) ??
      assembly.components[bridge.childComponentId]?.robot;
    if (!parentRobot) {
      throw new Error(
        `Cannot merge assembly "${assembly.name}" because bridge "${bridge.id}" references missing parent component "${bridge.parentComponentId}"`,
      );
    }
    if (!childRobot) {
      throw new Error(
        `Cannot merge assembly "${assembly.name}" because bridge "${bridge.id}" references missing child component "${bridge.childComponentId}"`,
      );
    }

    const parentId = requireAssemblyBridgeLinkId(
      assembly.name,
      bridge.id,
      'parent',
      bridge.parentComponentId,
      parentRobot,
      bridge.parentLinkId,
    );
    const childId = requireAssemblyBridgeLinkId(
      assembly.name,
      bridge.id,
      'child',
      bridge.childComponentId,
      childRobot,
      bridge.childLinkId,
    );

    if (!links[parentId]) {
      throw new Error(
        `Cannot merge assembly "${assembly.name}" because resolved parent link "${parentId}" for bridge "${bridge.id}" is not present in merged links`,
      );
    }
    if (!links[childId]) {
      throw new Error(
        `Cannot merge assembly "${assembly.name}" because resolved child link "${childId}" for bridge "${bridge.id}" is not present in merged links`,
      );
    }

    const jointId = bridge.id;
    const fullJoint: UrdfJoint = {
      ...j,
      id: jointId,
      name: bridge.name,
      parentLinkId: parentId,
      childLinkId: childId,
    };
    joints[jointId] = fullJoint;
  }

  assertMergedLinksHaveSingleParentJoint(assembly.name, joints);

  const childLinkIds = new Set<string>();
  Object.values(joints).forEach((joint) => {
    childLinkIds.add(joint.childLinkId);
  });

  const graphRootLinkIds = Object.keys(links).filter((linkId) => !childLinkIds.has(linkId));
  if (Object.keys(links).length > 0 && graphRootLinkIds.length === 0) {
    throw new Error(
      `Cannot merge assembly "${assembly.name}" because the merged joint graph has no root link; the assembly contains a cycle`,
    );
  }

  const graphRootLinkId = graphRootLinkIds[0] ?? '';
  const rootLinkId =
    graphRootLinkId ||
    (fallbackRootLinkId && links[fallbackRootLinkId] ? fallbackRootLinkId : '') ||
    Object.keys(links)[0] ||
    '';

  return {
    name: assembly.name,
    ...(componentVersions.size === 1 ? { version: Array.from(componentVersions)[0] } : {}),
    links,
    joints,
    rootLinkId,
    materials: Object.keys(materials).length > 0 ? materials : undefined,
    closedLoopConstraints: closedLoopConstraints.length > 0 ? closedLoopConstraints : undefined,
  };
}
