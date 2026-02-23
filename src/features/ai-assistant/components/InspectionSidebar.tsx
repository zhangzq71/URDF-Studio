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
    <div className="w-56 border-r border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1C1C1E] flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-200 dark:border-white/10">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          {t.inspectionItems}
        </h3>
        <button
          onClick={onRunInspection}
          disabled={isGeneratingAI}
          className="w-full py-2 bg-[#0060FA] hover:bg-[#0050D0] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-black/20 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
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
              className={`rounded-lg transition-colors ${
                isExpanded
                  ? 'bg-white dark:bg-element-bg shadow-sm border border-slate-200 dark:border-white/10'
                  : 'hover:bg-slate-200/50 dark:hover:bg-element-bg'
              }`}
            >
              <div className="flex items-center p-2 group">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                      allSelected
                        ? 'bg-[#0060FA] border-[#0060FA]'
                        : someSelected
                          ? 'bg-[#0060FA]/70 border-[#0060FA]/70'
                          : 'border-slate-300 dark:border-slate-600 hover:border-[#0060FA]'
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
                    className="flex-1 text-left truncate text-xs font-bold text-slate-700 dark:text-slate-200"
                    onClick={() => toggleCategoryExpand(category.id)}
                  >
                    {categoryName}
                  </button>
                </div>
                <button
                  className="p-1 hover:bg-slate-200 dark:hover:bg-element-hover rounded transition-colors"
                  onClick={() => toggleCategoryExpand(category.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="px-2 pb-2 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  {category.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-element-hover rounded-md cursor-pointer group/item"
                      onClick={() => toggleItemSelection(category.id, item.id)}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                          selectedItemIds.has(item.id)
                            ? 'bg-[#0060FA] border-[#0060FA]'
                            : 'border-slate-300 dark:border-slate-600 group-hover/item:border-[#0060FA]'
                        }`}
                      >
                        {selectedItemIds.has(item.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium truncate">
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
