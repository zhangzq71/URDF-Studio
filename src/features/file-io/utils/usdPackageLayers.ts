import * as THREE from 'three';

import type { RobotState, UrdfJoint, UrdfLink } from '../../../types/index.ts';
import { computeUsdInertiaProperties } from '../../../shared/utils/inertiaUsd.ts';
import {
  USD_GEOMETRY_TYPES as GEOMETRY_TYPES,
  getUsdGeometryType as getGeometryType,
} from './usdSceneNodeFactory.ts';
import {
  escapeUsdString,
  formatUsdFloat,
  formatUsdTuple,
  makeUsdIndent,
  quaternionToUsdTuple,
  sanitizeUsdIdentifier,
  serializeUsdPrimSpecWithMetadata,
} from './usdTextFormatting.ts';

export type UsdLinkPathMaps = {
  linkPaths: Map<string, string>;
  childIdsByParent: Map<string, string[]>;
};

export type UsdPackageLayerContents = {
  rootLayerContent: string;
  baseLayerContent: string;
  physicsLayerContent: string;
  sensorLayerContent: string;
};

export type UsdArchivePackage = {
  archiveFileName: string;
  rootLayerPath: string;
  archiveFiles: Map<string, Blob>;
};

const createIdentityBlob = (content: string): Blob => {
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
};

const rpyToQuaternion = (r: number, p: number, y: number): THREE.Quaternion => {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(r, p, y, 'ZYX'));
};

const getAxisToken = (axis: THREE.Vector3 | UrdfJoint['axis'] | undefined): 'X' | 'Y' | 'Z' => {
  const vector = axis
    ? new THREE.Vector3(axis.x ?? 0, axis.y ?? 0, axis.z ?? 0)
    : new THREE.Vector3(1, 0, 0);

  if (vector.lengthSq() <= 1e-12) {
    return 'X';
  }

  const abs = {
    x: Math.abs(vector.x),
    y: Math.abs(vector.y),
    z: Math.abs(vector.z),
  };

  if (abs.y >= abs.x && abs.y >= abs.z) return 'Y';
  if (abs.z >= abs.x && abs.z >= abs.y) return 'Z';
  return 'X';
};

const jointTypeToUsdType = (
  joint: UrdfJoint,
): 'PhysicsFixedJoint' | 'PhysicsRevoluteJoint' | 'PhysicsPrismaticJoint' => {
  const type = String(joint.type || '').toLowerCase();
  if (type === 'revolute' || type === 'continuous') {
    return 'PhysicsRevoluteJoint';
  }
  if (type === 'prismatic') {
    return 'PhysicsPrismaticJoint';
  }
  return 'PhysicsFixedJoint';
};

const radiansToDegrees = (value: number): number => {
  return value * 180 / Math.PI;
};

const serializeJointDefinition = (
  joint: UrdfJoint,
  linkPaths: Map<string, string>,
  lines: string[],
  depth: number,
): void => {
  const indent = makeUsdIndent(depth);
  const childIndent = makeUsdIndent(depth + 1);
  const typeName = jointTypeToUsdType(joint);
  const parentPath = linkPaths.get(joint.parentLinkId);
  const childPath = linkPaths.get(joint.childLinkId);

  if (!parentPath || !childPath) {
    return;
  }

  serializeUsdPrimSpecWithMetadata(
    lines,
    depth,
    `def ${typeName} "${sanitizeUsdIdentifier(joint.id || joint.name || 'joint')}"`,
  );
  lines.push(`${indent}{`);
  lines.push(`${childIndent}rel physics:body0 = <${parentPath}>`);
  lines.push(`${childIndent}rel physics:body1 = <${childPath}>`);

  if (typeName !== 'PhysicsFixedJoint') {
    lines.push(`${childIndent}uniform token physics:axis = "${getAxisToken(joint.axis)}"`);
  }
  lines.push(
    `${childIndent}custom string urdf:jointType = "${escapeUsdString(String(joint.type || 'fixed').toLowerCase())}"`,
  );
  lines.push(`${childIndent}custom float3 urdf:axisLocal = ${formatUsdTuple([
    joint.axis?.x ?? 1,
    joint.axis?.y ?? 0,
    joint.axis?.z ?? 0,
  ])}`);

  if (typeName === 'PhysicsRevoluteJoint' && String(joint.type || '').toLowerCase() !== 'continuous' && joint.limit) {
    lines.push(`${childIndent}float physics:lowerLimit = ${formatUsdFloat(radiansToDegrees(joint.limit.lower))}`);
    lines.push(`${childIndent}float physics:upperLimit = ${formatUsdFloat(radiansToDegrees(joint.limit.upper))}`);
  } else if (typeName === 'PhysicsPrismaticJoint' && joint.limit) {
    lines.push(`${childIndent}float physics:lowerLimit = ${formatUsdFloat(joint.limit.lower)}`);
    lines.push(`${childIndent}float physics:upperLimit = ${formatUsdFloat(joint.limit.upper)}`);
  }

  lines.push(`${childIndent}point3f physics:localPos0 = ${formatUsdTuple([
    joint.origin?.xyz?.x ?? 0,
    joint.origin?.xyz?.y ?? 0,
    joint.origin?.xyz?.z ?? 0,
  ])}`);
  const originQuaternion = rpyToQuaternion(
    joint.origin?.rpy?.r ?? 0,
    joint.origin?.rpy?.p ?? 0,
    joint.origin?.rpy?.y ?? 0,
  );
  lines.push(`${childIndent}custom point3f urdf:originXyz = ${formatUsdTuple([
    joint.origin?.xyz?.x ?? 0,
    joint.origin?.xyz?.y ?? 0,
    joint.origin?.xyz?.z ?? 0,
  ])}`);
  lines.push(`${childIndent}custom quatf urdf:originQuatWxyz = ${quaternionToUsdTuple(originQuaternion)}`);
  lines.push(`${childIndent}quatf physics:localRot0 = ${quaternionToUsdTuple(originQuaternion)}`);
  lines.push(`${childIndent}point3f physics:localPos1 = (0, 0, 0)`);
  lines.push(`${childIndent}quatf physics:localRot1 = (1, 0, 0, 0)`);
  lines.push(`${indent}}`);
};

