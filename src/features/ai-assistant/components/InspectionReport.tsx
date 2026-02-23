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
import type { Language, TranslationKeys } from '@/shared/i18n'
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
  const scorePercentage = (overallScore / maxScore) * 100

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

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-slate-900 dark:bg-[#1C1C1E] rounded-2xl p-6 text-white shadow-xl border border-transparent dark:border-white/10">
        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
          <Sparkles className="w-32 h-32" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-blue-400">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{t.inspectorSummary}</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight leading-tight">
              {lang === 'zh' ? 'URDF 模型健康度' : 'URDF Model Health'}
            </h2>
            <p className="text-sm text-slate-400 max-w-md font-medium leading-relaxed">{report.summary}</p>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t.overallScore}</div>
              <div className="flex items-baseline gap-1">
                <span className={`text-5xl font-black tracking-tighter ${getScoreColor(overallScore, maxScore)}`}>
                  {Math.round(scorePercentage)}
                </span>
                <span className="text-xl text-slate-600 font-bold">%</span>
              </div>
            </div>
            <button
              onClick={onDownloadPDF}
              className="p-3 bg-black dark:bg-[#48484A] hover:bg-slate-700 text-white rounded-xl transition-all border border-white/10 group shadow-lg"
              title={t.downloadReport}
            >
              <FileText className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>

        <div className="mt-8 relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full ${getScoreBgColor(
              overallScore,
              maxScore
            )}`}
            style={{ width: `${scorePercentage}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {INSPECTION_CRITERIA.map(category => {
          const categoryIssues = issuesByCategory[category.id] || []
          const categoryScore = report.categoryScores?.[category.id] ?? 10
          const isExpanded = expandedCategories.has(category.id)
          const categoryName = lang === 'zh' ? category.nameZh : category.name
          const hasProblems = categoryIssues.some(issue => issue.type !== 'pass')

          return (
            <div
              key={category.id}
              className={`group border rounded-2xl overflow-hidden transition-all duration-300 ${
                isExpanded
                  ? 'bg-white dark:bg-[#1C1C1E] border-slate-200 dark:border-white/10 shadow-xl shadow-slate-200/50 dark:shadow-black/50'
                  : 'bg-slate-50 dark:bg-[#1C1C1E]/50 border-transparent hover:border-slate-200 dark:hover:border-white/10'
              }`}
            >
              <button onClick={() => onToggleCategory(category.id)} className="w-full flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      hasProblems
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-600'
                    }`}
                  >
                    {category.id === 'physical' ? (
                      <Box className="w-5 h-5" />
                    ) : category.id === 'kinematics' ? (
                      <RefreshCw className="w-5 h-5" />
                    ) : category.id === 'naming' ? (
                      <FileText className="w-5 h-5" />
                    ) : category.id === 'symmetry' ? (
                      <LayoutGrid className="w-5 h-5" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">{categoryName}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {category.weight * 100}%
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {categoryIssues.length} {lang === 'zh' ? '项检查' : 'checks'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <div className={`text-sm font-black ${getScoreColor(categoryScore)}`}>{categoryScore.toFixed(1)}/10</div>
                    <div className="w-24 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getScoreBgColor(categoryScore)}`}
                        style={{ width: `${(categoryScore / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div
                    className={`p-1.5 rounded-lg transition-colors ${
                      isExpanded
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-600'
                        : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="p-4 pt-0 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {categoryIssues.length === 0 ? (
                    <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 rounded-xl text-green-600 dark:text-green-400">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-bold">
                        {lang === 'zh' ? '该章节所有检查项均通过' : 'All checks in this category passed'}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {categoryIssues.map((issue, idx) => {
                        const issueScore = issue.score ?? 10
                        const isRetesting =
                          retestingItem?.categoryId === issue.category && retestingItem?.itemId === issue.itemId

                        let bgClass = 'bg-white dark:bg-[#2C2C2E] border-slate-100 dark:border-white/5'
                        let iconColor = 'text-slate-400'
                        let Icon = Info

                        if (issue.type === 'error') {
                          bgClass = 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                          iconColor = 'text-red-500'
                          Icon = AlertCircle
                        } else if (issue.type === 'warning') {
                          bgClass = 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30'
                          iconColor = 'text-amber-500'
                          Icon = AlertTriangle
                        } else if (issue.type === 'suggestion') {
                          bgClass = 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30'
                          iconColor = 'text-blue-500'
                          Icon = Sparkles
                        } else if (issue.type === 'pass') {
                          bgClass = 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30'
                          iconColor = 'text-green-500'
                          Icon = Check
                        }

                        return (
                          <div
                            key={`${issue.category || 'unknown'}-${issue.itemId || idx}-${idx}`}
                            className={`p-4 rounded-xl border transition-all hover:shadow-md ${bgClass} group/issue`}
                          >
                            <div className="flex gap-4">
                              <div className={`shrink-0 p-2 rounded-lg bg-white dark:bg-[#000000] shadow-sm ${iconColor}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1 gap-4">
                                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {issue.title}
                                  </h4>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className={`text-xs font-black font-mono ${getScoreColor(issueScore)}`}>
                                      {issueScore.toFixed(1)}
                                    </div>
                                    {issue.category && issue.itemId && issue.type !== 'pass' && (
                                      <button
                                        onClick={() => onRetestItem(issue.category!, issue.itemId!)}
                                        disabled={isRetesting || isGeneratingAI}
                                        className="p-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-[#0060FA] hover:text-white rounded-lg transition-all disabled:opacity-30"
                                        title={lang === 'zh' ? '重新检查该项' : 'Retest this item'}
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
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium mb-3">
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
                                          className="text-[9px] font-bold bg-slate-100 dark:bg-[#000000] hover:bg-[#0060FA] hover:text-white px-2 py-1 rounded-md text-slate-500 dark:text-slate-400 transition-all border border-transparent hover:border-[#0060FA]"
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
