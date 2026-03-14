/**
 * URDF Generator
 * Generates URDF XML format from RobotState
 */

import { RobotState, UrdfLink, UrdfJoint, GeometryType, AssemblyState } from '@/types';
import { mergeAssembly } from '@/core/robot/assemblyMerger';
import {
  MAX_GEOMETRY_DIMENSION_DECIMALS,
  MAX_PROPERTY_DECIMALS,
  formatNumberWithMaxDecimals,
} from '@/core/utils/numberPrecision';
import { normalizeMeshPathForExport } from '../meshPathUtils';

const AXIS_EXPORT_TYPES = new Set(['revolute', 'continuous', 'prismatic', 'planar']);
const FULL_LIMIT_EXPORT_TYPES = new Set(['revolute', 'prismatic']);
const EFFORT_VELOCITY_LIMIT_EXPORT_TYPES = new Set(['continuous']);
const DYNAMICS_EXPORT_TYPES = new Set(['revolute', 'continuous', 'prismatic']);

// Helper to convert hex color to RGBA string
const hexToRgba = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;
    return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} 1.0`;
  }
  return '0.5 0.5 0.5 1.0'; // fallback gray
};

const generateLimitTag = (joint: UrdfJoint, formatScalar: (n: number) => string): string | null => {
  const jointType = String(joint.type).toLowerCase();
  if (FULL_LIMIT_EXPORT_TYPES.has(jointType)) {
    return `    <limit lower="${formatScalar(joint.limit.lower)}" upper="${formatScalar(joint.limit.upper)}" effort="${formatScalar(joint.limit.effort)}" velocity="${formatScalar(joint.limit.velocity)}" />`;
  }
  if (EFFORT_VELOCITY_LIMIT_EXPORT_TYPES.has(jointType)) {
    return `    <limit effort="${formatScalar(joint.limit.effort)}" velocity="${formatScalar(joint.limit.velocity)}" />`;
  }
  return null;
};

const generateCollisionElement = (
  collision: UrdfLink['collision'],
  vecStr: (v: { x: number; y: number; z: number }) => string,
  rotStr: (v: { r: number; p: number; y: number }) => string,
  formatShape: (n: number) => string,
  exportRobotName: string,
  useRelativePaths: boolean = false,
  preserveMeshPaths: boolean = false,
): string => {
  if (!collision || collision.type === GeometryType.NONE) return '';

  let xml = `    <collision>\n`;
  if (collision.origin) {
    xml += `      <origin xyz="${vecStr(collision.origin.xyz)}" rpy="${rotStr(collision.origin.rpy)}" />\n`;
  }
  xml += `      <geometry>\n`;
  if (collision.type === GeometryType.BOX) {
    xml += `        <box size="${vecStr(collision.dimensions)}" />\n`;
  } else if (collision.type === GeometryType.CYLINDER) {
    xml += `        <cylinder radius="${formatShape(collision.dimensions.x)}" length="${formatShape(collision.dimensions.y)}" />\n`;
  } else if (collision.type === GeometryType.SPHERE) {
    xml += `        <sphere radius="${formatShape(collision.dimensions.x)}" />\n`;
  } else if (collision.type === GeometryType.CAPSULE) {
    xml += `        <capsule radius="${formatShape(collision.dimensions.x)}" length="${formatShape(collision.dimensions.y)}" />\n`;
  } else if (collision.type === GeometryType.MESH) {
    const meshPath = collision.meshPath
      ? (preserveMeshPaths
        ? collision.meshPath.replace(/\\/g, '/')
        : normalizeMeshPathForExport(collision.meshPath))
      : 'part_collision.stl';
    const filename = preserveMeshPaths
      ? (meshPath || 'part_collision.stl')
      : useRelativePaths
        ? `meshes/${meshPath || 'part_collision.stl'}`
        : `package://${exportRobotName}/meshes/${meshPath || 'part_collision.stl'}`;
    xml += `        <mesh filename="${filename}" />\n`;
  }
  xml += `      </geometry>\n`;
  xml += `    </collision>\n`;

  return xml;
};

export interface UrdfGeneratorOptions {
  extended?: boolean;
  useRelativePaths?: boolean;
  preserveMeshPaths?: boolean;
}

export const generateAssemblyURDF = (assembly: AssemblyState, options: UrdfGeneratorOptions = {}): string => {
  const mergedData = mergeAssembly(assembly);
  return generateURDF(mergedData as unknown as RobotState, options);
};