const serializeCollisionOverrides = (
  link: UrdfLink,
  lines: string[],
  depth: number,
): void => {
  const collisionVisuals = [
    ...(getGeometryType(link.collision?.type) !== GEOMETRY_TYPES.NONE ? [link.collision] : []),
    ...((link.collisionBodies || []).filter((body) => getGeometryType(body.type) !== GEOMETRY_TYPES.NONE)),
  ];

  if (collisionVisuals.length === 0) {
    return;
  }

  const indent = makeUsdIndent(depth);
  lines.push(`${indent}over "collisions"`);
  lines.push(`${indent}{`);

  collisionVisuals.forEach((visual, index) => {
    const childIndent = makeUsdIndent(depth + 1);
    const apiSchemas = getGeometryType(visual.type) === GEOMETRY_TYPES.MESH
      ? '"PhysicsCollisionAPI", "PhysicsMeshCollisionAPI"'
      : '"PhysicsCollisionAPI"';

    serializeUsdPrimSpecWithMetadata(
      lines,
      depth + 1,
      `over "collision_${index}"`,
      [`prepend apiSchemas = [${apiSchemas}]`],
    );
    lines.push(`${childIndent}{`);
    lines.push(`${makeUsdIndent(depth + 2)}bool physics:collisionEnabled = true`);
    if (getGeometryType(visual.type) === GEOMETRY_TYPES.MESH) {
      lines.push(`${makeUsdIndent(depth + 2)}uniform token physics:approximation = "convexHull"`);
    }
    lines.push(`${childIndent}}`);
  });

  lines.push(`${indent}}`);
};

const serializeLinkPhysicsOverrides = (
  robot: RobotState,
  linkId: string,
  childIdsByParent: Map<string, string[]>,
  lines: string[],
  depth: number,
): void => {
  const link = robot.links[linkId];
  if (!link) {
    return;
  }

  const indent = makeUsdIndent(depth);
  const childIndent = makeUsdIndent(depth + 1);
  const apiSchemas = link.inertial
    ? '"PhysicsRigidBodyAPI", "PhysicsMassAPI"'
    : '"PhysicsRigidBodyAPI"';

  serializeUsdPrimSpecWithMetadata(
    lines,
    depth,
    `over "${sanitizeUsdIdentifier(linkId)}"`,
    [`prepend apiSchemas = [${apiSchemas}]`],
  );
  lines.push(`${indent}{`);

  if (link.inertial) {
    const usdInertia = computeUsdInertiaProperties(link.inertial);
    lines.push(`${childIndent}float physics:mass = ${formatUsdFloat(link.inertial.mass)}`);
    lines.push(`${childIndent}float3 physics:centerOfMass = ${formatUsdTuple([
      link.inertial.origin?.xyz?.x ?? 0,
      link.inertial.origin?.xyz?.y ?? 0,
      link.inertial.origin?.xyz?.z ?? 0,
    ])}`);
    lines.push(`${childIndent}float3 physics:diagonalInertia = ${formatUsdTuple([
      usdInertia?.diagonalInertia[0] ?? 0,
      usdInertia?.diagonalInertia[1] ?? 0,
      usdInertia?.diagonalInertia[2] ?? 0,
    ])}`);
    lines.push(`${childIndent}quatf physics:principalAxes = ${quaternionToUsdTuple(usdInertia?.principalAxesLocal)}`);
  }

  serializeCollisionOverrides(link, lines, depth + 1);

  (childIdsByParent.get(linkId) || []).forEach((childLinkId) => {
    serializeLinkPhysicsOverrides(robot, childLinkId, childIdsByParent, lines, depth + 1);
  });

  lines.push(`${indent}}`);
};

