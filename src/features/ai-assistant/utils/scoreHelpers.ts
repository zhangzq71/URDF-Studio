/**
 * Score display helpers for inspection report UI
 */

export function getScoreColor(score: number, maxScoreForItem: number = 10): string {
  const normalizedScore = (score / maxScoreForItem) * 10
  if (normalizedScore >= 9) return 'text-green-600 dark:text-green-400'
  if (normalizedScore >= 6) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

export function getScoreBgColor(score: number, maxScoreForItem: number = 10): string {
  const normalizedScore = (score / maxScoreForItem) * 10
  if (normalizedScore >= 9) return 'bg-green-500'
  if (normalizedScore >= 6) return 'bg-yellow-500'
  return 'bg-red-500'
}