export const generateURDF = (robot: RobotState, options: UrdfGeneratorOptions | boolean = false): string => {
  // Backward compat: accept boolean as legacy `extended` param
  const opts: UrdfGeneratorOptions = typeof options === 'boolean' ? { extended: options } : options;
  const extended = opts.extended ?? false;
  const useRelativePaths = opts.useRelativePaths ?? false;
  const preserveMeshPaths = opts.preserveMeshPaths ?? false;
  const { name, links, joints } = robot;
  const exportRobotName = name?.trim() ? name : 'robot';

  let xml = `<?xml version="1.0"?>\n<robot name="${name}">\n\n`;

  // Helper to format numbers
  const formatScalar = (n: number) => formatNumberWithMaxDecimals(n, MAX_PROPERTY_DECIMALS);
  const formatShape = (n: number) => formatNumberWithMaxDecimals(n, MAX_GEOMETRY_DIMENSION_DECIMALS);
  const vecStr = (v: { x: number; y: number; z: number }) => `${formatScalar(v.x)} ${formatScalar(v.y)} ${formatScalar(v.z)}`;
  const rotStr = (v: { r: number; p: number; y: number }) => `${formatScalar(v.r)} ${formatScalar(v.p)} ${formatScalar(v.y)}`;

  // Generate Links
  Object.values(links).forEach((link) => {
    xml += `  <link name="${link.name}">\n`;

    // Visual
    if (link.visual.type !== GeometryType.NONE) {
        xml += `    <visual>\n`;
        if (link.visual.origin) {
            xml += `      <origin xyz="${vecStr(link.visual.origin.xyz)}" rpy="${rotStr(link.visual.origin.rpy)}" />\n`;
        }

        xml += `      <geometry>\n`;
        if (link.visual.type === GeometryType.BOX) {
          xml += `        <box size="${vecStr(link.visual.dimensions)}" />\n`;
        } else if (link.visual.type === GeometryType.CYLINDER) {
          xml += `        <cylinder radius="${formatShape(link.visual.dimensions.x)}" length="${formatShape(link.visual.dimensions.y)}" />\n`;
        } else if (link.visual.type === GeometryType.SPHERE) {
          xml += `        <sphere radius="${formatShape(link.visual.dimensions.x)}" />\n`;
        } else if (link.visual.type === GeometryType.CAPSULE) {
          xml += `        <capsule radius="${formatShape(link.visual.dimensions.x)}" length="${formatShape(link.visual.dimensions.y)}" />\n`;
        } else if (link.visual.type === GeometryType.MESH) {
           const meshPath = link.visual.meshPath
             ? (preserveMeshPaths
               ? link.visual.meshPath.replace(/\\/g, '/')
               : normalizeMeshPathForExport(link.visual.meshPath))
             : 'part.stl';
           const filename = preserveMeshPaths
             ? (meshPath || 'part.stl')
             : useRelativePaths
               ? `meshes/${meshPath || 'part.stl'}`
               : `package://${exportRobotName}/meshes/${meshPath || 'part.stl'}`;
           xml += `        <mesh filename="${filename}" />\n`;
        }
        xml += `      </geometry>\n`;
        xml += `      <material name="${link.id}_mat">\n`;
        xml += `        <color rgba="${hexToRgba(link.visual.color || '#808080')}"/>\n`;
        xml += `      </material>\n`;
        xml += `    </visual>\n`;
    }

    // Collision (primary + additional bodies on the same link)
    xml += generateCollisionElement(
      link.collision,
      vecStr,
      rotStr,
      formatShape,
      exportRobotName,
      useRelativePaths,
      preserveMeshPaths,
    );
    (link.collisionBodies || []).forEach((collisionBody: UrdfLink['collision']) => {
      xml += generateCollisionElement(
        collisionBody,
        vecStr,
        rotStr,
        formatShape,
        exportRobotName,
        useRelativePaths,
        preserveMeshPaths,
      );
    });

    // Inertial
    xml += `    <inertial>\n`;
    if (link.inertial.origin) {
      xml += `      <origin xyz="${vecStr(link.inertial.origin.xyz)}" rpy="${rotStr(link.inertial.origin.rpy)}" />\n`;
    }
    xml += `      <mass value="${formatScalar(link.inertial.mass)}" />\n`;
    xml += `      <inertia ixx="${formatScalar(link.inertial.inertia.ixx)}" ixy="${formatScalar(link.inertial.inertia.ixy)}" ixz="${formatScalar(link.inertial.inertia.ixz)}" iyy="${formatScalar(link.inertial.inertia.iyy)}" iyz="${formatScalar(link.inertial.inertia.iyz)}" izz="${formatScalar(link.inertial.inertia.izz)}" />\n`;
    xml += `    </inertial>\n`;
    xml += `  </link>\n\n`;
  });

  // Generate Joints
  Object.values(joints).forEach((joint) => {
    const parent = links[joint.parentLinkId];
    const child = links[joint.childLinkId];
    if (!parent || !child) return;
    const jointType = String(joint.type).toLowerCase();

    xml += `  <joint name="${joint.name}" type="${joint.type}">\n`;
    xml += `    <parent link="${parent.name}" />\n`;
    xml += `    <child link="${child.name}" />\n`;
    xml += `    <origin xyz="${vecStr(joint.origin.xyz)}" rpy="${rotStr(joint.origin.rpy)}" />\n`;
    if (AXIS_EXPORT_TYPES.has(jointType)) {
        xml += `    <axis xyz="${vecStr(joint.axis)}" />\n`;
    }

    const limitTag = generateLimitTag(joint, formatScalar);
    if (limitTag) {
        xml += `${limitTag}\n`;
    }

    if (DYNAMICS_EXPORT_TYPES.has(jointType)) {
        if (joint.dynamics && (joint.dynamics.damping !== 0 || joint.dynamics.friction !== 0)) {
            xml += `    <dynamics damping="${formatScalar(joint.dynamics.damping)}" friction="${formatScalar(joint.dynamics.friction)}" />\n`;
        }
    }

    if (DYNAMICS_EXPORT_TYPES.has(jointType)) {
        // Extended Hardware Info
        if (extended && joint.hardware) {
            xml += `    <hardware>\n`;
            if (joint.hardware.motorType) xml += `      <motorType>${joint.hardware.motorType}</motorType>\n`;
            if (joint.hardware.motorId) xml += `      <motorId>${joint.hardware.motorId}</motorId>\n`;
            if (joint.hardware.motorDirection) xml += `      <motorDirection>${joint.hardware.motorDirection}</motorDirection>\n`;
            if (joint.hardware.armature !== undefined) xml += `      <armature>${formatScalar(joint.hardware.armature)}</armature>\n`;
            xml += `    </hardware>\n`;
        }
    }
    xml += `  </joint>\n\n`;
  });

  xml += `</robot>`;
  return xml;
};

