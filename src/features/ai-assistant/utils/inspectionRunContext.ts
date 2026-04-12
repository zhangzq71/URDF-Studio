import type { RobotState } from '@/types'
import type { Language } from '@/shared/i18n'
import {
  buildInspectionEvidenceSummary,
  type InspectionEvidenceSummary,
} from '@/shared/utils/inspectionEvidenceSummary'
import { INSPECTION_CRITERIA } from './inspectionCriteria'

export interface InspectionEstimatedDuration {
  label: string
  maxSeconds: number
}

export interface InspectionRunCategorySummary {
  id: string
  name: string
  selectedCount: number
  totalCount: number
}

export interface InspectionRunContext {
  robotName: string
  sourceValue: string
  linkCount: number
  jointCount: number
  selectedCount: number
  selectedCategoryCount: number
  estimatedDuration: InspectionEstimatedDuration
  categorySummary: InspectionRunCategorySummary[]
  evidenceSummary: InspectionEvidenceSummary | null
}

export function estimateInspectionDuration(
  robot: RobotState,
  selectedCount: number,
): InspectionEstimatedDuration {
  let complexity = Object.keys(robot.links).length + Object.keys(robot.joints).length + selectedCount * 2

  if (robot.inspectionContext?.sourceFormat === 'mjcf') {
    complexity += 6
  }

  if (complexity <= 35) {
    return { label: '10-20s', maxSeconds: 20 }
  }
  if (complexity <= 65) {
    return { label: '20-40s', maxSeconds: 40 }
  }
  return { label: '30-60s', maxSeconds: 60 }
}

export function buildInspectionRunContext(
  robot: RobotState,
  selectedItems: Record<string, Set<string>>,
  lang: Language,
  normalizedModelLabel: string,
): InspectionRunContext {
  const categorySummary: InspectionRunCategorySummary[] = []
  let selectedCount = 0

  INSPECTION_CRITERIA.forEach((category) => {
    const itemIds = selectedItems[category.id] ?? new Set<string>()
    const count = itemIds.size

    if (count === 0) {
      return
    }

    selectedCount += count
    categorySummary.push({
      id: category.id,
      name: lang === 'zh' ? category.nameZh : category.name,
      selectedCount: count,
      totalCount: category.items.length,
    })
  })

  return {
    robotName: robot.name || '-',
    sourceValue: robot.inspectionContext?.sourceFormat?.toUpperCase() ?? normalizedModelLabel,
    linkCount: Object.keys(robot.links).length,
    jointCount: Object.keys(robot.joints).length,
    selectedCount,
    selectedCategoryCount: categorySummary.length,
    estimatedDuration: estimateInspectionDuration(robot, selectedCount),
    categorySummary,
    evidenceSummary: buildInspectionEvidenceSummary(robot.inspectionContext, lang),
  }
}
