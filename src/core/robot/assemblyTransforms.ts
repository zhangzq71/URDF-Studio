import { DEFAULT_JOINT, DEFAULT_LINK, GeometryType, JointType } from '@/types';
import type {
  AssemblyComponent,
  AssemblyState,
  AssemblyTransform,
  RobotData,
  UrdfJoint,
  UrdfLink,
} from '@/types';
import { mergeAssembly } from './assemblyMerger';

const TRANSFORM_EPSILON = 1e-9;

export const IDENTITY_ASSEMBLY_TRANSFORM: AssemblyTransform = Object.freeze({
  position: { x: 0, y: 0, z: 0 },
  rotation: { r: 0, p: 0, y: 0 },
});

export const ASSEMBLY_EXPORT_ROOT_LINK_ID = '__assembly_root';
const ASSEMBLY_EXPORT_ROOT_JOINT_PREFIX = '__assembly_root_joint_';
const ASSEMBLY_COMPONENT_ROOT_LINK_PREFIX = '__assembly_component_root_';
const ASSEMBLY_COMPONENT_ROOT_JOINT_PREFIX = '__assembly_component_joint_';

export function cloneAssemblyTransform(transform?: AssemblyTransform | null): AssemblyTransform {
  if (!transform) {
    return {
      position: { ...IDENTITY_ASSEMBLY_TRANSFORM.position },
      rotation: { ...IDENTITY_ASSEMBLY_TRANSFORM.rotation },
    };
  }

  return {
    position: {
      x: Number.isFinite(transform.position?.x) ? transform.position.x : 0,
      y: Number.isFinite(transform.position?.y) ? transform.position.y : 0,
      z: Number.isFinite(transform.position?.z) ? transform.position.z : 0,
    },
    rotation: {
      r: Number.isFinite(transform.rotation?.r) ? transform.rotation.r : 0,
      p: Number.isFinite(transform.rotation?.p) ? transform.rotation.p : 0,
      y: Number.isFinite(transform.rotation?.y) ? transform.rotation.y : 0,
    },
  };
}

export function isIdentityAssemblyTransform(transform?: AssemblyTransform | null): boolean {
  if (!transform) {
    return true;
  }

  const normalized = cloneAssemblyTransform(transform);
  return (
    Math.abs(normalized.position.x) <= TRANSFORM_EPSILON &&
    Math.abs(normalized.position.y) <= TRANSFORM_EPSILON &&
    Math.abs(normalized.position.z) <= TRANSFORM_EPSILON &&
    Math.abs(normalized.rotation.r) <= TRANSFORM_EPSILON &&
    Math.abs(normalized.rotation.p) <= TRANSFORM_EPSILON &&
    Math.abs(normalized.rotation.y) <= TRANSFORM_EPSILON
  );
}

export function isAssemblyComponentIndividuallyTransformable(
  assemblyState: AssemblyState | null | undefined,
  componentId: string,
): boolean {
  if (!assemblyState?.components[componentId]) {
    return false;
  }

  return !Object.values(assemblyState.bridges).some(
    (bridge) => bridge.parentComponentId === componentId || bridge.childComponentId === componentId,
  );
}

function createSyntheticTransformLink(id: string, name: string): UrdfLink {
  return {
    ...DEFAULT_LINK,
    id,
    name,
    visual: {
      ...DEFAULT_LINK.visual,
      type: GeometryType.NONE,
      dimensions: { x: 0, y: 0, z: 0 },
    },
    collision: {
      ...DEFAULT_LINK.collision,
      type: GeometryType.NONE,
      dimensions: { x: 0, y: 0, z: 0 },
    },
    inertial: {
      ...DEFAULT_LINK.inertial,
      mass: 0,
      inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
    },
  };
}

function createFixedTransformJoint(
  id: string,
  name: string,
  parentLinkId: string,
  childLinkId: string,
  transform: AssemblyTransform,
): UrdfJoint {
  return {
    ...DEFAULT_JOINT,
    id,
    name,
    type: JointType.FIXED,
    parentLinkId,
    childLinkId,
    origin: {
      xyz: { ...transform.position },
      rpy: { ...transform.rotation },
    },
    axis: undefined,
    limit: undefined,
    dynamics: { damping: 0, friction: 0 },
  };
}

