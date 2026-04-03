/**
 * usePdfExport Hook
 * Handle PDF report export operations for inspection reports
 * Uses HTML template approach to support Chinese characters properly
 */

import { useCallback } from 'react';
import { flushSync } from 'react-dom';
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

    const container = document.createElement('div');
    container.id = 'pdf-report-container';
    container.style.cssText = `
      position: fixed;
      left: -200vw;
      top: 0;
      width: 210mm;
      padding: 0;
      margin: 0;
      opacity: 0;
      pointer-events: none;
      background: #ffffff;
    `;
    document.body.appendChild(container);

    const root = createRoot(container);

    flushSync(() => {
      root.render(
        <InspectionReportTemplate
          inspectionReport={inspectionReport}
          robotName={robotName}
          lang={lang as 'zh' | 'en'}
        />
      );
    });

    const now = new Date();
    const dateStr = now.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const fileName = `${robotName}_${t.inspectionReportFileSuffix}_${dateStr.replace(/[\/\s:]/g, '_')}.pdf`;

    void (async () => {
      try {
        const element = document.getElementById('pdf-report-container')?.firstElementChild;
        if (!element) {
          throw new Error('Inspection report PDF element was not rendered');
        }

        await printElementAsPdf({
          element: element as HTMLElement,
          title: fileName,
        });
      } catch (error) {
        console.error('Inspection report PDF export failed', error);
      } finally {
        flushSync(() => {
          root.unmount();
        });

        const containerToRemove = document.getElementById('pdf-report-container');
        if (containerToRemove?.parentElement) {
          containerToRemove.parentElement.removeChild(containerToRemove);
        }
      }
    })();
  }, [lang, robotName, t]);

  return {
    handleDownloadPDF,
  };
}
