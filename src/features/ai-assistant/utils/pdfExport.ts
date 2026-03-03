/**
 * PDF export utility for inspection reports
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Language } from '@/shared/i18n'
import type { InspectionReport } from '@/types'
import { InspectionReportTemplate } from '@/features/file-io/components/InspectionReportTemplate'

interface ExportInspectionReportPdfParams {
  inspectionReport: InspectionReport | null
  robotName: string
  lang: Language
}

export function exportInspectionReportPdf({
  inspectionReport,
  robotName,
  lang
}: ExportInspectionReportPdfParams): void {
  if (!inspectionReport) return

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
      lang: lang as 'zh' | 'en'
    })
  )

  setTimeout(() => {
    const now = new Date()
    const dateStr = now.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })

    const fileName =
      lang === 'zh'
        ? `${robotName}_检查报告_${dateStr.replace(/[\/\s:]/g, '_')}.pdf`
        : `${robotName}_inspection_report_${dateStr.replace(/[\/\s:]/g, '_')}.pdf`

    const element = document.getElementById('pdf-report-container-modal')?.firstElementChild
    if (element) {
      const originalContent = document.body.innerHTML
      const reportClone = element.cloneNode(true) as HTMLElement
      reportClone.style.cssText = `
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 20mm;
      `

      document.body.innerHTML = ''
      document.body.appendChild(reportClone)

      const originalTitle = document.title
      document.title = fileName

      const styleElement = document.createElement('style')
      styleElement.textContent = `
        @page {
          size: A4;
          margin: 10mm;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
        }
      `
      document.head.appendChild(styleElement)

      let restored = false

      const restoreOriginalView = () => {
        if (restored) return
        restored = true
        window.removeEventListener('afterprint', handleAfterPrint)
        document.body.innerHTML = originalContent
        document.title = originalTitle
        styleElement.remove()
      }

      const handleAfterPrint = () => {
        restoreOriginalView()
      }

      setTimeout(() => {
        window.addEventListener('afterprint', handleAfterPrint, { once: true })
        window.print()

        setTimeout(() => {
          restoreOriginalView()
        }, 5000)
      }, 100)
    }

    setTimeout(() => {
      root.unmount()
      const containerToRemove = document.getElementById('pdf-report-container-modal')
      if (containerToRemove && containerToRemove.parentElement) {
        containerToRemove.parentElement.removeChild(containerToRemove)
      }
    }, 6000)
  }, 200)
}
