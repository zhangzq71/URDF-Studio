import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare2, Square } from 'lucide-react';
import type {
  CollisionOptimizationAnalysis,
  CollisionOptimizationCandidate,
  CollisionOptimizationManualMergePair,
  CollisionOptimizationSource,
  CollisionTargetRef,
} from '../utils/collisionOptimization';
import { buildCollisionOptimizationSkeletonProjection } from '../utils/collisionOptimization';
import { GeometryType } from '@/types';

const GRAPH_PADDING = 40;
const COMPONENT_GAP = 168;
const CARD_WIDTH = 228;
const CARD_HEADER_HEIGHT = 34;
const CARD_PADDING = 10;
const ROW_HEIGHT = 34;
const EMPTY_CARD_HEIGHT = 44;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

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

interface ViewportState {
  x: number;
  y: number;
  scale: number;
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
  width: number;
  height: number;
}

interface GraphRenderModel {
  cards: GraphLinkCard[];
  rowByTargetId: Map<string, GraphTargetRow>;
  structureEdges: GraphStructureEdge[];
  pairEdges: GraphPairEdge[];
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
  manualPair: string;
  mergeTo: string;
  mergedInto: string;
  primary: string;
  selectCandidate: string;
  unselectCandidate: string;
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
  labels: Pick<CollisionOptimizationPlanarGraphLabels, 'primary' | 'collisionIndex'>,
): string {
  return target.isPrimary
    ? labels.primary
    : `${labels.collisionIndex} ${target.sequenceIndex + 1}`;
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

function spreadCardPositions(cards: BaseGraphLinkCard[]): Record<string, GraphPoint> {
  const initialPositions = Object.fromEntries(cards.map((card) => [card.id, { x: card.x, y: card.y }]));
  const positions = Object.fromEntries(cards.map((card) => [card.id, { x: card.x, y: card.y }]));
  const cardsByCluster = new Map<string, BaseGraphLinkCard[]>();

  cards.forEach((card) => {
    const siblings = cardsByCluster.get(card.clusterId) ?? [];
    siblings.push(card);
    cardsByCluster.set(card.clusterId, siblings);
  });

  cardsByCluster.forEach((clusterCards) => {
    for (let iteration = 0; iteration < 28; iteration += 1) {
      for (let i = 0; i < clusterCards.length; i += 1) {
        const leftCard = clusterCards[i];
        const leftPosition = positions[leftCard.id];
        if (!leftPosition) {
          continue;
        }

        for (let j = i + 1; j < clusterCards.length; j += 1) {
          const rightCard = clusterCards[j];
          const rightPosition = positions[rightCard.id];
          if (!rightPosition) {
            continue;
          }

          const overlapX = Math.min(
            leftPosition.x + leftCard.width + 10,
            rightPosition.x + rightCard.width + 10,
          ) - Math.max(leftPosition.x - 10, rightPosition.x - 10);
          const overlapY = Math.min(
            leftPosition.y + leftCard.height + 10,
            rightPosition.y + rightCard.height + 10,
          ) - Math.max(leftPosition.y - 10, rightPosition.y - 10);

          if (overlapX <= 0 || overlapY <= 0) {
            continue;
          }

          const leftCenter = {
            x: leftPosition.x + leftCard.width / 2,
            y: leftPosition.y + leftCard.height / 2,
          };
          const rightCenter = {
            x: rightPosition.x + rightCard.width / 2,
            y: rightPosition.y + rightCard.height / 2,
          };

          let deltaX = leftCenter.x - rightCenter.x;
          let deltaY = leftCenter.y - rightCenter.y;
          if (Math.abs(deltaX) < 1e-3 && Math.abs(deltaY) < 1e-3) {
            deltaX = leftCard.anchor.x - rightCard.anchor.x;
            deltaY = leftCard.anchor.y - rightCard.anchor.y;
          }
          if (Math.abs(deltaX) < 1e-3 && Math.abs(deltaY) < 1e-3) {
            deltaX = i - j;
          }

          if (Math.abs(deltaX) >= Math.abs(deltaY)) {
            const direction = deltaX >= 0 ? 1 : -1;
            const shift = (overlapX + 6) / 2;
            leftPosition.x += shift * direction;
            rightPosition.x -= shift * direction;
          } else {
            const direction = deltaY >= 0 ? 1 : -1;
            const shift = (overlapY + 6) / 2;
            leftPosition.y += shift * direction;
            rightPosition.y -= shift * direction;
          }
        }
      }

      clusterCards.forEach((card) => {
        const position = positions[card.id];
        const ideal = initialPositions[card.id];
        if (!position || !ideal) {
          return;
        }

        position.x += (ideal.x - position.x) * 0.08;
        position.y += (ideal.y - position.y) * 0.08;
        position.x = Math.max(8, position.x);
        position.y = Math.max(8, position.y);
      });
    }
  });

  return positions;
}

function buildGraphModel(
  source: CollisionOptimizationSource,
  targets: CollisionTargetRef[],
  candidates: CollisionOptimizationCandidate[],
  manualMergePairs: CollisionOptimizationManualMergePair[],
): GraphModel {
  const projection = buildCollisionOptimizationSkeletonProjection(source);
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
  let clusterCursorX = GRAPH_PADDING;
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

  const clusterItemIndex = new Map<string, number>();
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
    const localIndex = clusterItemIndex.get(clusterId) ?? 0;
    clusterItemIndex.set(clusterId, localIndex + 1);
    const clusterMidX = clusterCenterX.get(clusterId) ?? anchor.x;
    const cardSide = anchor.x <= clusterMidX ? 1 : -1;
    const verticalStagger = ((localIndex % 3) - 1) * 18;
    const defaultX = hasCollisions
      ? cardSide > 0
        ? anchor.x + 18
        : anchor.x - width - 18
      : anchor.x - width / 2;
    const defaultY = hasCollisions
      ? anchor.y - CARD_HEADER_HEIGHT / 2 + verticalStagger
      : anchor.y - height / 2;

    return {
      id: `${linkMeta.componentId ?? 'robot'}::${linkMeta.linkId}`,
      componentId: linkMeta.componentId,
      componentName: linkMeta.componentName,
      linkId: linkMeta.linkId,
      linkName: linkMeta.linkName,
      clusterId,
      anchor,
      x: defaultX,
      y: defaultY,
      width,
      height,
      rows,
    };
  });

  const spreadPositions = spreadCardPositions(cards);
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
      const absoluteRow: GraphTargetRow = {
        ...row,
        x: position.x + row.localX,
        y: position.y + row.localY,
        anchorIn: {
          x: position.x + 8,
          y: position.y + row.localY + row.height / 2,
        },
        anchorOut: {
          x: position.x + card.width - 8,
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
      label: `${outgoingPair.manual ? labels.manualPair : labels.autoPair} · ${labels.mergeTo} ${formatGeometryType(outgoingPair.candidate.suggestedType)}`,
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
    label: `${formatGeometryType(candidate.currentType)} -> ${candidate.suggestedType ? formatGeometryType(candidate.suggestedType) : '—'}`,
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

  const model = useMemo(
    () => buildGraphModel(source, analysis.targets, candidates, manualMergePairs),
    [analysis.targets, candidates, manualMergePairs, source],
  );

  const [viewport, setViewport] = useState<ViewportState>({ x: 24, y: 24, scale: 1 });
  const [panSession, setPanSession] = useState<PanSession | null>(null);
  const [cardDragSession, setCardDragSession] = useState<CardDragSession | null>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, GraphPoint>>({});

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

    const availableWidth = Math.max(container.clientWidth - 48, 320);
    const availableHeight = Math.max(container.clientHeight - 48, 240);
    const fittedScale = clamp(
      Math.min(1, availableWidth / model.width, availableHeight / model.height),
      MIN_SCALE,
      1,
    );

    setViewport({
      scale: fittedScale,
      x: Math.max(20, (container.clientWidth - model.width * fittedScale) / 2),
      y: Math.max(20, (container.clientHeight - model.height * fittedScale) / 2),
    });
    hasInitializedViewportRef.current = true;
  }, [model.cards.length, model.height, model.width]);

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

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldPoint = {
      x: (pointerX - viewport.x) / viewport.scale,
      y: (pointerY - viewport.y) / viewport.scale,
    };
    const nextScale = clamp(viewport.scale * Math.exp(-event.deltaY * 0.0014), MIN_SCALE, MAX_SCALE);

    setViewport({
      scale: nextScale,
      x: pointerX - worldPoint.x * nextScale,
      y: pointerY - worldPoint.y * nextScale,
    });
  }, [viewport.scale, viewport.x, viewport.y]);

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
            x: Math.max(8, cardDragSession.startCardPosition.x + (worldPoint.x - cardDragSession.startWorld.x)),
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
    renderedModel.rowByTargetId,
    toWorldPoint,
  ]);

  const dragSourceRow = manualConnection?.sourceTargetId
    ? renderedModel.rowByTargetId.get(manualConnection.sourceTargetId) ?? null
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[16rem] w-full overflow-hidden rounded-lg border border-border-black bg-panel-bg"
      onWheel={handleWheel}
      onPointerDown={handleSurfacePointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {renderedModel.cards.length === 0 ? (
        <div className="flex h-full min-h-[12rem] items-center justify-center px-3 text-center text-[10px] leading-relaxed text-text-secondary">
          {labels.empty}
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute left-2.5 top-2 z-20 max-w-[24rem] rounded-full border border-border-black bg-element-bg/95 px-2 py-1 text-[10px] text-text-secondary shadow-sm">
            {labels.dragHint}
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
                      className="stroke-border-black/35 dark:stroke-border-strong/40"
                      strokeWidth={1.5}
                      strokeLinecap="round"
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
                  const midPoint = {
                    x: (edge.sourceRow.anchorOut.x + edge.targetRow.anchorIn.x) / 2,
                    y: (edge.sourceRow.anchorOut.y + edge.targetRow.anchorIn.y) / 2,
                  };
                  const chipLabel = `${edge.manual ? labels.manualPair : labels.autoPair} · ${formatGeometryType(edge.candidate.suggestedType)}`;
                  const chipWidth = Math.max(90, chipLabel.length * 5.6);

                  return (
                    <g key={edge.id}>
                      <path
                        d={buildCurvePath(edge.sourceRow.anchorOut, edge.targetRow.anchorIn)}
                        className={
                          edge.manual
                            ? 'stroke-system-blue'
                            : 'stroke-amber-600/80 dark:stroke-amber-300/80'
                        }
                        strokeWidth={isChecked || sourceSelected || targetSelected ? 3 : 2.25}
                        strokeDasharray={edge.manual ? undefined : '5 4'}
                        strokeLinecap="round"
                      />
                      <rect
                        x={midPoint.x - chipWidth / 2}
                        y={midPoint.y - 8}
                        width={chipWidth}
                        height={16}
                        rx={8}
                        className={edge.manual ? 'fill-system-blue/12' : 'fill-amber-500/10'}
                      />
                      <text
                        x={midPoint.x}
                        y={midPoint.y + 3.5}
                        textAnchor="middle"
                        className={`text-[9px] font-medium ${
                          edge.manual ? 'fill-system-blue' : 'fill-amber-700 dark:fill-amber-300'
                        }`}
                      >
                        {chipLabel}
                      </text>
                    </g>
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
                        : 'rounded-2xl border-border-black bg-element-bg/95'
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
                      className={`flex w-full items-center gap-2 px-3 text-left ${
                        isGhostLink
                          ? 'h-full rounded-full cursor-move bg-panel-bg/70'
                          : 'h-[34px] rounded-t-2xl border-b border-border-black cursor-move bg-panel-bg'
                      }`}
                    >
                      <span className={`inline-block rounded-full ${
                        isGhostLink ? 'h-2.5 w-2.5 bg-border-black/70' : 'h-3 w-3 bg-system-blue/70'
                      }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-text-primary">
                        {card.linkName}
                      </span>
                      {card.componentName ? (
                        <span className="shrink-0 rounded-full border border-border-black bg-element-bg px-1.5 py-0.5 text-[9px] text-text-tertiary">
                          {labels.component}: {card.componentName}
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

                          return (
                            <div
                              key={row.target.id}
                              data-graph-target-id={row.target.id}
                              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors ${rowToneClass}`}
                              style={{
                                position: 'absolute',
                                left: row.localX,
                                top: row.localY,
                                width: row.width,
                                height: row.height,
                              }}
                            >
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
                                {isChecked ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                              </button>

                              <button
                                type="button"
                                data-graph-no-pan="true"
                                onClick={() => onSelectTarget?.(row.target)}
                                className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
                              >
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-text-primary">
                                    {getDisplayTypeLabel(row.target, labels)}
                                  </span>
                                  <span className="shrink-0 text-[9px] text-text-tertiary">
                                    {formatGeometryType(row.target.geometry.type)}
                                  </span>
                                </div>
                                {pairSummary ? (
                                  <div className="mt-1">
                                    <span className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[9px] ${getSummaryClass(pairSummary.tone)}`}>
                                      <span className="truncate">{pairSummary.label}</span>
                                    </span>
                                  </div>
                                ) : null}
                              </button>

                              <button
                                type="button"
                                data-graph-no-pan="true"
                                aria-label={labels.connectionHandle}
                                title={labels.connectionHandle}
                                onPointerDown={(event) => handleConnectionStart(event, row.target)}
                                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
                                  canConnect || !manualConnection
                                    ? 'border-border-black bg-element-bg text-text-secondary hover:bg-element-hover hover:text-text-primary'
                                    : 'border-system-blue/30 bg-system-blue/10 text-system-blue'
                                }`}
                              >
                                <span className="h-2 w-2 rounded-full bg-current" />
                              </button>
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
