import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, MessageCircle, ScanSearch } from 'lucide-react'
import type { InspectionReport, RobotState } from '@/types'
import type { Language } from '@/shared/i18n'
import { translations } from '@/shared/i18n'
import { DraggableWindow } from '@/shared/components'
import { useDraggableWindow } from '@/shared/hooks'
import { runRobotInspection } from '../services/aiService'
import { calculateOverallScore, INSPECTION_CRITERIA } from '../utils/inspectionCriteria'
import { exportInspectionReportPdf } from '../utils/pdfExport'
import { getScoreBgColor } from '../utils/scoreHelpers'
import { InspectionProgress, type InspectionProgressState } from './InspectionProgress'
import { InspectionReportView } from './InspectionReport'
import { InspectionSidebar, type SelectedInspectionItems } from './InspectionSidebar'
import { InspectionSetupView } from './InspectionSetupView'

interface AIInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  robot: RobotState
  lang: Language
  onSelectItem: (type: 'link' | 'joint', id: string) => void
  onOpenConversationWithReport: (
    report: InspectionReport,
    robotSnapshot: RobotState,
    options?: {
      selectedEntity?: { type: 'link' | 'joint'; id: string } | null
      focusedIssue?: InspectionReport['issues'][number] | null
    },
  ) => void
}

interface RetestingItemState {
  categoryId: string
  itemId: string
}

function createInitialSelectedItems(): SelectedInspectionItems {
  const initial: SelectedInspectionItems = {}
  INSPECTION_CRITERIA.forEach((category) => {
    initial[category.id] = new Set(category.items.map((item) => item.id))
  })
  return initial
}

function recalculateReportMetrics(
  issues: InspectionReport['issues'],
  fallbackMaxScore: number | undefined,
): Pick<InspectionReport, 'overallScore' | 'categoryScores' | 'maxScore'> {
  const categoryScoreBuckets: Record<string, number[]> = {}
  INSPECTION_CRITERIA.forEach((category) => {
    categoryScoreBuckets[category.id] = []
  })

  issues.forEach((issue) => {
    if (!issue.category || issue.score === undefined) {
      return
    }
    if (!categoryScoreBuckets[issue.category]) {
      categoryScoreBuckets[issue.category] = []
    }
    categoryScoreBuckets[issue.category].push(issue.score)
  })

  const categoryScores: Record<string, number> = {}
  Object.entries(categoryScoreBuckets).forEach(([categoryId, scores]) => {
    categoryScores[categoryId] = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 10
  })

  const allItemScores = issues
    .map((issue) => issue.score)
    .filter((score): score is number => score !== undefined)

  const overallScore = calculateOverallScore(categoryScores, allItemScores)

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    categoryScores,
    maxScore: allItemScores.length > 0 ? allItemScores.length * 10 : fallbackMaxScore ?? 100,
  }
}

function resolveIssueSelection(
  robot: RobotState,
  issue: InspectionReport['issues'][number],
): { type: 'link' | 'joint'; id: string } | null {
  for (const id of issue.relatedIds || []) {
    if (robot.links[id]) {
      return { type: 'link', id }
    }
    if (robot.joints[id]) {
      return { type: 'joint', id }
    }
  }

  return null
}

