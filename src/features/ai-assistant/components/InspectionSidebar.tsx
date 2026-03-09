import { Check, ChevronDown, ChevronRight, Loader2, Minus, RefreshCw } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { Language, TranslationKeys } from '@/shared/i18n'
import { INSPECTION_CRITERIA } from '../utils/inspectionCriteria'

export type SelectedInspectionItems = Record<string, Set<string>>

interface InspectionSidebarProps {
  lang: Language
  t: TranslationKeys
  isGeneratingAI: boolean
  expandedCategories: Set<string>
  selectedItems: SelectedInspectionItems
  setExpandedCategories: Dispatch<SetStateAction<Set<string>>>
  setSelectedItems: Dispatch<SetStateAction<SelectedInspectionItems>>
  onRunInspection: () => void
}

export function InspectionSidebar({
  lang,
  t,
  isGeneratingAI,
  expandedCategories,
  selectedItems,
  setExpandedCategories,
  setSelectedItems,
  onRunInspection
}: InspectionSidebarProps) {
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

  return (
    <div className="w-56 border-r border-border-black bg-panel-bg dark:bg-element-bg flex flex-col shrink-0">
      <div className="p-3 border-b border-border-black bg-element-bg">
        <h3 className="text-[10px] font-medium text-text-tertiary tracking-wide mb-2 px-1">
          {t.inspectionItems}
        </h3>
        <button
          onClick={onRunInspection}
          disabled={isGeneratingAI}
          className="w-full h-8 bg-system-blue-solid hover:bg-system-blue-hover text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
        >
          {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isGeneratingAI ? t.thinking : t.runInspection}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {INSPECTION_CRITERIA.map(category => {
          const categoryName = lang === 'zh' ? category.nameZh : category.name
          const selectedItemIds = selectedItems[category.id] || new Set()
          const allSelected = category.items.every(item => selectedItemIds.has(item.id))
          const someSelected = category.items.some(item => selectedItemIds.has(item.id))
          const isExpanded = expandedCategories.has(category.id)

          return (
            <div
              key={category.id}
              className={`rounded-xl transition-colors ${
                isExpanded
                  ? 'bg-panel-bg dark:bg-panel-bg border border-border-black shadow-sm'
                  : 'hover:bg-element-hover'
              }`}
            >
              <div className="flex items-center p-2.5 group">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                      allSelected
                        ? 'bg-system-blue-solid border-system-blue-solid'
                      : someSelected
                          ? 'bg-system-blue/80 border-system-blue'
                          : 'border-border-strong hover:border-system-blue'
                    }`}
                    onClick={() => toggleCategorySelection(category.id)}
                  >
                    {allSelected ? (
                      <Check className="w-3 h-3 text-white" />
                    ) : someSelected ? (
                      <Minus className="w-2.5 h-2.5 text-white" />
                    ) : null}
                  </div>
                  <button
                    className="flex-1 text-left truncate text-xs font-semibold text-text-primary"
                    onClick={() => toggleCategoryExpand(category.id)}
                  >
                    {categoryName}
                  </button>
                </div>
                <button
                  className="p-1 hover:bg-element-hover rounded-md transition-colors"
                  onClick={() => toggleCategoryExpand(category.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="px-2 pb-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  {category.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-1.5 hover:bg-element-hover rounded-lg cursor-pointer group/item transition-colors"
                      onClick={() => toggleItemSelection(category.id, item.id)}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                          selectedItemIds.has(item.id)
                            ? 'bg-system-blue-solid border-system-blue-solid'
                            : 'border-border-strong group-hover/item:border-system-blue'
                        }`}
                      >
                        {selectedItemIds.has(item.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-[11px] text-text-secondary font-medium truncate">
                        {lang === 'zh' ? item.nameZh : item.name}
                      </span>
                    </div>
                  ))}
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
