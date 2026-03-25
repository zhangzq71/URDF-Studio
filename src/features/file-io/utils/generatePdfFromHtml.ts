/**
 * Generate PDF from HTML using browser's print functionality
 * This ensures proper Chinese character support without needing external fonts
 */

interface PrintElementAsPdfOptions {
  element: HTMLElement
  title?: string
  bodyStyle?: string
  extraCss?: string
}

function clonePrintableHead(targetDocument: Document) {
  const headNodes = Array.from(document.head.children)
  headNodes.forEach(node => {
    if (node instanceof HTMLTitleElement) return
    targetDocument.head.appendChild(node.cloneNode(true))
  })
}

export async function printElementAsPdf({
  element,
  title,
  bodyStyle,
  extraCss
}: PrintElementAsPdfOptions): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `
    position: fixed;
    width: 0;
    height: 0;
    right: 0;
    bottom: 0;
    border: 0;
    visibility: hidden;
    pointer-events: none;
  `

  document.body.appendChild(iframe)

  const iframeWindow = iframe.contentWindow
  const iframeDocument = iframe.contentDocument

  if (!iframeWindow || !iframeDocument) {
    iframe.remove()
    throw new Error('Unable to create print document')
  }

  iframeDocument.open()
  iframeDocument.write('<!doctype html><html><head></head><body></body></html>')
  iframeDocument.close()

  clonePrintableHead(iframeDocument)

  if (title) {
    iframeDocument.title = title
    const titleElement = iframeDocument.createElement('title')
    titleElement.textContent = title
    iframeDocument.head.appendChild(titleElement)
  }

  const printStyle = iframeDocument.createElement('style')
  printStyle.textContent = `
    @page {
      size: A4;
      margin: 10mm;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    ${bodyStyle ? `body { ${bodyStyle} }` : ''}
    ${extraCss ?? ''}
  `
  iframeDocument.head.appendChild(printStyle)

  iframeDocument.body.appendChild(element.cloneNode(true))

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let printStarted = false

    const cleanup = () => {
      iframeWindow.removeEventListener('afterprint', handleAfterPrint)
      iframe.remove()
    }

    const finalize = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

    const handleAfterPrint = () => finalize()

    iframeWindow.addEventListener('afterprint', handleAfterPrint, { once: true })

    const startPrint = () => {
      if (settled || printStarted) return
      printStarted = true

      try {
        iframeWindow.focus()
        iframeWindow.print()
      } catch (error) {
        finalize(error instanceof Error ? error : new Error('Print failed'))
        return
      }

      // Some browsers do not reliably fire afterprint when the dialog is cancelled.
      setTimeout(() => finalize(), 1000)
    }

    iframe.onload = () => {
      setTimeout(startPrint, 100)
    }

    // srcdoc-like manual write can complete before onload is attached, so keep a fallback.
    setTimeout(startPrint, 300)
  })
}

export async function generatePdfFromHtml(
  elementId: string,
  title?: string
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }
  await printElementAsPdf({
    element,
    title,
    bodyStyle: `
      display: flex;
      justify-content: center;
    `,
    extraCss: `
      body > * {
        width: 100%;
        max-width: 210mm;
        padding: 20mm;
        box-sizing: border-box;
      }
    `
  })
}

/**
 * Alternative: Generate PDF using jsPDF with autoTable plugin
 * This requires jsPDF to have Chinese font support
 */
export async function generatePdfWithJsPDF(
  inspectionReport: any,
  robotName: string,
  fileName: string
): Promise<void> {
  // This is a fallback implementation that uses html2canvas + jsPDF
  // For now, we'll use the print-based approach which is more reliable for Chinese

  // Import jsPDF dynamically
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Title (English only for jsPDF - fallback)
  doc.setFontSize(20);
  doc.setTextColor(50, 50, 50);
  doc.text('URDF Robot Inspection Report', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Robot name
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(`Robot Name: ${robotName}`, margin, yPos);
  yPos += 10;

  // Date
  const now = new Date();
  const dateStr = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Inspection Date: ${dateStr}`, margin, yPos);
  yPos += 15;

  // Overall score
  const overallScore = inspectionReport.overallScore ?? 0;
  const maxScore = inspectionReport.maxScore ?? 100;
  doc.setFontSize(16);
  doc.setTextColor(50, 50, 50);
  doc.text(`Overall Score: ${overallScore.toFixed(1)}/${maxScore}`, margin, yPos);
  yPos += 10;

  // Progress bar
  const scorePercentage = (overallScore / maxScore) * 100;
  const barWidth = pageWidth - 2 * margin;
  const barHeight = 5;
  doc.setFillColor(200, 200, 200);
  doc.rect(margin, yPos, barWidth, barHeight, 'F');

  let barColor: [number, number, number] = [239, 68, 68]; // red
  if (scorePercentage >= 90) barColor = [34, 197, 94]; // green
  else if (scorePercentage >= 60) barColor = [234, 179, 8]; // yellow
  doc.setFillColor(...barColor);
  doc.rect(margin, yPos, (barWidth * scorePercentage) / 100, barHeight, 'F');
  yPos += 15;

  // Summary
  doc.setFontSize(12);
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'bold');
  doc.text('Inspection Summary', margin, yPos);
  yPos += 8;
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(inspectionReport.summary, pageWidth - 2 * margin);
  doc.text(summaryLines, margin, yPos);
  yPos += summaryLines.length * 6 + 10;

  // Issues
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Total Issues: ${inspectionReport.issues.length}`, margin, yPos);

  doc.save(fileName);
}
