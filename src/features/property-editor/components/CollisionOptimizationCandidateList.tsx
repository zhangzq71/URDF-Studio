import { ArrowRight, CheckSquare2, Square } from 'lucide-react';
import { GeometryType } from '@/types';
import type {
  CollisionOptimizationCandidate,
  CollisionTargetRef,
} from '../utils/collisionOptimization';
import { createCollisionOptimizationCandidateKey } from '../utils/collisionOptimization';

interface CollisionSelection {
  type: 'link' | 'joint' | null;
  id: string | null;
  subType?: 'visual' | 'collision';
  objectIndex?: number;
}

export interface CollisionOptimizationCandidateListLabels {
  clearAll: string;
  collisionIndex: string;
  component: string;
  current: string;
  depth: string;
  height: string;
  jointPair: string;
  mergeTo: string;
  noCandidates: string;
  primary: string;
  radius: string;
  selectedCount: string;
  suggested: string;
  totalLength: string;
  width: string;
}

interface CollisionOptimizationCandidateListProps {
  candidates: CollisionOptimizationCandidate[];
  checkedCandidateKeys: ReadonlySet<string>;
  selection?: CollisionSelection;
  labels: CollisionOptimizationCandidateListLabels;
  formatGeometryType: (type: GeometryType | null | undefined) => string;
  getStatusLabel: (candidate: CollisionOptimizationCandidate) => string;
  getCandidateOverrideOptions: (candidate: CollisionOptimizationCandidate) => GeometryType[];
  onSelectTarget?: (target: CollisionTargetRef) => void;
  onHoverTarget?: (target: CollisionTargetRef | null) => void;
  onToggleCandidate: (candidateKey: string) => void;
  onSetCandidateOverride: (candidate: CollisionOptimizationCandidate, nextType: GeometryType) => void;
}

