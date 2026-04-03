import { Loader2, Sparkles } from 'lucide-react'
import type { Language, TranslationKeys } from '@/shared/i18n'
import type { RobotInspectionStage } from '../services/aiService'

export interface InspectionProgressState {
  stage: RobotInspectionStage
  selectedCount: number
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
  t
}: InspectionProgressProps) {
  const stageOrder: RobotInspectionStage[] = [
    'preparing-context',
    'requesting-model',
    'processing-response',
    'finalizing-report',
  ]
  const stageIndex = Math.max(stageOrder.indexOf(progress.stage), 0)
  const stageProgressByStage: Record<RobotInspectionStage, number> = {
    'preparing-context': 18,
    'requesting-model': 48,
    'processing-response': 78,
    'finalizing-report': 94,
  }
  const stageLabels: Record<RobotInspectionStage, string> = {
    'preparing-context': t.inspectionPreparingContext,
    'requesting-model': t.inspectionRequestingModel,
    'processing-response': t.inspectionProcessingResponse,
    'finalizing-report': t.inspectionFinalizingReport,
  }
  const percentage = stageProgressByStage[progress.stage]

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
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-system-blue" />
            <span className="text-system-blue font-semibold">{stageLabels[progress.stage]}</span>
          </div>
          <span className="text-xs text-text-tertiary mt-1 block">
            {t.inspectionSelectedChecks.replace('{count}', String(progress.selectedCount))}
          </span>
          <span className="text-xs text-text-tertiary mt-1 block">
            {t.inspectionMayTake30Seconds}
          </span>
        </div>
      </div>

      <div className="w-full bg-element-bg rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-slider-accent transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="grid w-full grid-cols-2 gap-2 text-left">
        {stageOrder.map((stage, index) => {
          const isCompleted = index < stageIndex
          const isActive = index === stageIndex

          return (
            <div
              key={stage}
              className={`rounded-lg border px-3 py-2 transition-colors ${
                isActive
                  ? 'border-system-blue/35 bg-system-blue/10'
                  : isCompleted
                    ? 'border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30'
                    : 'border-border-black bg-element-bg'
              }`}
            >
              <div className="text-[10px] font-semibold tracking-wide text-text-tertiary">
                {index + 1}
              </div>
              <div className={`mt-1 text-xs font-medium ${isActive ? 'text-system-blue' : 'text-text-secondary'}`}>
                {stageLabels[stage]}
              </div>
            </div>
          )
        })}
      </div>

      {reportGenerationTimer !== null && (
        <div className="w-full space-y-2 pt-2">
          <div className="flex justify-between text-[10px] text-text-tertiary font-medium">
            <span>{t.aiAnalyzing}</span>
            <span>{reportGenerationTimer}s</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default InspectionProgress
