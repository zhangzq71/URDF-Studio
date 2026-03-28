import { resolveImportedAssetPath } from '@/core/parsers/meshPathUtils';

export interface ResolvedSdfIncludeSource {
  path: string;
  content: string;
}

function normalizePath(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }

    stack.push(segment);
  }

  return stack.join('/');
}

function resolveIncludePath(uri: string, sourcePath?: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return null;
  }

  if (trimmed.startsWith('file://')) {
    return normalizePath(trimmed.slice('file://'.length));
  }

  return normalizePath(resolveImportedAssetPath(trimmed, sourcePath));
}

function preferCandidate(left: ResolvedSdfIncludeSource, right: ResolvedSdfIncludeSource): number {
  const rank = (candidatePath: string): number => {
    const lowerPath = candidatePath.toLowerCase();
    if (lowerPath.endsWith('/model.sdf')) return 0;
    if (/\/model-\d+_\d+\.sdf$/i.test(candidatePath)) return 1;
    if (lowerPath.endsWith('.sdf')) return 2;
    return 3;
  };

  return rank(left.path) - rank(right.path) || left.path.localeCompare(right.path);
}

export function resolveSdfIncludeSource(
  includeUri: string,
  allFileContents: Record<string, string>,
  sourcePath?: string | null,
): ResolvedSdfIncludeSource | null {
  const includeBasePath = resolveIncludePath(includeUri, sourcePath ?? undefined);
  if (!includeBasePath) {
    return null;
  }

  const entries = Object.entries(allFileContents)
    .map(([path, content]) => ({
      path: normalizePath(path),
      content,
    }))
    .filter(({ path }) => path.toLowerCase().endsWith('.sdf'));

  const exactCandidates = [
    includeBasePath,
    `${includeBasePath}.sdf`,
    `${includeBasePath}/model.sdf`,
  ];

  for (const candidatePath of exactCandidates) {
    const matched = entries.find(({ path }) => path === candidatePath);
    if (matched) {
      return matched;
    }
  }

  const nestedCandidates = entries
    .filter(({ path }) => path.startsWith(`${includeBasePath}/`))
    .sort(preferCandidate);

  if (nestedCandidates[0]) {
    return nestedCandidates[0];
  }

  const basename = includeBasePath.split('/').pop()?.toLowerCase() || '';
  if (!basename) {
    return null;
  }

  const fallbackCandidates = entries
    .filter(({ path }) => path.toLowerCase().includes(`/${basename}/`))
    .sort(preferCandidate);

  return fallbackCandidates[0] ?? null;
}
