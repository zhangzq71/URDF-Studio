/**
 * AI Assistant Modal Component
 * Provides AI-powered robot inspection and generation interface
 */

import { useCallback, useState } from 'react'
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
      const response = await generateRobotFromPrompt(aiPrompt, robot, motorLibrary)
      if (response) {
        setAiResponse({
          explanation: response.explanation || 'No valid response received',
          type: response.actionType || 'advice',
          data: response.robotData
        })
      } else {
        setAiResponse({
          explanation: 'AI service did not return a response, please try again.',
          type: 'advice',
          data: undefined
        })
      }
    } catch (error: any) {
      console.error('AI Generation Error', error)
      setAiResponse({
        explanation: `Generation failed: ${error?.message || 'Unknown error'}`,
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
      let timerInterval: NodeJS.Timeout | null = null

      const progressInterval = setInterval(() => {
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
          clearInterval(progressInterval)

          setInspectionProgress({
            currentCategory: undefined,
            currentItem: undefined,
            completed: totalItems,
            total: totalItems
          })

          setReportGenerationTimer(1)
          let timerCount = 1

          const showReport = () => {
            if (timerInterval) {
              clearInterval(timerInterval)
              timerInterval = null
            }
            setInspectionProgress(null)
            setReportGenerationTimer(null)
            if (generatedReport) {
              setInspectionReport(generatedReport)
            }
          }

          timerInterval = setInterval(() => {
            timerCount++
            setReportGenerationTimer(timerCount)

            if (timerCount >= 30) {
              clearInterval(timerInterval!)
              timerInterval = null
              if (reportReady) {
                showReport()
              } else {
                setReportGenerationTimer(null)
                const checkReport = setInterval(() => {
                  if (reportReady) {
                    clearInterval(checkReport)
                    showReport()
                  }
                }, 100)
              }
            }
          }, 1000)

          runRobotInspection(robot, selectedItemsMap, lang)
            .then(report => {
              generatedReport = report
              reportReady = true
              if (timerCount < 30 && timerInterval) {
                clearInterval(timerInterval)
                timerInterval = null
                showReport()
              } else if (timerCount >= 30) {
                showReport()
              }
            })
            .catch(error => {
              console.error('Inspection Error', error)
              if (timerInterval) {
                clearInterval(timerInterval)
              }
              setInspectionProgress(null)
              setReportGenerationTimer(null)
            })
        }
      }, 300)
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
        alert(lang === 'zh' ? '生成的机器人数据中没有链接，无法应用更改。' : 'No links in generated data, cannot apply changes.')
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
      alert(lang === 'zh' ? '没有可应用的数据。' : 'No data to apply.')
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
              <div className="p-1.5 bg-[#0060FA] rounded-lg text-white shadow-lg shadow-black/20">
                <ScanSearch className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-bold tracking-tight">{t.aiTitle}</h1>
            </div>

            {inspectionReport && !isMinimized && (
              <div className="hidden md:flex ml-4 items-center gap-2 px-2 py-1 bg-white dark:bg-element-bg/50 border border-slate-200 dark:border-element-hover rounded-lg">
                <div
                  className={`w-2 h-2 rounded-full ${getScoreBgColor(
                    inspectionReport.overallScore || 0,
                    inspectionReport.maxScore || 100
                  )} animation-pulse`}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.overallScore}: {inspectionReport.overallScore?.toFixed(1)}
                </span>
              </div>
            )}
          </>
        }
        className="z-[100] bg-white dark:bg-[#1C1C1E] flex flex-col text-slate-900 dark:text-slate-100 overflow-hidden rounded-xl shadow-2xl dark:shadow-black border border-slate-200 dark:border-white/10 select-none"
        headerClassName="h-12 border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-4 bg-slate-50 dark:bg-[#1C1C1E] shrink-0"
        interactionClassName="select-none"
        headerDraggableClassName="cursor-grab"
        headerDraggingClassName="!cursor-grabbing"
        minimizeTitle={t.minimize}
        maximizeTitle={t.maximize}
        restoreTitle={t.restore}
        closeTitle={t.close}
        controlButtonClassName="p-1.5 hover:bg-slate-200 dark:hover:bg-element-hover rounded-md transition-colors"
        closeButtonClassName="p-1.5 text-slate-500 hover:bg-red-500 hover:text-white dark:text-slate-400 dark:hover:bg-red-600 dark:hover:text-white rounded transition-colors"
        rightResizeHandleClassName="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[#0060FA]/20 active:bg-[#0060FA]/30 transition-colors z-20"
        bottomResizeHandleClassName="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[#0060FA]/20 active:bg-[#0060FA]/30 transition-colors z-20"
        cornerResizeHandleClassName="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize hover:bg-[#0060FA]/30 active:bg-[#0060FA]/40 transition-colors z-30 flex items-center justify-center"
        cornerResizeHandle={<div className="w-2 h-2 border-r-2 border-b-2 border-slate-400" />}
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

            <div className="flex-1 overflow-y-auto bg-white dark:bg-app-bg flex flex-col min-w-0">
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
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-white/10">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                          <Sparkles className="w-4 h-4" />
                          <h3 className="text-sm font-bold uppercase tracking-tight">
                            {lang === 'zh' ? '智能分析' : 'AI Analysis'}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                          "{t.aiIntro}"
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-element-active/50 rounded-xl border border-slate-100 dark:border-white/10">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-2">
                          <Info className="w-4 h-4" />
                          <h3 className="text-sm font-bold uppercase tracking-tight">
                            {lang === 'zh' ? '常用示例' : 'Examples'}
                          </h3>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{t.aiExamples}</p>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col bg-white dark:bg-black rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4">
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        className="flex-1 bg-transparent border-none p-0 text-slate-900 dark:text-slate-200 text-sm focus:ring-0 focus:outline-none resize-none custom-scrollbar placeholder:text-slate-400"
                        placeholder={t.aiPlaceholder}
                      />
                      <div className="mt-4 flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {lang === 'zh' ? '按 Enter 发送，Shift+Enter 换行' : 'Press Enter to send, Shift+Enter for newline'}
                        </span>
                        <button
                          onClick={handleGenerateAI}
                          disabled={isGeneratingAI || !aiPrompt.trim()}
                          className="px-4 py-1.5 bg-black dark:bg-white dark:text-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg dark:shadow-black active:scale-95 disabled:opacity-30 disabled:active:scale-100"
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
                            className="flex items-center gap-2 px-6 py-2 bg-[#0060FA] hover:bg-blue-600 text-white rounded-full text-xs font-bold transition-all shadow-lg shadow-black/20 hover:scale-105 active:scale-95"
                          >
                            <MessageCircle className="w-4 h-4" />
                            {lang === 'zh' ? '针对报告进行对话' : 'Discuss Report with AI'}
                          </button>
                        </div>
                      </div>
                    )}

                    {aiResponse && (
                      <div className="space-y-6">
                        <div className="p-4 bg-slate-50 dark:bg-[#1C1C1E] rounded-xl border border-slate-200 dark:border-white/10">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-3 bg-[#0060FA] rounded-full" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.yourRequest}</span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium italic">{aiPrompt}</p>
                        </div>

                        <div className="p-5 bg-white dark:bg-[#1C1C1E] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl shadow-slate-200/50 dark:shadow-black/50 relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#0060FA] to-blue-400" />
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-[#0060FA]" />
                              <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight">
                                {t.aiResponse} <span className="text-blue-400 font-normal ml-1">[{aiResponse.type}]</span>
                              </h3>
                            </div>
                            {aiResponse.data && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-md text-[10px] font-bold">
                                <Check className="w-3 h-3" />
                                {lang === 'zh' ? '建议可应用' : 'Actionable'}
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {aiResponse.explanation}
                          </p>
                        </div>

                        {aiResponse.data && (
                          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl flex gap-3 items-start">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
                                {lang === 'zh' ? '应用更改提示' : 'Apply Changes'}
                              </p>
                              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
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

        <div className="h-14 px-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#1C1C1E]">
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-element-hover rounded-lg transition-colors"
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
                  className="px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleGenerateAI}
                  disabled={isGeneratingAI || !aiPrompt.trim()}
                  className="px-6 py-1.5 bg-black dark:bg-white dark:text-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-lg dark:shadow-black hover:opacity-90 active:scale-95 disabled:opacity-30"
                >
                  {isGeneratingAI ? t.thinking : t.send}
                </button>
              </>
            ) : aiResponse?.data ? (
              <button
                onClick={applyAIChanges}
                className="px-6 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-green-500/20 active:scale-95 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t.applyChanges}
              </button>
            ) : null}
          </div>
        </div>

        {isResizing && (
          <div className="absolute bottom-2 right-12 z-50 px-2 py-1 bg-[#0060FA] text-white text-[10px] rounded font-mono shadow-lg">
            {size.width} × {size.height}
          </div>
        )}
      </DraggableWindow>
    </>
  )
}

export default AIModal
