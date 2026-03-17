import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare2, LocateFixed, Square, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  CollisionOptimizationAnalysis,
  CollisionOptimizationCandidate,
  CollisionOptimizationManualMergePair,
  CollisionOptimizationSource,
  CollisionTargetRef,
} from '../utils/collisionOptimization';
import { buildCollisionOptimizationSkeletonProjection } from '../utils/collisionOptimization';
import { GeometryType } from '@/types';

const GRAPH_PADDING = 32;
const COMPONENT_GAP = 168;
const CARD_WIDTH = 168;
const CARD_HEADER_HEIGHT = 26;
const CARD_PADDING = 6;
const ROW_HEIGHT = 30;
const EMPTY_CARD_HEIGHT = 34;
const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
const CALLOUT_COLUMN_GAP = 84;
const CALLOUT_STACK_GAP = 12;
const CALLOUT_DRAG_ALLOWANCE = 64;

type CalloutSide = 'left' | 'right';

interface CollisionSelection {
  type: 'link' | 'joint' | null;
  id: string | null;
  subType?: 'visual' | 'collision';
  objectIndex?: number;
}

interface GraphPoint {
  x: number;
  y: number;
}

interface GestureLikeEvent extends Event {
  clientX: number;
  clientY: number;
  scale: number;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

interface GraphCalloutColumn {
  originX: number;
  minLeft: number;
  maxLeft: number;
}

interface GraphCalloutColumns {
  left: GraphCalloutColumn;
  right: GraphCalloutColumn;
}

interface SourceLinkMeta {
  componentId?: string;
  componentName?: string;
  linkId: string;
  linkName: string;
}

interface BaseGraphTargetRow {
  target: CollisionTargetRef;
  localX: number;
  localY: number;
  width: number;
  height: number;
}

interface GraphTargetRow extends BaseGraphTargetRow {
  x: number;
  y: number;
  anchorIn: GraphPoint;
  anchorOut: GraphPoint;
}

interface BaseGraphLinkCard {
  id: string;
  componentId?: string;
  componentName?: string;
  linkId: string;
  linkName: string;
  clusterId: string;
  side: CalloutSide;
  anchor: GraphPoint;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: BaseGraphTargetRow[];
}

interface GraphLinkCard extends BaseGraphLinkCard {
  rows: GraphTargetRow[];
}

interface GraphStructureLink {
  id: string;
  fromLinkId: string;
  toLinkId: string;
}

interface GraphStructureEdge {
  id: string;
  from: GraphPoint;
  to: GraphPoint;
}

interface GraphPairRelation {
  id: string;
  candidate: CollisionOptimizationCandidate;
  sourceTargetId: string;
  targetTargetId: string;
  manual: boolean;
}

interface GraphPairEdge {
  id: string;
  candidate: CollisionOptimizationCandidate;
  sourceRow: GraphTargetRow;
  targetRow: GraphTargetRow;
  manual: boolean;
}

interface GraphModel {
  cards: BaseGraphLinkCard[];
  structureLinks: GraphStructureLink[];
  pairRelations: GraphPairRelation[];
  skeletonBounds: GraphBounds;
  calloutColumns: GraphCalloutColumns;
  width: number;
  height: number;
}

interface GraphRenderModel {
  cards: GraphLinkCard[];
  rowByTargetId: Map<string, GraphTargetRow>;
  structureEdges: GraphStructureEdge[];
  pairEdges: GraphPairEdge[];
  skeletonBounds: GraphBounds;
  calloutColumns: GraphCalloutColumns;
  width: number;
  height: number;
}

interface PanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startViewport: ViewportState;
}

interface CardDragSession {
  pointerId: number;
  cardId: string;
  side: CalloutSide;
  startWorld: GraphPoint;
  startCardPosition: GraphPoint;
}

export interface CollisionOptimizationPlanarGraphConnectionState {
  sourceTargetId: string;
  pointer: GraphPoint | null;
}

export interface CollisionOptimizationPlanarGraphLabels {
  autoPair: string;
  collisionIndex: string;
  component: string;
  connectionHandle: string;
  dragHint: string;
  empty: string;
  frontView: string;
  manualPair: string;
  mergeTo: string;
  mergedInto: string;
  primary: string;
  resetView: string;
  selectCandidate: string;
  unselectCandidate: string;
  zoomIn: string;
  zoomOut: string;
}

