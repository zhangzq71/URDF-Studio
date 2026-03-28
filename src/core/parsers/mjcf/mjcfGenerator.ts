/**
 * MuJoCo XML Generator
 * Generates MuJoCo MJCF format from RobotState
 */

import * as THREE from 'three';
import { DEFAULT_LINK, RobotState, GeometryType, JointType, UrdfLink } from '@/types';
import {
  MAX_GEOMETRY_DIMENSION_DECIMALS,
  MAX_PROPERTY_DECIMALS,
  formatNumberWithMaxDecimals,
} from '@/core/utils/numberPrecision';
import { getVisualGeometryEntries } from '@/core/robot';
import { normalizeMeshPathForExport, normalizeTexturePathForExport } from '../meshPathUtils';

export type MjcfActuatorType = 'position' | 'velocity' | 'motor';

export interface MjcfVisualMeshVariant {
  meshPath: string;
  color?: string;
  sourceMaterialName?: string;
}

export interface MujocoExportOptions {
  meshdir?: string;
  texturedir?: string;
  addFloatBase?: boolean;
  includeActuators?: boolean;
  actuatorType?: MjcfActuatorType;
  includeSceneHelpers?: boolean;
  meshPathOverrides?: ReadonlyMap<string, string>;
  visualMeshVariants?: ReadonlyMap<string, readonly MjcfVisualMeshVariant[]>;
}