function isFocusedTarget(
  selection: CollisionSelection | undefined,
  target: CollisionTargetRef,
): boolean {
  return selection?.type === 'link'
    && selection.id === target.linkId
    && selection.subType === 'collision'
    && (selection.objectIndex ?? 0) === target.objectIndex;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const safeValue = Number(value);
  const absolute = Math.abs(safeValue);
  if (absolute >= 10) {
    return safeValue.toFixed(1).replace(/\.0$/, '');
  }

  if (absolute >= 1) {
    return safeValue.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  return safeValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function getPrimitiveMonogram(type: GeometryType | null | undefined): string {
  switch (type) {
    case GeometryType.CYLINDER:
      return 'CYL';
    case GeometryType.CAPSULE:
      return 'CAP';
    case GeometryType.BOX:
      return 'BOX';
    case GeometryType.SPHERE:
      return 'SPH';
    case GeometryType.MESH:
      return 'MSH';
    default:
      return '—';
  }
}

function getGeometryMetrics(
  candidate: CollisionOptimizationCandidate,
  labels: Pick<
    CollisionOptimizationCandidateListLabels,
    'depth' | 'height' | 'radius' | 'totalLength' | 'width'
  >,
): Array<{ label: string; value: string }> {
  const geometry = candidate.nextGeometry ?? candidate.target.geometry;
  const dimensions = geometry.dimensions;

  if (!dimensions) {
    return [];
  }

  if (geometry.type === GeometryType.CYLINDER || geometry.type === GeometryType.CAPSULE) {
    return [
      { label: labels.radius, value: formatCompactNumber(dimensions.x) },
      { label: labels.totalLength, value: formatCompactNumber(dimensions.y) },
    ];
  }

  if (geometry.type === GeometryType.SPHERE) {
    return [{ label: labels.radius, value: formatCompactNumber(dimensions.x) }];
  }

  if (geometry.type === GeometryType.BOX) {
    return [
      { label: labels.width, value: formatCompactNumber(dimensions.x) },
      { label: labels.depth, value: formatCompactNumber(dimensions.y) },
      { label: labels.height, value: formatCompactNumber(dimensions.z) },
    ];
  }

  return [];
}

function getMetricSummary(
  candidate: CollisionOptimizationCandidate,
  labels: Pick<
    CollisionOptimizationCandidateListLabels,
    'depth' | 'height' | 'radius' | 'totalLength' | 'width'
  >,
): string {
  return getGeometryMetrics(candidate, labels)
    .map((metric) => `${metric.label} ${metric.value}`)
    .join(' · ');
}

function getFlowSources(candidate: CollisionOptimizationCandidate): CollisionTargetRef[] {
  return candidate.secondaryTarget
    ? [candidate.target, candidate.secondaryTarget]
    : [candidate.target];
}

function MergeConnector({
  sourceCount,
  emphasized,
  label,
}: {
  sourceCount: number;
  emphasized: boolean;
  label: string;
}) {
  const stroke = emphasized ? 'var(--color-system-blue)' : 'var(--color-border-black)';
  const opacity = emphasized ? 0.7 : 0.42;
  const sourceRows = sourceCount > 1 ? [14, 42] : [28];

  return (
    <div className="relative flex min-h-[4rem] items-center justify-center">
      <span className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-full border border-system-blue/20 bg-system-blue/10 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-system-blue">
        {label}
      </span>
      <svg
        className="mt-2 h-[2.5rem] w-[3.5rem]"
        viewBox="0 0 72 56"
        fill="none"
        aria-hidden="true"
      >
        {sourceRows.map((y) => (
          <path
            key={y}
            d={`M 6 ${y} H 22 C 28 ${y}, 30 28, 36 28 H 48`}
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opacity}
          />
        ))}
        <path
          d="M 48 21 L 61 28 L 48 35"
          stroke={stroke}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      </svg>
    </div>
  );
}

function FlowSourceChip({
  target,
  candidate,
  labels,
  isFocused,
  onSelectTarget,
  onHoverTarget,
  formatGeometryType,
}: {
  target: CollisionTargetRef;
  candidate: CollisionOptimizationCandidate;
  labels: CollisionOptimizationCandidateListLabels;
  isFocused: boolean;
  onSelectTarget?: (target: CollisionTargetRef) => void;
  onHoverTarget?: (target: CollisionTargetRef | null) => void;
  formatGeometryType: (type: GeometryType | null | undefined) => string;
}) {
  const toneClass = isFocused
    ? 'border-system-blue/35 bg-system-blue/10'
    : 'border-border-black bg-panel-bg hover:bg-element-hover';
  const slotLabel = target.isPrimary
    ? labels.primary
    : `${labels.collisionIndex} ${target.sequenceIndex + 1}`;

  return (
    <button
      type="button"
      onClick={() => onSelectTarget?.(target)}
      onMouseEnter={() => onHoverTarget?.(target)}
      onMouseLeave={() => onHoverTarget?.(null)}
      className={`grid w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${toneClass}`}
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-md border border-border-black bg-element-bg text-[7px] font-semibold tracking-[0.12em] text-text-secondary">
        {getPrimitiveMonogram(target.geometry.type)}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-0.75">
          <span className="truncate text-[9px] font-semibold text-text-primary">{target.linkName}</span>
          <span className="rounded-full border border-border-black bg-element-bg px-1.25 py-0.5 text-[6.5px] font-medium text-text-tertiary">
            {slotLabel}
          </span>
          <span className="rounded-md border border-border-black bg-element-bg px-1.25 py-0.5 text-[6.5px] text-text-secondary">
            {formatGeometryType(target.geometry.type)}
          </span>
          {target.componentName ? (
            <span className="rounded-full border border-border-black bg-element-bg px-1.25 py-0.5 text-[6.5px] font-medium text-text-tertiary">
              {labels.component}: {target.componentName}
            </span>
          ) : null}
          {!target.isPrimary && candidate.secondaryTarget ? (
            <span className="rounded-md border border-border-black bg-element-bg px-1.25 py-0.5 text-[6.5px] text-text-secondary">
              {labels.jointPair}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function OverrideTypeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-1.25 py-0.75 text-[7px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
        active
          ? 'border-system-blue/25 bg-system-blue/12 text-system-blue'
          : 'border-border-black bg-panel-bg text-text-secondary hover:bg-element-hover hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}

export function CollisionOptimizationCandidateList({
  candidates,
  checkedCandidateKeys,
  selection,
  labels,
  formatGeometryType,
  getStatusLabel,
  getCandidateOverrideOptions,
  onSelectTarget,
  onHoverTarget,
  onToggleCandidate,
  onSetCandidateOverride,
}: CollisionOptimizationCandidateListProps) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-black bg-panel-bg px-2.5 py-4 text-center text-[10px] leading-relaxed text-text-secondary">
        {labels.noCandidates}
      </div>
    );
  }

  return (
    <div className="space-y-1 pr-0.5">
      {candidates.map((candidate) => {
        const candidateKey = createCollisionOptimizationCandidateKey(candidate);
        const isChecked = checkedCandidateKeys.has(candidateKey);
        const sources = getFlowSources(candidate);
        const metricSummary = getMetricSummary(candidate, labels);
        const overrideOptions = getCandidateOverrideOptions(candidate);
        const effectiveType = candidate.suggestedType ?? candidate.currentType;
        const currentLabel = formatGeometryType(candidate.currentType);
        const targetLabel = formatGeometryType(effectiveType);
        const statusLabel = getStatusLabel(candidate);
        const isFocused = sources.some((target) => isFocusedTarget(selection, target));
        const toneClass = isFocused
          ? 'border-system-blue/35 bg-system-blue/6 ring-1 ring-system-blue/10'
          : 'border-border-black bg-panel-bg hover:bg-element-hover';

        return (
          <div
            key={candidateKey}
            className={`rounded-lg border px-1.25 py-1 transition-colors ${toneClass}`}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-1.5">
              <button
                type="button"
                aria-label={isChecked ? labels.clearAll : labels.selectedCount}
                disabled={!candidate.eligible}
                onClick={() => {
                  if (!candidate.eligible) {
                    return;
                  }
                  onToggleCandidate(candidateKey);
                }}
                className={`mt-0.5 shrink-0 rounded-md p-0.25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
                  candidate.eligible
                    ? 'text-system-blue'
                    : 'cursor-not-allowed text-text-tertiary/60'
                }`}
              >
                {isChecked ? <CheckSquare2 className="h-3.25 w-3.25" /> : <Square className="h-3.25 w-3.25" />}
              </button>

              <div className="grid gap-1 xl:grid-cols-[minmax(0,1.22fr)_3.5rem_minmax(9.75rem,0.78fr)]">
                <div className="space-y-1">
                  {sources.map((source) => (
                    <FlowSourceChip
                      key={source.id}
                      target={source}
                      candidate={candidate}
                      labels={labels}
                      isFocused={isFocusedTarget(selection, source)}
                      onSelectTarget={onSelectTarget}
                      onHoverTarget={onHoverTarget}
                      formatGeometryType={formatGeometryType}
                    />
                  ))}
                </div>

                <MergeConnector
                  sourceCount={sources.length}
                  emphasized={isChecked || isFocused}
                  label={labels.mergeTo}
                />

                <div className="min-w-0 rounded-md border border-system-blue/20 bg-system-blue/8 px-1.5 py-1.25">
                  <button
                    type="button"
                    onClick={() => onSelectTarget?.(candidate.target)}
                    onMouseEnter={() => onHoverTarget?.(candidate.target)}
                    onMouseLeave={() => onHoverTarget?.(null)}
                    className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex items-start gap-1">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-system-blue/25 bg-panel-bg px-0.75 text-[6.5px] font-semibold tracking-[0.1em] text-system-blue">
                          {getPrimitiveMonogram(effectiveType)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[9px] font-semibold text-text-primary">
                            {targetLabel}
                          </div>
                          <div className="mt-0.25 flex items-center gap-1 text-[6.5px] text-text-secondary">
                            <span>{currentLabel}</span>
                            <ArrowRight className="h-1.75 w-1.75 text-text-tertiary" />
                            <span className="text-text-primary">{targetLabel}</span>
                          </div>
                          {metricSummary ? (
                            <div className="mt-0.25 truncate text-[6.5px] text-text-secondary">
                              {metricSummary}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <span className={`shrink-0 rounded-full border px-1.25 py-0.5 text-[6px] font-medium ${
                        candidate.eligible
                          ? 'border-system-blue/20 bg-panel-bg text-system-blue'
                          : 'border-border-black bg-panel-bg text-text-tertiary'
                      }`}>
                        {candidate.secondaryTarget
                          ? `${sources.length} Links`
                          : candidate.eligible
                            ? labels.primary
                            : statusLabel}
                      </span>
                    </div>
                  </button>

                  {overrideOptions.length > 1 ? (
                    <div className="mt-0.75 flex flex-wrap gap-0.75">
                      {overrideOptions.map((type) => (
                        <OverrideTypeChip
                          key={`${candidateKey}-${type}`}
                          active={effectiveType === type}
                          label={formatGeometryType(type)}
                          onClick={() => onSetCandidateOverride(candidate, type)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CollisionOptimizationCandidateList;
