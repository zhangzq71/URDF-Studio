const GENERATED_SOURCE_CACHE_LIMIT = 64;

export function readGeneratedSourceFromCache(
  cache: Map<string, string>,
  cacheKey: string,
  buildSource: () => string,
): string {
  const cachedSource = cache.get(cacheKey);
  if (cachedSource !== undefined) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cachedSource);
    return cachedSource;
  }

  const nextSource = buildSource();
  cache.set(cacheKey, nextSource);

  while (cache.size > GENERATED_SOURCE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
  }

  return nextSource;
}
