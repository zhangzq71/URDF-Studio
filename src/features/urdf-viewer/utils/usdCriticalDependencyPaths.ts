const dependencyStemByRootUsdFile: Record<string, string> = {
  'g1_29dof_rev_1_0.usd': 'g1_29dof_rev_1_0',
  'g1_23dof_rev_1_0.usd': 'g1_23dof_rev_1_0',
  'go2.usd': 'go2_description',
  'go2w.usd': 'go2w_description',
  'h1.usd': 'h1',
  'h1_2.usd': 'h1_2',
  'h1_2_handless.usd': 'h1_2_handless',
  'b2.usd': 'b2_description',
  'b2w.usd': 'b2w_description',
};

function normalizeUsdAssetPath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function toVirtualUsdPath(path: string): string {
  const normalizedPath = normalizeUsdAssetPath(path);
  if (!normalizedPath) {
    return '/';
  }
  return `/${normalizedPath}`;
}

function getUsdDependencyExtension(stagePath: string): '.usd' | '.usda' | '.usdc' {
  const normalizedPath = toVirtualUsdPath(stagePath).toLowerCase();
  if (normalizedPath.endsWith('.usda')) {
    return '.usda';
  }
  if (normalizedPath.endsWith('.usdc')) {
    return '.usdc';
  }
  return '.usd';
}

function getVirtualUsdDirectory(path: string): string {
  const normalizedPath = toVirtualUsdPath(path);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex < 0) return '/';
  return normalizedPath.slice(0, lastSlashIndex + 1);
}

function inferUsdDependencyStem(stagePath: string): string | null {
  const normalizedPath = toVirtualUsdPath(stagePath).toLowerCase();
  const fileName = normalizedPath.split('/').pop() || '';
  if (!fileName) return null;

  const mappedStem = dependencyStemByRootUsdFile[fileName];
  if (mappedStem) return mappedStem;

  const inferredStem = fileName.replace(/\.usd[a-z]?$/i, '');
  if (!inferredStem) return null;
  if (!normalizedPath.includes('/configuration/')) return inferredStem;

  return inferredStem.replace(/_(base|physics|robot|sensor)$/i, '');
}

export function buildCriticalUsdDependencyPaths(stagePath: string): string[] {
  const normalizedStagePath = toVirtualUsdPath(stagePath);
  const dependencyStem = inferUsdDependencyStem(normalizedStagePath);
  if (!dependencyStem) return [];
  const dependencyExtension = getUsdDependencyExtension(normalizedStagePath);
  const rootFileStem = normalizedStagePath.split('/').pop()?.replace(/\.usd[a-z]?$/i, '') || '';

  const rootDirectory = getVirtualUsdDirectory(normalizedStagePath);
  const configurationDirectory = rootDirectory.toLowerCase().endsWith('/configuration/')
    ? rootDirectory
    : `${rootDirectory}configuration/`;

  const suffixes = dependencyStem === 'h1_2_handless'
    ? ['base', 'physics', 'robot']
    : rootFileStem === dependencyStem && dependencyStem.endsWith('_description')
      ? ['base', 'physics', 'sensor', 'robot']
      : ['base', 'physics', 'sensor'];

  return suffixes.map((suffix) => `${configurationDirectory}${dependencyStem}_${suffix}${dependencyExtension}`);
}
