import './index.css';
import {
  createAcceptMessage,
  createReadyMessage,
  createRejectMessage,
  type HandoffOfferMessage,
  type HandoffPayloadMessage,
  isHandoffOfferMessage,
  isHandoffPayloadMessage,
  validateHandoffOffer,
  validateHandoffPayload,
} from '@/app/handoff/protocol';
import { pruneExpiredPendingHandoffImports, savePendingHandoffImport } from '@/app/handoff/storage';

type Locale = 'en' | 'zh';
type Phase = 'waiting' | 'offer' | 'awaiting-payload' | 'saving' | 'redirecting' | 'done' | 'error';

type TranslationDictionary = {
  eyebrow: string;
  title: string;
  waitingStatus: string;
  noOpenerError: string;
  offerStatus: (origin: string) => string;
  awaitingPayloadStatus: string;
  savingStatus: string;
  redirectingStatus: string;
  acceptLabel: string;
  rejectLabel: string;
  senderLabel: string;
  fileLabel: string;
  sizeLabel: string;
  acceptNote: string;
  rejectedStatus: string;
  payloadMismatchError: string;
};

const TRANSLATIONS: Record<Locale, TranslationDictionary> = {
  en: {
    eyebrow: 'Import Handoff',
    title: 'Accept a ZIP archive from the sender site',
    waitingStatus: 'Waiting for the sender site to describe the archive…',
    noOpenerError:
      'This page must be opened by the sender site. Close this window and start the transfer again from the partner page.',
    offerStatus: (origin) =>
      `${origin} wants to send a ZIP archive directly into URDF Studio. Review the details below, then approve the handoff to continue.`,
    awaitingPayloadStatus:
      'Approval sent. Waiting for the sender site to stream the ZIP archive into this window…',
    savingStatus: 'Saving the archive into this browser session…',
    redirectingStatus: 'Archive received. Redirecting into the editor…',
    acceptLabel: 'Accept ZIP',
    rejectLabel: 'Reject',
    senderLabel: 'Sender',
    fileLabel: 'Archive',
    sizeLabel: 'Size',
    acceptNote:
      'The archive stays inside the browser handoff between the sender page and URDF Studio. No third-party storage is used in this flow.',
    rejectedStatus: 'The transfer was rejected. Return to the sender page to try again.',
    payloadMismatchError: 'The sender payload did not match the accepted offer.',
  },
  zh: {
    eyebrow: '导入接力',
    title: '接收来自发送方页面的 ZIP 压缩包',
    waitingStatus: '正在等待发送方页面描述即将传入的压缩包…',
    noOpenerError: '此页面必须由发送方页面打开。请关闭当前窗口，并回到合作方页面重新发起传输。',
    offerStatus: (origin) =>
      `${origin} 想直接把一个 ZIP 压缩包发送到 URDF Studio。请先核对下面的信息，再确认是否接收。`,
    awaitingPayloadStatus: '已发送接收确认，正在等待发送方页面把 ZIP 压缩包传入当前窗口…',
    savingStatus: '正在把压缩包写入当前浏览器会话…',
    redirectingStatus: '压缩包接收完成，正在跳转到编辑器…',
    acceptLabel: '接收 ZIP',
    rejectLabel: '拒绝',
    senderLabel: '发送方',
    fileLabel: '压缩包',
    sizeLabel: '大小',
    acceptNote:
      '这个流程中的压缩包只在发送方页面与 URDF Studio 当前浏览器会话之间流转，不依赖第三方存储。',
    rejectedStatus: '本次传输已被拒绝。请回到发送方页面重新尝试。',
    payloadMismatchError: '发送方传来的实际内容与已确认的压缩包信息不一致。',
  },
};

const locale: Locale =
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en';
const t = TRANSLATIONS[locale];

const root = document.getElementById('root');
if (!root) {
  throw new Error('Could not find the handoff root container.');
}

let currentPhase: Phase = 'waiting';
let activeOffer: HandoffOfferMessage | null = null;
let activeSourceWindow: WindowProxy | null = null;
let activeSourceOrigin = '*';

