export function guardPromiseRejection<T>(promise: Promise<T>): Promise<T> {
  // Attach a no-op rejection handler immediately so disposal/cancellation paths
  // do not surface as transient unhandled rejections before the caller awaits.
  void promise.catch(() => {});
  return promise;
}
