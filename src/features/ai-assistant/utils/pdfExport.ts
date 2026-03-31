/**
 * PDF export utility for inspection reports
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { translations, type Language } from '@/shared/i18n'
import type { InspectionReport, RobotInspectionContext } from '@/types'
import { InspectionReportTemplate } from '@/features/file-io/components/InspectionReportTemplate'
import { printElementAsPdf } from '@/features/file-io/utils/generatePdfFromHtml'

interface ExportInspectionReportPdfParams {
  inspectionReport: InspectionReport | null
  robotName: string
  lang: Language
  inspectionContext?: RobotInspectionContext
}

export function exportInspectionReportPdf({
  inspectionReport,
  robotName,
  lang,
  inspectionContext
}: ExportInspectionReportPdfParams): void {
  if (!inspectionReport) return
  const t = translations[lang]

  const container = document.createElement('div')
  container.id = 'pdf-report-container-modal'
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 210mm;
    padding: 0;
    margin: 0;
  `
  document.body.appendChild(container)

  const root = createRoot(container)
  root.render(
    createElement(InspectionReportTemplate, {
      inspectionReport,
      robotName,
      lang: lang as 'zh' | 'en',
      inspectionContext
    })
  )

  setTimeout(async () => {
    const now = new Date()
    const dateStr = now.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })

    const fileName = `${robotName}_${t.inspectionReportFileSuffix}_${dateStr.replace(/[\/\s:]/g, '_')}.pdf`

    const element = document.getElementById('pdf-report-container-modal')?.firstElementChild
    if (element) {
      try {
        await printElementAsPdf({
          element: element as HTMLElement,
          title: fileName,
          bodyStyle: `
            display: flex;
            justify-content: center;
          `,
          extraCss: `
            body > * {
              width: 100%;
              max-width: 210mm;
              margin: 0 auto;
              padding: 20mm;
              box-sizing: border-box;
            }
          `
        })
      } catch (error) {
        console.error('Inspection report PDF export failed', error)
      }
    }

    root.unmount()
    const containerToRemove = document.getElementById('pdf-report-container-modal')
    if (containerToRemove && containerToRemove.parentElement) {
      containerToRemove.parentElement.removeChild(containerToRemove)
    }
  }, 200)
}
