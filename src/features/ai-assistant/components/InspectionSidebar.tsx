import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { Language, TranslationKeys } from '@/shared/i18n'
import { INSPECTION_CRITERIA } from '../utils/inspectionCriteria'

export type SelectedInspectionItems = Record<string, Set<string>>

interface InspectionSidebarProps {
  lang: Language
  t: TranslationKeys
  isGeneratingAI: boolean
  focusedCategoryId: string
  expandedCategories: Set<string>
  selectedItems: SelectedInspectionItems
  setExpandedCategories: Dispatch<SetStateAction<Set<string>>>
  setSelectedItems: Dispatch<SetStateAction<SelectedInspectionItems>>
  onFocusCategory: (categoryId: string) => void
}

export function InspectionSidebar({
  lang,
  t,
  isGeneratingAI,
  focusedCategoryId,
  expandedCategories,
  selectedItems,
  setExpandedCategories,
  setSelectedItems,
  onFocusCategory,
}: InspectionSidebarProps) {
  const totalItemCount = INSPECTION_CRITERIA.reduce((sum, category) => sum + category.items.length, 0)
  let totalSelectedCount = 0
  let selectedCategoryCount = 0

  INSPECTION_CRITERIA.forEach((category) => {
    const count = selectedItems[category.id]?.size ?? 0
    totalSelectedCount += count
    if (count > 0) {
      selectedCategoryCount += 1
    }
  })

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedItems(prev => {
      const newItems = { ...prev }
      const category = INSPECTION_CRITERIA.find(c => c.id === categoryId)
      if (!category) return prev

      const allSelected = category.items.every(item => newItems[categoryId]?.has(item.id))
      if (allSelected) {
        newItems[categoryId] = new Set()
      } else {
        newItems[categoryId] = new Set(category.items.map(item => item.id))
      }
      return newItems
    })
  }

  const toggleItemSelection = (categoryId: string, itemId: string) => {
    setSelectedItems(prev => {
      const newItems = { ...prev }
      if (!newItems[categoryId]) {
        newItems[categoryId] = new Set()
      }
      const itemSet = new Set(newItems[categoryId])
      if (itemSet.has(itemId)) {
        itemSet.delete(itemId)
      } else {
        itemSet.add(itemId)
      }
      newItems[categoryId] = itemSet
      return newItems
    })
  }

  const toggleCategoryExpand = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const resolveCategoryImpactLabel = (weight: number) => {
    if (weight >= 0.2) {
      return t.inspectionCategoryImpactHigh
    }
    if (weight >= 0.15) {
      return t.inspectionCategoryImpactMedium
    }
    return t.inspectionCategoryImpactBaseline
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-border-black bg-panel-bg dark:bg-element-bg">
      <div className="border-b border-border-black bg-element-bg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="px-1 text-[10px] font-medium tracking-wide text-text-tertiary">
              {t.inspectionItems}
            </h3>
            <p className="mt-1 px-1 text-[11px] leading-4 text-text-secondary">
              {t.inspectionScopeDescription}
            </p>
          </div>
          {isGeneratingAI && (
            <span className="rounded-lg border border-border-black bg-panel-bg px-2 py-1 text-[10px] font-medium text-text-secondary">
              {t.checking}
            </span>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-border-black bg-panel-bg p-2.5">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            <span>{t.runInspection}</span>
            <span>{selectedCategoryCount}/{INSPECTION_CRITERIA.length}</span>
          </div>
          <div className="mt-1 text-xs font-semibold text-text-primary">
            {t.inspectionSelectedChecksSummary
              .replace('{selected}', String(totalSelectedCount))
              .replace('{total}', String(totalItemCount))}
          </div>
        </div>
      </div>

      <div className={`custom-scrollbar flex-1 overflow-y-auto p-2 space-y-2 ${isGeneratingAI ? 'pointer-events-none opacity-70' : ''}`}>
        {INSPECTION_CRITERIA.map(category => {
          const categoryName = lang === 'zh' ? category.nameZh : category.name
          const selectedItemIds = selectedItems[category.id] || new Set()
          const selectedCount = selectedItemIds.size
          const allSelected = category.items.every(item => selectedItemIds.has(item.id))
          const someSelected = category.items.some(item => selectedItemIds.has(item.id))
          const isExpanded = expandedCategories.has(category.id)
          const isFocused = focusedCategoryId === category.id

          return (
            <div
              key={category.id}
              className={`rounded-xl transition-colors ${
                isFocused
                  ? 'border border-system-blue/35 bg-system-blue/10 shadow-sm'
                  : someSelected || isExpanded
                    ? 'border border-border-black bg-panel-bg shadow-sm'
                    : 'border border-transparent hover:border-border-black hover:bg-element-hover'
              }`}
            >
              <div className="flex items-start gap-2 p-2.5">
                <button
                  type="button"
                  aria-label={categoryName}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isGeneratingAI
                      ? 'border-border-strong bg-element-bg'
                      : allSelected
                        ? 'border-system-blue-solid bg-system-blue-solid'
                        : someSelected
                          ? 'border-system-blue bg-system-blue/80'
                          : 'border-border-strong bg-panel-bg hover:border-system-blue'
                  }`}
                  onClick={() => {
                    toggleCategorySelection(category.id)
                    onFocusCategory(category.id)
                  }}
                >
                  {allSelected ? (
                    <Check className="h-3 w-3 text-white" />
                  ) : someSelected ? (
                    <Minus className="h-2.5 w-2.5 text-white" />
                  ) : null}
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onFocusCategory(category.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-text-primary">
                        {categoryName}
                      </span>
                      <span className="shrink-0 rounded-md border border-border-black bg-element-bg px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        {Math.round(category.weight * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-text-tertiary">
                      <span>{selectedCount}/{category.items.length}</span>
                      <span aria-hidden="true">•</span>
                      <span>{resolveCategoryImpactLabel(category.weight)}</span>
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  className="rounded-md p-1 transition-colors hover:bg-element-hover"
                  onClick={() => {
                    onFocusCategory(category.id)
                    toggleCategoryExpand(category.id)
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" />
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-1 border-t border-border-black/80 px-2 pb-2 pt-2 duration-200">
                  <div className="space-y-1">
                    {category.items.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors ${
                          selectedItemIds.has(item.id)
                            ? 'bg-element-bg'
                            : 'hover:bg-element-hover'
                        }`}
                        onClick={() => {
                          toggleItemSelection(category.id, item.id)
                          onFocusCategory(category.id)
                        }}
                      >
                        <div
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                            selectedItemIds.has(item.id)
                              ? 'border-system-blue-solid bg-system-blue-solid'
                              : 'border-border-strong bg-panel-bg'
                          }`}
                        >
                          {selectedItemIds.has(item.id) && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <span className="truncate text-[11px] font-medium text-text-secondary">
                          {lang === 'zh' ? item.nameZh : item.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default InspectionSidebar