function cloneVisibleAssemblyState(assemblyState: AssemblyState): AssemblyState {
  const clonedAssembly = structuredClone(assemblyState);
  const visibleComponents = Object.fromEntries(
    Object.entries(clonedAssembly.components).filter(
      ([, component]) => component.visible !== false,
    ),
  );
  const visibleComponentIds = new Set(Object.keys(visibleComponents));
  const visibleBridges = Object.fromEntries(
    Object.entries(clonedAssembly.bridges).filter(
      ([, bridge]) =>
        visibleComponentIds.has(bridge.parentComponentId) &&
        visibleComponentIds.has(bridge.childComponentId),
    ),
  );

  return {
    ...clonedAssembly,
    components: visibleComponents,
    bridges: visibleBridges,
  };
}

function buildRootLinkComponentMap(
  components: Record<string, AssemblyComponent>,
): Map<string, string> {
  const map = new Map<string, string>();
  Object.values(components).forEach((component) => {
    Object.keys(component.robot.links).forEach((linkId) => {
      map.set(linkId, component.id);
    });
  });
  return map;
}

function collectTopLevelRootLinkIds(robot: RobotData): string[] {
  const childLinkIds = new Set<string>();
  Object.values(robot.joints).forEach((joint) => {
    childLinkIds.add(joint.childLinkId);
  });

  return Object.keys(robot.links).filter((linkId) => !childLinkIds.has(linkId));
}

export function buildExportableAssemblyRobotData(assemblyState: AssemblyState): RobotData {
  const visibleAssembly = cloneVisibleAssemblyState(assemblyState);
  const linkToComponentId = buildRootLinkComponentMap(visibleAssembly.components);

  Object.values(visibleAssembly.components).forEach((component) => {
    if (!isAssemblyComponentIndividuallyTransformable(visibleAssembly, component.id)) {
      return;
    }

    if (isIdentityAssemblyTransform(component.transform)) {
      return;
    }

    const componentRootLinkId = component.robot.rootLinkId;
    const wrapperRootLinkId = `${ASSEMBLY_COMPONENT_ROOT_LINK_PREFIX}${component.id}`;
    const wrapperJointId = `${ASSEMBLY_COMPONENT_ROOT_JOINT_PREFIX}${component.id}`;
    const wrapperTransform = cloneAssemblyTransform(component.transform);

    component.robot = {
      ...component.robot,
      links: {
        ...component.robot.links,
        [wrapperRootLinkId]: createSyntheticTransformLink(wrapperRootLinkId, wrapperRootLinkId),
      },
      joints: {
        ...component.robot.joints,
        [wrapperJointId]: createFixedTransformJoint(
          wrapperJointId,
          wrapperJointId,
          wrapperRootLinkId,
          componentRootLinkId,
          wrapperTransform,
        ),
      },
      rootLinkId: wrapperRootLinkId,
    };
    linkToComponentId.set(wrapperRootLinkId, component.id);
  });

  const mergedRobot = mergeAssembly(visibleAssembly);
  if (isIdentityAssemblyTransform(visibleAssembly.transform)) {
    return mergedRobot;
  }

  const assemblyTransform = cloneAssemblyTransform(visibleAssembly.transform);
  const topLevelRootLinkIds = collectTopLevelRootLinkIds(mergedRobot);
  if (topLevelRootLinkIds.length === 0) {
    return mergedRobot;
  }

  const links: Record<string, UrdfLink> = {
    ...mergedRobot.links,
    [ASSEMBLY_EXPORT_ROOT_LINK_ID]: createSyntheticTransformLink(
      ASSEMBLY_EXPORT_ROOT_LINK_ID,
      ASSEMBLY_EXPORT_ROOT_LINK_ID,
    ),
  };
  const joints: Record<string, UrdfJoint> = {
    ...mergedRobot.joints,
  };

  topLevelRootLinkIds.forEach((rootLinkId) => {
    const componentId = linkToComponentId.get(rootLinkId) ?? rootLinkId;
    const wrapperJointId = `${ASSEMBLY_EXPORT_ROOT_JOINT_PREFIX}${componentId}`;
    joints[wrapperJointId] = createFixedTransformJoint(
      wrapperJointId,
      wrapperJointId,
      ASSEMBLY_EXPORT_ROOT_LINK_ID,
      rootLinkId,
      assemblyTransform,
    );
  });

  return {
    ...mergedRobot,
    links,
    joints,
    rootLinkId: ASSEMBLY_EXPORT_ROOT_LINK_ID,
  };
}
