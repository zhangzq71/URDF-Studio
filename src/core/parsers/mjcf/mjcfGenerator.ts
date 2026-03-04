/**
 * MuJoCo XML Generator
 * Generates MuJoCo MJCF format from RobotState
 */

import { RobotState, GeometryType, JointType, UrdfLink } from '@/types';
import { normalizeMeshPathForExport } from '../meshPathUtils';

interface MujocoExportOptions {
  meshdir?: string;
}

export const generateMujocoXML = (robot: RobotState, options: MujocoExportOptions = {}): string => {
  const { name, links, joints, rootLinkId } = robot;
  const meshdir = options.meshdir ?? '../meshes/';

  // Helper to format numbers
  const f = (n: number) => n.toFixed(4);
  const vecStr = (v: { x: number; y: number; z: number }) => `${f(v.x)} ${f(v.y)} ${f(v.z)}`;
  const rotStr = (v: { r: number; p: number; y: number }) => `${f(v.r)} ${f(v.p)} ${f(v.y)}`; // MuJoCo accepts Euler XYZ by default

  // Helper to convert hex color to rgba string
  const hexToRgba = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "0.8 0.8 0.8 1.0";
    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;
    return `${f(r)} ${f(g)} ${f(b)} 1.0`;
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
  const buildBody = (linkId: string, indent: string) => {
    const link = links[linkId];
    if (!link) return '';

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
           limitStr = `range="${parentJoint.limit.lower} ${parentJoint.limit.upper}"`;
       }

       bodyXml += `${indent}  <joint name="${parentJoint.name}" type="${jType}" axis="${vecStr(parentJoint.axis)}" ${limitStr} damping="${parentJoint.dynamics.damping}" frictionloss="${parentJoint.dynamics.friction}"/>\n`;
    }

    // 2. Inertial
    bodyXml += `${indent}  <inertial pos="0 0 0" mass="${link.inertial.mass}" diaginertia="${f(link.inertial.inertia.ixx)} ${f(link.inertial.inertia.iyy)} ${f(link.inertial.inertia.izz)}"/>\n`;

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
            vGeomAttrs += ` type="box" size="${f(v.dimensions.x/2)} ${f(v.dimensions.y/2)} ${f(v.dimensions.z/2)}"`;
        } else if (v.type === GeometryType.CYLINDER) {
            // MuJoCo cylinder size is radius half-height
            vGeomAttrs += ` type="cylinder" size="${f(v.dimensions.x)} ${f(v.dimensions.y/2)}"`;
        } else if (v.type === GeometryType.SPHERE) {
            vGeomAttrs += ` type="sphere" size="${f(v.dimensions.x)}"`;
        } else if (v.type === GeometryType.CAPSULE) {
            // MuJoCo capsule size is radius half-height
            vGeomAttrs += ` type="capsule" size="${f(v.dimensions.x)} ${f(v.dimensions.y/2)}"`;
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
        cGeomAttrs += ` type="box" size="${f(c.dimensions.x / 2)} ${f(c.dimensions.y / 2)} ${f(c.dimensions.z / 2)}"`;
      } else if (c.type === GeometryType.CYLINDER) {
        cGeomAttrs += ` type="cylinder" size="${f(c.dimensions.x)} ${f(c.dimensions.y / 2)}"`;
      } else if (c.type === GeometryType.SPHERE) {
        cGeomAttrs += ` type="sphere" size="${f(c.dimensions.x)}"`;
      } else if (c.type === GeometryType.CAPSULE) {
        cGeomAttrs += ` type="capsule" size="${f(c.dimensions.x)} ${f(c.dimensions.y / 2)}"`;
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
        bodyXml += buildBody(childJoint.childLinkId, indent + "  ");
    });

    bodyXml += `${indent}</body>\n`;
    return bodyXml;
  };

  xml += buildBody(rootLinkId, "    ");

  xml += `  </worldbody>\n`;

  // Actuators
  xml += `  <actuator>\n`;
  Object.values(joints).forEach(j => {
      if (j.type !== JointType.FIXED) {
          // Add a position servo by default for revolute/prismatic
          xml += `    <position name="${j.name}_servo" joint="${j.name}" kp="50" />\n`;
          // Alternatively could use motor: <motor name="${j.name}_motor" joint="${j.name}" gear="1" />
      }
  });
  xml += `  </actuator>\n`;

  xml += `</mujoco>`;
  return xml;
};
