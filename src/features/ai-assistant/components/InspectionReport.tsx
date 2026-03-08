import {
  AlertCircle,
  AlertTriangle,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import type { InspectionReport, RobotState } from '@/types'
import { translations, type Language, type TranslationKeys } from '@/shared/i18n'
import { INSPECTION_CRITERIA } from '../utils/inspectionCriteria'
import { getScoreBgColor, getScoreColor } from '../utils/scoreHelpers'

interface RetestingItemState {
  categoryId: string
  itemId: string
}

interface InspectionReportProps {
  report: InspectionReport
  robot: RobotState
  lang: Language
  t: TranslationKeys
  expandedCategories: Set<string>
  retestingItem: RetestingItemState | null
  isGeneratingAI: boolean
  onToggleCategory: (categoryId: string) => void
  onRetestItem: (categoryId: string, itemId: string) => void
  onDownloadPDF: () => void
  onSelectItem: (type: 'link' | 'joint', id: string) => void
}

const ISSUE_PRIORITY: Record<string, number> = {
  error: 0,
  warning: 1,
  suggestion: 2,
  pass: 3
}

function getCategoryIcon(categoryId: string) {
  if (categoryId === 'physical') return Box
  if (categoryId === 'kinematics') return RefreshCw
  if (categoryId === 'naming') return FileText
  if (categoryId === 'symmetry') return LayoutGrid
  return Sparkles
}

function getIssueMeta(issueType: string, lang: Language) {
  const t = translations[lang]
  if (issueType === 'error') {
    return {
      Icon: AlertCircle,
      label: t.issueError,
      rowClass: 'border-red-200/80 dark:border-red-900/60',
      stripeClass: 'bg-red-500',
      iconClass: 'text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border-red-200/80 dark:border-red-900/60',
      badgeClass: 'text-red-700 dark:text-red-300 bg-red-50/80 dark:bg-red-950/50 border-red-200 dark:border-red-900/70'
    }
  }

  if (issueType === 'warning') {
    return {
      Icon: AlertTriangle,
      label: t.issueWarning,
      rowClass: 'border-amber-200/80 dark:border-amber-900/60',
      stripeClass: 'bg-amber-500',
      iconClass: 'text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200/80 dark:border-amber-900/60',
      badgeClass: 'text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900/70'
    }
  }

  if (issueType === 'suggestion') {
    return {
      Icon: Sparkles,
      label: t.issueSuggestion,
      rowClass: 'border-system-blue/30 dark:border-system-blue/35',
      stripeClass: 'bg-system-blue',
      iconClass: 'text-system-blue bg-system-blue/10 dark:bg-system-blue/20 border-system-blue/30 dark:border-system-blue/35',
      badgeClass: 'text-system-blue bg-system-blue/10 dark:bg-system-blue/20 border-system-blue/30 dark:border-system-blue/35'
    }
  }

  if (issueType === 'pass') {
    return {
      Icon: Check,
      label: t.issuePass,
      rowClass: 'border-emerald-200/80 dark:border-emerald-900/60',
      stripeClass: 'bg-emerald-500',
      iconClass: 'text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200/80 dark:border-emerald-900/60',
      badgeClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900/70'
    }
  }

  return {
    Icon: Info,
    label: t.issueInfo,
    rowClass: 'border-border-black',
    stripeClass: 'bg-border-strong',
    iconClass: 'text-text-tertiary bg-element-bg border-border-black',
    badgeClass: 'text-text-secondary bg-element-bg border-border-black'
  }
}

export function InspectionReportView({
  report,
  robot,
  lang,
  t,
  expandedCategories,
  retestingItem,
  isGeneratingAI,
  onToggleCategory,
  onRetestItem,
  onDownloadPDF,
  onSelectItem
}: InspectionReportProps) {
  const overallScore = report.overallScore ?? 0
  const maxScore = report.maxScore ?? 100
  const scorePercentage = maxScore > 0 ? (overallScore / maxScore) * 100 : 0

  const issuesByCategory: Record<string, typeof report.issues> = {}
  INSPECTION_CRITERIA.forEach(category => {
    issuesByCategory[category.id] = []
  })

  report.issues.forEach(issue => {
    const categoryId = issue.category || 'physical'
    if (!issuesByCategory[categoryId]) {
      issuesByCategory[categoryId] = []
    }
    issuesByCategory[categoryId].push(issue)
  })

  const issueStats = report.issues.reduce(
    (acc, issue) => {
      if (issue.type === 'error') acc.error += 1
      else if (issue.type === 'warning') acc.warning += 1
      else if (issue.type === 'suggestion') acc.suggestion += 1
      else if (issue.type === 'pass') acc.pass += 1
      return acc
    },
    { error: 0, warning: 0, suggestion: 0, pass: 0 }
  )

  const scoreBand =
    scorePercentage >= 90
      ? {
          label: t.inspectionStable,
          className:
            'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-900/60'
        }
      : scorePercentage >= 70
        ? {
            label: t.inspectionAttention,
            className:
              'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-900/60'
          }
        : {
            label: t.inspectionHighRisk,
            className:
              'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200/80 dark:border-red-900/60'
          }

  const summaryMetrics = [
    {
      key: 'error',
      label: t.issueErrors,
      value: issueStats.error,
      className: 'text-red-600 dark:text-red-300 border-red-200/80 dark:border-red-900/60'
    },
    {
      key: 'warning',
      label: t.issueWarnings,
      value: issueStats.warning,
      className: 'text-amber-600 dark:text-amber-300 border-amber-200/80 dark:border-amber-900/60'
    },
    {
      key: 'suggestion',
      label: t.issueSuggestions,
      value: issueStats.suggestion,
      className: 'text-system-blue border-system-blue/30 dark:border-system-blue/35'
    },
    {
      key: 'pass',
      label: t.issuePassed,
      value: issueStats.pass,
      className: 'text-emerald-600 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-900/60'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="overflow-hidden bg-panel-bg rounded-xl p-5 border border-border-black shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-text-secondary">
              <div className="w-1.5 h-1.5 rounded-full bg-system-blue" />
              <span className="text-[10px] font-medium tracking-wide">{t.inspectorSummary}</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-text-primary">
              {t.inspectionResultTitle}
            </h2>
            <p className="text-sm text-text-secondary max-w-xl leading-relaxed">{report.summary}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-lg border border-border-black bg-element-bg px-3 py-2 min-w-[110px] text-right">
              <div className="text-[10px] text-text-tertiary font-medium tracking-wide mb-1">{t.overallScore}</div>
              <div className="flex items-baseline justify-end gap-1">
                <span className={`text-3xl font-semibold tracking-tight ${getScoreColor(overallScore, maxScore)}`}>
                  {Math.round(scorePercentage)}%
                </span>
              </div>
              <div className={`inline-flex mt-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${scoreBand.className}`}>
                {scoreBand.label}
              </div>
            </div>
            <button
              onClick={onDownloadPDF}
              className="w-9 h-9 flex items-center justify-center bg-element-bg hover:bg-element-hover text-text-secondary rounded-lg transition-colors border border-border-black"
              title={t.downloadReport}
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 relative h-1.5 w-full bg-element-bg rounded-full overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full ${getScoreBgColor(
              overallScore,
              maxScore
            )}`}
            style={{ width: `${scorePercentage}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {summaryMetrics.map(metric => (
            <div
              key={metric.key}
              className={`rounded-lg border bg-element-bg dark:bg-element-bg px-2.5 py-2 ${metric.className}`}
            >
              <div className="text-[10px] font-medium tracking-wide text-text-tertiary">{metric.label}</div>
              <div className="text-base font-semibold leading-tight mt-1">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {INSPECTION_CRITERIA.map(category => {
          const categoryIssues = issuesByCategory[category.id] || []
          const categoryScore = report.categoryScores?.[category.id] ?? 10
          const isExpanded = expandedCategories.has(category.id)
          const categoryName = lang === 'zh' ? category.nameZh : category.name
          const hasProblems = categoryIssues.some(issue => issue.type !== 'pass')
          const nonPassCount = categoryIssues.filter(issue => issue.type !== 'pass').length
          const orderedIssues = [...categoryIssues].sort(
            (a, b) => (ISSUE_PRIORITY[a.type] ?? 99) - (ISSUE_PRIORITY[b.type] ?? 99)
          )
          const CategoryIcon = getCategoryIcon(category.id)

          return (
            <div
              key={category.id}
              className={`group border rounded-xl overflow-hidden transition-colors duration-200 ${
                isExpanded
                  ? 'bg-panel-bg border-border-black shadow-sm'
                  : 'bg-element-bg border-transparent hover:border-border-black'
              }`}
            >
              <button onClick={() => onToggleCategory(category.id)} className="w-full flex items-center justify-between p-3.5 text-left">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                      hasProblems
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 border-amber-200/80 dark:border-amber-900/60'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-900/60'
                    }`}
                  >
                    <CategoryIcon className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary truncate">{categoryName}</span>
                      <span className="text-[10px] font-medium text-text-tertiary tracking-wide">
                        {t.weight} {category.weight * 100}%
                      </span>
                    </div>
                    <div className="text-[10px] text-text-tertiary font-medium flex items-center gap-2">
                      {t.checksCount.replace('{count}', String(categoryIssues.length))}
                      {hasProblems ? (
                        <span className="px-1.5 py-0.5 rounded border border-amber-200/80 dark:border-amber-900/60 text-amber-700 dark:text-amber-300">
                          {t.itemsNeedAttention.replace('{count}', String(nonPassCount))}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                          {t.allPassedShort}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 pl-3 shrink-0">
                  <div className="hidden sm:flex flex-col items-end gap-1 min-w-[84px]">
                    <div className={`text-sm font-medium ${getScoreColor(categoryScore)}`}>{categoryScore.toFixed(1)}/10</div>
                    <div className="w-20 h-1 bg-element-bg rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getScoreBgColor(categoryScore)}`}
                        style={{ width: `${(categoryScore / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div
                    className={`p-1.5 rounded-md transition-colors ${
                      isExpanded
                        ? 'bg-element-hover text-text-secondary'
                        : 'text-text-tertiary group-hover:text-text-secondary'
                    }`}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="p-4 pt-0 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {categoryIssues.length === 0 ? (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-element-bg dark:bg-element-bg text-emerald-700 dark:text-emerald-300">
                      <div className="p-2 rounded-md border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/60">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-semibold">
                        {t.allChecksPassedForCategory}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {orderedIssues.map((issue, idx) => {
                        const issueScore = issue.score ?? 10
                        const isRetesting =
                          retestingItem?.categoryId === issue.category && retestingItem?.itemId === issue.itemId

                        const meta = getIssueMeta(issue.type, lang)
                        const Icon = meta.Icon

                        return (
                          <div
                            key={`${issue.category || 'unknown'}-${issue.itemId || idx}-${idx}`}
                            className={`rounded-lg border bg-white dark:bg-panel-bg transition-colors ${meta.rowClass}`}
                          >
                            <div className={`h-0.5 ${meta.stripeClass}`} />
                            <div className="p-4">
                              <div className="flex gap-3">
                                <div className={`shrink-0 p-2 rounded-lg border ${meta.iconClass}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between mb-1 gap-4">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <h4 className="text-sm font-semibold text-text-primary truncate">
                                          {issue.title}
                                        </h4>
                                        <span
                                          className={`px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${meta.badgeClass}`}
                                        >
                                          {meta.label}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className={`text-xs font-semibold ${getScoreColor(issueScore)}`}>
                                        {issueScore.toFixed(1)}
                                      </div>
                                      {issue.category && issue.itemId && issue.type !== 'pass' && (
                                      <button
                                          onClick={() => onRetestItem(issue.category!, issue.itemId!)}
                                          disabled={isRetesting || isGeneratingAI}
                                          className="p-1.5 bg-element-bg border border-border-black hover:bg-element-hover hover:text-system-blue rounded-lg transition-colors disabled:opacity-30"
                                          title={t.retestThisItem}
                                        >
                                          {isRetesting ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <RefreshCw className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs text-text-secondary leading-relaxed font-medium mb-3">
                                    {issue.description}
                                  </p>

                                  {issue.relatedIds && issue.relatedIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {issue.relatedIds.map(id => {
                                        const name = robot.links[id]?.name || robot.joints[id]?.name || id
                                        return (
                                          <button
                                            key={id}
                                            onClick={() => {
                                              const type = robot.links[id] ? 'link' : 'joint'
                                              onSelectItem(type, id)
                                            }}
                                            className="text-[10px] font-medium bg-element-bg hover:bg-element-hover hover:text-system-blue px-2 py-1 rounded-md text-text-secondary transition-colors border border-border-black"
                                          >
                                            {name}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default InspectionReportView
