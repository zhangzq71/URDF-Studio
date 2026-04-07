import {
  POPUP_HANDOFF_ACCEPT,
  POPUP_HANDOFF_MAX_BYTES,
  POPUP_HANDOFF_OFFER,
  POPUP_HANDOFF_PAYLOAD,
  POPUP_HANDOFF_PROTOCOL_VERSION,
  POPUP_HANDOFF_READY,
  POPUP_HANDOFF_REJECT,
  validatePopupHandoffPayload,
  type PopupHandoffAcceptMessage,
  type PopupHandoffOfferMessage,
  type PopupHandoffPayloadMessage,
  type PopupHandoffReadyMessage,
  type PopupHandoffRejectCode,
  type PopupHandoffRejectMessage,
} from '../../shared/utils/popupHandoffProtocol.ts';

export type HandoffOfferMessage = PopupHandoffOfferMessage;
export type HandoffPayloadMessage = PopupHandoffPayloadMessage;
export type HandoffRejectCode = PopupHandoffRejectCode;

export function createReadyMessage(): PopupHandoffReadyMessage {
  return {
    type: POPUP_HANDOFF_READY,
    version: POPUP_HANDOFF_PROTOCOL_VERSION,
    maxBytes: POPUP_HANDOFF_MAX_BYTES,
    accepts: ['application/zip', '.zip'],
  };
}

export function createAcceptMessage(): PopupHandoffAcceptMessage {
  return {
    type: POPUP_HANDOFF_ACCEPT,
    version: POPUP_HANDOFF_PROTOCOL_VERSION,
  };
}

export function createRejectMessage(
  code: HandoffRejectCode,
  message: string,
): PopupHandoffRejectMessage {
  return {
    type: POPUP_HANDOFF_REJECT,
    version: POPUP_HANDOFF_PROTOCOL_VERSION,
    code,
    message,
  };
}

export function isHandoffOfferMessage(value: unknown): value is HandoffOfferMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<HandoffOfferMessage>;
  return (
    candidate.type === POPUP_HANDOFF_OFFER &&
    candidate.version === POPUP_HANDOFF_PROTOCOL_VERSION &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.sizeBytes === 'number'
  );
}

export function isHandoffPayloadMessage(value: unknown): value is HandoffPayloadMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<HandoffPayloadMessage>;
  return (
    candidate.type === POPUP_HANDOFF_PAYLOAD &&
    candidate.version === POPUP_HANDOFF_PROTOCOL_VERSION &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.sizeBytes === 'number' &&
    candidate.zip instanceof Blob
  );
}

export function validateHandoffOffer(message: HandoffOfferMessage): string | null {
  const validation = validatePopupHandoffPayload({
    fileName: message.fileName,
    mimeType: message.mimeType,
    sizeBytes: message.sizeBytes,
  });
  if (validation.ok) {
    return null;
  }
  return validation.message;
}

export function validateHandoffPayload(
  message: HandoffPayloadMessage,
  expectedOffer: HandoffOfferMessage,
): string | null {
  const validation = validatePopupHandoffPayload({
    fileName: message.fileName,
    mimeType: message.mimeType,
    sizeBytes: message.sizeBytes,
  });

  if (validation.ok === false) {
    return validation.message;
  }

  if (
    message.fileName !== expectedOffer.fileName ||
    message.mimeType !== expectedOffer.mimeType ||
    message.sizeBytes !== expectedOffer.sizeBytes
  ) {
    return 'The sender payload did not match the accepted offer.';
  }

  return null;
}
