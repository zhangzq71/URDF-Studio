export function resolveImportPreparationConcurrency(): number {
  if (typeof navigator === 'undefined') {
    return 4;
  }

  const hardwareConcurrency = Number(navigator.hardwareConcurrency || 4);
  return Math.max(2, Math.min(8, Math.ceil(hardwareConcurrency / 2)));
}

export async function processWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) {
          return;
        }
        await task(items[currentIndex], currentIndex);
      }
    }),
  );
}
