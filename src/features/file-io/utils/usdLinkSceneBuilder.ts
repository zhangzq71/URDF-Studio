import * as THREE from 'three';

import type { RobotState, UrdfJoint, UrdfLink, UrdfVisual } from '../../../types/index.ts';
import {
  getVisualGeometryEntries,
  hasBoxFaceMaterialPalette,
  resolveVisualMaterialOverride,
} from '@/core/robot';
import {
  buildColladaRootNormalizationHints,
  type ColladaRootNormalizationHints,
} from '../../../core/loaders/colladaRootNormalization.ts';
import {
  USD_GEOMETRY_TYPES as GEOMETRY_TYPES,
  buildUsdVisualSceneNode,
  getUsdGeometryType as getGeometryType,
  type UsdMaterialMetadata,
  type UsdMeshCompressionOptions,
} from './usdSceneNodeFactory.ts';
import { type UsdAssetRegistry } from './usdAssetRegistry.ts';
import { applyUsdMaterialMetadata } from './usdSceneSerialization.ts';
import { sanitizeUsdIdentifier } from './usdTextFormatting.ts';

export type BuildUsdLinkSceneRootOptions = {
  robot: RobotState;
  registry: UsdAssetRegistry;
  meshCompression?: UsdMeshCompressionOptions;
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
  onLinkVisit?: (link: UrdfLink) => void | Promise<void>;
};

type DeferredSceneMutation = Promise<void>;

const resolveLinkMaterialEntry = (
  robot: RobotState,
  link: UrdfLink,
  visual: UrdfVisual,
  options: { isPrimaryVisual: boolean },
): UsdMaterialMetadata => {
  const resolvedMaterial = resolveVisualMaterialOverride(robot, link, visual, {
    isPrimaryVisual: options.isPrimaryVisual,
  });

  if (resolvedMaterial.source === 'authored') {
    if (resolvedMaterial.isMultiMaterial) {
      return {
        preserveEmbeddedMaterials: true,
      };
    }

    return {
      color: resolvedMaterial.color || undefined,
      texture: resolvedMaterial.texture || undefined,
      forceUniformOverride: true,
    };
  }

  if (resolvedMaterial.source === 'legacy-link') {
    return {
      color:
        resolvedMaterial.color ||
        (resolvedMaterial.texture ? '#ffffff' : undefined) ||
        visual.color ||
        undefined,
      texture: resolvedMaterial.texture || undefined,
      forceUniformOverride: true,
    };
  }

  return {
    color: visual.color || undefined,
  };
};

const rpyToQuaternion = (r: number, p: number, y: number): THREE.Quaternion => {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(r, p, y, 'ZYX'));
};

const createJointLocalMatrix = (joint: UrdfJoint): THREE.Matrix4 => {
  const originPosition = new THREE.Vector3(
    joint.origin?.xyz?.x ?? 0,
    joint.origin?.xyz?.y ?? 0,
    joint.origin?.xyz?.z ?? 0,
  );
  const originQuaternion = rpyToQuaternion(
    joint.origin?.rpy?.r ?? 0,
    joint.origin?.rpy?.p ?? 0,
    joint.origin?.rpy?.y ?? 0,
  );

  const originMatrix = new THREE.Matrix4().compose(
    originPosition,
    originQuaternion,
    new THREE.Vector3(1, 1, 1),
  );

  const motionMatrix = new THREE.Matrix4();
  const axis = new THREE.Vector3(joint.axis?.x ?? 1, joint.axis?.y ?? 0, joint.axis?.z ?? 0);
  if (axis.lengthSq() <= 1e-12) {
    axis.set(1, 0, 0);
  } else {
    axis.normalize();
  }

  const jointType = String(joint.type || '').toLowerCase();
  if (jointType === 'revolute' || jointType === 'continuous') {
    motionMatrix.makeRotationAxis(axis, typeof joint.angle === 'number' ? joint.angle : 0);
  } else if (jointType === 'prismatic') {
    motionMatrix.makeTranslation(
      axis.x * (typeof joint.angle === 'number' ? joint.angle : 0),
      axis.y * (typeof joint.angle === 'number' ? joint.angle : 0),
      axis.z * (typeof joint.angle === 'number' ? joint.angle : 0),
    );
  } else if ((jointType === 'ball' || jointType === 'floating') && joint.quaternion) {
    motionMatrix.makeRotationFromQuaternion(
      new THREE.Quaternion(
        joint.quaternion.x,
        joint.quaternion.y,
        joint.quaternion.z,
        joint.quaternion.w,
      ),
    );
  } else {
    motionMatrix.identity();
  }

  return originMatrix.multiply(motionMatrix);
};

const getCollisionVisuals = (link: UrdfLink): UrdfVisual[] => {
  return [
    ...(getGeometryType(link.collision?.type) === GEOMETRY_TYPES.NONE ? [] : [link.collision]),
    ...(link.collisionBodies || []).filter(
      (body) => getGeometryType(body.type) !== GEOMETRY_TYPES.NONE,
    ),
  ];
};

const buildChildIdsByParent = (robot: RobotState): Map<string, string[]> => {
  const childIdsByParent = new Map<string, string[]>();
  Object.values(robot.joints).forEach((joint) => {
    const children = childIdsByParent.get(joint.parentLinkId) || [];
    children.push(joint.childLinkId);
    childIdsByParent.set(joint.parentLinkId, children);
  });
  return childIdsByParent;
};

const buildJointsByChild = (robot: RobotState): Map<string, UrdfJoint> => {
  const jointsByChild = new Map<string, UrdfJoint>();
  Object.values(robot.joints).forEach((joint) => {
    jointsByChild.set(joint.childLinkId, joint);
  });
  return jointsByChild;
};

