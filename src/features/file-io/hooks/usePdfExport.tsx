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
import { printElementAsPdf } from '../utils/generatePdfFromHtml';

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
    setTimeout(async () => {
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
          });
        } catch (error) {
          console.error('Inspection report PDF export failed', error);
        }
      }

      // Cleanup
      root.unmount();
      const containerToRemove = document.getElementById('pdf-report-container');
      if (containerToRemove && containerToRemove.parentElement) {
        containerToRemove.parentElement.removeChild(containerToRemove);
      }
    }, 200);
  }, [lang, robotName, t]);

  return {
    handleDownloadPDF,
  };
}
