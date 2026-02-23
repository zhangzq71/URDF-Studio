import { Loader2, MessageCircle, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { InspectionReport, MotorSpec, RobotState } from '@/types'
import type { Language, TranslationKeys } from '@/shared/i18n'
import { generateRobotFromPrompt } from '../services/aiService'

interface ReportChatOverlayProps {
  isOpen: boolean
  onClose: () => void
  robot: RobotState
  motorLibrary: Record<string, MotorSpec[]>
  inspectionReport: InspectionReport | null
  lang: Language
  t: TranslationKeys
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function ReportChatOverlay({
  isOpen,
  onClose,
  robot,
  motorLibrary,
  inspectionReport,
  lang,
  t
}: ReportChatOverlayProps) {
  const [reportChatMessages, setReportChatMessages] = useState<ChatMessage[]>([])
  const [reportChatInput, setReportChatInput] = useState('')
  const [isChatGenerating, setIsChatGenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setReportChatMessages([])
      setReportChatInput('')
      setIsChatGenerating(false)
    }
  }, [isOpen])

  const handleReportChatSend = async () => {
    if (!reportChatInput.trim() || isChatGenerating || !inspectionReport) return

    const userMessage = reportChatInput.trim()
    setReportChatInput('')
    setReportChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsChatGenerating(true)

    try {
      const contextPrompt =
        lang === 'zh'
          ? `当前机器人结构：\n${JSON.stringify(robot, null, 2)}\n\n检测报告摘要：\n${inspectionReport.summary}\n\n检测报告中的问题列表：\n${inspectionReport.issues.map(i => `- ${i.title} (${i.type}): ${i.description}`).join('\n')}\n\n用户问题：${userMessage}`
          : `Current robot structure:\n${JSON.stringify(robot, null, 2)}\n\nInspection report summary:\n${inspectionReport.summary}\n\nIssues:\n${inspectionReport.issues.map(i => `- ${i.title} (${i.type}): ${i.description}`).join('\n')}\n\nUser question: ${userMessage}`

      const response = await generateRobotFromPrompt(contextPrompt, robot, motorLibrary)
      const assistantMessage =
        response?.explanation || (lang === 'zh' ? '抱歉，无法生成回复。' : 'Sorry, unable to generate response.')
      setReportChatMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }])
    } catch (error) {
      console.error('Chat Error', error)
      setReportChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: lang === 'zh' ? '发送消息时出错，请重试。' : 'Error sending message, please try again.'
        }
      ])
    } finally {
      setIsChatGenerating(false)
    }
  }

  if (!isOpen || !inspectionReport) {
    return null
  }

  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-app-bg/95 z-40 flex flex-col animate-in slide-in-from-right-4 duration-300">
      <div className="h-12 px-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-[#1C1C1E] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold">{t.chatTitle}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 dark:hover:bg-element-hover rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {reportChatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 px-10 text-center">
            <div className="p-4 bg-slate-100 dark:bg-black rounded-full">
              <MessageCircle className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-xs italic leading-relaxed">{t.askAboutReport}</p>
          </div>
        ) : (
          reportChatMessages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm text-sm ${
                  message.role === 'user'
                    ? 'bg-[#0060FA] text-white rounded-tr-none'
                    : 'bg-slate-100 dark:bg-element-active text-slate-700 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-border-black'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))
        )}

        {isChatGenerating && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-element-active rounded-2xl rounded-tl-none border border-slate-200 dark:border-border-black px-4 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-[#0060FA]" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E]">
        <div className="relative group">
          <input
            type="text"
            value={reportChatInput}
            onChange={e => setReportChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleReportChatSend()
              }
            }}
            placeholder={t.chatPlaceholder}
            className="w-full bg-slate-100 dark:bg-black border border-slate-200 dark:border-element-hover rounded-xl py-3 pl-4 pr-12 text-xs focus:ring-2 focus:ring-[#0060FA] transition-all"
          />
          <button
            onClick={handleReportChatSend}
            disabled={isChatGenerating || !reportChatInput.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#0060FA] text-white rounded-lg shadow-md hover:opacity-90 active:scale-90 transition-all disabled:opacity-30 disabled:scale-100"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReportChatOverlay
