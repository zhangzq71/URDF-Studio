import { GENERATED_INSPECTION_CRITERIA } from './inspectionCriteria.generated'

export interface InspectionItem {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  scoringReference?: string
  scoringReferenceZh?: string
  maxScore: number
}

export interface InspectionCategory {
  id: string
  name: string
  nameZh: string
  weight: number
  items: InspectionItem[]
}

export type IssueType = 'error' | 'warning' | 'suggestion' | 'pass'

export const INSPECTION_CRITERIA: InspectionCategory[] = GENERATED_INSPECTION_CRITERIA

export function calculateItemScore(type: IssueType, hasIssue: boolean): number {
  if (!hasIssue) return 10

  switch (type) {
    case 'error':
      return Math.floor(Math.random() * 4)
    case 'warning':
      return 4 + Math.floor(Math.random() * 3)
    case 'suggestion':
      return 7 + Math.floor(Math.random() * 3)
    case 'pass':
      return 10
    default:
      return 5
  }
}

export function calculateCategoryScore(itemScores: number[]): number {
  if (itemScores.length === 0) return 0
  const sum = itemScores.reduce((a, b) => a + b, 0)
  return sum / itemScores.length
}

export function calculateOverallScore(
  categoryScores: Record<string, number>,
  itemScores?: number[]
): number {
  if (itemScores && itemScores.length > 0) {
    return itemScores.reduce((sum, score) => sum + score, 0)
  }

  let total = 0
  let totalWeight = 0

  INSPECTION_CRITERIA.forEach(category => {
    const score = categoryScores[category.id] || 0
    total += score * category.weight
    totalWeight += category.weight
  })

  return totalWeight > 0 ? total / totalWeight : 0
}

export function getInspectionItem(
  categoryId: string,
  itemId: string
): InspectionItem | undefined {
  const category = INSPECTION_CRITERIA.find(c => c.id === categoryId)
  return category?.items.find(item => item.id === itemId)
}

export function getInspectionCategory(
  categoryId: string
): InspectionCategory | undefined {
  return INSPECTION_CRITERIA.find(c => c.id === categoryId)
}
