import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  CheckSquare2,
  Loader2,
  MousePointerClick,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import { translations } from '@/shared/i18n';
import { GeometryType } from '@/types';
import type {
  CollisionOptimizationBaseAnalysis,
  CollisionOptimizationSource,
  CollisionOptimizationScope,
  CylinderOptimizationStrategy,
  MeshOptimizationStrategy,
  RodBoxOptimizationStrategy,
} from '../utils/collisionOptimization';
import {
  buildCollisionOptimizationAnalysis,
  buildCollisionOptimizationOperations,
  countSameLinkOverlapWarnings,
  prepareCollisionOptimizationBaseAnalysis,
  type CollisionOptimizationCandidate,
  type CollisionOptimizationOperation,
  type CollisionTargetRef,
} from '../utils/collisionOptimization';

interface CollisionOptimizationDialogProps {
  source: CollisionOptimizationSource;
  assets: Record<string, string>;
  lang: 'en' | 'zh';
  selection?: {
    type: 'link' | 'joint' | null;
    id: string | null;
    subType?: 'visual' | 'collision';
    objectIndex?: number;
  };
  onClose: () => void;
  onApply: (operations: CollisionOptimizationOperation[]) => void;
  onSelectTarget?: (target: CollisionTargetRef) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-tertiary first:mt-0">
      {children}
    </div>
  );
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative h-[18px] w-8 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
        disabled
          ? 'bg-switch-off opacity-50 cursor-not-allowed'
          : value
            ? 'bg-system-blue'
            : 'bg-switch-off'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-[14px] w-[14px] rounded-full shadow transition-transform ${
          value ? 'translate-x-[14px] bg-white' : 'translate-x-0 bg-white dark:bg-element-bg'
        }`}
      />
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'warn';
}) {
  const surfaceClass = tone === 'good'
    ? 'border-green-500/20 bg-green-500/10'
    : tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/10'
      : 'border-border-black bg-element-bg';
  const accentClass = tone === 'good'
    ? 'text-green-700 dark:text-green-300'
    : tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-text-secondary';
  const valueClass = tone === 'good'
    ? 'text-green-800 dark:text-green-200'
    : tone === 'warn'
      ? 'text-amber-800 dark:text-amber-200'
      : 'text-text-primary';

  return (
    <div className={`flex min-w-[118px] flex-1 items-center justify-between gap-2 rounded-md border px-2 py-1 ${surfaceClass}`}>
      <div className={`flex min-w-0 items-center gap-1.5 ${accentClass}`}>
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-[9px] font-medium uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className={`shrink-0 text-[11px] font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-7 rounded-md border px-2 py-1.5 text-[10px] font-medium leading-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-border-black text-text-tertiary'
          : active
            ? 'bg-white dark:bg-segmented-active text-text-primary shadow-sm border-border-black'
            : 'bg-transparent text-text-secondary border-transparent hover:text-text-primary hover:bg-element-hover'
      }`}
    >
      {children}
    </button>
  );
}

function PanelSwitchButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
        active
          ? 'bg-white dark:bg-segmented-active text-text-primary shadow-sm'
          : 'text-text-secondary hover:bg-element-hover hover:text-text-primary'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="rounded-full border border-border-black bg-element-bg px-1 py-0.5 text-[9px] leading-none text-text-tertiary">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function StrategyField({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-black bg-panel-bg px-2.5 py-2.5">
      <div className="text-[11px] font-medium leading-tight text-text-primary">{label}</div>
      {desc ? <div className="mt-0.5 text-[10px] leading-snug text-text-tertiary">{desc}</div> : null}
      <div className={`${desc ? 'mt-2' : 'mt-1.5'} flex flex-wrap gap-1`}>{children}</div>
    </div>
  );
}

export const CollisionOptimizationDialog: React.FC<CollisionOptimizationDialogProps> = ({
  source,
  assets,
  lang,
  selection,
  onClose,
  onApply,
  onSelectTarget,
}) => {
  const t = translations[lang];
  const copy = {
    title: t.collisionOptimizerDialog,
    scope: t.collisionOptimizerScope,
    scopeAll: t.collisionOptimizerScopeAll,
    scopeMesh: t.collisionOptimizerScopeMesh,
    scopePrimitive: t.collisionOptimizerScopePrimitive,
    scopeSelected: t.collisionOptimizerScopeSelected,
    panelCandidates: t.collisionOptimizerCandidates,
    panelSettings: t.collisionOptimizerSettings,
    strategies: t.collisionOptimizerStrategies,
    strategySmart: t.collisionOptimizerStrategySmart,
    strategyKeep: t.collisionOptimizerStrategyKeep,
    strategyBox: t.box,
    strategySphere: t.sphere,
    strategyCylinder: t.cylinder,
    strategyCapsule: t.capsule,
    meshStrategyLabel: t.collisionOptimizerMeshStrategyLabel,
    cylinderStrategyLabel: t.collisionOptimizerCylinderStrategyLabel,
    rodBoxStrategyLabel: t.collisionOptimizerRodBoxStrategyLabel,
    rules: t.collisionOptimizerRules,
    avoidSiblingOverlap: t.collisionOptimizerAvoidSiblingOverlap,
    avoidSiblingOverlapDesc: t.collisionOptimizerAvoidSiblingOverlapDesc,
    candidates: t.collisionOptimizerCandidates,
    selectAll: t.collisionOptimizerSelectAll,
    clearAll: t.collisionOptimizerClearSelection,
    selectedCount: t.selected,
    noCandidates: t.collisionOptimizerNoSuggestion,
    noSelectedCollision: t.collisionOptimizerNoSelectedCollision,
    analyzing: t.collisionOptimizerLoading,
    apply: t.collisionOptimizerApplyAction,
    warningTitle: t.collisionOptimizerWarningTitle,
    warningBefore: t.collisionOptimizerWarningBefore,
    warningAfter: t.collisionOptimizerWarningAfter,
    ready: t.collisionOptimizerReady,
    disabled: t.collisionOptimizerDisabled,
    missingMeshPath: t.collisionOptimizerMissingMeshPath,
    meshAnalysisFailed: t.collisionOptimizerMeshAnalysisFailed,
    noRuleMatch: t.collisionOptimizerNoRuleMatch,
    totalCollisions: t.collisionOptimizerStatsTotal,
    meshCollisions: t.collisionOptimizerStatsMeshes,
    eligible: t.collisionOptimizerStatsOptimizable,
    warnings: t.collisionOptimizerStatsWarnings,
    collisionIndex: t.collisionOptimizerCollisionIndex,
    primary: t.collisionOptimizerPrimary,
    component: t.collisionOptimizerComponent,
  };

  const [scope, setScope] = useState<CollisionOptimizationScope>('all');
  const [meshStrategy, setMeshStrategy] = useState<MeshOptimizationStrategy>('capsule');
  const [cylinderStrategy, setCylinderStrategy] = useState<CylinderOptimizationStrategy>('capsule');
  const [rodBoxStrategy, setRodBoxStrategy] = useState<RodBoxOptimizationStrategy>('capsule');
  const [avoidSiblingOverlap, setAvoidSiblingOverlap] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [baseAnalysis, setBaseAnalysis] = useState<CollisionOptimizationBaseAnalysis | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [stackedPanel, setStackedPanel] = useState<'candidates' | 'settings'>('candidates');
  const hasCustomCheckedSelectionRef = useRef(false);

  const windowState = useDraggableWindow({
    defaultSize: { width: 1120, height: 720 },
    minSize: { width: 700, height: 520 },
    centerOnMount: true,
    enableMinimize: false,
    enableMaximize: false,
  });
  const dialogWidth = windowState.size.width;
  const isStackedLayout = dialogWidth < 1080;
  const isCompactLayout = dialogWidth < 900;
  const isDenseLayout = dialogWidth < 760;

  const selectedTargetId = useMemo(() => {
    if (selection?.type !== 'link' || selection.subType !== 'collision' || !selection.id || !baseAnalysis) {
      return null;
    }

    const matches = baseAnalysis.targets.filter((target) =>
      target.linkId === selection.id && (selection.objectIndex ?? 0) === target.objectIndex
    );

    return matches.length === 1 ? matches[0].id : null;
  }, [baseAnalysis, selection]);

  const effectiveSelectedTargetId = scope === 'selected' ? selectedTargetId : null;

  useEffect(() => {
    let isMounted = true;
    setIsAnalyzing(true);
    hasCustomCheckedSelectionRef.current = false;
    setCheckedIds(new Set());

    void prepareCollisionOptimizationBaseAnalysis(source, assets)
      .then((result) => {
        if (!isMounted) return;
        setBaseAnalysis(result);
      })
      .finally(() => {
        if (isMounted) {
          setIsAnalyzing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [assets, source]);

  const analysis = useMemo(
    () => (baseAnalysis
      ? buildCollisionOptimizationAnalysis(baseAnalysis, {
        scope,
        meshStrategy,
        cylinderStrategy,
        rodBoxStrategy,
        avoidSiblingOverlap,
        selectedTargetId: effectiveSelectedTargetId,
      })
      : null),
    [
      avoidSiblingOverlap,
      baseAnalysis,
      cylinderStrategy,
      effectiveSelectedTargetId,
      meshStrategy,
      rodBoxStrategy,
      scope,
    ],
  );

  useEffect(() => {
    if (!analysis || hasCustomCheckedSelectionRef.current) {
      return;
    }

    setCheckedIds(new Set(analysis.candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.target.id)));
  }, [analysis]);

  const activeOperations = useMemo(
    () => buildCollisionOptimizationOperations(analysis?.candidates ?? [], checkedIds),
    [analysis?.candidates, checkedIds],
  );

  const overridesByTargetId = useMemo<Record<string, CollisionOptimizationOperation['nextGeometry']>>(
    () => activeOperations.reduce<Record<string, CollisionOptimizationOperation['nextGeometry']>>((accumulator, operation) => {
      accumulator[operation.id] = operation.nextGeometry;
      return accumulator;
    }, {}),
    [activeOperations],
  );

  const warningBefore = useMemo(
    () => analysis ? countSameLinkOverlapWarnings(analysis.targets, analysis.meshAnalysisByTargetId) : 0,
    [analysis],
  );

  const warningAfter = useMemo(
    () => analysis ? countSameLinkOverlapWarnings(analysis.targets, analysis.meshAnalysisByTargetId, overridesByTargetId) : 0,
    [analysis, overridesByTargetId],
  );

  const totalCollisionCount = analysis?.targets.length ?? 0;
  const meshCollisionCount = useMemo(
    () => analysis?.targets.filter((target) => target.geometry.type === GeometryType.MESH).length ?? 0,
    [analysis?.targets],
  );
  const eligibleCount = useMemo(
    () => analysis?.candidates.filter((candidate) => candidate.eligible).length ?? 0,
    [analysis?.candidates],
  );

  const toggleCandidate = useCallback((targetId: string) => {
    hasCustomCheckedSelectionRef.current = true;
    setCheckedIds((previous) => {
      const next = new Set(previous);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    hasCustomCheckedSelectionRef.current = true;
    setCheckedIds(new Set(analysis?.candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.target.id) ?? []));
  }, [analysis?.candidates]);

  const handleClearAll = useCallback(() => {
    hasCustomCheckedSelectionRef.current = true;
    setCheckedIds(new Set());
  }, []);

  const handleApply = useCallback(() => {
    if (activeOperations.length === 0) return;
    onApply(activeOperations);
  }, [activeOperations, onApply]);

  const formatGeometryType = useCallback((type: GeometryType) => {
    switch (type) {
      case GeometryType.BOX:
        return t.box;
      case GeometryType.SPHERE:
        return t.sphere;
      case GeometryType.CYLINDER:
        return t.cylinder;
      case GeometryType.CAPSULE:
        return t.capsule;
      case GeometryType.MESH:
        return t.mesh;
      default:
        return t.none;
    }
  }, [t]);

  const getStatusLabel = useCallback((candidate: CollisionOptimizationCandidate) => {
    if (candidate.eligible) {
      return copy.ready;
    }

    switch (candidate.status) {
      case 'disabled':
        return copy.disabled;
      case 'missing-mesh-path':
        return copy.missingMeshPath;
      case 'mesh-analysis-failed':
        return copy.meshAnalysisFailed;
      case 'no-rule-match':
      default:
        return copy.noRuleMatch;
    }
  }, [copy]);

  const isSelectedScopeWithoutSelection = scope === 'selected'
    && (!selection?.id || selection.subType !== 'collision' || selection.type !== 'link');

  const footerLabel = `${copy.selectedCount} ${activeOperations.length} / ${eligibleCount}`;
  const hasOverlapWarnings = warningBefore > 0 || warningAfter > 0;
  const showCandidatesPanel = !isStackedLayout || stackedPanel === 'candidates';
  const showSettingsPanel = !isStackedLayout || stackedPanel === 'settings';

  const meshStrategyOptions: Array<{ value: MeshOptimizationStrategy; label: string }> = [
    { value: 'capsule', label: copy.strategyCapsule },
    { value: 'smart', label: copy.strategySmart },
    { value: 'cylinder', label: copy.strategyCylinder },
    { value: 'box', label: copy.strategyBox },
    { value: 'sphere', label: copy.strategySphere },
    { value: 'keep', label: copy.strategyKeep },
  ];

  const cylinderStrategyOptions: Array<{ value: CylinderOptimizationStrategy; label: string }> = [
    { value: 'capsule', label: copy.strategyCapsule },
    { value: 'keep', label: copy.strategyKeep },
  ];

  const rodBoxStrategyOptions: Array<{ value: RodBoxOptimizationStrategy; label: string }> = [
    { value: 'capsule', label: copy.strategyCapsule },
    { value: 'cylinder', label: copy.strategyCylinder },
    { value: 'keep', label: copy.strategyKeep },
  ];

  return (
    <DraggableWindow
      window={windowState}
      onClose={onClose}
      title={
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="rounded-md border border-border-black bg-element-bg p-1 text-text-secondary">
            <Sparkles className="h-3 w-3" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-text-primary">{copy.title}</div>
          </div>
        </div>
      }
      className="z-[110] flex flex-col overflow-hidden rounded-xl border border-border-black bg-panel-bg text-text-primary shadow-lg"
      headerClassName="flex h-11 shrink-0 items-center justify-between border-b border-border-black bg-element-bg px-2.5"
      interactionClassName="select-none"
      headerDraggableClassName="cursor-grab"
      headerDraggingClassName="cursor-grabbing"
      showMinimizeButton={false}
      showMaximizeButton={false}
      closeTitle={t.close}
      closeButtonClassName="rounded-md p-1 text-text-tertiary transition-colors hover:bg-red-500 hover:text-white"
      showResizeHandles={true}
    >
      <div className="flex-1 min-h-0 overflow-hidden px-2.5 py-2.5 sm:px-3">
        <div className="flex h-full min-h-0 flex-col gap-2.5">
          <div className="flex flex-wrap gap-1">
            <StatCard label={copy.totalCollisions} value={totalCollisionCount} icon={<Boxes className="w-3.5 h-3.5" />} />
            <StatCard label={copy.meshCollisions} value={meshCollisionCount} icon={<Wand2 className="w-3.5 h-3.5" />} />
            <StatCard label={copy.eligible} value={eligibleCount} icon={<CheckSquare2 className="w-3.5 h-3.5" />} tone={eligibleCount > 0 ? 'good' : 'default'} />
            <StatCard label={copy.warnings} value={`${warningBefore} → ${warningAfter}`} icon={<ShieldAlert className="w-3.5 h-3.5" />} tone={warningAfter > 0 ? 'warn' : 'good'} />
          </div>

          {isStackedLayout && (
            <div className="shrink-0 rounded-xl border border-border-black bg-segmented-bg p-0.5">
              <div className="flex gap-1">
                <PanelSwitchButton
                  active={stackedPanel === 'candidates'}
                  onClick={() => setStackedPanel('candidates')}
                  icon={<Boxes className="h-3.5 w-3.5 shrink-0" />}
                  label={copy.panelCandidates}
                  badge={analysis?.candidates.length ?? 0}
                />
                <PanelSwitchButton
                  active={stackedPanel === 'settings'}
                  onClick={() => setStackedPanel('settings')}
                  icon={<Wand2 className="h-3.5 w-3.5 shrink-0" />}
                  label={copy.panelSettings}
                />
              </div>
            </div>
          )}

          <div className={`grid flex-1 min-h-0 gap-2.5 ${isStackedLayout ? 'grid-cols-1' : 'grid-cols-[minmax(280px,clamp(300px,34%,380px))_minmax(0,1fr)]'}`}>
            {showCandidatesPanel && (
              <div className="min-h-0 flex flex-col overflow-hidden rounded-xl border border-border-black bg-element-bg">
                <div className="shrink-0 border-b border-border-black bg-panel-bg px-2 py-1.5">
                  <div className={`gap-1.5 ${isDenseLayout ? 'space-y-1.5' : 'flex items-center justify-between'}`}>
                    <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                      <div className="text-[11px] font-semibold text-text-primary">{copy.candidates}</div>
                      <span className="inline-flex items-center rounded-full border border-border-black bg-element-bg px-1.5 py-0.5 text-[9px] text-text-tertiary">
                        {copy.eligible} {eligibleCount}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] ${
                        activeOperations.length > 0
                          ? 'border-system-blue/20 bg-system-blue/10 text-system-blue'
                          : 'border-border-black bg-element-bg text-text-tertiary'
                      }`}>
                        {copy.selectedCount} {activeOperations.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="rounded-md px-1.5 py-0.5 text-[9px] font-medium text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary"
                      >
                        {copy.selectAll}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="rounded-md px-1.5 py-0.5 text-[9px] font-medium text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary"
                      >
                        {copy.clearAll}
                      </button>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1">
                    <div className="flex flex-wrap gap-1 rounded-md border border-border-black bg-segmented-bg p-0.5">
                      {([
                        ['all', copy.scopeAll],
                        ['mesh', copy.scopeMesh],
                        ['primitive', copy.scopePrimitive],
                        ['selected', copy.scopeSelected],
                      ] as const).map(([value, label]) => (
                        <OptionButton
                          key={value}
                          active={scope === value}
                          onClick={() => setScope(value)}
                        >
                          {label}
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-1">
                  {isAnalyzing && (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[10px] text-text-tertiary">
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      <span>{copy.analyzing}</span>
                    </div>
                  )}

                  {!isAnalyzing && isSelectedScopeWithoutSelection && (
                    <div className="rounded-lg border border-dashed border-border-black bg-panel-bg px-2.5 py-4 text-center text-[10px] leading-relaxed text-text-secondary">
                      <MousePointerClick className="mx-auto mb-1.5 h-4.5 w-4.5 text-text-tertiary" />
                      {copy.noSelectedCollision}
                    </div>
                  )}

                  {!isAnalyzing && !isSelectedScopeWithoutSelection && (analysis?.candidates.length ?? 0) === 0 && (
                    <div className="rounded-lg border border-dashed border-border-black bg-panel-bg px-2.5 py-4 text-center text-[10px] leading-relaxed text-text-secondary">
                      {copy.noCandidates}
                    </div>
                  )}

                  {!isAnalyzing && analysis?.candidates.map((candidate) => {
                    const isChecked = checkedIds.has(candidate.target.id);
                    const isFocused = selection?.type === 'link'
                      && selection.id === candidate.target.linkId
                      && selection.subType === 'collision'
                      && (selection.objectIndex ?? 0) === candidate.target.objectIndex;

                    return (
                      <div
                        key={candidate.target.id}
                        className={`rounded-md border transition-colors ${
                          isFocused
                            ? 'border-system-blue/40 bg-system-blue/10'
                            : 'border-border-black bg-panel-bg hover:bg-element-hover'
                        }`}
                      >
                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-2 py-1.5">
                          <button
                            type="button"
                            aria-label={isChecked ? copy.clearAll : copy.selectAll}
                            disabled={!candidate.eligible}
                            onClick={() => {
                              if (!candidate.eligible) return;
                              toggleCandidate(candidate.target.id);
                            }}
                            className={`mt-0.5 shrink-0 ${candidate.eligible ? 'text-system-blue' : 'cursor-not-allowed text-text-tertiary/60'}`}
                          >
                            {isChecked ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectTarget?.(candidate.target)}
                            className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-[11px] font-semibold text-text-primary">{candidate.target.linkName}</span>
                                <span className="inline-flex items-center rounded-full border border-system-blue/20 bg-system-blue/10 px-1.5 py-0.5 text-[9px] text-system-blue">
                                  {candidate.target.isPrimary
                                    ? copy.primary
                                    : `${copy.collisionIndex} ${candidate.target.sequenceIndex + 1}`}
                                </span>
                              </div>

                              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[9px] text-text-secondary">
                                {candidate.target.componentName && (
                                  <span className="inline-flex max-w-[14rem] items-center rounded-md border border-border-black bg-element-bg px-1.5 py-0.5">
                                    <span className="truncate">{candidate.target.componentName}</span>
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 rounded-md border border-border-black bg-element-bg px-1.5 py-0.5 font-medium text-text-secondary">
                                  <span>{formatGeometryType(candidate.currentType)}</span>
                                  <ArrowRight className="h-2.5 w-2.5 text-text-tertiary" />
                                  <span className="text-text-primary">{candidate.suggestedType ? formatGeometryType(candidate.suggestedType) : '—'}</span>
                                </span>
                              </div>
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
              </div>
            )}

            {showSettingsPanel && (
              <div className="min-h-0 flex flex-col overflow-hidden rounded-xl border border-border-black bg-element-bg">
                <div className="shrink-0 border-b border-border-black bg-panel-bg px-2.5 py-2">
                  <div className="text-[11px] font-semibold text-text-primary">{copy.panelSettings}</div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2.5 space-y-2.5">
                  <div>
                    <SectionLabel>{copy.strategies}</SectionLabel>

                    <StrategyField label={copy.meshStrategyLabel}>
                      {meshStrategyOptions.map((option) => (
                        <OptionButton
                          key={option.value}
                          active={meshStrategy === option.value}
                          onClick={() => setMeshStrategy(option.value)}
                        >
                          {option.label}
                        </OptionButton>
                      ))}
                    </StrategyField>

                    <StrategyField label={copy.cylinderStrategyLabel}>
                      {cylinderStrategyOptions.map((option) => (
                        <OptionButton
                          key={option.value}
                          active={cylinderStrategy === option.value}
                          onClick={() => setCylinderStrategy(option.value)}
                        >
                          {option.label}
                        </OptionButton>
                      ))}
                    </StrategyField>

                    <StrategyField label={copy.rodBoxStrategyLabel}>
                      {rodBoxStrategyOptions.map((option) => (
                        <OptionButton
                          key={option.value}
                          active={rodBoxStrategy === option.value}
                          onClick={() => setRodBoxStrategy(option.value)}
                        >
                          {option.label}
                        </OptionButton>
                      ))}
                    </StrategyField>
                  </div>

                  <div>
                    <SectionLabel>{copy.rules}</SectionLabel>
                    <div className={`rounded-lg border border-border-black bg-panel-bg px-2.5 py-2.5 gap-2.5 ${isDenseLayout ? 'flex flex-col' : 'flex items-start justify-between'}`}>
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium leading-tight text-text-primary">{copy.avoidSiblingOverlap}</div>
                        <div className="mt-0.5 text-[10px] leading-relaxed text-text-tertiary">{copy.avoidSiblingOverlapDesc}</div>
                      </div>
                      <Toggle value={avoidSiblingOverlap} onChange={setAvoidSiblingOverlap} />
                    </div>
                  </div>

                  {hasOverlapWarnings && (
                    <div className="rounded-xl border border-border-black bg-element-bg px-2.5 py-2.5">
                      <SectionLabel>{copy.warningTitle}</SectionLabel>
                      <div className={`grid gap-1.5 ${isDenseLayout ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        <div className="rounded-lg border border-border-black bg-panel-bg px-2.5 py-2">
                          <div className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary">{copy.warningBefore}</div>
                          <div className="mt-0.5 text-sm font-semibold text-text-primary">{warningBefore}</div>
                        </div>
                        <div className="rounded-lg border border-border-black bg-panel-bg px-2.5 py-2">
                          <div className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary">{copy.warningAfter}</div>
                          <div className="mt-0.5 text-sm font-semibold text-text-primary">{warningAfter}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`shrink-0 gap-2.5 border-t border-border-black bg-element-bg px-3 py-2.5 ${isCompactLayout ? 'flex flex-wrap items-center' : 'flex items-center'}`}>
        <div className={`flex items-center gap-1.5 text-[10px] text-text-tertiary ${isCompactLayout ? 'order-1' : ''}`}>
          <RefreshCw className="h-3 w-3" />
          <span>{footerLabel}</span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-panel-bg hover:text-text-primary ${isCompactLayout ? 'order-2' : ''}`}
        >
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={activeOperations.length === 0 || isAnalyzing}
          className={`flex items-center gap-1.5 rounded-md bg-system-blue-solid px-3.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-system-blue disabled:cursor-not-allowed disabled:opacity-50 ${isCompactLayout ? 'order-3 ml-auto' : ''}`}
        >
          <Sparkles className="h-3 w-3" />
          {copy.apply}
        </button>
      </div>
    </DraggableWindow>
  );
};

export default CollisionOptimizationDialog;