export interface CollisionOptimizationPlanarGraphProps {
  source: CollisionOptimizationSource;
  analysis: CollisionOptimizationAnalysis;
  candidates: CollisionOptimizationCandidate[];
  checkedTargetIds: ReadonlySet<string>;
  selection?: CollisionSelection;
  manualMergePairs: CollisionOptimizationManualMergePair[];
  manualConnection?: CollisionOptimizationPlanarGraphConnectionState | null;
  labels: CollisionOptimizationPlanarGraphLabels;
  formatGeometryType: (type: GeometryType | null | undefined) => string;
  canCreateManualPair: (sourceTargetId: string, targetTargetId: string) => boolean;
  onToggleCandidate: (targetId: string) => void;
  onSelectTarget?: (target: CollisionTargetRef) => void;
  onManualConnectionStart?: (target: CollisionTargetRef) => void;
  onManualConnectionMove?: (pointer: GraphPoint) => void;
  onManualConnectionEnd?: (target: CollisionTargetRef | null) => void;
  onManualConnectionCancel?: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildPairKey(leftTargetId: string, rightTargetId: string): string {
  return `${leftTargetId}::${rightTargetId}`;
}

function compareTargets(left: CollisionTargetRef, right: CollisionTargetRef): number {
  return left.sequenceIndex - right.sequenceIndex
    || left.objectIndex - right.objectIndex
    || left.linkName.localeCompare(right.linkName)
    || (left.componentName ?? '').localeCompare(right.componentName ?? '');
}

function getDisplayTypeLabel(
  target: CollisionTargetRef,
  _labels: Pick<CollisionOptimizationPlanarGraphLabels, 'primary' | 'collisionIndex'>,
): string {
  return target.isPrimary
    ? 'P'
    : `#${target.sequenceIndex + 1}`;
}

function buildCurvePath(from: GraphPoint, to: GraphPoint): string {
  const horizontalOffset = Math.max(48, Math.abs(to.x - from.x) * 0.35);
  return `M ${from.x} ${from.y} C ${from.x + horizontalOffset} ${from.y}, ${to.x - horizontalOffset} ${to.y}, ${to.x} ${to.y}`;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function collectSourceLinkMetas(source: CollisionOptimizationSource): SourceLinkMeta[] {
  if (source.kind === 'robot') {
    return Object.values(source.robot.links).map((link) => ({
      linkId: link.id,
      linkName: link.name || link.id,
    }));
  }

  return Object.values(source.assembly.components).flatMap((component) =>
    Object.values(component.robot.links).map((link) => ({
      componentId: component.id,
      componentName: component.name,
      linkId: link.id,
      linkName: link.name || link.id,
    })),
  );
}

function getFallbackAnchor(index: number): GraphPoint {
  return {
    x: GRAPH_PADDING + index * 160,
    y: GRAPH_PADDING + (index % 5) * 96,
  };
}

function computeBounds(points: GraphPoint[]): GraphBounds {
  if (points.length === 0) {
    return {
      minX: GRAPH_PADDING,
      maxX: GRAPH_PADDING,
      minY: GRAPH_PADDING,
      maxY: GRAPH_PADDING,
      centerX: GRAPH_PADDING,
      centerY: GRAPH_PADDING,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function expandBounds(bounds: GraphBounds, marginX: number, marginY: number): GraphBounds {
  return {
    minX: bounds.minX - marginX,
    maxX: bounds.maxX + marginX,
    minY: bounds.minY - marginY,
    maxY: bounds.maxY + marginY,
    centerX: bounds.centerX,
    centerY: bounds.centerY,
  };
}

function getFocusBounds(model: Pick<GraphModel, 'skeletonBounds'>): GraphBounds {
  const skeletonWidth = Math.max(model.skeletonBounds.maxX - model.skeletonBounds.minX, 120);
  const skeletonHeight = Math.max(model.skeletonBounds.maxY - model.skeletonBounds.minY, 140);

  return expandBounds(
    model.skeletonBounds,
    Math.max(CARD_WIDTH * 0.72, skeletonWidth * 0.22),
    Math.max(88, skeletonHeight * 0.28),
  );
}

function createViewportForBounds(
  container: HTMLDivElement,
  bounds: GraphBounds,
): ViewportState {
  const availableWidth = Math.max(container.clientWidth - 56, 320);
  const availableHeight = Math.max(container.clientHeight - 56, 240);
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 160);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 160);
  const scale = clamp(
    Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight),
    0.5,
    1.85,
  );

  return {
    scale,
    x: (container.clientWidth / 2) - bounds.centerX * scale,
    y: (container.clientHeight / 2) - bounds.centerY * scale,
  };
}

function layoutCalloutPositions(
  cards: BaseGraphLinkCard[],
  columns: GraphCalloutColumns,
): Record<string, GraphPoint> {
  const positions: Record<string, GraphPoint> = {};

  (['left', 'right'] as const).forEach((side) => {
    const sideCards = cards
      .filter((card) => card.side === side)
      .sort((left, right) => left.anchor.y - right.anchor.y || left.anchor.x - right.anchor.x);
    let cursorY = GRAPH_PADDING;

    sideCards.forEach((card, index) => {
      const column = columns[side];
      const desiredY = Math.max(GRAPH_PADDING, card.anchor.y - card.height / 2);
      const laneOffset = (index % 2) * 8;
      const left =
        side === 'left'
          ? clamp(column.originX + laneOffset, column.minLeft, column.maxLeft)
          : clamp(column.originX + laneOffset, column.minLeft, column.maxLeft);
      const top = Math.max(desiredY, cursorY);

      positions[card.id] = { x: left, y: top };
      cursorY = top + card.height + CALLOUT_STACK_GAP;
    });
  });

  return positions;
}

function buildGraphModel(
  source: CollisionOptimizationSource,
  targets: CollisionTargetRef[],
  candidates: CollisionOptimizationCandidate[],
  manualMergePairs: CollisionOptimizationManualMergePair[],
): GraphModel {
  const projection = buildCollisionOptimizationSkeletonProjection(source, { viewMode: 'front' });
  const linkMetas = collectSourceLinkMetas(source);
  const targetsByLinkId = new Map<string, CollisionTargetRef[]>();

  targets.forEach((target) => {
    const bucket = targetsByLinkId.get(target.linkId) ?? [];
    bucket.push(target);
    targetsByLinkId.set(target.linkId, bucket);
  });

  const scaledProjectedPoints = new Map<string, GraphPoint>();
  const projectedNodes = Object.values(projection.nodes);
  const edgeDistances = projection.edges.flatMap((edge) => {
    const fromNode = projection.nodes[edge.fromLinkId];
    const toNode = projection.nodes[edge.toLinkId];
    if (!fromNode || !toNode) {
      return [];
    }

    const deltaX = fromNode.projected.x - toNode.projected.x;
    const deltaY = fromNode.projected.y - toNode.projected.y;
    const distance = Math.hypot(deltaX, deltaY);
    return distance > 1e-6 ? [distance] : [];
  });
  const typicalEdgeDistance = Math.max(median(edgeDistances), 1e-3);
  const pixelsPerUnit = clamp(96 / typicalEdgeDistance, 180, 4800);

  projectedNodes.forEach((node) => {
    scaledProjectedPoints.set(node.linkId, {
      x: node.projected.x * pixelsPerUnit,
      y: node.projected.y * pixelsPerUnit,
    });
  });

  const clusterBounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
  projectedNodes.forEach((node) => {
    const point = scaledProjectedPoints.get(node.linkId);
    if (!point) {
      return;
    }

    const current = clusterBounds.get(node.clusterId);
    if (!current) {
      clusterBounds.set(node.clusterId, {
        minX: point.x,
        maxX: point.x,
        minY: point.y,
        maxY: point.y,
      });
      return;
    }

    current.minX = Math.min(current.minX, point.x);
    current.maxX = Math.max(current.maxX, point.x);
    current.minY = Math.min(current.minY, point.y);
    current.maxY = Math.max(current.maxY, point.y);
  });

  const clusterOrder = [...clusterBounds.entries()]
    .sort((left, right) => left[1].minX - right[1].minX || left[0].localeCompare(right[0]))
    .map(([clusterId]) => clusterId);
  const clusterOffsetX = new Map<string, number>();
  let clusterCursorX = GRAPH_PADDING + CARD_WIDTH + CALLOUT_COLUMN_GAP;
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;

  projectedNodes.forEach((node) => {
    const point = scaledProjectedPoints.get(node.linkId);
    if (!point) {
      return;
    }

    globalMinY = Math.min(globalMinY, point.y);
    globalMaxY = Math.max(globalMaxY, point.y);
  });

  if (!Number.isFinite(globalMinY)) {
    globalMinY = 0;
    globalMaxY = 0;
  }

  clusterOrder.forEach((clusterId) => {
    const bounds = clusterBounds.get(clusterId);
    if (!bounds) {
      return;
    }

    clusterOffsetX.set(clusterId, clusterCursorX - bounds.minX);
    clusterCursorX += (bounds.maxX - bounds.minX) + COMPONENT_GAP;
  });

  const anchorByLinkId = new Map<string, GraphPoint>();
  const clusterCenterX = new Map<string, number>();

  projectedNodes.forEach((node) => {
    const point = scaledProjectedPoints.get(node.linkId);
    if (!point) {
      return;
    }

    anchorByLinkId.set(node.linkId, {
      x: point.x + (clusterOffsetX.get(node.clusterId) ?? GRAPH_PADDING),
      y: point.y - globalMinY + GRAPH_PADDING,
    });
  });

  const skeletonBounds = computeBounds([...anchorByLinkId.values()]);

  clusterOrder.forEach((clusterId) => {
    const bounds = clusterBounds.get(clusterId);
    const offsetX = clusterOffsetX.get(clusterId);
    if (!bounds || offsetX == null) {
      return;
    }

    clusterCenterX.set(clusterId, (bounds.minX + bounds.maxX) / 2 + offsetX);
  });

  const orderedLinkMetas = [...linkMetas].sort((left, right) => {
    const leftNode = projection.nodes[left.linkId];
    const rightNode = projection.nodes[right.linkId];
    const leftClusterIndex = clusterOrder.indexOf(leftNode?.clusterId ?? '');
    const rightClusterIndex = clusterOrder.indexOf(rightNode?.clusterId ?? '');

    return (leftClusterIndex === -1 ? Number.MAX_SAFE_INTEGER : leftClusterIndex)
      - (rightClusterIndex === -1 ? Number.MAX_SAFE_INTEGER : rightClusterIndex)
      || (anchorByLinkId.get(left.linkId)?.y ?? 0) - (anchorByLinkId.get(right.linkId)?.y ?? 0)
      || (anchorByLinkId.get(left.linkId)?.x ?? 0) - (anchorByLinkId.get(right.linkId)?.x ?? 0)
      || left.linkName.localeCompare(right.linkName);
  });

  const cards = orderedLinkMetas.map((linkMeta, index) => {
    const linkTargets = [...(targetsByLinkId.get(linkMeta.linkId) ?? [])].sort(compareTargets);
    const rows = linkTargets.map((target, rowIndex) => ({
      target,
      localX: CARD_PADDING,
      localY: CARD_HEADER_HEIGHT + CARD_PADDING + rowIndex * ROW_HEIGHT,
      width: CARD_WIDTH - CARD_PADDING * 2,
      height: ROW_HEIGHT - 2,
    }));
    const hasCollisions = rows.length > 0;
    const width = hasCollisions
      ? CARD_WIDTH
      : clamp(96 + linkMeta.linkName.length * 6, 104, 180);
    const height = hasCollisions
      ? CARD_HEADER_HEIGHT + CARD_PADDING * 2 + rows.length * ROW_HEIGHT
      : EMPTY_CARD_HEIGHT;
    const projectionNode = projection.nodes[linkMeta.linkId];
    const clusterId = projectionNode?.clusterId ?? 'cluster-0';
    const anchor = anchorByLinkId.get(linkMeta.linkId) ?? getFallbackAnchor(index);
    const clusterMidX = clusterCenterX.get(clusterId) ?? skeletonBounds.centerX;
    const side: CalloutSide = anchor.x <= clusterMidX ? 'left' : 'right';

    return {
      id: `${linkMeta.componentId ?? 'robot'}::${linkMeta.linkId}`,
      componentId: linkMeta.componentId,
      componentName: linkMeta.componentName,
      linkId: linkMeta.linkId,
      linkName: linkMeta.linkName,
      clusterId,
      side,
      anchor,
      x: side === 'left' ? GRAPH_PADDING : skeletonBounds.maxX + CALLOUT_COLUMN_GAP,
      y: anchor.y - height / 2,
      width,
      height,
      rows,
    };
  });

  const leftColumnWidth = cards.reduce(
    (maxWidth, card) => card.side === 'left' ? Math.max(maxWidth, card.width) : maxWidth,
    0,
  );
  const leftOriginX = Math.max(
    GRAPH_PADDING,
    skeletonBounds.minX - CALLOUT_COLUMN_GAP - Math.max(leftColumnWidth, CARD_WIDTH),
  );
  const rightOriginX = skeletonBounds.maxX + CALLOUT_COLUMN_GAP;
  const calloutColumns: GraphCalloutColumns = {
    left: {
      originX: leftOriginX,
      minLeft: Math.max(8, leftOriginX - CALLOUT_DRAG_ALLOWANCE),
      maxLeft: Math.max(GRAPH_PADDING, skeletonBounds.minX - Math.max(leftColumnWidth, CARD_WIDTH) - 20),
    },
    right: {
      originX: rightOriginX,
      minLeft: skeletonBounds.maxX + 20,
      maxLeft: rightOriginX + CALLOUT_DRAG_ALLOWANCE,
    },
  };

  const spreadPositions = layoutCalloutPositions(cards, calloutColumns);
  const laidOutCards = cards.map((card) => ({
    ...card,
    x: spreadPositions[card.id]?.x ?? card.x,
    y: spreadPositions[card.id]?.y ?? card.y,
  }));

  const manualPairKeys = new Set(
    manualMergePairs.map((pair) => buildPairKey(pair.primaryTargetId, pair.secondaryTargetId)),
  );
  const pairRelations = new Map<string, GraphPairRelation>();

  candidates.forEach((candidate) => {
    if (!candidate.secondaryTarget) {
      return;
    }

    const relationKey = buildPairKey(candidate.target.id, candidate.secondaryTarget.id);
    const manual = manualPairKeys.has(relationKey);
    const existing = pairRelations.get(relationKey);
    if (!existing || manual) {
      pairRelations.set(relationKey, {
        id: relationKey,
        candidate,
        sourceTargetId: candidate.target.id,
        targetTargetId: candidate.secondaryTarget.id,
        manual,
      });
    }
  });

  const width = Math.max(
    clusterCursorX,
    laidOutCards.reduce(
      (maxWidth, card) => Math.max(maxWidth, card.x + card.width + GRAPH_PADDING, card.anchor.x + GRAPH_PADDING),
      GRAPH_PADDING * 2,
    ),
  );
  const height = Math.max(
    globalMaxY - globalMinY + GRAPH_PADDING * 2,
    laidOutCards.reduce(
      (maxHeight, card) => Math.max(maxHeight, card.y + card.height + GRAPH_PADDING, card.anchor.y + GRAPH_PADDING),
      GRAPH_PADDING * 2,
    ),
  );

  return {
    cards: laidOutCards,
    structureLinks: projection.edges.map((edge) => ({
      id: edge.id,
      fromLinkId: edge.fromLinkId,
      toLinkId: edge.toLinkId,
    })),
    pairRelations: [...pairRelations.values()],
    skeletonBounds,
    calloutColumns,
    width,
    height,
  };
}

function resolveGraphModel(
  model: GraphModel,
  cardPositions: Record<string, GraphPoint>,
): GraphRenderModel {
  const rowByTargetId = new Map<string, GraphTargetRow>();
  const cards = model.cards.map((card) => {
    const position = cardPositions[card.id] ?? { x: card.x, y: card.y };
    const rows = card.rows.map((row) => {
      const inwardAnchorX = card.side === 'left'
        ? position.x + card.width - 8
        : position.x + 8;
      const absoluteRow: GraphTargetRow = {
        ...row,
        x: position.x + row.localX,
        y: position.y + row.localY,
        anchorIn: {
          x: inwardAnchorX,
          y: position.y + row.localY + row.height / 2,
        },
        anchorOut: {
          x: inwardAnchorX,
          y: position.y + row.localY + row.height / 2,
        },
      };

      rowByTargetId.set(row.target.id, absoluteRow);
      return absoluteRow;
    });

    return {
      ...card,
      x: position.x,
      y: position.y,
      rows,
    };
  });

  const cardByLinkId = new Map(cards.map((card) => [card.linkId, card] as const));
  const structureEdges = model.structureLinks.flatMap((link) => {
    const fromCard = cardByLinkId.get(link.fromLinkId);
    const toCard = cardByLinkId.get(link.toLinkId);
    if (!fromCard || !toCard) {
      return [];
    }

    return [{
      id: link.id,
      from: fromCard.anchor,
      to: toCard.anchor,
    }];
  });

  const pairEdges = model.pairRelations.flatMap((relation) => {
    const sourceRow = rowByTargetId.get(relation.sourceTargetId);
    const targetRow = rowByTargetId.get(relation.targetTargetId);
    if (!sourceRow || !targetRow) {
      return [];
    }

    return [{
      id: relation.id,
      candidate: relation.candidate,
      sourceRow,
      targetRow,
      manual: relation.manual,
    }];
  });

  const width = Math.max(
    model.width,
    cards.reduce(
      (maxWidth, card) => Math.max(maxWidth, card.x + card.width + GRAPH_PADDING, card.anchor.x + GRAPH_PADDING),
      0,
    ),
  );
  const height = Math.max(
    model.height,
    cards.reduce(
      (maxHeight, card) => Math.max(maxHeight, card.y + card.height + GRAPH_PADDING, card.anchor.y + GRAPH_PADDING),
      0,
    ),
  );

  return {
    cards,
    rowByTargetId,
    structureEdges,
    pairEdges,
    skeletonBounds: model.skeletonBounds,
    calloutColumns: model.calloutColumns,
    width,
    height,
  };
}

function getPairSummary(
  target: CollisionTargetRef,
  pairByPrimaryTargetId: Map<string, GraphPairEdge>,
  pairBySecondaryTargetId: Map<string, GraphPairEdge>,
  candidateByTargetId: Map<string, CollisionOptimizationCandidate>,
  labels: Pick<CollisionOptimizationPlanarGraphLabels, 'autoPair' | 'manualPair' | 'mergeTo' | 'mergedInto'>,
  formatGeometryType: (type: GeometryType | null | undefined) => string,
): { tone: 'manual' | 'auto' | 'single'; label: string } | null {
  const outgoingPair = pairByPrimaryTargetId.get(target.id);
  if (outgoingPair) {
    return {
      tone: outgoingPair.manual ? 'manual' : 'auto',
      label: `${outgoingPair.manual ? labels.manualPair : labels.autoPair} -> ${formatGeometryType(outgoingPair.candidate.suggestedType)}`,
    };
  }

  const incomingPair = pairBySecondaryTargetId.get(target.id);
  if (incomingPair) {
    return {
      tone: incomingPair.manual ? 'manual' : 'auto',
      label: `${incomingPair.manual ? labels.manualPair : labels.autoPair} · ${labels.mergedInto} ${incomingPair.candidate.target.linkName}`,
    };
  }

  const candidate = candidateByTargetId.get(target.id);
  if (!candidate) {
    return null;
  }

  return {
    tone: 'single',
    label: candidate.suggestedType ? `-> ${formatGeometryType(candidate.suggestedType)}` : '—',
  };
}

function getSummaryClass(tone: 'manual' | 'auto' | 'single'): string {
  switch (tone) {
    case 'manual':
      return 'border-system-blue/25 bg-system-blue/10 text-system-blue';
    case 'auto':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'single':
    default:
      return 'border-border-black bg-panel-bg text-text-secondary';
  }
}

function getCardTetherPoint(card: GraphLinkCard): GraphPoint {
  return {
    x: clamp(card.anchor.x, card.x, card.x + card.width),
    y: clamp(card.anchor.y, card.y, card.y + card.height),
  };
}

export function CollisionOptimizationPlanarGraph({
  source,
  analysis,
  candidates,
  checkedTargetIds,
  selection,
  manualMergePairs,
  manualConnection = null,
  labels,
  formatGeometryType,
  canCreateManualPair,
  onToggleCandidate,
  onSelectTarget,
  onManualConnectionStart,
  onManualConnectionMove,
  onManualConnectionEnd,
  onManualConnectionCancel,
}: CollisionOptimizationPlanarGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitializedViewportRef = useRef(false);
  const gestureScaleRef = useRef(1);

  const model = useMemo(
    () => buildGraphModel(source, analysis.targets, candidates, manualMergePairs),
    [analysis.targets, candidates, manualMergePairs, source],
  );

  const [viewport, setViewport] = useState<ViewportState>({ x: 24, y: 24, scale: 1 });
  const [panSession, setPanSession] = useState<PanSession | null>(null);
  const [cardDragSession, setCardDragSession] = useState<CardDragSession | null>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, GraphPoint>>({});
  const focusBounds = useMemo(() => getFocusBounds(model), [model]);

  useEffect(() => {
    setCardPositions((previous) => {
      const next: Record<string, GraphPoint> = {};
      let changed = Object.keys(previous).length !== model.cards.length;

      model.cards.forEach((card) => {
        const existing = previous[card.id];
        const position = existing ?? { x: card.x, y: card.y };
        next[card.id] = position;
        if (!existing) {
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [model.cards]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasInitializedViewportRef.current || model.cards.length === 0) {
      return;
    }

    setViewport(createViewportForBounds(container, focusBounds));
    hasInitializedViewportRef.current = true;
  }, [focusBounds, model.cards.length]);

  const renderedModel = useMemo(
    () => resolveGraphModel(model, cardPositions),
    [cardPositions, model],
  );

  const candidateByTargetId = useMemo(() => {
    const map = new Map<string, CollisionOptimizationCandidate>();
    candidates.forEach((candidate) => {
      if (!map.has(candidate.target.id)) {
        map.set(candidate.target.id, candidate);
      }
    });
    return map;
  }, [candidates]);

  const pairByPrimaryTargetId = useMemo(() => {
    const map = new Map<string, GraphPairEdge>();
    renderedModel.pairEdges.forEach((edge) => {
      map.set(edge.candidate.target.id, edge);
    });
    return map;
  }, [renderedModel.pairEdges]);

  const pairBySecondaryTargetId = useMemo(() => {
    const map = new Map<string, GraphPairEdge>();
    renderedModel.pairEdges.forEach((edge) => {
      const secondaryTargetId = edge.candidate.secondaryTarget?.id;
      if (secondaryTargetId) {
        map.set(secondaryTargetId, edge);
      }
    });
    return map;
  }, [renderedModel.pairEdges]);

  const toWorldPoint = useCallback((clientX: number, clientY: number): GraphPoint | null => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  }, [viewport.scale, viewport.x, viewport.y]);

  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, scaleFactor: number) => {
    const container = containerRef.current;
    if (!container || !Number.isFinite(scaleFactor) || scaleFactor <= 0) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;

    setViewport((current) => {
      const worldPoint = {
        x: (pointerX - current.x) / current.scale,
        y: (pointerY - current.y) / current.scale,
      };
      const nextScale = clamp(current.scale * scaleFactor, MIN_SCALE, MAX_SCALE);

      if (Math.abs(nextScale - current.scale) <= 1e-4) {
        return current;
      }

      return {
        scale: nextScale,
        x: pointerX - worldPoint.x * nextScale,
        y: pointerY - worldPoint.y * nextScale,
      };
    });
  }, []);

  const handleResetViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setViewport(createViewportForBounds(container, focusBounds));
  }, [focusBounds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheelEvent = (event: WheelEvent) => {
      event.preventDefault();
      zoomAtClientPoint(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0022));
    };

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent;
      gestureScaleRef.current = Number.isFinite(gestureEvent.scale) && gestureEvent.scale > 0
        ? gestureEvent.scale
        : 1;
      event.preventDefault();
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent;
      event.preventDefault();

      const nextGestureScale = Number.isFinite(gestureEvent.scale) && gestureEvent.scale > 0
        ? gestureEvent.scale
        : gestureScaleRef.current;
      const scaleFactor = nextGestureScale / Math.max(gestureScaleRef.current, 1e-4);
      gestureScaleRef.current = nextGestureScale;
      zoomAtClientPoint(gestureEvent.clientX, gestureEvent.clientY, scaleFactor);
    };

    const handleGestureEnd = (event: Event) => {
      gestureScaleRef.current = 1;
      event.preventDefault();
    };

    container.addEventListener('wheel', handleWheelEvent, { passive: false });
    container.addEventListener('gesturestart', handleGestureStart as EventListener, { passive: false });
    container.addEventListener('gesturechange', handleGestureChange as EventListener, { passive: false });
    container.addEventListener('gestureend', handleGestureEnd as EventListener, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheelEvent);
      container.removeEventListener('gesturestart', handleGestureStart as EventListener);
      container.removeEventListener('gesturechange', handleGestureChange as EventListener);
      container.removeEventListener('gestureend', handleGestureEnd as EventListener);
    };
  }, [zoomAtClientPoint]);

  const handleSurfacePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (![0, 1, 2].includes(event.button) || manualConnection) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('[data-graph-card-id]') || target.closest('[data-graph-no-pan="true"]')) {
      return;
    }

    event.preventDefault();
    setPanSession({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewport,
    });
  }, [manualConnection, viewport]);

  const handleCardDragStart = useCallback((event: React.PointerEvent<HTMLButtonElement>, card: GraphLinkCard) => {
    if (event.button !== 0 || manualConnection) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const worldPoint = toWorldPoint(event.clientX, event.clientY);
    if (!worldPoint) {
      return;
    }

    setCardDragSession({
      pointerId: event.pointerId,
      cardId: card.id,
      side: card.side,
      startWorld: worldPoint,
      startCardPosition: { x: card.x, y: card.y },
    });
  }, [manualConnection, toWorldPoint]);

  const handleConnectionStart = useCallback((event: React.PointerEvent<HTMLButtonElement>, target: CollisionTargetRef) => {
    event.preventDefault();
    event.stopPropagation();
    onManualConnectionStart?.(target);

    const point = toWorldPoint(event.clientX, event.clientY);
    if (point) {
      onManualConnectionMove?.(point);
    }
  }, [onManualConnectionMove, onManualConnectionStart, toWorldPoint]);

  useEffect(() => {
    if (!manualConnection && !panSession && !cardDragSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (panSession && event.pointerId === panSession.pointerId) {
        setViewport({
          ...panSession.startViewport,
          x: panSession.startViewport.x + (event.clientX - panSession.startClientX),
          y: panSession.startViewport.y + (event.clientY - panSession.startClientY),
        });
        return;
      }

      if (cardDragSession && event.pointerId === cardDragSession.pointerId) {
        const worldPoint = toWorldPoint(event.clientX, event.clientY);
        if (!worldPoint) {
          return;
        }

        setCardPositions((previous) => ({
          ...previous,
          [cardDragSession.cardId]: {
            x: clamp(
              cardDragSession.startCardPosition.x + (worldPoint.x - cardDragSession.startWorld.x),
              renderedModel.calloutColumns[cardDragSession.side].minLeft,
              renderedModel.calloutColumns[cardDragSession.side].maxLeft,
            ),
            y: Math.max(8, cardDragSession.startCardPosition.y + (worldPoint.y - cardDragSession.startWorld.y)),
          },
        }));
        return;
      }

      if (manualConnection) {
        const point = toWorldPoint(event.clientX, event.clientY);
        if (point) {
          onManualConnectionMove?.(point);
        }
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (panSession && event.pointerId === panSession.pointerId) {
        setPanSession(null);
      }

      if (cardDragSession && event.pointerId === cardDragSession.pointerId) {
        setCardDragSession(null);
      }

      if (manualConnection) {
        const hitElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        const targetId = hitElement?.closest<HTMLElement>('[data-graph-target-id]')?.dataset.graphTargetId ?? null;
        const target = targetId ? renderedModel.rowByTargetId.get(targetId)?.target ?? null : null;
        onManualConnectionEnd?.(
          target && target.id !== manualConnection.sourceTargetId ? target : null,
        );
      }
    };

    const handlePointerCancel = () => {
      setPanSession(null);
      setCardDragSession(null);
      if (manualConnection) {
        onManualConnectionCancel?.();
      }
    };

    const handleWindowBlur = () => {
      handlePointerCancel();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        handlePointerCancel();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: false });
    window.addEventListener('pointercancel', handlePointerCancel, { once: false });
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    cardDragSession,
    manualConnection,
    onManualConnectionCancel,
    onManualConnectionEnd,
    onManualConnectionMove,
    panSession,
    renderedModel.calloutColumns,
    renderedModel.rowByTargetId,
    toWorldPoint,
  ]);

  const dragSourceRow = manualConnection?.sourceTargetId
    ? renderedModel.rowByTargetId.get(manualConnection.sourceTargetId) ?? null
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[16rem] w-full select-none overflow-hidden rounded-lg border border-border-black bg-panel-bg"
      onPointerDown={handleSurfacePointerDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ touchAction: 'none' }}
    >
      {renderedModel.cards.length === 0 ? (
        <div className="flex h-full min-h-[12rem] items-center justify-center px-3 text-center text-[10px] leading-relaxed text-text-secondary">
          {labels.empty}
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute left-2.5 top-2 z-20 flex max-w-[30rem] flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-system-blue/20 bg-system-blue/10 px-2 py-1 text-[10px] font-medium text-system-blue shadow-sm">
              {labels.frontView}
            </span>
            <span className="rounded-full border border-border-black bg-element-bg/95 px-2 py-1 text-[10px] text-text-secondary shadow-sm">
              {labels.dragHint}
            </span>
          </div>

          <div className="absolute right-2.5 top-2 z-20 flex items-center gap-1 rounded-full border border-border-black bg-element-bg/95 p-1 shadow-sm">
            <button
              type="button"
              data-graph-no-pan="true"
              aria-label={labels.zoomOut}
              title={labels.zoomOut}
              onClick={() => {
                const container = containerRef.current;
                if (!container) {
                  return;
                }
                const rect = container.getBoundingClientRect();
                zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.22);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-graph-no-pan="true"
              aria-label={labels.zoomIn}
              title={labels.zoomIn}
              onClick={() => {
                const container = containerRef.current;
                if (!container) {
                  return;
                }
                const rect = container.getBoundingClientRect();
                zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.22);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-graph-no-pan="true"
              aria-label={labels.resetView}
              title={labels.resetView}
              onClick={handleResetViewport}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            className={`absolute inset-0 ${
              manualConnection ? 'cursor-crosshair' : panSession ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-border-black) 32%, transparent) 1px, transparent 0)',
                backgroundSize: '18px 18px',
              }}
            />

            <div
              className="absolute left-0 top-0"
              style={{
                width: renderedModel.width,
                height: renderedModel.height,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
              }}
            >
              <svg
                className="pointer-events-none absolute inset-0"
                width={renderedModel.width}
                height={renderedModel.height}
                viewBox={`0 0 ${renderedModel.width} ${renderedModel.height}`}
                fill="none"
              >
                <defs>
                  <marker
                    id="collision-optimizer-callout-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-border-black)" opacity="0.5" />
                  </marker>
                </defs>

                <rect
                  x={renderedModel.skeletonBounds.minX - 24}
                  y={renderedModel.skeletonBounds.minY - 24}
                  width={Math.max(48, renderedModel.skeletonBounds.maxX - renderedModel.skeletonBounds.minX + 48)}
                  height={Math.max(48, renderedModel.skeletonBounds.maxY - renderedModel.skeletonBounds.minY + 48)}
                  rx={26}
                  className="fill-system-blue/5 stroke-border-black/15 dark:stroke-border-strong/20"
                  strokeDasharray="6 6"
                />

                {renderedModel.pairEdges.map((edge) => {
                  const isChecked = checkedTargetIds.has(edge.candidate.target.id);
                  const sourceSelected = selection?.type === 'link'
                    && selection.id === edge.candidate.target.linkId
                    && selection.subType === 'collision'
                    && (selection.objectIndex ?? 0) === edge.candidate.target.objectIndex;
                  const targetSelected = selection?.type === 'link'
                    && selection.id === edge.targetRow.target.linkId
                    && selection.subType === 'collision'
                    && (selection.objectIndex ?? 0) === edge.targetRow.target.objectIndex;

                  return (
                    <path
                      key={edge.id}
                      d={buildCurvePath(edge.sourceRow.anchorOut, edge.targetRow.anchorIn)}
                      className={
                        edge.manual
                          ? 'stroke-system-blue/65'
                          : 'stroke-amber-600/50 dark:stroke-amber-300/45'
                      }
                      strokeWidth={isChecked || sourceSelected || targetSelected ? 2.75 : 1.75}
                      strokeDasharray={edge.manual ? '4 4' : '6 5'}
                      strokeLinecap="round"
                    />
                  );
                })}

                {renderedModel.structureEdges.map((edge) => (
                  <line
                    key={edge.id}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    className="stroke-border-black/55 dark:stroke-border-strong/60"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                ))}

                {renderedModel.cards.map((card) => {
                  const tetherPoint = getCardTetherPoint(card);
                  const tetherLength = Math.hypot(card.anchor.x - tetherPoint.x, card.anchor.y - tetherPoint.y);
                  if (tetherLength <= 2) {
                    return null;
                  }

                  return (
                    <line
                      key={`${card.id}::tether`}
                      x1={card.anchor.x}
                      y1={card.anchor.y}
                      x2={tetherPoint.x}
                      y2={tetherPoint.y}
                      className="stroke-border-black/40 text-border-black/40 dark:stroke-border-strong/45 dark:text-border-strong/45"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      markerEnd="url(#collision-optimizer-callout-arrow)"
                    />
                  );
                })}

                {renderedModel.cards.map((card) => {
                  const isGhostLink = card.rows.length === 0;

                  return (
                    <circle
                      key={`${card.id}::node`}
                      cx={card.anchor.x}
                      cy={card.anchor.y}
                      r={isGhostLink ? 4 : 5.5}
                      className={isGhostLink ? 'fill-border-black/75 dark:fill-border-strong/80' : 'fill-system-blue'}
                    />
                  );
                })}

                {dragSourceRow && manualConnection?.pointer ? (
                  <path
                    d={buildCurvePath(dragSourceRow.anchorOut, manualConnection.pointer)}
                    className="stroke-system-blue"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeDasharray="7 5"
                  />
                ) : null}
              </svg>

              {renderedModel.cards.map((card) => {
                const isGhostLink = card.rows.length === 0;

                return (
                  <div
                    key={card.id}
                    data-graph-card-id={card.id}
                    className={`absolute border shadow-sm ${
                      isGhostLink
                        ? 'rounded-full border-dashed border-border-black/70 bg-element-bg/90'
                        : 'rounded-xl border-border-black bg-element-bg/95'
                    }`}
                    style={{
                      left: card.x,
                      top: card.y,
                      width: card.width,
                      height: card.height,
                    }}
                  >
                    <button
                      type="button"
                      data-graph-no-pan="true"
                      onPointerDown={(event) => handleCardDragStart(event, card)}
                      className={`flex w-full items-center gap-1.5 px-2 text-left ${
                        isGhostLink
                          ? 'h-full rounded-full cursor-move bg-panel-bg/70'
                          : 'h-[26px] rounded-t-xl border-b border-border-black cursor-move bg-panel-bg'
                      }`}
                    >
                      <span className={`inline-block rounded-full ${
                        isGhostLink ? 'h-2 w-2 bg-border-black/70' : 'h-2.5 w-2.5 bg-system-blue/70'
                      }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-text-primary">
                        {card.linkName}
                      </span>
                      {card.componentName ? (
                        <span className="shrink-0 rounded-full border border-border-black bg-element-bg px-1 py-0.5 text-[8px] text-text-tertiary">
                          {card.componentName}
                        </span>
                      ) : null}
                    </button>

                    {!isGhostLink ? (
                      <div className="relative" style={{ height: card.height - CARD_HEADER_HEIGHT }}>
                        {card.rows.map((row) => {
                          const candidate = candidateByTargetId.get(row.target.id);
                          const pairSummary = getPairSummary(
                            row.target,
                            pairByPrimaryTargetId,
                            pairBySecondaryTargetId,
                            candidateByTargetId,
                            labels,
                            formatGeometryType,
                          );
                          const isChecked = checkedTargetIds.has(row.target.id);
                          const isSelected = selection?.type === 'link'
                            && selection.id === row.target.linkId
                            && selection.subType === 'collision'
                            && (selection.objectIndex ?? 0) === row.target.objectIndex;
                          const canConnect = manualConnection?.sourceTargetId
                            ? row.target.id !== manualConnection.sourceTargetId
                              && canCreateManualPair(manualConnection.sourceTargetId, row.target.id)
                            : false;
                          const rowToneClass = isSelected
                            ? 'border-system-blue/35 bg-system-blue/10'
                            : canConnect
                              ? 'border-system-blue/20 bg-system-blue/5'
                              : 'border-border-black bg-panel-bg';
                          const toggleControl = (
                            <button
                              type="button"
                              data-graph-no-pan="true"
                              aria-label={isChecked ? labels.unselectCandidate : labels.selectCandidate}
                              disabled={!candidate?.eligible}
                              onClick={() => {
                                if (candidate?.eligible) {
                                  onToggleCandidate(row.target.id);
                                }
                              }}
                              className={`shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
                                candidate?.eligible
                                  ? 'text-system-blue'
                                  : 'cursor-not-allowed text-text-tertiary/60'
                              }`}
                            >
                              {isChecked ? <CheckSquare2 className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                            </button>
                          );
                          const connectControl = (
                            <button
                              type="button"
                              data-graph-no-pan="true"
                              aria-label={labels.connectionHandle}
                              title={labels.connectionHandle}
                              onPointerDown={(event) => handleConnectionStart(event, row.target)}
                              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
                                canConnect || !manualConnection
                                  ? 'border-border-black bg-element-bg text-text-secondary hover:bg-element-hover hover:text-text-primary'
                                  : 'border-system-blue/30 bg-system-blue/10 text-system-blue'
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            </button>
                          );

                          return (
                            <div
                              key={row.target.id}
                              data-graph-target-id={row.target.id}
                              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-lg border px-1 py-[3px] transition-colors ${rowToneClass}`}
                              style={{
                                position: 'absolute',
                                left: row.localX,
                                top: row.localY,
                                width: row.width,
                                height: row.height,
                              }}
                            >
                              {card.side === 'right' ? connectControl : toggleControl}

                              <button
                                type="button"
                                data-graph-no-pan="true"
                                onClick={() => onSelectTarget?.(row.target)}
                                className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
                              >
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-text-primary">
                                    {getDisplayTypeLabel(row.target, labels)}
                                  </span>
                                  <span className="shrink-0 text-[8px] text-text-tertiary">
                                    {formatGeometryType(row.target.geometry.type)}
                                  </span>
                                </div>
                                {pairSummary ? (
                                  <div className="mt-0.5">
                                    <span className={`inline-flex max-w-full items-center rounded-md border px-1 py-0.5 text-[8px] ${getSummaryClass(pairSummary.tone)}`}>
                                      <span className="truncate">{pairSummary.label}</span>
                                    </span>
                                  </div>
                                ) : null}
                              </button>

                              {card.side === 'right' ? toggleControl : connectControl}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CollisionOptimizationPlanarGraph;
