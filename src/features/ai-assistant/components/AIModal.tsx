/**
 * AI Assistant Modal Component
 * Provides AI-powered robot inspection and generation interface
 */

import { useCallback, useState, useRef, useEffect } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Info,
  Loader2,
  MessageCircle,
  ScanSearch,
  Send,
  Sparkles
} from 'lucide-react'
import type { InspectionReport, MotorSpec, RobotState } from '@/types'
import type { Language } from '@/shared/i18n'
import { translations } from '@/shared/i18n'
import { DraggableWindow } from '@/shared/components'
import { useDraggableWindow } from '@/shared/hooks'
import { generateRobotFromPrompt, runRobotInspection } from '../services/aiService'
import { INSPECTION_CRITERIA } from '../utils/inspectionCriteria'
import { exportInspectionReportPdf } from '../utils/pdfExport'
import { getScoreBgColor } from '../utils/scoreHelpers'
import { InspectionProgress, type InspectionProgressState } from './InspectionProgress'
import { InspectionReportView } from './InspectionReport'
import { InspectionSidebar, type SelectedInspectionItems } from './InspectionSidebar'
import { ReportChatOverlay } from './ReportChatOverlay'

interface AIModalProps {
  isOpen: boolean
  onClose: () => void
  robot: RobotState
  motorLibrary: Record<string, MotorSpec[]>
  lang: Language
  onApplyChanges: (data: { name?: string; links?: any; joints?: any; rootLinkId?: string }) => void
  onSelectItem: (type: 'link' | 'joint', id: string) => void
}

interface AIModalAIResponse {
  explanation: string
  type: string
  data?: any
}

interface RetestingItemState {
  categoryId: string
  itemId: string
}

