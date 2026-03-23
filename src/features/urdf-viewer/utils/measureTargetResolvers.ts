import * as THREE from 'three';
import { resolveLinkKey } from '@/core/robot';
import type { UrdfLink } from '@/types';
import type { MeasureAnchorMode, MeasureTarget } from './measurements.ts';
import {
  createMeasureTarget,
  getLinkCenterOfMassLocal,
  getLinkMeasurePoint,
  getObjectWorldCenter,
} from './measurements.ts';
import type { ViewerRobotDataResolution } from './viewerRobotData.ts';

export interface MeasureSelectionLike {
  type: 'link' | 'joint' | null;
  id: string | null;
  subType?: 'visual' | 'collision';
  objectIndex?: number;
}

export interface ResolveUsdMeasureTargetOptions {
  resolution: ViewerRobotDataResolution | null | undefined;
  meshesByLinkKey: Map<string, THREE.Mesh[]>;
  linkWorldTransformResolver?: (linkPath: string) => THREE.Matrix4 | null | undefined;
}

function findRobotLinkObject(robotModel: THREE.Object3D, linkName: string): THREE.Object3D | null {
  const links = (robotModel as THREE.Object3D & {
    links?: Record<string, THREE.Object3D>;
  }).links;
  if (links?.[linkName]) {
    return links[linkName];
  }

  let found: THREE.Object3D | null = null;
  robotModel.traverse((child) => {
    if (!found && (child as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink && child.name === linkName) {
      found = child;
    }
  });

  return found;
}

function getEffectiveMeasureSelection(
  selection?: MeasureSelectionLike,
  fallbackSelection?: MeasureSelectionLike,
): MeasureSelectionLike | null {
  if (!selection?.type || !selection.id) {
    return null;
  }

  if (
    fallbackSelection?.type === selection.type
    && fallbackSelection.id === selection.id
    && (selection.subType === undefined || selection.objectIndex === undefined)
  ) {
    return {
      ...selection,
      subType: selection.subType ?? fallbackSelection.subType,
      objectIndex: selection.objectIndex ?? fallbackSelection.objectIndex,
    };
  }

  return selection;
}

function getSelectionObjectType(selection: MeasureSelectionLike): 'visual' | 'collision' {
  return selection.subType === 'collision' ? 'collision' : 'visual';
}

function resolveRobotLinkData(
  robotLinks: Record<string, UrdfLink> | null | undefined,
  identity: string,
  linkObject?: THREE.Object3D | null,
): UrdfLink | null {
  if (!robotLinks) {
    return null;
  }

  const resolvedLinkKey = resolveLinkKey(robotLinks, identity)
    ?? resolveLinkKey(robotLinks, linkObject?.name)
    ?? null;
  if (resolvedLinkKey) {
    return robotLinks[resolvedLinkKey] ?? null;
  }

  return Object.values(robotLinks).find((link) => link.name === identity || link.name === linkObject?.name) ?? null;
}

function resolveUsdLinkId(
  resolution: ViewerRobotDataResolution,
  selection: MeasureSelectionLike,
): string | null {
  if (selection.type === 'link') {
    return selection.id;
  }

  const childLinkPath = resolution.childLinkPathByJointId[selection.id || ''];
  if (!childLinkPath) {
    return null;
  }

  return resolution.linkIdByPath[childLinkPath] ?? null;
}

function resolveUsdLinkPath(
  resolution: ViewerRobotDataResolution,
  selection: MeasureSelectionLike,
): string | null {
  if (selection.type === 'link') {
    return resolution.linkPathById[selection.id || ''] ?? null;
  }

  return resolution.childLinkPathByJointId[selection.id || ''] ?? null;
}

function pickUsdMeasureMesh(
  meshes: THREE.Mesh[],
  objectIndex: number,
): THREE.Mesh | null {
  return meshes.find((mesh) => mesh.userData?.usdObjectIndex === objectIndex)
    ?? meshes[objectIndex]
    ?? meshes[0]
    ?? null;
}

function resolveUsdLinkData(
  resolution: ViewerRobotDataResolution,
  linkId: string,
): UrdfLink | null {
  const directLink = resolution.robotData.links[linkId];
  if (directLink) {
    return directLink;
  }

  return Object.values(resolution.robotData.links).find((link) => (
    link.id === linkId || link.name === linkId
  )) ?? null;
}

export function resolveRobotMeasureTargetFromSelection(
  robot: THREE.Object3D | null,
  robotLinksOrSelection?: Record<string, UrdfLink> | MeasureSelectionLike,
  selectionOrFallback?: MeasureSelectionLike,
  fallbackSelectionOrAnchorMode?: MeasureSelectionLike | MeasureAnchorMode,
  anchorMode: MeasureAnchorMode = 'frame',
): MeasureTarget | null {
  const hasRobotLinks = !robotLinksOrSelection || !('type' in robotLinksOrSelection);
  const robotLinks = hasRobotLinks
    ? (robotLinksOrSelection as Record<string, UrdfLink> | undefined)
    : undefined;
  const selection = hasRobotLinks
    ? selectionOrFallback
    : (robotLinksOrSelection as MeasureSelectionLike | undefined);
  const fallback = hasRobotLinks
    ? (
      typeof fallbackSelectionOrAnchorMode === 'string'
        ? undefined
        : fallbackSelectionOrAnchorMode
    )
    : selectionOrFallback;
  const effectiveAnchorMode = typeof fallbackSelectionOrAnchorMode === 'string'
    ? fallbackSelectionOrAnchorMode
    : anchorMode;
  const effectiveSelection = getEffectiveMeasureSelection(selection, fallback);
  if (!robot || effectiveSelection?.type !== 'link' || !effectiveSelection.id) {
    return null;
  }

  const linkData = resolveRobotLinkData(robotLinks, effectiveSelection.id);
  const linkObject = findRobotLinkObject(robot, effectiveSelection.id)
    ?? findRobotLinkObject(robot, linkData?.name || '');
  if (!linkObject) {
    return null;
  }

  const objectType = getSelectionObjectType(effectiveSelection);
  const objectIndex = effectiveSelection.objectIndex ?? 0;
  const resolvedLinkData = linkData ?? resolveRobotLinkData(robotLinks, effectiveSelection.id, linkObject);

  return createMeasureTarget({
    linkName: effectiveSelection.id,
    objectType,
    objectIndex,
    point: getLinkMeasurePoint(linkObject, resolvedLinkData, effectiveAnchorMode, objectType, objectIndex),
  });
}

export function resolveUsdMeasureTargetFromSelection(
  options: ResolveUsdMeasureTargetOptions,
  selection?: MeasureSelectionLike,
  fallbackSelection?: MeasureSelectionLike,
  anchorMode: MeasureAnchorMode = 'frame',
): MeasureTarget | null {
  const effectiveSelection = getEffectiveMeasureSelection(selection, fallbackSelection);
  const resolution = options.resolution;
  if (!resolution || !effectiveSelection?.type || !effectiveSelection.id) {
    return null;
  }

  const linkId = resolveUsdLinkId(resolution, effectiveSelection);
  const linkPath = resolveUsdLinkPath(resolution, effectiveSelection);
  if (!linkId || !linkPath) {
    return null;
  }

  const objectType = getSelectionObjectType(effectiveSelection);
  const objectIndex = effectiveSelection.objectIndex ?? 0;
  const linkData = resolveUsdLinkData(resolution, linkId);
  const linkWorldMatrix = options.linkWorldTransformResolver?.(linkPath);
  const linkFramePoint = linkWorldMatrix
    ? new THREE.Vector3().setFromMatrixPosition(linkWorldMatrix)
    : null;

  if (anchorMode === 'centerOfMass' && linkWorldMatrix) {
    const centerOfMassLocal = getLinkCenterOfMassLocal(linkData);
    if (centerOfMassLocal) {
      return createMeasureTarget({
        linkName: linkId,
        objectType,
        objectIndex,
        point: centerOfMassLocal.applyMatrix4(linkWorldMatrix),
      });
    }
  }

  if ((anchorMode === 'frame' || anchorMode === 'centerOfMass') && linkFramePoint) {
    return createMeasureTarget({
      linkName: linkId,
      objectType,
      objectIndex,
      point: linkFramePoint,
    });
  }

  const meshes = options.meshesByLinkKey.get(`${linkPath}:${objectType}`) || [];
  const targetMesh = pickUsdMeasureMesh(meshes, objectIndex);
  if (targetMesh) {
    return createMeasureTarget({
      linkName: linkId,
      objectType,
      objectIndex,
      point: getObjectWorldCenter(targetMesh),
    });
  }

  if (linkFramePoint) {
    return createMeasureTarget({
      linkName: linkId,
      objectType,
      objectIndex,
      point: linkFramePoint,
    });
  }

  return null;
}
