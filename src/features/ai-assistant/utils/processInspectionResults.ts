import type { InspectionReport } from '@/types'
import { translations } from '@/shared/i18n'
import type { IssueType } from '../types'
import {
  INSPECTION_CRITERIA,
  calculateCategoryScore,
  calculateItemScore,
  calculateOverallScore,
  getInspectionItem
} from './inspectionCriteria'

interface ParsedInspectionResult {
  summary?: string
  issues?: unknown[]
}

const issueIncludesAny = (text: string, patterns: string[]) => patterns.some(pattern => text.includes(pattern))

const inferIssueCategory = (text: string) => {
  if (issueIncludesAny(text, ['mass', 'inertia', '质量', '惯性'])) {
    return 'physical'
  }

  if (issueIncludesAny(text, ['frame', 'origin', 'axis', 'joint', '坐标', '原点', '轴', '关节'])) {
    return 'kinematics'
  }

  if (issueIncludesAny(text, ['name', '命名', '名称'])) {
    return 'naming'
  }

  if (issueIncludesAny(text, ['symmetry', 'left', 'right', '对称', '左右'])) {
    return 'symmetry'
  }

  if (issueIncludesAny(text, ['motor', 'hardware', 'armature', 'torque', 'velocity', '电机', '硬件', '电枢', '力矩', '速度'])) {
    return 'hardware'
  }

  return undefined
}

const inferIssueItemId = (
  text: string,
  categoryId: string | undefined,
  selectedItems?: Record<string, string[]>
) => {
  if (!categoryId || !selectedItems?.[categoryId]?.length) {
    return undefined
  }

  const selectedItemIds = new Set(selectedItems[categoryId])

  if (
    categoryId === 'kinematics' &&
    selectedItemIds.has('frame_alignment') &&
    issueIncludesAny(text, ['frame', 'origin', 'coordinate', 'collinear', '坐标', '原点', '共线'])
  ) {
    return 'frame_alignment'
  }

  if (
    categoryId === 'hardware' &&
    selectedItemIds.has('armature_config') &&
    issueIncludesAny(text, ['armature', 'rotor inertia', 'equivalent inertia', '电枢', '转子', '惯量'])
  ) {
    return 'armature_config'
  }

  if (
    categoryId === 'hardware' &&
    selectedItemIds.has('motor_limits') &&
    issueIncludesAny(text, ['effort', 'velocity', 'torque', 'peak', 'rated', '限位', '力矩', '速度', '额定', '峰值'])
  ) {
    return 'motor_limits'
  }

  return undefined
}

export function processInspectionResults(
  rawResults: unknown,
  selectedItems?: Record<string, string[]>,
  lang: 'en' | 'zh' = 'en'
): InspectionReport {
  const t = translations[lang]
  const parsedResult = (rawResults || {}) as ParsedInspectionResult

  const issues = ((parsedResult.issues || []) as Record<string, unknown>[]).map(issue => {
    const issueText = `${String(issue.title || '').toLowerCase()} ${String(issue.description || '').toLowerCase()}`

    if (issue.score === undefined) {
      issue.score = calculateItemScore(issue.type as IssueType, true)
    }

    if (!issue.category) {
      issue.category = inferIssueCategory(issueText)
    }

    if (!issue.itemId) {
      issue.itemId = inferIssueItemId(issueText, issue.category as string | undefined, selectedItems)
    }

    return issue
  })

  const allIssues: typeof issues = [...issues]
  const reportedItems = new Set<string>()

  issues.forEach(issue => {
    if (issue.category && issue.itemId) {
      reportedItems.add(`${issue.category}:${issue.itemId}`)
    }
  })

  if (selectedItems) {
    Object.keys(selectedItems).forEach(categoryId => {
      const selectedItemIds = selectedItems[categoryId] || []
      selectedItemIds.forEach(itemId => {
        const key = `${categoryId}:${itemId}`
        if (!reportedItems.has(key)) {
          const item = getInspectionItem(categoryId, itemId)
          if (item) {
            const itemName = lang === 'zh' ? item.nameZh : item.name
            const itemDesc = lang === 'zh' ? item.descriptionZh : item.description
            allIssues.push({
              type: 'pass',
              title: t.inspectionPassTitle.replace('{itemName}', itemName),
              description: t.inspectionPassDescription.replace('{itemDesc}', itemDesc),
              category: categoryId,
              itemId,
              score: 10
            })
          }
        }
      })
    })
  }

  const categoryScores: Record<string, number[]> = {}
  INSPECTION_CRITERIA.forEach(category => {
    categoryScores[category.id] = []
  })

  allIssues.forEach(issue => {
    if (issue.category && issue.score !== undefined) {
      if (!categoryScores[issue.category as string]) {
        categoryScores[issue.category as string] = []
      }
      categoryScores[issue.category as string].push(issue.score as number)
    }
  })

  const categoryScoreMap: Record<string, number> = {}
  Object.keys(categoryScores).forEach(categoryId => {
    const scores = categoryScores[categoryId]
    if (scores.length > 0) {
      categoryScoreMap[categoryId] = calculateCategoryScore(scores)
    } else {
      categoryScoreMap[categoryId] = 10
    }
  })

  const allItemScores: number[] = []
  allIssues.forEach(issue => {
    if (issue.score !== undefined) {
      allItemScores.push(issue.score as number)
    }
  })

  const overallScore = calculateOverallScore(categoryScoreMap, allItemScores)
  const maxScore = allItemScores.length > 0 ? allItemScores.length * 10 : 100

  return {
    summary: parsedResult.summary || t.inspectionCompleted,
    issues: allIssues as unknown as InspectionReport['issues'],
    overallScore: Math.round(overallScore * 10) / 10,
    categoryScores: categoryScoreMap,
    maxScore
  }
}
