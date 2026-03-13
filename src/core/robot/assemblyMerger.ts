/**
 * Assembly Merger - Merges AssemblyState into a single RobotData
 * Used for rendering and URDF export
 */
import type { AssemblyState, RobotData, UrdfJoint } from '@/types';

export function mergeAssembly(assembly: AssemblyState): RobotData {
  const links: RobotData['links'] = {};
  const joints: RobotData['joints'] = {};
  const materials: RobotData['materials'] = {};
  let rootLinkId = '';

  const comps = Object.values(assembly.components).filter(c => c.visible !== false);
  const visibleCompIds = new Set(comps.map(c => c.id));
  if (comps.length === 0) {
    return {
      name: assembly.name,
      links: {},
      joints: {},
      rootLinkId: '',
    };
  }

  // 1. Merge all component links/joints (already prefixed)
  for (const comp of comps) {
    for (const [id, link] of Object.entries(comp.robot.links)) {
      links[id] = { ...link };
    }
    for (const [id, joint] of Object.entries(comp.robot.joints)) {
      joints[id] = { ...joint };
    }
    if (comp.robot.materials) {
      Object.assign(materials, comp.robot.materials);
    }
    if (!rootLinkId) {
      rootLinkId = comp.robot.rootLinkId;
    }
  }

  // 2. Add bridge joints (parentLinkId/childLinkId are prefixed ids from component.robot)
  for (const bridge of Object.values(assembly.bridges)) {
    // Only add bridge if both components are visible
    if (!visibleCompIds.has(bridge.parentComponentId) || !visibleCompIds.has(bridge.childComponentId)) {
      continue;
    }

    const j = bridge.joint;
    const parentId = bridge.parentLinkId.startsWith(bridge.parentComponentId + '_')
      ? bridge.parentLinkId
      : bridge.parentComponentId + '_' + bridge.parentLinkId;
    const childId = bridge.childLinkId.startsWith(bridge.childComponentId + '_')
      ? bridge.childLinkId
      : bridge.childComponentId + '_' + bridge.childLinkId;

    if (!links[parentId] || !links[childId]) continue;

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

  return {
    name: assembly.name,
    links,
    joints,
    rootLinkId,
    materials: Object.keys(materials).length > 0 ? materials : undefined,
  };
}