export function AIInspectionModal({
  isOpen,
  onClose,
  robot,
  lang,
  onSelectItem,
  onOpenConversationWithReport,
}: AIInspectionModalProps) {
  const t = translations[lang]
  const windowState = useDraggableWindow({
    isOpen,
    defaultSize: { width: 1080, height: 720 },
    minSize: { width: 760, height: 520 },
    centerOnMount: true,
    enableMinimize: true,
  })
  const { isMinimized, size, isResizing } = windowState

  const [inspectionReport, setInspectionReport] = useState<InspectionReport | null>(null)
  const [isInspecting, setIsInspecting] = useState(false)
  const [inspectionProgress, setInspectionProgress] = useState<InspectionProgressState | null>(null)
  const [reportGenerationTimer, setReportGenerationTimer] = useState<number | null>(null)
  const [retestingItem, setRetestingItem] = useState<RetestingItemState | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(INSPECTION_CRITERIA.map((category) => category.id)),
  )
  const [selectedItems, setSelectedItems] = useState<SelectedInspectionItems>(() => createInitialSelectedItems())
  const [focusedCategoryId, setFocusedCategoryId] = useState<string>(INSPECTION_CRITERIA[0]?.id ?? '')

  const activeIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([])
  const isMountedRef = useRef(false)
  const inspectionRunIdRef = useRef(0)
  const retestRequestIdRef = useRef(0)

  let totalSelectedCount = 0
  let selectedCategoryCount = 0
  let selectedWeight = 0

  INSPECTION_CRITERIA.forEach((category) => {
    const count = selectedItems[category.id]?.size ?? 0
    totalSelectedCount += count
    if (count > 0) {
      selectedCategoryCount += 1
      selectedWeight += category.weight
    }
  })

  const selectedWeightPercentage = Math.round(selectedWeight * 100)

  const clearActiveTimers = useCallback(() => {
    activeIntervalsRef.current.forEach(clearInterval)
    activeIntervalsRef.current = []
  }, [])

  const resetTransientInspectionState = useCallback(() => {
    clearActiveTimers()
    setInspectionProgress(null)
    setReportGenerationTimer(null)
    setInspectionReport(null)
    setRetestingItem(null)
    setIsInspecting(false)
  }, [clearActiveTimers])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      inspectionRunIdRef.current += 1
      retestRequestIdRef.current += 1
      clearActiveTimers()
    }
  }, [clearActiveTimers])

  const handleClose = useCallback(() => {
    inspectionRunIdRef.current += 1
    retestRequestIdRef.current += 1
    resetTransientInspectionState()
    onClose()
  }, [onClose, resetTransientInspectionState])

  const handleRunInspection = async () => {
    if (isInspecting) {
      return
    }

    inspectionRunIdRef.current += 1
    const runId = inspectionRunIdRef.current
    const isRunActive = () => isMountedRef.current && inspectionRunIdRef.current === runId

    clearActiveTimers()
    setIsInspecting(true)
    setInspectionReport(null)
    setRetestingItem(null)

    let totalItems = 0
    Object.keys(selectedItems).forEach((categoryId) => {
      totalItems += selectedItems[categoryId]?.size || 0
    })

    const selectedItemsMap: Record<string, string[]> = {}
    Object.keys(selectedItems).forEach((categoryId) => {
      const itemIds = Array.from(selectedItems[categoryId])
      if (itemIds.length > 0) {
        selectedItemsMap[categoryId] = itemIds
      }
    })

    if (totalItems === 0) {
      setInspectionProgress(null)
      setReportGenerationTimer(null)
      setIsInspecting(false)
      return
    }

    setInspectionProgress({
      stage: 'preparing-context',
      selectedCount: totalItems,
    })
    setReportGenerationTimer(0)

    try {
      const timerInterval = setInterval(() => {
        if (!isRunActive()) {
          clearActiveTimers()
          return
        }

        setReportGenerationTimer((current) => (current ?? 0) + 1)
      }, 1000)
      activeIntervalsRef.current.push(timerInterval)

      const report = await runRobotInspection(robot, selectedItemsMap, lang, {
        onStageChange: (stage) => {
          if (!isRunActive()) {
            return
          }

          setInspectionProgress({
            stage,
            selectedCount: totalItems,
          })
        },
      })

      if (!isRunActive()) {
        return
      }

      setInspectionReport(report)
    } catch (error) {
      console.error('Inspection Error', error)
    } finally {
      if (isRunActive()) {
        clearActiveTimers()
        setInspectionProgress(null)
        setReportGenerationTimer(null)
        setIsInspecting(false)
      }
    }
  }

  const handleRetestItem = async (categoryId: string, itemId: string) => {
    const requestId = retestRequestIdRef.current + 1
    retestRequestIdRef.current = requestId
    const isRequestActive = () => isMountedRef.current && retestRequestIdRef.current === requestId

    setRetestingItem({ categoryId, itemId })

    try {
      const selectedItemsMap: Record<string, string[]> = {
        [categoryId]: [itemId],
      }
      const report = await runRobotInspection(robot, selectedItemsMap, lang)
      if (!isRequestActive() || !report || !inspectionReport) {
        return
      }

      const updatedIssues = inspectionReport.issues.filter(
        (issue) => !(issue.category === categoryId && issue.itemId === itemId),
      )
      const nextIssues = report.issues.filter(
        (issue) => issue.category === categoryId && issue.itemId === itemId,
      )
      const mergedIssues = [...updatedIssues, ...nextIssues] as InspectionReport['issues']
      const nextMetrics = recalculateReportMetrics(mergedIssues, inspectionReport.maxScore)

      setInspectionReport({
        ...inspectionReport,
        issues: mergedIssues,
        ...nextMetrics,
      })
    } catch (error) {
      if (!isRequestActive()) {
        return
      }
      console.error('Retest Error', error)
    } finally {
      if (isRequestActive()) {
        setRetestingItem(null)
      }
    }
  }

  const handleToggleReportCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleDownloadPDF = () => {
    exportInspectionReportPdf({
      inspectionReport,
      robotName: robot.name,
      lang,
      inspectionContext: robot.inspectionContext,
    })
  }

  const handleAskAboutIssue = useCallback((issue: InspectionReport['issues'][number]) => {
    if (!inspectionReport) {
      return
    }

    onOpenConversationWithReport(inspectionReport, robot, {
      focusedIssue: issue,
      selectedEntity: resolveIssueSelection(robot, issue),
    })
  }, [inspectionReport, onOpenConversationWithReport, robot])

  if (!isOpen) {
    return null
  }

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-[90] bg-transparent" />

      <DraggableWindow
        window={windowState}
        onClose={handleClose}
        title={(
          <>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-border-black bg-panel-bg p-1.5 text-system-blue dark:bg-element-bg dark:text-system-blue">
                <ScanSearch className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-semibold text-text-primary">{t.aiInspection}</h1>
            </div>

            {inspectionReport && !isMinimized && (
              <div className="ml-4 hidden items-center gap-2 rounded-lg border border-border-black bg-panel-bg px-2 py-1 shadow-sm dark:bg-panel-bg md:flex">
                <div
                  className={`w-2 h-2 rounded-full ${getScoreBgColor(
                    inspectionReport.overallScore || 0,
                    inspectionReport.maxScore || 100,
                  )}`}
                />
                <span className="text-[10px] font-medium tracking-wide text-text-secondary">
                  {t.overallScore}: {inspectionReport.overallScore?.toFixed(1)}
                </span>
              </div>
            )}
          </>
        )}
        className="z-[100] flex flex-col overflow-hidden rounded-2xl border border-border-black bg-panel-bg text-text-primary shadow-xl select-none dark:bg-panel-bg"
        headerClassName="h-12 border-b border-border-black flex items-center justify-between px-4 bg-element-bg shrink-0"
        interactionClassName="select-none"
        headerDraggableClassName="cursor-grab"
        headerDraggingClassName="!cursor-grabbing"
        minimizeTitle={t.minimize}
        maximizeTitle={t.maximize}
        restoreTitle={t.restore}
        closeTitle={t.close}
        controlButtonClassName="p-1.5 hover:bg-element-hover rounded-md transition-colors"
        closeButtonClassName="p-1.5 text-text-tertiary hover:bg-red-500 hover:text-white rounded-md transition-colors"
        rightResizeHandleClassName="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-system-blue/15 active:bg-system-blue/25 transition-colors z-20"
        bottomResizeHandleClassName="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-system-blue/15 active:bg-system-blue/25 transition-colors z-20"
        cornerResizeHandleClassName="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize hover:bg-system-blue/20 active:bg-system-blue/30 transition-colors z-30 flex items-center justify-center"
        cornerResizeHandle={<div className="w-2 h-2 border-r-2 border-b-2 border-border-strong" />}
      >
        {!isMinimized && (
          <div className="relative flex flex-1 overflow-hidden">
            <InspectionSidebar
              lang={lang}
              t={t}
              isGeneratingAI={isInspecting}
              focusedCategoryId={focusedCategoryId}
              expandedCategories={expandedCategories}
              selectedItems={selectedItems}
              setExpandedCategories={setExpandedCategories}
              setSelectedItems={setSelectedItems}
              onFocusCategory={setFocusedCategoryId}
            />

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-app-bg dark:bg-panel-bg">
              <div className="flex-1 p-6">
                {inspectionProgress ? (
                  <InspectionProgress
                    progress={inspectionProgress}
                    reportGenerationTimer={reportGenerationTimer}
                    lang={lang}
                    t={t}
                  />
                ) : inspectionReport ? (
                  <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div className="space-y-6 pb-20">
                      <InspectionReportView
                        report={inspectionReport}
                        robot={robot}
                        lang={lang}
                        t={t}
                        expandedCategories={expandedCategories}
                        retestingItem={retestingItem}
                        isGeneratingAI={isInspecting}
                        onToggleCategory={handleToggleReportCategory}
                        onRetestItem={handleRetestItem}
                        onDownloadPDF={handleDownloadPDF}
                        onSelectItem={onSelectItem}
                        onAskAboutIssue={handleAskAboutIssue}
                      />

                      <div className="flex justify-center">
                        <button
                          onClick={() => onOpenConversationWithReport(inspectionReport, robot)}
                          className="h-8 rounded-lg border border-border-black bg-panel-bg px-4 text-xs font-medium text-system-blue shadow-sm transition-colors hover:bg-element-bg dark:bg-element-bg"
                        >
                          <span className="flex items-center gap-2">
                            <MessageCircle className="w-4 h-4" />
                            {t.discussReportWithAI}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <InspectionSetupView
                    robot={robot}
                    lang={lang}
                    t={t}
                    selectedItems={selectedItems}
                    focusedCategoryId={focusedCategoryId}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex h-14 items-center justify-between border-t border-border-black bg-element-bg px-4 shrink-0">
          <div className="flex items-center gap-2">
            {inspectionReport && !inspectionProgress && (
              <button
                onClick={() => {
                  inspectionRunIdRef.current += 1
                  resetTransientInspectionState()
                }}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary"
              >
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                {t.back}
              </button>
            )}
            {!inspectionReport && !inspectionProgress && (
              <div className="rounded-lg border border-border-black bg-panel-bg px-3 py-1.5 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  {t.inspectionRunSummary}
                </div>
                <div className="mt-0.5 text-xs font-medium text-text-secondary">
                  {t.inspectionSelectedChecks.replace('{count}', String(totalSelectedCount))}
                  {' · '}
                  {t.inspectionSelectedCategories}: {selectedCategoryCount}
                  {' · '}
                  {t.inspectionWeightedCoverage}: {selectedWeightPercentage}%
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!inspectionReport && !inspectionProgress && (
              <>
                <button
                  onClick={handleClose}
                  className="h-8 rounded-lg px-4 text-xs font-medium text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleRunInspection}
                  disabled={isInspecting || totalSelectedCount === 0}
                  className="h-8 rounded-lg bg-system-blue-solid px-5 text-xs font-semibold text-white transition-colors hover:bg-system-blue-hover disabled:opacity-30"
                  title={totalSelectedCount === 0 ? t.inspectionNoChecksSelected : undefined}
                >
                  {isInspecting ? t.thinking : t.runInspection}
                </button>
              </>
            )}
          </div>
        </div>

        {isResizing && (
          <div className="absolute bottom-2 right-12 z-50 rounded-lg bg-system-blue-solid px-2 py-1 text-[10px] font-medium text-white shadow-sm">
            {size.width} × {size.height}
          </div>
        )}
      </DraggableWindow>
    </>
  )
}

export default AIInspectionModal
