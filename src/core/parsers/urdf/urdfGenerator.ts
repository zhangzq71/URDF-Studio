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
import { normalizeMeshPathForExport, normalizeTexturePathForExport } from '../meshPathUtils';
import { formatUrdfMeshScaleAttribute } from './meshScale';

const AXIS_EXPORT_TYPES = new Set(['revolute', 'continuous', 'prismatic', 'planar']);
const FULL_LIMIT_EXPORT_TYPES = new Set(['revolute', 'prismatic']);
const EFFORT_VELOCITY_LIMIT_EXPORT_TYPES = new Set(['continuous']);
const DYNAMICS_EXPORT_TYPES = new Set(['revolute', 'continuous', 'prismatic']);

const hasExportableInertial = (link: UrdfLink): boolean => Boolean(link.inertial);

// Bias each serialized color channel by a tiny positive epsilon before converting
// to floats. The importer currently floors `rgba * 255`, so a direct decimal
// expansion of `channel / 255` can still fall just below the intended 8-bit value
// after parsing. Keeping the bias far below one full color step preserves the
// visual result while making roundtrips stable.
const hexToRgba = (hex: string): string => {
  const normalized = String(hex || '').trim();
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(normalized);
  if (result) {
    const serializeChannel = (channelHex: string) => {
      const channel = parseInt(channelHex, 16);
      return Math.min(1, (channel + 1e-3) / 255).toFixed(8);
    };

    const r = serializeChannel(result[1]);
    const g = serializeChannel(result[2]);
    const b = serializeChannel(result[3]);
    const a = result[4] ? serializeChannel(result[4]) : '1.00000000';
    return `${r} ${g} ${b} ${a}`;
  }
  return '0.5 0.5 0.5 1.0'; // fallback gray
};

function resolveLinkExportMaterial(
  robot: RobotState,
  link: UrdfLink,
): { color?: string; texture?: string } {
  const material = robot.materials?.[link.id] || robot.materials?.[link.name];
  return {
    color: material?.color || link.visual.color,
    texture: material?.texture,
  };
}

const generateLimitTag = (joint: UrdfJoint, formatScalar: (n: number) => string): string | null => {
  const jointType = String(joint.type).toLowerCase();
  if (!joint.limit) {
    return null;
  }
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
    const scaleAttribute = formatUrdfMeshScaleAttribute(collision.dimensions, formatShape);
    xml += `        <mesh filename="${filename}"${scaleAttribute} />\n`;
  }
  xml += `      </geometry>\n`;
  xml += `    </collision>\n`;

  return xml;
};

export interface UrdfGeneratorOptions {
  extended?: boolean;
  includeHardware?: 'never' | 'auto' | 'always';
  useRelativePaths?: boolean;
  preserveMeshPaths?: boolean;
  omitMeshMaterialPaths?: Iterable<string>;
}

const DEFAULT_PARSED_HARDWARE = {
  armature: 0,
  motorType: 'None',
  motorId: '',
  motorDirection: 1 as 1 | -1,
};

const hasExportableHardware = (joint: UrdfJoint): boolean => {
  const hardware = joint.hardware;
  if (!hardware) return false;

  return (
    (hardware.motorType?.trim() ?? '') !== DEFAULT_PARSED_HARDWARE.motorType
    || (hardware.motorId?.trim() ?? '') !== DEFAULT_PARSED_HARDWARE.motorId
    || (hardware.motorDirection ?? DEFAULT_PARSED_HARDWARE.motorDirection) !== DEFAULT_PARSED_HARDWARE.motorDirection
    || (hardware.armature ?? DEFAULT_PARSED_HARDWARE.armature) !== DEFAULT_PARSED_HARDWARE.armature
  );
};

export const generateAssemblyURDF = (assembly: AssemblyState, options: UrdfGeneratorOptions = {}): string => {
  const mergedData = mergeAssembly(assembly);
  return generateURDF(mergedData as unknown as RobotState, options);
};