export type RosHardwareInterface = 'effort' | 'position' | 'velocity';

/**
 * Generate ROS1 <transmission> tags for non-fixed joints.
 * These are appended inside the <robot> element before the closing tag.
 */
export const generateRos1Transmissions = (
  robot: RobotState,
  hwInterface: RosHardwareInterface = 'effort',
): string => {
  const { joints } = robot;
  const ifName = hwInterface === 'effort'
    ? 'hardware_interface/EffortJointInterface'
    : hwInterface === 'position'
    ? 'hardware_interface/PositionJointInterface'
    : 'hardware_interface/VelocityJointInterface';

  let xml = '';
  Object.values(joints).forEach((j) => {
    const jType = String(j.type).toLowerCase();
    if (jType === 'fixed') return;
    xml += `  <transmission name="${j.name}_trans">\n`;
    xml += `    <type>transmission_interface/SimpleTransmission</type>\n`;
    xml += `    <joint name="${j.name}">\n`;
    xml += `      <hardwareInterface>${ifName}</hardwareInterface>\n`;
    xml += `    </joint>\n`;
    xml += `    <actuator name="${j.name}_motor">\n`;
    xml += `      <hardwareInterface>${ifName}</hardwareInterface>\n`;
    xml += `      <mechanicalReduction>1</mechanicalReduction>\n`;
    xml += `    </actuator>\n`;
    xml += `  </transmission>\n\n`;
  });
  return xml;
};

/**
 * Generate ROS2 <ros2_control> block + Gazebo plugin tag.
 * These are appended inside the <robot> element before the closing tag.
 */
export const generateRos2Control = (
  robot: RobotState,
  hwInterface: RosHardwareInterface = 'effort',
  robotName?: string,
): string => {
  const { joints, name } = robot;
  const ctrlName = robotName || name || 'robot';
  const cmdIf = hwInterface === 'position' ? 'position' : hwInterface === 'velocity' ? 'velocity' : 'effort';

  let xml = `  <ros2_control name="${ctrlName}" type="system">\n`;
  xml += `    <hardware>\n`;
  xml += `      <plugin>mock_components/GenericSystem</plugin>\n`;
  xml += `    </hardware>\n`;

  Object.values(joints).forEach((j) => {
    const jType = String(j.type).toLowerCase();
    if (jType === 'fixed') return;
    xml += `    <joint name="${j.name}">\n`;
    xml += `      <command_interface name="${cmdIf}"/>\n`;
    xml += `      <state_interface name="position"/>\n`;
    xml += `      <state_interface name="velocity"/>\n`;
    if (cmdIf === 'effort') {
      xml += `      <state_interface name="effort"/>\n`;
    }
    xml += `    </joint>\n`;
  });

  xml += `  </ros2_control>\n\n`;

  xml += `  <gazebo>\n`;
  xml += `    <plugin name="gazebo_ros2_control" filename="libgazebo_ros2_control.so">\n`;
  xml += `      <robot_sim_type>gazebo_ros2_control/GazeboSystem</robot_sim_type>\n`;
  xml += `    </plugin>\n`;
  xml += `  </gazebo>\n`;

  return xml;
};

/**
 * Inject ROS1 or ROS2 Gazebo tags into an already-generated URDF string.
 * Inserts the extra XML just before the closing </robot> tag.
 */
export const injectGazeboTags = (
  urdfXml: string,
  robot: RobotState,
  rosVersion: 'ros1' | 'ros2',
  hwInterface: RosHardwareInterface = 'effort',
): string => {
  const extra = rosVersion === 'ros1'
    ? generateRos1Transmissions(robot, hwInterface)
    : generateRos2Control(robot, hwInterface);
  return urdfXml.replace(/(<\/robot>)\s*$/, `\n${extra}</robot>`);
};
