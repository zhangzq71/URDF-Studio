import { ArrowRight, CheckSquare2, Square } from 'lucide-react';
import type {
  CollisionOptimizationCandidate,
  CollisionTargetRef,
} from '../utils/collisionOptimization';
import { GeometryType } from '@/types';

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
  jointPair: string;
  noCandidates: string;
  primary: string;
  selectedCount: string;
}

interface CollisionOptimizationCandidateListProps {
  candidates: CollisionOptimizationCandidate[];
  checkedTargetIds: ReadonlySet<string>;
  selection?: CollisionSelection;
  labels: CollisionOptimizationCandidateListLabels;
  formatGeometryType: (type: GeometryType) => string;
  getStatusLabel: (candidate: CollisionOptimizationCandidate) => string;
  onSelectTarget?: (target: CollisionTargetRef) => void;
  onHoverTarget?: (target: CollisionTargetRef | null) => void;
  onToggleCandidate: (targetId: string) => void;
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

export function CollisionOptimizationCandidateList({
  candidates,
  checkedTargetIds,
  selection,
  labels,
  formatGeometryType,
  getStatusLabel,
  onSelectTarget,
  onHoverTarget,
  onToggleCandidate,
}: CollisionOptimizationCandidateListProps) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-black bg-panel-bg px-2.5 py-4 text-center text-[10px] leading-relaxed text-text-secondary">
        {labels.noCandidates}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {candidates.map((candidate) => {
        const isChecked = checkedTargetIds.has(candidate.target.id);
        const isFocused = isFocusedTarget(selection, candidate.target);
        const candidateMeta = (
          <div className="flex min-w-0 flex-wrap items-center gap-1 text-[9px] text-text-secondary">
            {candidate.secondaryTarget && (
              <span className="inline-flex max-w-[14rem] items-center rounded-md border border-border-black bg-element-bg px-1.5 py-0.5">
                <span className="truncate">
                  {labels.jointPair}: {candidate.secondaryTarget.linkName}
                </span>
              </span>
            )}
            {candidate.target.componentName && (
              <span className="inline-flex max-w-[14rem] items-center rounded-md border border-border-black bg-element-bg px-1.5 py-0.5">
                <span className="truncate">
                  {labels.component}: {candidate.target.componentName}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md border border-border-black bg-element-bg px-1.5 py-0.5 font-medium text-text-secondary">
              <span>{formatGeometryType(candidate.currentType)}</span>
              <ArrowRight className="h-2.5 w-2.5 text-text-tertiary" />
              <span className="text-text-primary">
                {candidate.suggestedType ? formatGeometryType(candidate.suggestedType) : '—'}
              </span>
            </span>
          </div>
        );

        return (
          <div
            key={`${candidate.target.id}-${candidate.secondaryTarget?.id ?? 'single'}`}
            className={`rounded-md border transition-colors ${
              isFocused
                ? 'border-system-blue/40 bg-system-blue/10'
                : 'border-border-black bg-panel-bg hover:bg-element-hover'
            }`}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-2 py-1.5">
              <button
                type="button"
                aria-label={isChecked ? labels.clearAll : labels.selectedCount}
                disabled={!candidate.eligible}
                onClick={() => {
                  if (!candidate.eligible) return;
                  onToggleCandidate(candidate.target.id);
                }}
                className={`mt-0.5 shrink-0 ${
                  candidate.eligible
                    ? 'text-system-blue'
                    : 'cursor-not-allowed text-text-tertiary/60'
                }`}
              >
                {isChecked ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => onSelectTarget?.(candidate.target)}
                className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
                onMouseEnter={() => onHoverTarget?.(candidate.target)}
                onMouseLeave={() => onHoverTarget?.(null)}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[11px] font-semibold text-text-primary">
                      {candidate.target.linkName}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-system-blue/20 bg-system-blue/10 px-1.5 py-0.5 text-[9px] text-system-blue">
                      {candidate.target.isPrimary
                        ? labels.primary
                        : `${labels.collisionIndex} ${candidate.target.sequenceIndex + 1}`}
                    </span>
                  </div>

                  <div className="mt-0.5">{candidateMeta}</div>
                </div>
              </button>

              {!candidate.eligible ? (
                <div className="pt-0.5 text-[9px]">
                  <span className="inline-flex items-center rounded-full border border-border-black bg-element-bg px-1.5 py-0.5 text-text-tertiary">
                    {getStatusLabel(candidate)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CollisionOptimizationCandidateList;