export const generateURDF = (robot: RobotState, options: UrdfGeneratorOptions | boolean = false): string => {
  // Backward compat: accept boolean as legacy `extended` param
  const opts: UrdfGeneratorOptions = typeof options === 'boolean' ? { extended: options } : options;
  const hardwareMode = opts.includeHardware ?? ((opts.extended ?? false) ? 'always' : 'never');
  const useRelativePaths = opts.useRelativePaths ?? false;
  const preserveMeshPaths = opts.preserveMeshPaths ?? false;
  const omitMeshMaterialPaths = opts.omitMeshMaterialPaths
    ? new Set(Array.from(opts.omitMeshMaterialPaths, (path) => String(path || '').replace(/\\/g, '/')))
    : null;
  const { name, links, joints } = robot;
  const exportRobotName = name?.trim() ? name : 'robot';

  let xml = `<?xml version="1.0"?>\n<robot name="${name}">\n\n`;

  // Helper to format numbers
  const formatScalar = (n: number) => formatNumberWithMaxDecimals(n, MAX_PROPERTY_DECIMALS);
  const formatShape = (n: number) => formatNumberWithMaxDecimals(n, MAX_GEOMETRY_DIMENSION_DECIMALS);
  const vecStr = (v: { x: number; y: number; z: number }) => `${formatScalar(v.x)} ${formatScalar(v.y)} ${formatScalar(v.z)}`;
  const rotStr = (v: { r: number; p: number; y: number }) => `${formatScalar(v.r)} ${formatScalar(v.p)} ${formatScalar(v.y)}`;
  const shouldOmitMeshMaterial = (meshPath?: string): boolean => {
    if (!omitMeshMaterialPaths || !meshPath) {
      return false;
    }

    const normalizedPath = meshPath.replace(/\\/g, '/');
    if (omitMeshMaterialPaths.has(normalizedPath)) {
      return true;
    }

    const exportPath = normalizeMeshPathForExport(meshPath);
    return Boolean(exportPath && omitMeshMaterialPaths.has(exportPath));
  };

  // Generate Links
  Object.values(links).forEach((link) => {
    xml += `  <link name="${link.name}">\n`;

    // Visual
    if (link.visual.type !== GeometryType.NONE) {
        const visualMaterial = resolveLinkExportMaterial(robot, link);
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
           const scaleAttribute = formatUrdfMeshScaleAttribute(link.visual.dimensions, formatShape);
           xml += `        <mesh filename="${filename}"${scaleAttribute} />\n`;
        }
        xml += `      </geometry>\n`;
        const shouldEmitVisualColor = !(
          link.visual.type === GeometryType.MESH
          && shouldOmitMeshMaterial(link.visual.meshPath)
        );
        if ((shouldEmitVisualColor && visualMaterial.color) || visualMaterial.texture) {
          xml += `      <material name="${link.id}_mat">\n`;
          if (shouldEmitVisualColor && visualMaterial.color) {
            xml += `        <color rgba="${hexToRgba(visualMaterial.color)}"/>\n`;
          }
          if (visualMaterial.texture) {
            const texturePath = preserveMeshPaths
              ? visualMaterial.texture.replace(/\\/g, '/')
              : normalizeTexturePathForExport(visualMaterial.texture);
            const textureFilename = preserveMeshPaths
              ? texturePath
              : useRelativePaths
                ? `textures/${texturePath || 'texture.png'}`
                : `package://${exportRobotName}/textures/${texturePath || 'texture.png'}`;
            xml += `        <texture filename="${textureFilename}" />\n`;
          }
          xml += `      </material>\n`;
        }
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
    if (hasExportableInertial(link) && link.inertial) {
      xml += `    <inertial>\n`;
      if (link.inertial.origin) {
        xml += `      <origin xyz="${vecStr(link.inertial.origin.xyz)}" rpy="${rotStr(link.inertial.origin.rpy)}" />\n`;
      }
      xml += `      <mass value="${formatScalar(link.inertial.mass)}" />\n`;
      xml += `      <inertia ixx="${formatScalar(link.inertial.inertia.ixx)}" ixy="${formatScalar(link.inertial.inertia.ixy)}" ixz="${formatScalar(link.inertial.inertia.ixz)}" iyy="${formatScalar(link.inertial.inertia.iyy)}" iyz="${formatScalar(link.inertial.inertia.iyz)}" izz="${formatScalar(link.inertial.inertia.izz)}" />\n`;
      xml += `    </inertial>\n`;
    }
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
    if (AXIS_EXPORT_TYPES.has(jointType) && joint.axis) {
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
        const shouldExportHardware = joint.hardware
          && (
            hardwareMode === 'always'
            || (hardwareMode === 'auto' && hasExportableHardware(joint))
          );

        if (shouldExportHardware) {
            xml += `    <hardware>\n`;
            if (joint.hardware.motorType) xml += `      <motorType>${joint.hardware.motorType}</motorType>\n`;
            if (joint.hardware.motorId) xml += `      <motorId>${joint.hardware.motorId}</motorId>\n`;
            if (joint.hardware.motorDirection) xml += `      <motorDirection>${joint.hardware.motorDirection}</motorDirection>\n`;
            if (joint.hardware.armature !== undefined) xml += `      <armature>${formatScalar(joint.hardware.armature)}</armature>\n`;
            xml += `    </hardware>\n`;
        }
    }

    if (joint.mimic?.joint) {
        const mimicAttributes = [`joint="${joint.mimic.joint}"`];
        if (typeof joint.mimic.multiplier === 'number' && Number.isFinite(joint.mimic.multiplier)) {
          mimicAttributes.push(`multiplier="${formatScalar(joint.mimic.multiplier)}"`);
        }
        if (typeof joint.mimic.offset === 'number' && Number.isFinite(joint.mimic.offset)) {
          mimicAttributes.push(`offset="${formatScalar(joint.mimic.offset)}"`);
        }
        xml += `    <mimic ${mimicAttributes.join(' ')} />\n`;
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
