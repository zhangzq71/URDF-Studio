const runtimeEnv = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;

export function isDevelopmentBuild(): boolean {
  return Boolean(runtimeEnv?.DEV);
}

export function normalizeRuntimeError(
  error: unknown,
  fallbackMessage: string,
): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

export function logRuntimeFailure(
  scope: string,
  error: unknown,
  level: 'error' | 'warn' = 'error',
): Error {
  const normalized = normalizeRuntimeError(error, `${scope} failed.`);
  console[level](`[${scope}]`, normalized);
  return normalized;
}

export function failFastInDev(
  scope: string,
  error: unknown,
  level: 'error' | 'warn' = 'error',
): Error {
  const normalized = logRuntimeFailure(scope, error, level);
  if (isDevelopmentBuild()) {
    throw normalized;
  }
  return normalized;
}

export function scheduleFailFastInDev(
  scope: string,
  error: unknown,
  level: 'error' | 'warn' = 'error',
): Error {
  const normalized = logRuntimeFailure(scope, error, level);
  if (isDevelopmentBuild()) {
    queueMicrotask(() => {
      throw normalized;
    });
  }
  return normalized;
}
