import { computeLinkWorldMatrices } from '@/core/robot';
import type { RobotData, UrdfJoint } from '@/types';

const ROOT_LAYOUT_MIN_SPAN = 0.9;
const ROOT_LAYOUT_MAX_SPAN = 2.6;
const ROOT_LAYOUT_GAP = 0.45;
const ROOT_LAYOUT_BODY_PADDING = 0.8;

export interface MergedVisualizerRootPlacement {
  linkId: string;
  position: [number, number, number];
}

interface MatrixWithElements {
  elements: ArrayLike<number>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildChildJointsByParent(
  joints: Record<string, UrdfJoint>,
): Record<string, UrdfJoint[]> {
  const grouped: Record<string, UrdfJoint[]> = {};

  Object.values(joints).forEach((joint) => {
    if (!grouped[joint.parentLinkId]) {
      grouped[joint.parentLinkId] = [];
    }

    grouped[joint.parentLinkId].push(joint);
  });

  return grouped;
}

function collectRootSubtreeLinkIds(
  rootLinkId: string,
  childJointsByParent: Record<string, UrdfJoint[]>,
): string[] {
  const visited = new Set<string>();
  const queue = [rootLinkId];

  while (queue.length > 0) {
    const currentLinkId = queue.shift();
    if (!currentLinkId || visited.has(currentLinkId)) {
      continue;
    }

    visited.add(currentLinkId);
    const childJoints = childJointsByParent[currentLinkId] ?? [];
    childJoints.forEach((joint) => {
      if (!visited.has(joint.childLinkId)) {
        queue.push(joint.childLinkId);
      }
    });
  }

  return [...visited];
}

function estimateRootLayoutSpan(
  rootLinkId: string,
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  childJointsByParent: Record<string, UrdfJoint[]>,
  linkWorldMatrices: Record<string, MatrixWithElements>,
): number {
  const subtreeLinkIds = collectRootSubtreeLinkIds(rootLinkId, childJointsByParent)
    .filter((linkId) => Boolean(robot.links[linkId]));

  if (subtreeLinkIds.length === 0) {
    return ROOT_LAYOUT_MIN_SPAN;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  subtreeLinkIds.forEach((linkId) => {
    const matrix = linkWorldMatrices[linkId];
    const elements = matrix?.elements;
    if (!elements || elements.length < 14) {
      return;
    }

    const x = Number(elements[12] ?? 0);
    const y = Number(elements[13] ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return ROOT_LAYOUT_MIN_SPAN;
  }

  const authoredSpan = Math.max(maxX - minX, maxY - minY);
  return clamp(
    Math.max(authoredSpan + ROOT_LAYOUT_BODY_PADDING, ROOT_LAYOUT_MIN_SPAN),
    ROOT_LAYOUT_MIN_SPAN,
    ROOT_LAYOUT_MAX_SPAN,
  );
}

export function collectMergedVisualizerRootLinkIds(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
): string[] {
  const childLinkIds = new Set<string>();
  Object.values(robot.joints).forEach((joint) => {
    childLinkIds.add(joint.childLinkId);
  });

  const rootLinkIds = [
    robot.rootLinkId,
    ...Object.keys(robot.links).filter((linkId) => !childLinkIds.has(linkId)),
  ].filter((linkId, index, values): linkId is string => (
    Boolean(linkId)
    && Boolean(robot.links[linkId])
    && values.indexOf(linkId) === index
  ));

  if (rootLinkIds.length > 0) {
    return rootLinkIds;
  }

  const fallbackLinkId = Object.keys(robot.links).find((linkId) => Boolean(robot.links[linkId]));
  return fallbackLinkId ? [fallbackLinkId] : [];
}

export function resolveMergedVisualizerRootPlacements(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
): MergedVisualizerRootPlacement[] {
  const rootLinkIds = collectMergedVisualizerRootLinkIds(robot);
  if (rootLinkIds.length <= 1) {
    return rootLinkIds.map((linkId) => ({ linkId, position: [0, 0, 0] }));
  }

  const childJointsByParent = buildChildJointsByParent(robot.joints);
  const linkWorldMatrices = computeLinkWorldMatrices(robot);
  const layoutSpans = rootLinkIds.map((rootLinkId) => (
    estimateRootLayoutSpan(rootLinkId, robot, childJointsByParent, linkWorldMatrices)
  ));
  const totalSpan = layoutSpans.reduce((sum, span) => sum + span, 0)
    + ROOT_LAYOUT_GAP * Math.max(0, layoutSpans.length - 1);

  let cursor = -totalSpan / 2;

  return rootLinkIds.map((linkId, index) => {
    const span = layoutSpans[index] ?? ROOT_LAYOUT_MIN_SPAN;
    const centerX = cursor + span / 2;
    cursor += span + ROOT_LAYOUT_GAP;

    return {
      linkId,
      position: [centerX, 0, 0],
    };
  });
}