export function AIModal({
  isOpen,
  onClose,
  robot,
  motorLibrary,
  lang,
  onApplyChanges,
  onSelectItem
}: AIModalProps) {
  const t = translations[lang]
  const windowState = useDraggableWindow({
    isOpen,
    defaultSize: { width: 900, height: 650 },
    minSize: { width: 600, height: 400 },
    centerOnMount: true,
    enableMinimize: true
  })
  const { isMinimized, size, isResizing } = windowState

  const [aiPrompt, setAiPrompt] = useState('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiResponse, setAiResponse] = useState<AIModalAIResponse | null>(null)
  const [inspectionReport, setInspectionReport] = useState<InspectionReport | null>(null)
  const activeIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    return () => {
      activeIntervalsRef.current.forEach(clearInterval);
      activeIntervalsRef.current = [];
    };
  }, []);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(INSPECTION_CRITERIA.map(category => category.id))
  )

  const [selectedItems, setSelectedItems] = useState<SelectedInspectionItems>(() => {
    const initial: SelectedInspectionItems = {}
    INSPECTION_CRITERIA.forEach(category => {
      initial[category.id] = new Set(category.items.map(item => item.id))
    })
    return initial
  })

  const [inspectionProgress, setInspectionProgress] = useState<InspectionProgressState | null>(null)
  const [reportGenerationTimer, setReportGenerationTimer] = useState<number | null>(null)
  const [isReportChatOpen, setIsReportChatOpen] = useState(false)
  const [retestingItem, setRetestingItem] = useState<RetestingItemState | null>(null)

  const handleClose = useCallback(() => {
    setInspectionProgress(null)
    setReportGenerationTimer(null)
    onClose()
  }, [onClose])

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return

    setIsGeneratingAI(true)
    setAiResponse(null)
    setInspectionReport(null)

    try {
      const response = await generateRobotFromPrompt(aiPrompt, robot, motorLibrary, lang)
      if (response) {
        setAiResponse({
          explanation: response.explanation || t.aiNoValidResponse,
          type: response.actionType || 'advice',
          data: response.robotData
        })
      } else {
        setAiResponse({
          explanation: t.aiNoServiceResponseRetry,
          type: 'advice',
          data: undefined
        })
      }
    } catch (error: any) {
      console.error('AI Generation Error', error)
      setAiResponse({
        explanation: t.aiGenerationFailed.replace('{message}', error?.message || t.unknownError),
        type: 'advice',
        data: undefined
      })
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleRunInspection = async () => {
    setIsGeneratingAI(true)
    setAiResponse(null)
    setInspectionReport(null)
    setReportGenerationTimer(null)

    let totalItems = 0
    const selectedItemsList: Array<{
      categoryId: string
      itemId: string
      categoryName: string
      itemName: string
    }> = []

    Object.keys(selectedItems).forEach(categoryId => {
      const category = INSPECTION_CRITERIA.find(c => c.id === categoryId)
      if (!category) return
      const categoryName = lang === 'zh' ? category.nameZh : category.name
      const items = Array.from(selectedItems[categoryId])
      items.forEach(itemId => {
        const item = category.items.find(i => i.id === itemId)
        if (item) {
          const itemName = lang === 'zh' ? item.nameZh : item.name
          selectedItemsList.push({ categoryId, itemId, categoryName, itemName })
          totalItems++
        }
      })
    })

    const selectedItemsMap: Record<string, string[]> = {}
    Object.keys(selectedItems).forEach(categoryId => {
      const items = Array.from(selectedItems[categoryId])
      if (items.length > 0) {
        selectedItemsMap[categoryId] = items
      }
    })

    setInspectionProgress({ completed: 0, total: totalItems })

    try {
      let currentIndex = 0
      let reportReady = false
      let generatedReport: InspectionReport | null = null
      let timerInterval: ReturnType<typeof setInterval> | null = null
      let progressInterval: ReturnType<typeof setInterval> | null = null
      let checkReportInterval: ReturnType<typeof setInterval> | null = null

      const trackInterval = (id: ReturnType<typeof setInterval>) => {
        activeIntervalsRef.current.push(id);
        return id;
      };
      const untrackInterval = (id: ReturnType<typeof setInterval> | null) => {
        if (id) {
          clearInterval(id);
          activeIntervalsRef.current = activeIntervalsRef.current.filter(i => i !== id);
        }
      };

      const clearProgressInterval = () => {
        untrackInterval(progressInterval);
        progressInterval = null;
      }

      const clearTimerInterval = () => {
        untrackInterval(timerInterval);
        timerInterval = null;
      }

      const clearCheckReportInterval = () => {
        untrackInterval(checkReportInterval);
        checkReportInterval = null;
      }

      progressInterval = trackInterval(setInterval(() => {
        currentIndex++
        if (currentIndex <= totalItems) {
          const currentItem = selectedItemsList[currentIndex - 1]
          setInspectionProgress({
            currentCategory: currentItem?.categoryName,
            currentItem: currentItem?.itemName,
            completed: currentIndex,
            total: totalItems
          })
        } else {
          clearProgressInterval()

          setInspectionProgress({
            currentCategory: undefined,
            currentItem: undefined,
            completed: totalItems,
            total: totalItems
          })

          setReportGenerationTimer(1)
          let timerCount = 1

          const showReport = () => {
            clearTimerInterval()
            clearCheckReportInterval()
            setInspectionProgress(null)
            setReportGenerationTimer(null)
            if (generatedReport) {
              setInspectionReport(generatedReport)
            }
          }

          timerInterval = trackInterval(setInterval(() => {
            timerCount++
            setReportGenerationTimer(timerCount)

            if (timerCount >= 30) {
              clearTimerInterval()
              if (reportReady) {
                showReport()
              } else {
                setReportGenerationTimer(null)
                checkReportInterval = trackInterval(setInterval(() => {
                  if (reportReady) {
                    clearCheckReportInterval()
                    showReport()
                  }
                }, 100))
              }
            }
          }, 1000))

          runRobotInspection(robot, selectedItemsMap, lang)
            .then(report => {
              generatedReport = report
              reportReady = true
              if (timerCount < 30 && timerInterval) {
                clearTimerInterval()
                showReport()
              } else if (timerCount >= 30) {
                showReport()
              }
            })
            .catch(error => {
              console.error('Inspection Error', error)
              clearTimerInterval()
              clearCheckReportInterval()
              setInspectionProgress(null)
              setReportGenerationTimer(null)
            })
        }
      }, 300))
    } catch (error: any) {
      console.error('Inspection Error', error)
      setInspectionProgress(null)
      setReportGenerationTimer(null)
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleRetestItem = async (categoryId: string, itemId: string) => {
    setRetestingItem({ categoryId, itemId })
    try {
      const selectedItemsMap: Record<string, string[]> = {
        [categoryId]: [itemId]
      }

      const report = await runRobotInspection(robot, selectedItemsMap, lang)
      if (report && inspectionReport) {
        const updatedIssues = inspectionReport.issues.filter(
          issue => !(issue.category === categoryId && issue.itemId === itemId)
        )
        const newIssues = report.issues.filter(issue => issue.category === categoryId && issue.itemId === itemId)
        const allIssues = [...updatedIssues, ...newIssues]

        const categoryScores: Record<string, number> = { ...inspectionReport.categoryScores }
        const categoryIssues = allIssues.filter(issue => issue.category === categoryId)
        if (categoryIssues.length > 0) {
          const scores = categoryIssues.map(issue => issue.score ?? 10)
          categoryScores[categoryId] = scores.reduce((a, b) => a + b, 0) / scores.length
        }

        const allScores = allIssues.map(issue => issue.score ?? 10)
        const overallScore = allScores.reduce((a, b) => a + b, 0)

        setInspectionReport({
          ...inspectionReport,
          issues: allIssues,
          categoryScores,
          overallScore,
          maxScore: inspectionReport.maxScore || 100
        })
      }
    } catch (error) {
      console.error('Retest Error', error)
    } finally {
      setRetestingItem(null)
    }
  }

  const handleToggleReportCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
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
      lang
    })
  }

  const applyAIChanges = () => {
    if (aiResponse?.data) {
      const generated = aiResponse.data
      if (!generated.links || Object.keys(generated.links).length === 0) {
        alert(t.aiNoLinksGenerated)
        return
      }

      onApplyChanges({
        name: generated.name,
        links: generated.links,
        joints: generated.joints,
        rootLinkId: generated.rootLinkId
      })

      handleClose()
      setAiPrompt('')
      setAiResponse(null)
    } else {
      alert(t.aiNoDataToApply)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[90] pointer-events-none" />

      <DraggableWindow
        window={windowState}
        onClose={handleClose}
        title={
          <>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-panel-bg text-system-blue rounded-lg border border-border-black dark:bg-element-bg dark:text-system-blue">
                <ScanSearch className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-semibold text-text-primary">{t.aiTitle}</h1>
            </div>

            {inspectionReport && !isMinimized && (
              <div className="hidden md:flex ml-4 items-center gap-2 px-2 py-1 bg-panel-bg dark:bg-panel-bg border border-border-black rounded-lg shadow-sm">
                <div
                  className={`w-2 h-2 rounded-full ${getScoreBgColor(
                    inspectionReport.overallScore || 0,
                    inspectionReport.maxScore || 100
                  )}`}
                />
                <span className="text-[10px] font-medium tracking-wide text-text-secondary">
                  {t.overallScore}: {inspectionReport.overallScore?.toFixed(1)}
                </span>
              </div>
            )}
          </>
        }
        className="z-[100] bg-panel-bg dark:bg-panel-bg flex flex-col text-text-primary overflow-hidden rounded-2xl shadow-xl border border-border-black select-none"
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
          <div className="flex-1 flex overflow-hidden relative">
            <InspectionSidebar
              lang={lang}
              t={t}
              isGeneratingAI={isGeneratingAI}
              expandedCategories={expandedCategories}
              selectedItems={selectedItems}
              setExpandedCategories={setExpandedCategories}
              setSelectedItems={setSelectedItems}
              onRunInspection={handleRunInspection}
            />

            <div className="flex-1 overflow-y-auto bg-white dark:bg-panel-bg flex flex-col min-w-0">
              <div className="flex-1 p-6">
                {inspectionProgress ? (
                  <InspectionProgress
                    progress={inspectionProgress}
                    reportGenerationTimer={reportGenerationTimer}
                    lang={lang}
                    t={t}
                  />
                ) : !aiResponse && !inspectionReport ? (
                  <div className="h-full flex flex-col">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-system-blue/10 dark:bg-element-bg rounded-xl border border-system-blue/20 dark:border-border-black shadow-sm">
                        <div className="flex items-center gap-2 text-text-secondary dark:text-system-blue mb-2">
                          <Sparkles className="w-4 h-4" />
                          <h3 className="text-sm font-semibold">
                            {t.aiAnalysis}
                          </h3>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          "{t.aiIntro}"
                        </p>
                      </div>
                      <div className="p-4 bg-panel-bg dark:bg-element-bg rounded-xl border border-border-black shadow-sm">
                        <div className="flex items-center gap-2 text-text-secondary mb-2">
                          <Info className="w-4 h-4" />
                          <h3 className="text-sm font-semibold">
                            {t.examples}
                          </h3>
                        </div>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">{t.aiExamples}</p>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col bg-panel-bg dark:bg-panel-bg rounded-xl border border-border-black shadow-sm p-4">
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        className="flex-1 bg-transparent border-none p-0 text-text-primary text-sm focus:ring-0 focus:outline-none resize-none custom-scrollbar placeholder:text-text-tertiary"
                        placeholder={t.aiPlaceholder}
                      />
                      <div className="mt-4 flex justify-between items-center">
                        <span className="text-[10px] text-text-tertiary font-medium">
                          {t.sendOnEnterHint}
                        </span>
                        <button
                          onClick={handleGenerateAI}
                          disabled={isGeneratingAI || !aiPrompt.trim()}
                          className="h-8 px-4 bg-system-blue-solid hover:bg-system-blue-hover text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-30"
                        >
                          {isGeneratingAI ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          {t.send}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {inspectionReport && (
                      <div className="space-y-6 pb-20">
                        <InspectionReportView
                          report={inspectionReport}
                          robot={robot}
                          lang={lang}
                          t={t}
                          expandedCategories={expandedCategories}
                          retestingItem={retestingItem}
                          isGeneratingAI={isGeneratingAI}
                          onToggleCategory={handleToggleReportCategory}
                          onRetestItem={handleRetestItem}
                          onDownloadPDF={handleDownloadPDF}
                          onSelectItem={onSelectItem}
                        />

                        <div className="flex justify-center">
                          <button
                            onClick={() => setIsReportChatOpen(true)}
                            className="h-8 flex items-center gap-2 px-4 bg-panel-bg dark:bg-element-bg border border-border-black text-system-blue rounded-lg text-xs font-medium hover:bg-element-bg transition-colors shadow-sm"
                          >
                            <MessageCircle className="w-4 h-4" />
                            {t.discussReportWithAI}
                          </button>
                        </div>
                      </div>
                    )}

                    {aiResponse && (
                      <div className="space-y-6">
                        <div className="p-4 bg-system-blue/10 dark:bg-element-bg rounded-xl border border-system-blue/20 dark:border-border-black shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-3 bg-system-blue rounded-full" />
                            <span className="text-[10px] font-medium text-text-tertiary tracking-wide">{t.yourRequest}</span>
                          </div>
                          <p className="text-sm text-text-secondary">{aiPrompt}</p>
                        </div>

                        <div className="p-5 bg-panel-bg dark:bg-panel-bg rounded-xl border border-border-black shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-text-secondary dark:text-system-blue" />
                              <h3 className="text-sm font-semibold text-text-primary">
                                {t.aiResponse} <span className="text-text-tertiary font-normal ml-1">[{aiResponse.type}]</span>
                              </h3>
                            </div>
                            {aiResponse.data && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg text-[10px] font-medium border border-emerald-100 dark:border-emerald-800">
                                <Check className="w-3 h-3" />
                                {t.actionable}
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                            {aiResponse.explanation}
                          </p>
                        </div>

                        {aiResponse.data && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl flex gap-3 items-start shadow-sm">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg shrink-0">
                              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                {t.applyChangesHintTitle}
                              </p>
                              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                {t.actionWarning}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <ReportChatOverlay
              isOpen={isReportChatOpen}
              onClose={() => setIsReportChatOpen(false)}
              robot={robot}
              motorLibrary={motorLibrary}
              inspectionReport={inspectionReport}
              lang={lang}
              t={t}
            />
          </div>
        )}

        <div className="h-14 px-4 border-t border-border-black flex items-center justify-between shrink-0 bg-element-bg">
          <div className="flex items-center gap-2">
            {(aiResponse || inspectionReport) && !inspectionProgress && (
              <button
                onClick={() => {
                  setAiResponse(null)
                  setInspectionReport(null)
                  setAiPrompt('')
                  setInspectionProgress(null)
                  setReportGenerationTimer(null)
                }}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-element-hover rounded-lg transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                {t.back}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!(aiResponse || inspectionReport) ? (
              <>
                <button
                  onClick={handleClose}
                  className="h-8 px-4 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-element-hover rounded-lg transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleGenerateAI}
                  disabled={isGeneratingAI || !aiPrompt.trim()}
                  className="h-8 px-5 bg-system-blue-solid hover:bg-system-blue-hover text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-30"
                >
                  {isGeneratingAI ? t.thinking : t.send}
                </button>
              </>
            ) : aiResponse?.data ? (
              <button
                onClick={applyAIChanges}
                className="h-8 px-5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t.applyChanges}
              </button>
            ) : null}
          </div>
        </div>

        {isResizing && (
          <div className="absolute bottom-2 right-12 z-50 px-2 py-1 bg-system-blue-solid text-white text-[10px] rounded-lg font-medium shadow-sm">
            {size.width} × {size.height}
          </div>
        )}
      </DraggableWindow>
    </>
  )
}

export default AIModal
