import { Loader2, Sparkles } from 'lucide-react'
import type { Language, TranslationKeys } from '@/shared/i18n'

export interface InspectionProgressState {
  currentCategory?: string
  currentItem?: string
  completed: number
  total: number
}

interface InspectionProgressProps {
  progress: InspectionProgressState
  reportGenerationTimer: number | null
  lang: Language
  t: TranslationKeys
}

export function InspectionProgress({
  progress,
  reportGenerationTimer,
  lang,
  t
}: InspectionProgressProps) {
  const percentage = Math.round((progress.completed / progress.total) * 100)

  return (
    <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-6">
      <div className="relative">
        <div className="w-24 h-24 rounded-full border-4 border-slate-100 dark:border-border-black flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#0060FA] animate-spin" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold font-mono">{percentage}%</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t.runInspection}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {progress.currentCategory ? (
            <>
              {t.checking}: <span className="text-[#0060FA] font-bold">{progress.currentCategory}</span>
              <br />
              <span className="opacity-60">{progress.currentItem}</span>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0060FA]" />
                <span className="text-[#0060FA] font-semibold">{t.generatingReport}</span>
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                {lang === 'zh' ? '这可能需要 30 秒...' : 'This may take up to 30 seconds...'}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="w-full bg-slate-100 dark:bg-black rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            progress.currentCategory ? 'bg-[#0060FA]' : 'bg-[#0060FA] animate-pulse'
          }`}
          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
        />
      </div>

      {!progress.currentCategory && reportGenerationTimer && (
        <div className="w-full space-y-2 pt-2">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{lang === 'zh' ? 'AI 分析中' : 'AI Analyzing'}</span>
            <span>{reportGenerationTimer}s</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-black rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-1000"
              style={{ width: `${Math.min((reportGenerationTimer / 30) * 100, 95)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default InspectionProgress