function formatByteSize(sizeBytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Math.max(0, sizeBytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function redirectToEditor(handoffId: string): void {
  currentPhase = 'redirecting';
  render();
  const nextUrl = new URL('./', window.location.href);
  nextUrl.searchParams.set('handoff', handoffId);
  window.location.assign(nextUrl.toString());
}

function rejectTransfer(code: Parameters<typeof createRejectMessage>[0], message: string): void {
  if (activeSourceWindow) {
    activeSourceWindow.postMessage(createRejectMessage(code, message), activeSourceOrigin);
  }
  currentPhase = 'error';
  render(message);
}

function sendReadyMessage(): void {
  if (!window.opener) {
    currentPhase = 'error';
    render(t.noOpenerError);
    return;
  }

  window.opener.postMessage(createReadyMessage(), '*');
}

function render(errorMessage?: string): void {
  const senderOrigin = activeOffer ? activeSourceOrigin : '—';
  const fileName = activeOffer?.fileName ?? '—';
  const archiveSize = activeOffer ? formatByteSize(activeOffer.sizeBytes) : '—';

  const statusText =
    currentPhase === 'waiting'
      ? t.waitingStatus
      : currentPhase === 'offer'
        ? t.offerStatus(senderOrigin)
        : currentPhase === 'awaiting-payload'
          ? t.awaitingPayloadStatus
          : currentPhase === 'saving'
            ? t.savingStatus
            : currentPhase === 'redirecting' || currentPhase === 'done'
              ? t.redirectingStatus
              : (errorMessage ?? t.rejectedStatus);

  root.innerHTML = `
    <main class="handoff-shell">
      <section class="handoff-card">
        <p class="handoff-eyebrow">${t.eyebrow}</p>
        <h1 class="handoff-title">${t.title}</h1>
        <p class="handoff-status ${currentPhase === 'error' ? 'handoff-error' : ''}">${statusText}</p>
        <dl class="handoff-detail-grid">
          <dt class="handoff-term">${t.senderLabel}</dt>
          <dd class="handoff-value">${senderOrigin}</dd>
          <dt class="handoff-term">${t.fileLabel}</dt>
          <dd class="handoff-value">${fileName}</dd>
          <dt class="handoff-term">${t.sizeLabel}</dt>
          <dd class="handoff-value">${archiveSize}</dd>
        </dl>
        <div class="handoff-note">${t.acceptNote}</div>
        <div class="handoff-actions">
          <button
            id="handoff-accept"
            class="handoff-button handoff-button-primary"
            ${currentPhase === 'offer' ? '' : 'disabled'}
          >
            ${t.acceptLabel}
          </button>
          <button
            id="handoff-reject"
            class="handoff-button handoff-button-secondary"
            ${currentPhase === 'offer' ? '' : 'disabled'}
          >
            ${t.rejectLabel}
          </button>
        </div>
      </section>
    </main>
  `;

  const acceptButton = document.getElementById('handoff-accept');
  const rejectButton = document.getElementById('handoff-reject');

  acceptButton?.addEventListener('click', () => {
    if (!activeOffer || !activeSourceWindow) return;
    currentPhase = 'awaiting-payload';
    activeSourceWindow.postMessage(createAcceptMessage(), activeSourceOrigin);
    render();
  });

  rejectButton?.addEventListener('click', () => {
    rejectTransfer('user_rejected', t.rejectedStatus);
  });
}

async function handlePayloadMessage(message: HandoffPayloadMessage): Promise<void> {
  if (!activeOffer) {
    rejectTransfer('protocol_error', t.payloadMismatchError);
    return;
  }

  const payloadValidationError = validateHandoffPayload(message, activeOffer);
  if (payloadValidationError) {
    rejectTransfer('protocol_error', payloadValidationError);
    return;
  }

  currentPhase = 'saving';
  render();

  try {
    await pruneExpiredPendingHandoffImports();
    const savedRecord = await savePendingHandoffImport({
      fileName: message.fileName,
      mimeType: message.mimeType,
      sizeBytes: message.sizeBytes,
      sourceOrigin: activeSourceOrigin,
      zipBlob: message.zip,
    });
    currentPhase = 'done';
    render();
    redirectToEditor(savedRecord.id);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : 'Failed to save the incoming archive.';
    rejectTransfer('protocol_error', messageText);
  }
}

window.addEventListener('message', (event) => {
  if (!window.opener || event.source !== window.opener) {
    return;
  }

  const openerWindow = window.opener;

  if (isHandoffOfferMessage(event.data)) {
    const offerError = validateHandoffOffer(event.data);
    if (offerError) {
      activeSourceWindow = openerWindow;
      activeSourceOrigin = event.origin || '*';
      rejectTransfer(
        event.data.sizeBytes > createReadyMessage().maxBytes ? 'too_large' : 'invalid_type',
        offerError,
      );
      return;
    }

    activeOffer = event.data;
    activeSourceWindow = openerWindow;
    activeSourceOrigin = event.origin || '*';
    currentPhase = 'offer';
    render();
    return;
  }

  if (isHandoffPayloadMessage(event.data)) {
    void handlePayloadMessage(event.data);
  }
});

render();
void pruneExpiredPendingHandoffImports().catch((error) => {
  console.error('Failed to prune expired handoff imports:', error);
});
sendReadyMessage();