export const generateMujocoXML = (robot: RobotState, options: MujocoExportOptions = {}): string => {
  const { name, links, joints, rootLinkId } = robot;
  const meshdir = options.meshdir ?? '../meshes/';
  const texturedir = options.texturedir
    ?? (meshdir.includes('meshes') ? meshdir.replace(/meshes\/?$/, 'textures/') : '../textures/');
  const addFloatBase = options.addFloatBase ?? false;
  const includeActuators = options.includeActuators ?? true;
  const actuatorType = options.actuatorType ?? 'position';
  const includeSceneHelpers = options.includeSceneHelpers ?? false;
  const meshPathOverrides = options.meshPathOverrides;
  const visualMeshVariants = options.visualMeshVariants;

  // Helper to format numbers
  const formatScalar = (n: number) => formatNumberWithMaxDecimals(n, MAX_PROPERTY_DECIMALS);
  const formatShape = (n: number) => formatNumberWithMaxDecimals(n, MAX_GEOMETRY_DIMENSION_DECIMALS);
  const vecStr = (v: { x: number; y: number; z: number }) => `${formatScalar(v.x)} ${formatScalar(v.y)} ${formatScalar(v.z)}`;
  const quatStr = (v: { r: number; p: number; y: number }) => {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.r, v.p, v.y, 'ZYX'));
    return `${formatScalar(quaternion.w)} ${formatScalar(quaternion.x)} ${formatScalar(quaternion.y)} ${formatScalar(quaternion.z)}`;
  };
  const hasRotation = (v: { r: number; p: number; y: number } | undefined) => Boolean(
    v && (Math.abs(v.r) > 1e-9 || Math.abs(v.p) > 1e-9 || Math.abs(v.y) > 1e-9),
  );
  const quatAttr = (v: { r: number; p: number; y: number } | undefined) => (
    hasRotation(v) ? ` quat="${quatStr(v!)}"` : ''
  );
  const hasFiniteJointRange = (joint: RobotState['joints'][string] | undefined): boolean => (
    Boolean(
      joint?.limit
      && Number.isFinite(joint.limit.lower)
      && Number.isFinite(joint.limit.upper),
    )
  );

  // Helper to convert hex color to rgba string
  const hexToRgba = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(String(hex || '').trim());
    if (!result) return "0.8 0.8 0.8 1.0";
    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;
    const a = result[4] ? parseInt(result[4], 16) / 255 : 1;
    return `${formatNumberWithMaxDecimals(r, 4)} ${formatNumberWithMaxDecimals(g, 4)} ${formatNumberWithMaxDecimals(b, 4)} ${formatNumberWithMaxDecimals(a, 4)}`;
  };

  type MeshScaleTuple = [number, number, number];
  interface MeshAssetEntry {
    key: string;
    path: string;
    scale: MeshScaleTuple;
  }

  const normalizeMeshScale = (dimensions?: { x: number; y: number; z: number }): MeshScaleTuple => {
    const normalize = (value: number | undefined) => {
      if (Number.isFinite(value) && Math.abs(value as number) > 1e-9) {
        return Math.abs(value as number);
      }
      return 1;
    };

    return [
      normalize(dimensions?.x),
      normalize(dimensions?.y),
      normalize(dimensions?.z),
    ];
  };

  const meshScaleKey = (scale: MeshScaleTuple) => (
    `${formatShape(scale[0])} ${formatShape(scale[1])} ${formatShape(scale[2])}`
  );

  const buildMeshAssetKey = (meshPath: string, scale: MeshScaleTuple) => (
    `${meshPath}@@${meshScaleKey(scale)}`
  );

  const resolveVisualMeshVariants = (meshPath?: string): readonly MjcfVisualMeshVariant[] | undefined => {
    const normalizedPath = normalizeMeshPathForExport(meshPath);
    if (!normalizedPath) {
      return undefined;
    }

    const variants = visualMeshVariants?.get(meshPath || '')
      || visualMeshVariants?.get(normalizedPath);
    return variants && variants.length > 0 ? variants : undefined;
  };

  const resolveExportMeshPath = (meshPath?: string): string => {
    const normalizedPath = normalizeMeshPathForExport(meshPath);
    if (!normalizedPath) {
      return '';
    }

    const overridePath = meshPathOverrides?.get(meshPath || '')
      || meshPathOverrides?.get(normalizedPath);
    if (!overridePath) {
      return normalizedPath;
    }

    return normalizeMeshPathForExport(overridePath) || overridePath;
  };

  const meshAssets = new Map<string, MeshAssetEntry>();
  const registerMeshAsset = (meshPath?: string, dimensions?: { x: number; y: number; z: number }) => {
    const normalizedPath = resolveExportMeshPath(meshPath);
    if (!normalizedPath) {
      return;
    }

    const scale = normalizeMeshScale(dimensions);
    const key = buildMeshAssetKey(normalizedPath, scale);
    if (!meshAssets.has(key)) {
      meshAssets.set(key, {
        key,
        path: normalizedPath,
        scale,
      });
    }
  };

  Object.values(links).forEach(link => {
    getVisualGeometryEntries(link).forEach((entry) => {
      if (entry.geometry.type !== GeometryType.MESH) {
        return;
      }

      const variants = resolveVisualMeshVariants(entry.geometry.meshPath);
      if (variants) {
        variants.forEach((variant) => {
          registerMeshAsset(variant.meshPath, entry.geometry.dimensions);
        });
      } else {
        registerMeshAsset(entry.geometry.meshPath, entry.geometry.dimensions);
      }
    });
    if (link.collision && link.collision.type === GeometryType.MESH) {
      registerMeshAsset(link.collision.meshPath, link.collision.dimensions);
    }
    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH) {
        registerMeshAsset(body.meshPath, body.dimensions);
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

  Array.from(meshAssets.values()).forEach(({ key, path }) => {
    meshAssetNameMap.set(key, buildMeshAssetName(path));
  });

  const resolveMeshAssetName = (
    meshPath?: string,
    dimensions?: { x: number; y: number; z: number },
  ): string | null => {
    const normalized = resolveExportMeshPath(meshPath);
    if (!normalized) return null;

    const scale = normalizeMeshScale(dimensions);
    const key = buildMeshAssetKey(normalized, scale);
    return meshAssetNameMap.get(key) || null;
  };

  interface LinkMaterialAssetEntry {
    linkId: string;
    color: string;
    texture?: string;
    shininess?: number;
    reflectance?: number;
    emission?: number;
  }

  interface VisualVariantMaterialAssetEntry {
    key: string;
    color: string;
  }

  const resolveLinkMaterialColor = (link: UrdfLink): string => {
    const material = robot.materials?.[link.id] || robot.materials?.[link.name];
    return material?.color || (material?.texture ? '#ffffff' : undefined) || link.visual.color || '#808080';
  };

  const resolveLinkMaterialTexture = (link: UrdfLink): string | undefined => {
    const material = robot.materials?.[link.id] || robot.materials?.[link.name];
    return material?.texture;
  };

  const clampUnitScalar = (value: number | null | undefined): number | undefined => {
    if (!Number.isFinite(value)) {
      return undefined;
    }

    return Math.max(0, Math.min(1, Number(value)));
  };

  const resolveLinkMaterialPbr = (
    link: UrdfLink,
  ): Pick<LinkMaterialAssetEntry, 'shininess' | 'reflectance' | 'emission'> => {
    const material = robot.materials?.[link.id] || robot.materials?.[link.name];
    const usdMaterial = material?.usdMaterial;
    if (!usdMaterial || typeof usdMaterial !== 'object') {
      return {};
    }

    const roughness = clampUnitScalar(usdMaterial.roughness);
    const reflectance = clampUnitScalar(usdMaterial.metalness);
    const emissive = usdMaterial.emissive && typeof usdMaterial.emissive.length === 'number'
      ? Array.from(usdMaterial.emissive)
        .slice(0, 3)
        .map((channel) => Number(channel))
        .filter((channel) => Number.isFinite(channel))
      : [];
    const emissivePeak = emissive.length >= 3
      ? Math.max(emissive[0] || 0, emissive[1] || 0, emissive[2] || 0)
      : null;
    const emissiveIntensity = Number.isFinite(usdMaterial.emissiveIntensity)
      ? Math.max(0, Number(usdMaterial.emissiveIntensity))
      : null;
    const emission = usdMaterial.emissiveEnabled === false
      ? undefined
      : clampUnitScalar(
        emissivePeak !== null
          ? emissivePeak * (emissiveIntensity ?? 1)
          : emissiveIntensity,
      );

    return {
      ...(roughness !== undefined ? { shininess: clampUnitScalar(1 - roughness) } : {}),
      ...(reflectance !== undefined ? { reflectance } : {}),
      ...(emission !== undefined ? { emission } : {}),
    };
  };

  const sanitizeMaterialAssetName = (value: string): string => (
    value
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '') || 'material'
  );

  const visualMaterialAssets = new Map<string, LinkMaterialAssetEntry>();
  const visualMaterialNameMap = new Map<string, string>();
  const visualVariantMaterialAssets = new Map<string, VisualVariantMaterialAssetEntry>();
  const visualVariantMaterialNameMap = new Map<string, string>();
  const usedMaterialNames = new Set<string>();
  const buildVisualMaterialAssetName = (link: UrdfLink): string => {
    const base = sanitizeMaterialAssetName(`${link.name || link.id}_mat`);
    let candidate = base;
    let suffix = 2;
    while (usedMaterialNames.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    usedMaterialNames.add(candidate);
    return candidate;
  };

  const buildVisualVariantMaterialAssetName = (link: UrdfLink, variantIndex: number): string => {
    const base = sanitizeMaterialAssetName(`${link.name || link.id}_mat_${variantIndex + 1}`);
    let candidate = base;
    let suffix = 2;
    while (usedMaterialNames.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    usedMaterialNames.add(candidate);
    return candidate;
  };

  Object.entries(links).forEach(([linkId, link]) => {
    if (link.visual.type === GeometryType.NONE) {
      return;
    }

    const variants = link.visual.type === GeometryType.MESH
      ? resolveVisualMeshVariants(link.visual.meshPath)
      : undefined;
    if (variants) {
      variants.forEach((variant, variantIndex) => {
        const key = `${linkId}@@${variantIndex}`;
        const materialName = buildVisualVariantMaterialAssetName(link, variantIndex);
        visualVariantMaterialAssets.set(key, {
          key,
          color: variant.color || resolveLinkMaterialColor(link),
        });
        visualVariantMaterialNameMap.set(key, materialName);
      });
      return;
    }

    const color = resolveLinkMaterialColor(link);
    const texture = resolveLinkMaterialTexture(link);
    const pbr = resolveLinkMaterialPbr(link);
    const materialName = buildVisualMaterialAssetName(link);
    visualMaterialAssets.set(linkId, { linkId, color, texture, ...pbr });
    visualMaterialNameMap.set(linkId, materialName);
  });

  interface TextureAssetEntry {
    path: string;
    owningLinkId: string;
  }

  const textureAssets = new Map<string, TextureAssetEntry>();
  const registerTextureAsset = (linkId: string, texturePath?: string) => {
    const normalizedPath = normalizeTexturePathForExport(texturePath || '');
    if (!normalizedPath) {
      return;
    }

    if (!textureAssets.has(normalizedPath)) {
      textureAssets.set(normalizedPath, {
        path: normalizedPath,
        owningLinkId: linkId,
      });
    }
  };

  visualMaterialAssets.forEach(({ linkId, texture }) => {
    registerTextureAsset(linkId, texture);
  });

  const textureAssetNameMap = new Map<string, string>();
  const usedTextureNames = new Set<string>();
  const buildTextureAssetName = (link: UrdfLink): string => {
    const base = sanitizeMaterialAssetName(`${link.name || link.id}_tex`);
    let candidate = base;
    let suffix = 2;
    while (usedTextureNames.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    usedTextureNames.add(candidate);
    return candidate;
  };

  Array.from(textureAssets.values()).forEach(({ path, owningLinkId }) => {
    const owningLink = links[owningLinkId];
    textureAssetNameMap.set(path, buildTextureAssetName(owningLink || {
      ...DEFAULT_LINK,
      id: owningLinkId,
      name: owningLinkId,
    }));
  });

  const resolveTextureAssetName = (texturePath?: string): string | null => {
    const normalizedPath = normalizeTexturePathForExport(texturePath || '');
    if (!normalizedPath) {
      return null;
    }

    return textureAssetNameMap.get(normalizedPath) || null;
  };

  const hasGeometry = (link: UrdfLink | undefined): boolean => {
    if (!link) return false;

    const hasVisual = getVisualGeometryEntries(link).length > 0;
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
  xml += textureAssets.size > 0
    ? `  <compiler angle="radian" meshdir="${meshdir}" texturedir="${texturedir}" />\n`
    : `  <compiler angle="radian" meshdir="${meshdir}" />\n`;

  // Assets Section
  xml += `  <asset>\n`;
  meshAssets.forEach(({ key, path, scale }) => {
    const meshName = meshAssetNameMap.get(key) || 'mesh';
    const scaleAttr = meshScaleKey(scale) === '1 1 1'
      ? ''
      : ` scale="${meshScaleKey(scale)}"`;
    xml += `    <mesh name="${meshName}" file="${path}"${scaleAttr} />\n`;
  });
  textureAssets.forEach(({ path }) => {
    const textureName = textureAssetNameMap.get(path);
    if (!textureName) {
      return;
    }
    xml += `    <texture name="${textureName}" type="2d" file="${path}" />\n`;
  });
  visualMaterialAssets.forEach(({ linkId, color, texture, shininess, reflectance, emission }) => {
    const materialName = visualMaterialNameMap.get(linkId);
    if (!materialName) {
      return;
    }
    const textureAssetName = resolveTextureAssetName(texture);
    const pbrAttrs = [
      Number.isFinite(shininess) ? ` shininess="${formatNumberWithMaxDecimals(shininess!, 4)}"` : '',
      Number.isFinite(reflectance) ? ` reflectance="${formatNumberWithMaxDecimals(reflectance!, 4)}"` : '',
      Number.isFinite(emission) ? ` emission="${formatNumberWithMaxDecimals(emission!, 4)}"` : '',
    ].join('');
    xml += textureAssetName
      ? `    <material name="${materialName}" rgba="${hexToRgba(color)}" texture="${textureAssetName}"${pbrAttrs} />\n`
      : `    <material name="${materialName}" rgba="${hexToRgba(color)}"${pbrAttrs} />\n`;
  });
  visualVariantMaterialAssets.forEach(({ key, color }) => {
    const materialName = visualVariantMaterialNameMap.get(key);
    if (!materialName) {
      return;
    }

    xml += `    <material name="${materialName}" rgba="${hexToRgba(color)}" />\n`;
  });
  xml += `  </asset>\n\n`;

  xml += `  <worldbody>\n`;
  if (includeSceneHelpers) {
    xml += `    <light pos="0 0 10" dir="0 0 -1" diffuse="1 1 1"/>\n`;
    xml += `    <geom type="plane" size="5 5 0.1" rgba=".9 .9 .9 1"/>\n`;
  }

  // Recursive Body Builder
  const buildBody = (linkId: string, indent: string, path = new Set<string>()) => {
    const link = links[linkId];
    if (!link) return '';

    if (path.has(linkId)) {
      console.error(`[MJCFGenerator] Skipping cyclic link reference at "${linkId}"`);
      return '';
    }

    const nextPath = new Set(path);
    nextPath.add(linkId);

    // Find the joint that connects to this link (if not root)
    const parentJoint = Object.values(joints).find(j => j.childLinkId === linkId);

    // Body transforms should preserve the imported chain exactly. Root bodies
    // stay at the world origin unless the source state encodes an explicit
    // parent joint offset.
    let pos = "0 0 0";
    let bodyRotation: { r: number; p: number; y: number } | undefined;

    if (parentJoint) {
      pos = vecStr(parentJoint.origin.xyz);
      bodyRotation = parentJoint.origin.rpy;
    }

    let bodyXml = `${indent}<body name="${link.name}" pos="${pos}"${quatAttr(bodyRotation)}>\n`;

    // 1. Joint Definition (inside the body it belongs to)
    if (parentJoint && parentJoint.type !== JointType.FIXED) {
       if (parentJoint.type === JointType.FLOATING) {
         bodyXml += `${indent}  <freejoint name="${parentJoint.name}"/>\n`;
       } else {
         let jType = 'hinge';
         if (parentJoint.type === JointType.PRISMATIC) {
           jType = 'slide';
         } else if (parentJoint.type === JointType.BALL) {
           jType = 'ball';
         }

         const shouldEmitRange = (
           parentJoint.type !== JointType.CONTINUOUS
           && parentJoint.type !== JointType.BALL
           && hasFiniteJointRange(parentJoint)
         );
         const limitStr = shouldEmitRange
           ? ` range="${formatScalar(parentJoint.limit!.lower)} ${formatScalar(parentJoint.limit!.upper)}"`
           : '';
         const axisStr = parentJoint.type === JointType.BALL
           ? ''
           : ` axis="${vecStr(parentJoint.axis)}"`;

         bodyXml += `${indent}  <joint name="${parentJoint.name}" type="${jType}"${axisStr}${limitStr} damping="${formatScalar(parentJoint.dynamics.damping)}" frictionloss="${formatScalar(parentJoint.dynamics.friction)}"/>\n`;
       }
    }

    // 2. Inertial
    // Preserve URDF semantics: links may legitimately omit inertial data.
    // In that case, do not synthesize arbitrary mass/inertia on MJCF export.
    if (link.inertial) {
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
    }

    // 3. Visual Geom
    // Offset visual geom by its origin
    const linkLevelMaterial = robot.materials?.[link.id] || robot.materials?.[link.name];
    getVisualGeometryEntries(link).forEach((visualEntry) => {
        const v = visualEntry.geometry;
        let vPos = "0 0 0";
        if (v.origin) {
            vPos = vecStr(v.origin.xyz);
        }

        const meshVariants = v.type === GeometryType.MESH
          ? resolveVisualMeshVariants(v.meshPath)
          : undefined;

        const buildVisualGeomAttrs = (
          meshPathOverride?: string,
          materialNameOverride?: string,
          rgbaOverride?: string,
        ) => {
          let vGeomAttrs = `pos="${vPos}"${quatAttr(v.origin?.rpy)} group="1" contype="0" conaffinity="0"`;
          if (materialNameOverride) {
            vGeomAttrs += ` material="${materialNameOverride}"`;
          } else {
            vGeomAttrs += ` rgba="${rgbaOverride || hexToRgba(v.color || resolveLinkMaterialColor(link))}"`;
          }

          if (v.type === GeometryType.BOX) {
            vGeomAttrs += ` type="box" size="${formatScalar(v.dimensions.x / 2)} ${formatScalar(v.dimensions.y / 2)} ${formatScalar(v.dimensions.z / 2)}"`;
          } else if (v.type === GeometryType.CYLINDER) {
            vGeomAttrs += ` type="cylinder" size="${formatShape(v.dimensions.x)} ${formatShape(v.dimensions.y / 2)}"`;
          } else if (v.type === GeometryType.SPHERE) {
            vGeomAttrs += ` type="sphere" size="${formatShape(v.dimensions.x)}"`;
          } else if (v.type === GeometryType.CAPSULE) {
            vGeomAttrs += ` type="capsule" size="${formatShape(v.dimensions.x)} ${formatShape(v.dimensions.y / 2)}"`;
          } else if (v.type === GeometryType.MESH) {
            const meshAssetName = resolveMeshAssetName(meshPathOverride || v.meshPath, v.dimensions);
            if (meshAssetName) {
              vGeomAttrs += ` type="mesh" mesh="${meshAssetName}"`;
            } else {
              const fallback = resolveExportMeshPath(meshPathOverride || v.meshPath);
              if (fallback) vGeomAttrs += ` type="mesh" mesh="${fallback}"`;
            }
          }

          return vGeomAttrs;
        };

        if (meshVariants && meshVariants.length > 0) {
          meshVariants.forEach((variant) => {
            bodyXml += `${indent}  <geom ${buildVisualGeomAttrs(
              variant.meshPath,
              undefined,
              variant.color ? hexToRgba(variant.color) : undefined,
            )} />\n`;
          });
        } else {
          const visualMaterialName = linkLevelMaterial ? visualMaterialNameMap.get(linkId) : undefined;
          bodyXml += `${indent}  <geom ${buildVisualGeomAttrs(
            v.meshPath,
            visualMaterialName,
            linkLevelMaterial ? undefined : hexToRgba(v.color || resolveLinkMaterialColor(link)),
          )} />\n`;
        }
    });

    // 4. Collision geoms use a dedicated visualization group so the runtime
    // loader can classify them as collision-only and keep them hidden unless
    // collision display is explicitly enabled.
    const collisionGeoms = [link.collision, ...(link.collisionBodies || [])]
      .filter((c) => c && c.type !== GeometryType.NONE);

    collisionGeoms.forEach((c) => {
      let cPos = "0 0 0";
      if (c.origin) {
        cPos = vecStr(c.origin.xyz);
      }
      let cGeomAttrs = `pos="${cPos}"${quatAttr(c.origin?.rpy)} rgba="${hexToRgba(c.color || DEFAULT_LINK.collision.color)}" group="3" contype="1" conaffinity="1"`;

      if (c.type === GeometryType.BOX) {
        cGeomAttrs += ` type="box" size="${formatScalar(c.dimensions.x / 2)} ${formatScalar(c.dimensions.y / 2)} ${formatScalar(c.dimensions.z / 2)}"`;
      } else if (c.type === GeometryType.CYLINDER) {
        cGeomAttrs += ` type="cylinder" size="${formatShape(c.dimensions.x)} ${formatShape(c.dimensions.y / 2)}"`;
      } else if (c.type === GeometryType.SPHERE) {
        cGeomAttrs += ` type="sphere" size="${formatShape(c.dimensions.x)}"`;
      } else if (c.type === GeometryType.CAPSULE) {
        cGeomAttrs += ` type="capsule" size="${formatShape(c.dimensions.x)} ${formatShape(c.dimensions.y / 2)}"`;
      } else if (c.type === GeometryType.MESH && c.meshPath) {
        const meshAssetName = resolveMeshAssetName(c.meshPath, c.dimensions);
        if (meshAssetName) {
          cGeomAttrs += ` type="mesh" mesh="${meshAssetName}"`;
        } else {
          const fallback = resolveExportMeshPath(c.meshPath);
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
  const rootBodyAlreadyHasFreeJoint = /<freejoint\b/.test(rootBodyXml);
  if (addFloatBase && !rootBodyAlreadyHasFreeJoint) {
    xml += injectFreeJoint(rootBodyXml);
  } else {
    xml += rootBodyXml;
  }

  xml += `  </worldbody>\n`;

  // Actuators (conditional)
  if (includeActuators && actuatorType !== 'motor') {
    xml += `  <actuator>\n`;
    Object.values(joints).forEach(j => {
      if (
        j.type !== JointType.FIXED
        && j.type !== JointType.FLOATING
        && j.type !== JointType.BALL
      ) {
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
      if (
        j.type !== JointType.FIXED
        && j.type !== JointType.FLOATING
        && j.type !== JointType.BALL
      ) {
        xml += `    <motor name="${j.name}_motor" joint="${j.name}" gear="1" />\n`;
      }
    });
    xml += `  </actuator>\n`;
  }

  xml += `</mujoco>`;
  return xml;
};
