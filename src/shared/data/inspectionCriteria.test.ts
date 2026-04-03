import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { INSPECTION_CRITERIA } from './inspectionCriteria.ts'

const englishSource = fs.readFileSync(
  new URL('../../features/ai-assistant/config/urdf_inspect_standard_en.md', import.meta.url),
  'utf8'
)

const chineseSource = fs.readFileSync(
  new URL('../../features/ai-assistant/config/urdf_inspect_stantard_zh.md', import.meta.url),
  'utf8'
)

const extractCriteriaShape = (source: string, language: 'en' | 'zh') => {
  const categoryPattern = language === 'en' ? /^Category ID:\s*(.+)$/gm : /^章节ID:\s*(.+)$/gm
  const itemPattern = language === 'en' ? /^Item ID:\s*(.+)$/gm : /^项目ID:\s*(.+)$/gm

  const categoryIds = Array.from(source.matchAll(categoryPattern), match => match[1].trim())
  const itemIds = Array.from(source.matchAll(itemPattern), match => match[1].trim())

  return { categoryIds, itemIds }
}

test('inspection criteria runtime data stays in sync with the editable markdown sources', () => {
  const runtimeCategoryIds = INSPECTION_CRITERIA.map(category => category.id)
  const runtimeItemIds = INSPECTION_CRITERIA.flatMap(category => category.items.map(item => item.id))

  const englishShape = extractCriteriaShape(englishSource, 'en')
  const chineseShape = extractCriteriaShape(chineseSource, 'zh')

  assert.deepEqual(runtimeCategoryIds, englishShape.categoryIds)
  assert.deepEqual(runtimeCategoryIds, chineseShape.categoryIds)
  assert.deepEqual(runtimeItemIds, englishShape.itemIds)
  assert.deepEqual(runtimeItemIds, chineseShape.itemIds)
})
