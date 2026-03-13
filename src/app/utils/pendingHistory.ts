type PendingHistoryFlusher = (() => void) | null;

let pendingHistoryFlusher: PendingHistoryFlusher = null;

export function registerPendingHistoryFlusher(flusher: PendingHistoryFlusher) {
  pendingHistoryFlusher = flusher;
}

export function flushPendingHistory() {
  pendingHistoryFlusher?.();
}