const buildLinkSceneNode = async (
  robot: RobotState,
  linkId: string,
  childIdsByParent: Map<string, string[]>,
  jointsByChild: Map<string, UrdfJoint>,
  registry: UsdAssetRegistry,
  pendingSceneMutations: DeferredSceneMutation[],
  meshCompression?: UsdMeshCompressionOptions,
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null,
  onLinkVisit?: (link: UrdfLink) => void | Promise<void>,
): Promise<THREE.Group> => {
  const link = robot.links[linkId];
  const group = new THREE.Group();
  group.name = sanitizeUsdIdentifier(linkId);

  if (!link) {
    return group;
  }

  group.userData.usdLink = {
    id: link.id,
    name: link.name,
  };
  await onLinkVisit?.(link);

  const visuals = getVisualGeometryEntries(link);
  if (visuals.length > 0) {
    const visualsScope = new THREE.Group();
    visualsScope.name = 'visuals';
    group.add(visualsScope);

    const visualNodePromises = visuals.map(async (visualEntry, index) => {
      const visual = visualEntry.geometry;
      const materialState = resolveLinkMaterialEntry(robot, link, visual, {
        isPrimaryVisual: visualEntry.bodyIndex === null,
      });
      const visualNode = await buildUsdVisualSceneNode({
        visual,
        role: 'visual',
        registry,
        materialState,
        meshCompression,
        colladaRootNormalizationHints,
      });
      if (!visualNode) {
        return null;
      }

      visualNode.name = `visual_${index}`;
      if (!hasBoxFaceMaterialPalette(visual) && (materialState.color || materialState.texture)) {
        applyUsdMaterialMetadata(visualNode, materialState);
      }

      return visualNode;
    });

    pendingSceneMutations.push(
      Promise.all(visualNodePromises).then((visualNodes) => {
        visualNodes.forEach((visualNode) => {
          if (visualNode) {
            visualsScope.add(visualNode);
          }
        });

        if (visualsScope.children.length === 0) {
          group.remove(visualsScope);
        }
      }),
    );
  }

  const collisions = getCollisionVisuals(link);
  if (collisions.length > 0) {
    const collidersScope = new THREE.Group();
    collidersScope.name = 'collisions';
    group.add(collidersScope);

    const collisionNodePromises = collisions.map(async (collision, index) => {
      const collisionNode = await buildUsdVisualSceneNode({
        visual: collision,
        role: 'collision',
        registry,
        meshCompression,
        colladaRootNormalizationHints,
      });
      if (!collisionNode) {
        return null;
      }

      collisionNode.name = `collision_${index}`;
      collisionNode.userData.usdPurpose = 'guide';
      collisionNode.userData.usdCollision = true;
      if (getGeometryType(collision.type) === GEOMETRY_TYPES.MESH) {
        collisionNode.userData.usdMeshCollision = true;
      }

      return collisionNode;
    });

    pendingSceneMutations.push(
      Promise.all(collisionNodePromises).then((collisionNodes) => {
        collisionNodes.forEach((collisionNode) => {
          if (collisionNode) {
            collidersScope.add(collisionNode);
          }
        });

        if (collidersScope.children.length === 0) {
          group.remove(collidersScope);
        }
      }),
    );
  }

  const childLinkIds = childIdsByParent.get(linkId) || [];
  if (childLinkIds.length > 0) {
    const childNodes = await Promise.all(
      childLinkIds.map((childLinkId) =>
        buildLinkSceneNode(
          robot,
          childLinkId,
          childIdsByParent,
          jointsByChild,
          registry,
          pendingSceneMutations,
          meshCompression,
          colladaRootNormalizationHints,
          onLinkVisit,
        ),
      ),
    );

    childLinkIds.forEach((childLinkId, index) => {
      const childNode = childNodes[index];
      const joint = jointsByChild.get(childLinkId);
      if (joint) {
        const jointMatrix = createJointLocalMatrix(joint);
        jointMatrix.decompose(childNode.position, childNode.quaternion, childNode.scale);
      }

      group.add(childNode);
    });
  }

  return group;
};

export const flattenUsdLinkSceneHierarchy = (sceneRoot: THREE.Object3D): void => {
  sceneRoot.updateMatrixWorld(true);

  const nestedLinkNodes: THREE.Object3D[] = [];
  sceneRoot.traverse((node) => {
    if (node === sceneRoot) {
      return;
    }
    if (!node.userData?.usdLink) {
      return;
    }
    if (node.parent === sceneRoot) {
      return;
    }
    nestedLinkNodes.push(node);
  });

  nestedLinkNodes.forEach((node) => {
    sceneRoot.attach(node);
  });
};

export const buildUsdLinkSceneRoot = async ({
  robot,
  registry,
  meshCompression,
  colladaRootNormalizationHints,
  onLinkVisit,
}: BuildUsdLinkSceneRootOptions): Promise<THREE.Group> => {
  const resolvedHints =
    colladaRootNormalizationHints ?? buildColladaRootNormalizationHints(robot.links);
  const pendingSceneMutations: DeferredSceneMutation[] = [];
  const root = await buildLinkSceneNode(
    robot,
    robot.rootLinkId,
    buildChildIdsByParent(robot),
    buildJointsByChild(robot),
    registry,
    pendingSceneMutations,
    meshCompression,
    resolvedHints,
    onLinkVisit,
  );

  const mutationResults = await Promise.allSettled(pendingSceneMutations);
  const rejectedMutation = mutationResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejectedMutation) {
    throw rejectedMutation.reason;
  }

  return root;
};
