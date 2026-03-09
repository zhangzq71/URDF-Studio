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
    <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-5">
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-2 border-border-black flex items-center justify-center bg-panel-bg shadow-sm">
          <Loader2 className="w-8 h-8 text-system-blue animate-spin" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-text-primary">{percentage}%</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-semibold text-text-primary">{t.runInspection}</h3>
        <div className="text-sm text-text-secondary leading-relaxed">
          {progress.currentCategory ? (
            <>
              {t.checking}: <span className="text-system-blue font-semibold">{progress.currentCategory}</span>
              <br />
              <span className="opacity-60">{progress.currentItem}</span>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-system-blue" />
                <span className="text-system-blue font-semibold">{t.generatingReport}</span>
              </div>
              <span className="text-xs text-text-tertiary mt-1 block">
                {t.inspectionMayTake30Seconds}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="w-full bg-element-bg rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            progress.currentCategory ? 'bg-slider-accent' : 'bg-slider-accent animate-pulse'
          }`}
          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
        />
      </div>

      {!progress.currentCategory && reportGenerationTimer && (
        <div className="w-full space-y-2 pt-2">
          <div className="flex justify-between text-[10px] text-text-tertiary font-medium">
            <span>{t.aiAnalyzing}</span>
            <span>{reportGenerationTimer}s</span>
          </div>
          <div className="w-full bg-element-bg rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-slider-accent transition-all duration-1000"
              style={{ width: `${Math.min((reportGenerationTimer / 30) * 100, 95)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default InspectionProgress
