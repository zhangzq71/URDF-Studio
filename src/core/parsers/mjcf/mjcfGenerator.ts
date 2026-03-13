/**
 * MuJoCo XML Generator
 * Generates MuJoCo MJCF format from RobotState
 */

import * as THREE from 'three';
import { RobotState, GeometryType, JointType, UrdfLink } from '@/types';
import {
  MAX_GEOMETRY_DIMENSION_DECIMALS,
  MAX_PROPERTY_DECIMALS,
  formatNumberWithMaxDecimals,
} from '@/core/utils/numberPrecision';
import { normalizeMeshPathForExport } from '../meshPathUtils';

export type MjcfActuatorType = 'position' | 'velocity' | 'motor';

export interface MujocoExportOptions {
  meshdir?: string;
  addFloatBase?: boolean;
  includeActuators?: boolean;
  actuatorType?: MjcfActuatorType;
}

export const generateMujocoXML = (robot: RobotState, options: MujocoExportOptions = {}): string => {
  const { name, links, joints, rootLinkId } = robot;
  const meshdir = options.meshdir ?? '../meshes/';
  const addFloatBase = options.addFloatBase ?? false;
  const includeActuators = options.includeActuators ?? true;
  const actuatorType = options.actuatorType ?? 'position';

  // Helper to format numbers
  const formatScalar = (n: number) => formatNumberWithMaxDecimals(n, MAX_PROPERTY_DECIMALS);
  const formatShape = (n: number) => formatNumberWithMaxDecimals(n, MAX_GEOMETRY_DIMENSION_DECIMALS);
  const vecStr = (v: { x: number; y: number; z: number }) => `${formatScalar(v.x)} ${formatScalar(v.y)} ${formatScalar(v.z)}`;
  const rotStr = (v: { r: number; p: number; y: number }) => `${formatScalar(v.r)} ${formatScalar(v.p)} ${formatScalar(v.y)}`; // MuJoCo accepts Euler XYZ by default
  const quatStr = (v: { r: number; p: number; y: number }) => {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.r, v.p, v.y, 'ZYX'));
    return `${formatScalar(quaternion.w)} ${formatScalar(quaternion.x)} ${formatScalar(quaternion.y)} ${formatScalar(quaternion.z)}`;
  };

  // Helper to convert hex color to rgba string
  const hexToRgba = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "0.8 0.8 0.8 1.0";
    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;
    return `${formatNumberWithMaxDecimals(r, 4)} ${formatNumberWithMaxDecimals(g, 4)} ${formatNumberWithMaxDecimals(b, 4)} 1.0`;
  };

  // Collect all mesh assets and create stable MJCF mesh names.
  const meshAssets = new Set<string>();
  Object.values(links).forEach(link => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      const meshPath = normalizeMeshPathForExport(link.visual.meshPath);
      if (meshPath) meshAssets.add(meshPath);
    }
    if (link.collision && link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      const meshPath = normalizeMeshPathForExport(link.collision.meshPath);
      if (meshPath) meshAssets.add(meshPath);
    }
    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        const meshPath = normalizeMeshPathForExport(body.meshPath);
        if (meshPath) meshAssets.add(meshPath);
      }
    });
  });

  const meshAssetNameMap = new Map<string, string>();
  const usedAssetNames = new Set<string>();
  const buildMeshAssetName = (meshPath: string): string => {
    const base = meshPath
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '') || 'mesh';

    let candidate = base;
    let i = 2;
    while (usedAssetNames.has(candidate)) {
      candidate = `${base}_${i}`;
      i += 1;
    }
    usedAssetNames.add(candidate);
    return candidate;
  };

  Array.from(meshAssets).forEach((meshPath) => {
    meshAssetNameMap.set(meshPath, buildMeshAssetName(meshPath));
  });

  const resolveMeshAssetName = (meshPath?: string): string | null => {
    if (!meshPath) return null;
    const normalized = normalizeMeshPathForExport(meshPath);
    if (!normalized) return null;
    return meshAssetNameMap.get(normalized) || null;
  };

  const hasGeometry = (link: UrdfLink | undefined): boolean => {
    if (!link) return false;

    const hasVisual = link.visual.type !== GeometryType.NONE;
    const hasCollision = link.collision.type !== GeometryType.NONE;
    const hasExtraCollisions = (link.collisionBodies || []).some((body) => body.type !== GeometryType.NONE);

    return hasVisual || hasCollision || hasExtraCollisions;
  };

  const isSyntheticWorldRoot = (linkId: string): boolean => {
    const link = links[linkId];
    if (!link) return false;

    const normalizedName = (link.name || '').trim().toLowerCase();
    if (normalizedName !== 'world') return false;

    const hasMass = (link.inertial?.mass || 0) > 0;
    return !hasMass && !hasGeometry(link);
  };

  let xml = `<mujoco model="${name}">\n`;
  xml += `  <compiler angle="radian" meshdir="${meshdir}" />\n`;

  // Assets Section
  xml += `  <asset>\n`;
  meshAssets.forEach(mesh => {
    const meshName = meshAssetNameMap.get(mesh) || 'mesh';
    xml += `    <mesh name="${meshName}" file="${mesh}" />\n`;
  });
  xml += `  </asset>\n\n`;

  // Defaults
  xml += `  <default>\n`;
  xml += `    <geom rgba="0.8 0.6 0.4 1"/>\n`;
  xml += `  </default>\n\n`;

  xml += `  <worldbody>\n`;
  xml += `    <light pos="0 0 10" dir="0 0 -1" diffuse="1 1 1"/>\n`;
  xml += `    <geom type="plane" size="5 5 0.1" rgba=".9 .9 .9 1"/>\n`;

  // Recursive Body Builder
  const buildBody = (linkId: string, indent: string, path = new Set<string>()) => {
    const link = links[linkId];
    if (!link) return '';

    if (path.has(linkId)) {
      console.warn(`[MJCFGenerator] Skipping cyclic link reference at "${linkId}"`);
      return '';
    }

    const nextPath = new Set(path);
    nextPath.add(linkId);

    // Find the joint that connects to this link (if not root)
    const parentJoint = Object.values(joints).find(j => j.childLinkId === linkId);

    // If root, pos is 0 0 1 (arbitrary start height), else relative to parent joint origin
    // Note: In MJCF, the body position corresponds to the joint frame if a joint is defined inside.
    // However, URDF defines joint origin relative to parent link.
    // MJCF Hierarchy: ParentBody -> (pos/rot of joint) -> Body -> Joint -> Geoms

    let pos = "0 0 0.5";
    let euler = "0 0 0";

    if (parentJoint) {
      pos = vecStr(parentJoint.origin.xyz);
      euler = rotStr(parentJoint.origin.rpy);
    } else {
        // Root link visual offset usually handled in geom, body at 0,0,0 or slight offset
        pos = "0 0 1";
    }

    let bodyXml = `${indent}<body name="${link.name}" pos="${pos}" euler="${euler}">\n`;

    // 1. Joint Definition (inside the body it belongs to)
    if (parentJoint && parentJoint.type !== JointType.FIXED) {
       let jType = 'hinge';
       if (parentJoint.type === JointType.PRISMATIC) jType = 'slide';
       // continuous is also hinge but without limits (MuJoCo handles limits via 'limited' attr)

       let limitStr = "";
       if (parentJoint.type !== JointType.CONTINUOUS) {
           limitStr = `range="${formatScalar(parentJoint.limit.lower)} ${formatScalar(parentJoint.limit.upper)}"`;
       }

       bodyXml += `${indent}  <joint name="${parentJoint.name}" type="${jType}" axis="${vecStr(parentJoint.axis)}" ${limitStr} damping="${formatScalar(parentJoint.dynamics.damping)}" frictionloss="${formatScalar(parentJoint.dynamics.friction)}"/>\n`;
    }

    // 2. Inertial
    const inertialOrigin = link.inertial.origin || { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } };
    const inertialRPY = inertialOrigin.rpy || { r: 0, p: 0, y: 0 };
    const hasInertialRotation = Math.abs(inertialRPY.r) > 1e-9 || Math.abs(inertialRPY.p) > 1e-9 || Math.abs(inertialRPY.y) > 1e-9;
    const inertia = link.inertial.inertia;
    const hasOffDiagonalInertia = Math.abs(inertia.ixy) > 1e-12 || Math.abs(inertia.ixz) > 1e-12 || Math.abs(inertia.iyz) > 1e-12;
    const inertialTensorAttr = hasOffDiagonalInertia
      ? `fullinertia="${formatScalar(inertia.ixx)} ${formatScalar(inertia.iyy)} ${formatScalar(inertia.izz)} ${formatScalar(inertia.ixy)} ${formatScalar(inertia.ixz)} ${formatScalar(inertia.iyz)}"`
      : `diaginertia="${formatScalar(inertia.ixx)} ${formatScalar(inertia.iyy)} ${formatScalar(inertia.izz)}"`;
    const inertialQuatAttr = hasInertialRotation ? ` quat="${quatStr(inertialRPY)}"` : '';
    bodyXml += `${indent}  <inertial pos="${vecStr(inertialOrigin.xyz || { x: 0, y: 0, z: 0 })}" mass="${formatScalar(link.inertial.mass)}"${inertialQuatAttr} ${inertialTensorAttr}/>\n`;

    // 3. Visual Geom
    // Offset visual geom by its origin
    const v = link.visual;
    if (v.type !== GeometryType.NONE) {
        let vPos = "0 0 0";
        let vEuler = "0 0 0";
        if (v.origin) {
            vPos = vecStr(v.origin.xyz);
            vEuler = rotStr(v.origin.rpy);
        }

        let vGeomAttrs = `pos="${vPos}" euler="${vEuler}" rgba="${hexToRgba(v.color)}" group="1"`;

        if (v.type === GeometryType.BOX) {
            // MuJoCo box size is half-extents
            vGeomAttrs += ` type="box" size="${formatScalar(v.dimensions.x / 2)} ${formatScalar(v.dimensions.y / 2)} ${formatScalar(v.dimensions.z / 2)}"`;
        } else if (v.type === GeometryType.CYLINDER) {
            // MuJoCo cylinder size is radius half-height
            vGeomAttrs += ` type="cylinder" size="${formatShape(v.dimensions.x)} ${formatShape(v.dimensions.y / 2)}"`;
        } else if (v.type === GeometryType.SPHERE) {
            vGeomAttrs += ` type="sphere" size="${formatShape(v.dimensions.x)}"`;
        } else if (v.type === GeometryType.CAPSULE) {
            // MuJoCo capsule size is radius half-height
            vGeomAttrs += ` type="capsule" size="${formatShape(v.dimensions.x)} ${formatShape(v.dimensions.y / 2)}"`;
        } else if (v.type === GeometryType.MESH && v.meshPath) {
            const meshAssetName = resolveMeshAssetName(v.meshPath);
            if (meshAssetName) {
                vGeomAttrs += ` type="mesh" mesh="${meshAssetName}"`;
            } else {
                const fallback = normalizeMeshPathForExport(v.meshPath);
                if (fallback) vGeomAttrs += ` type="mesh" mesh="${fallback}"`;
            }
        }

        bodyXml += `${indent}  <geom ${vGeomAttrs} />\n`;
    }

    // 4. Collision Geoms (group 0 is default collision)
    const collisionGeoms = [link.collision, ...(link.collisionBodies || [])]
      .filter((c) => c && c.type !== GeometryType.NONE);

    collisionGeoms.forEach((c) => {
      let cPos = "0 0 0";
      let cEuler = "0 0 0";
      if (c.origin) {
        cPos = vecStr(c.origin.xyz);
        cEuler = rotStr(c.origin.rpy);
      }
      let cGeomAttrs = `pos="${cPos}" euler="${cEuler}" rgba="1 0 0 0.5" group="0"`;

      if (c.type === GeometryType.BOX) {
        cGeomAttrs += ` type="box" size="${formatScalar(c.dimensions.x / 2)} ${formatScalar(c.dimensions.y / 2)} ${formatScalar(c.dimensions.z / 2)}"`;
      } else if (c.type === GeometryType.CYLINDER) {
        cGeomAttrs += ` type="cylinder" size="${formatShape(c.dimensions.x)} ${formatShape(c.dimensions.y / 2)}"`;
      } else if (c.type === GeometryType.SPHERE) {
        cGeomAttrs += ` type="sphere" size="${formatShape(c.dimensions.x)}"`;
      } else if (c.type === GeometryType.CAPSULE) {
        cGeomAttrs += ` type="capsule" size="${formatShape(c.dimensions.x)} ${formatShape(c.dimensions.y / 2)}"`;
      } else if (c.type === GeometryType.MESH && c.meshPath) {
        const meshAssetName = resolveMeshAssetName(c.meshPath);
        if (meshAssetName) {
          cGeomAttrs += ` type="mesh" mesh="${meshAssetName}"`;
        } else {
          const fallback = normalizeMeshPathForExport(c.meshPath);
          if (fallback) cGeomAttrs += ` type="mesh" mesh="${fallback}"`;
        }
      }

      bodyXml += `${indent}  <geom ${cGeomAttrs} />\n`;
    });


    // 5. Recursively add children
    const childJoints = Object.values(joints).filter(j => j.parentLinkId === linkId);
    childJoints.forEach(childJoint => {
        bodyXml += buildBody(childJoint.childLinkId, indent + "  ", nextPath);
    });

    bodyXml += `${indent}</body>\n`;
    return bodyXml;
  };

  const emitRootBodies = (): string => {
    if (!isSyntheticWorldRoot(rootLinkId)) {
      return buildBody(rootLinkId, "    ");
    }

    const rootChildren = Object.values(joints).filter((joint) => joint.parentLinkId === rootLinkId);
    return rootChildren.map((joint) => buildBody(joint.childLinkId, "    ")).join('');
  };

  const injectFreeJoint = (bodyXml: string): string => {
    const firstNewline = bodyXml.indexOf('\n');
    if (firstNewline === -1) {
      return bodyXml;
    }

    return bodyXml.slice(0, firstNewline + 1) + '      <freejoint/>\n' + bodyXml.slice(firstNewline + 1);
  };

  const rootBodyXml = emitRootBodies();
  if (addFloatBase) {
    xml += injectFreeJoint(rootBodyXml);
  } else {
    xml += rootBodyXml;
  }

  xml += `  </worldbody>\n`;

  // Actuators (conditional)
  if (includeActuators && actuatorType !== 'motor') {
    xml += `  <actuator>\n`;
    Object.values(joints).forEach(j => {
      if (j.type !== JointType.FIXED) {
        // Use joint dynamics for actuator gains
        const kv = j.dynamics?.damping ?? 1.0;
        const kp = j.limit?.effort ? j.limit.effort * 0.5 : 100.0;
        
        if (actuatorType === 'position') {
          xml += `    <position name="${j.name}_servo" joint="${j.name}" kp="${formatScalar(kp)}" />\n`;
        } else if (actuatorType === 'velocity') {
          xml += `    <velocity name="${j.name}_vel" joint="${j.name}" kv="${formatScalar(kv)}" />\n`;
        }
      }
    });
    xml += `  </actuator>\n`;
  } else if (includeActuators && actuatorType === 'motor') {
    xml += `  <actuator>\n`;
    Object.values(joints).forEach(j => {
      if (j.type !== JointType.FIXED) {
        xml += `    <motor name="${j.name}_motor" joint="${j.name}" gear="1" />\n`;
      }
    });
    xml += `  </actuator>\n`;
  }

  xml += `</mujoco>`;
  return xml;
};
