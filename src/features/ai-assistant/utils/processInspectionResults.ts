import type { InspectionReport } from '@/types'
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

export function processInspectionResults(
  rawResults: unknown,
  selectedItems?: Record<string, string[]>,
  lang: 'en' | 'zh' = 'en'
): InspectionReport {
  const parsedResult = (rawResults || {}) as ParsedInspectionResult

  const issues = ((parsedResult.issues || []) as Record<string, unknown>[]).map(issue => {
    if (issue.score === undefined) {
      issue.score = calculateItemScore(issue.type as IssueType, true)
    }

    if (!issue.category) {
      const title = (issue.title as string)?.toLowerCase() || ''
      if (title.includes('mass') || title.includes('inertia')) {
        issue.category = 'physical'
      } else if (title.includes('axis') || title.includes('joint')) {
        issue.category = 'kinematics'
      } else if (title.includes('name')) {
        issue.category = 'naming'
      } else if (title.includes('symmetry') || title.includes('left') || title.includes('right')) {
        issue.category = 'symmetry'
      } else if (title.includes('motor') || title.includes('hardware')) {
        issue.category = 'hardware'
      }
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
              title: lang === 'zh' ? `${itemName} - 通过` : `${itemName} - Passed`,
              description:
                lang === 'zh'
                  ? `该检查项已通过：${itemDesc}`
                  : `This check item passed: ${itemDesc}`,
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
    summary: parsedResult.summary || 'Inspection completed.',
    issues: allIssues as unknown as InspectionReport['issues'],
    overallScore: Math.round(overallScore * 10) / 10,
    categoryScores: categoryScoreMap,
    maxScore
  }
}
