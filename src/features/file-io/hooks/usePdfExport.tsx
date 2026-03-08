/**
 * usePdfExport Hook
 * Handle PDF report export operations for inspection reports
 * Uses HTML template approach to support Chinese characters properly
 */

import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { translations } from '@/shared/i18n';
import { useUIStore, useRobotStore } from '@/store';
import type { InspectionReport } from '@/types';
import { InspectionReportTemplate } from '../components/InspectionReportTemplate';
import { generatePdfFromHtml } from '../utils/generatePdfFromHtml';

interface UsePdfExportReturn {
  handleDownloadPDF: (inspectionReport: InspectionReport | null) => void;
}

export function usePdfExport(): UsePdfExportReturn {
  const lang = useUIStore((s) => s.lang);
  const t = translations[lang];
  const robotName = useRobotStore((s) => s.name);

  const handleDownloadPDF = useCallback((inspectionReport: InspectionReport | null) => {
    if (!inspectionReport) return;

    // Create a hidden container for the report template
    const container = document.createElement('div');
    container.id = 'pdf-report-container';
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: 210mm;
      padding: 0;
      margin: 0;
    `;
    document.body.appendChild(container);

    // Render the report template
    const root = createRoot(container);
    root.render(
      <InspectionReportTemplate
        inspectionReport={inspectionReport}
        robotName={robotName}
        lang={lang as 'zh' | 'en'}
      />
    );

    // Wait for rendering to complete
    setTimeout(() => {
      // Generate filename
      const now = new Date();
      const dateStr = now.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const fileName = `${robotName}_${t.inspectionReportFileSuffix}_${dateStr.replace(/[\/\s:]/g, '_')}.pdf`;

      // Use browser's print dialog to generate PDF
      // This ensures proper Chinese character support
      // Create a clean printable version
      const element = document.getElementById('pdf-report-container')?.firstElementChild;
      if (element) {
        // Store original body content
        const originalContent = document.body.innerHTML;

        // Replace body with report content for printing
        const reportClone = element.cloneNode(true) as HTMLElement;
        reportClone.style.cssText = `
          width: 100%;
          max-width: 210mm;
          margin: 0 auto;
          padding: 20mm;
        `;

        document.body.innerHTML = '';
        document.body.appendChild(reportClone);

        // Store original title
        const originalTitle = document.title;
        document.title = fileName;

        // Inject print styles
        const styleElement = document.createElement('style');
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
        `;
        document.head.appendChild(styleElement);

        // Small delay before opening print dialog
        setTimeout(() => {
          window.print();

          // Restore original content after print
          window.addEventListener('afterprint', () => {
            document.body.innerHTML = originalContent;
            document.title = originalTitle;
            styleElement.remove();
          }, { once: true });

          // Also restore after a timeout in case user cancels
          setTimeout(() => {
            if (document.body.contains(reportClone)) {
              document.body.innerHTML = originalContent;
              document.title = originalTitle;
            }
          }, 5000);
        }, 100);
      }

      // Cleanup
      setTimeout(() => {
        root.unmount();
        const containerToRemove = document.getElementById('pdf-report-container');
        if (containerToRemove && containerToRemove.parentElement) {
          containerToRemove.parentElement.removeChild(containerToRemove);
        }
      }, 6000);
    }, 200);
  }, [lang, robotName, t]);

  return {
    handleDownloadPDF,
  };
}