export const buildUsdLinkPathMaps = (
  robot: RobotState,
  rootPrimName: string,
): UsdLinkPathMaps => {
  const childIdsByParent = new Map<string, string[]>();
  Object.values(robot.joints).forEach((joint) => {
    const children = childIdsByParent.get(joint.parentLinkId) || [];
    children.push(joint.childLinkId);
    childIdsByParent.set(joint.parentLinkId, children);
  });

  const linkPaths = new Map<string, string>();
  const visit = (linkId: string, parentPath: string) => {
    const path = `${parentPath}/${sanitizeUsdIdentifier(linkId)}`;
    linkPaths.set(linkId, path);
    (childIdsByParent.get(linkId) || []).forEach((childLinkId) => visit(childLinkId, path));
  };

  visit(robot.rootLinkId, `/${rootPrimName}`);

  return { linkPaths, childIdsByParent };
};

export const buildUsdPhysicsLayerContent = (
  robot: RobotState,
  pathMaps: UsdLinkPathMaps,
  rootPrimName: string,
  configStem: string,
): string => {
  const lines = [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    metersPerUnit = 1',
    '    subLayers = [',
    `        @${configStem}_base.usd@`,
    '    ]',
    '    upAxis = "Z"',
    ')',
    '',
  ];

  lines.push('def PhysicsScene "physicsScene"');
  lines.push('{');
  lines.push('    vector3f physics:gravityDirection = (0, 0, -1)');
  lines.push('    float physics:gravityMagnitude = 9.81');
  lines.push('}');
  lines.push('');

  serializeUsdPrimSpecWithMetadata(
    lines,
    0,
    `over "${rootPrimName}"`,
    ['prepend apiSchemas = ["PhysicsArticulationRootAPI"]'],
  );
  lines.push('{');

  serializeLinkPhysicsOverrides(robot, robot.rootLinkId, pathMaps.childIdsByParent, lines, 1);

  lines.push('');
  lines.push('    over "joints"');
  lines.push('    {');

  Object.values(robot.joints).forEach((joint) => {
    serializeJointDefinition(joint, pathMaps.linkPaths, lines, 2);
  });

  lines.push('    }');
  lines.push('}');
  lines.push('');
  return `${lines.join('\n')}\n`;
};

export const buildUsdSensorLayerContent = (rootPrimName: string): string => {
  return [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    metersPerUnit = 1',
    '    upAxis = "Z"',
    ')',
    '',
    `def Xform "${rootPrimName}"`,
    '{',
    '}',
    '',
  ].join('\n');
};

export const buildUsdRootLayerContent = (
  rootPrimName: string,
  configStem: string,
): string => {
  return [
    '#usda 1.0',
    '(',
    `    defaultPrim = "${rootPrimName}"`,
    '    upAxis = "Z"',
    '    metersPerUnit = 1',
    ')',
    '',
    `def Xform "${rootPrimName}" (`,
    '    variants = {',
    '        string Physics = "PhysX"',
    '        string Sensor = "Sensors"',
    '    }',
    '    prepend variantSets = ["Physics", "Sensor"]',
    ')',
    '{',
    '    quatd xformOp:orient = (1, 0, 0, 0)',
    '    double3 xformOp:scale = (1, 1, 1)',
    '    double3 xformOp:translate = (0, 0, 0)',
    '    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]',
    '    variantSet "Physics" = {',
    '        "None" (',
    `            prepend references = @configuration/${configStem}_base.usd@`,
    '        ) {',
    '            over "joints" (',
    '                active = false',
    '            )',
    '            {',
    '            }',
    '',
    '        }',
    '        "PhysX" (',
    `            prepend payload = @configuration/${configStem}_physics.usd@`,
    '        ) {',
    '',
    '        }',
    '    }',
    '    variantSet "Sensor" = {',
    '        "None" {',
    '',
    '        }',
    '        "Sensors" (',
    `            prepend payload = @configuration/${configStem}_sensor.usd@`,
    '        ) {',
    '',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
};

export const createUsdArchivePackage = (
  exportName: string,
  layerContents: UsdPackageLayerContents,
  assetFiles: Map<string, Blob> = new Map(),
): UsdArchivePackage => {
  const packageRoot = sanitizeUsdIdentifier(exportName || 'robot');
  const configStemBase = `${packageRoot}${packageRoot.includes('description') ? '' : '_description'}`;
  const usdRoot = `${packageRoot}/usd`;
  const configurationRoot = `${usdRoot}/configuration`;
  const rootLayerPath = `${usdRoot}/${packageRoot}.usd`;

  return {
    archiveFileName: `${packageRoot}_usd.zip`,
    rootLayerPath,
    archiveFiles: new Map<string, Blob>([
      [rootLayerPath, createIdentityBlob(layerContents.rootLayerContent)],
      [`${configurationRoot}/${configStemBase}_base.usd`, createIdentityBlob(layerContents.baseLayerContent)],
      [`${configurationRoot}/${configStemBase}_physics.usd`, createIdentityBlob(layerContents.physicsLayerContent)],
      [`${configurationRoot}/${configStemBase}_sensor.usd`, createIdentityBlob(layerContents.sensorLayerContent)],
      ...Array.from(assetFiles.entries()).map(([relativePath, blob]) => [`${usdRoot}/${relativePath}`, blob] as const),
    ]),
  };
};
