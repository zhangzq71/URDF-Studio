import { GeometryType, type RobotFile } from '@/types';
import { type RobotImportResult, resolveRobotFileData } from '@/core/parsers';
import { pickPreferredUsdRootFile } from '@/core/parsers/usd/usdFormatUtils';
import { getVisualGeometryEntries } from '@/core/robot';

const PACKAGE_REFERENCE_PATTERN = /package:\/\/([^/\s"'<>]+)/g;

function normalizeImportPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizePackageRootIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function collectReferencedPackageNames(content: string): string[] {
  const packageNames = new Set<string>();

  for (const match of content.matchAll(PACKAGE_REFERENCE_PATTERN)) {
    const packageName = match[1]?.trim();
    if (packageName) {
      packageNames.add(packageName);
    }
  }

  return [...packageNames];
}

function hasImportedPackageRoot(packageName: string, filePool: RobotFile[]): boolean {
  const normalizedPackageName = packageName.trim().toLowerCase();
  const normalizedPackageIdentity = normalizePackageRootIdentity(packageName);
  if (!normalizedPackageName) return false;

  return filePool.some((file) => {
    const normalizedPath = normalizeImportPath(file.name).toLowerCase();
    if (
      normalizedPath === normalizedPackageName
      || normalizedPath.startsWith(`${normalizedPackageName}/`)
      || normalizedPath.includes(`/${normalizedPackageName}/`)
    ) {
      return true;
    }

    if (!normalizedPackageIdentity) {
      return false;
    }

    return normalizedPath
      .split('/')
      .some((segment) => normalizePackageRootIdentity(segment) === normalizedPackageIdentity);
  });
}

export function isUrdfSelfContainedInImportBundle(file: RobotFile, filePool: RobotFile[] = []): boolean {
  if (file.format !== 'urdf') return false;

  const referencedPackages = collectReferencedPackageNames(file.content);
  if (referencedPackages.length === 0) return true;

  return referencedPackages.every((packageName) => hasImportedPackageRoot(packageName, filePool));
}

function parseMjcfDocument(content: string): Document | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    return doc.querySelector('parsererror') ? null : doc;
  } catch {
    return null;
  }
}

type MjcfCandidateStructure = {
  directBodyCount: number;
  actuatorCount: number;
  attachCount: number;
  includeCount: number;
  assetModelCount: number;
  sceneHelperCount: number;
};

type ResolvedRobotRichness = {
  renderableLinkCount: number;
  visualGeometryCount: number;
  collisionGeometryCount: number;
  meshGeometryCount: number;
};

type RobotImportResolver = (file: RobotFile) => RobotImportResult;

function memoizeRobotImportResolver(
  resolveRobotImport: RobotImportResolver,
): RobotImportResolver {
  const cache = new WeakMap<RobotFile, RobotImportResult>();

  return (file: RobotFile): RobotImportResult => {
    const cachedResult = cache.get(file);
    if (cachedResult) {
      return cachedResult;
    }

    const resolvedResult = resolveRobotImport(file);
    cache.set(file, resolvedResult);
    return resolvedResult;
  };
}

export function createMemoizedRobotImportResolver(
  filePool: RobotFile[],
): RobotImportResolver {
  return memoizeRobotImportResolver((file) => (
    resolveRobotFileData(file, { availableFiles: filePool })
  ));
}

function collectMjcfCandidateStructure(content: string): MjcfCandidateStructure {
  const doc = parseMjcfDocument(content);
  const mujocoEl = doc?.querySelector('mujoco');
  const worldbodyEl = mujocoEl?.querySelector(':scope > worldbody');

  return {
    directBodyCount: worldbodyEl?.querySelectorAll(':scope > body').length ?? 0,
    actuatorCount: mujocoEl?.querySelectorAll(':scope > actuator > *').length ?? 0,
    attachCount: mujocoEl?.querySelectorAll('attach[model]').length ?? 0,
    includeCount: mujocoEl?.querySelectorAll(':scope > include[file]').length ?? 0,
    assetModelCount: mujocoEl?.querySelectorAll(':scope > asset > model[file]').length ?? 0,
    sceneHelperCount: (worldbodyEl?.querySelectorAll(':scope > geom').length ?? 0)
      + (worldbodyEl?.querySelectorAll(':scope > light').length ?? 0)
      + (worldbodyEl?.querySelectorAll(':scope > camera').length ?? 0),
  };
}

function compareMjcfCandidateStructure(left: MjcfCandidateStructure, right: MjcfCandidateStructure): number {
  if (left.directBodyCount !== right.directBodyCount) {
    return right.directBodyCount - left.directBodyCount;
  }

  if (left.actuatorCount !== right.actuatorCount) {
    return right.actuatorCount - left.actuatorCount;
  }

  if (left.attachCount !== right.attachCount) {
    return right.attachCount - left.attachCount;
  }

  if (left.includeCount !== right.includeCount) {
    return left.includeCount - right.includeCount;
  }

  if (left.assetModelCount !== right.assetModelCount) {
    return left.assetModelCount - right.assetModelCount;
  }

  if (left.sceneHelperCount !== right.sceneHelperCount) {
    return left.sceneHelperCount - right.sceneHelperCount;
  }

  return 0;
}

function summarizeResolvedRobotRichness(
  file: RobotFile,
  resolveRobotImport: RobotImportResolver,
): ResolvedRobotRichness | null {
  const resolved = resolveRobotImport(file);
  if (resolved.status !== 'ready') {
    return null;
  }

  let renderableLinkCount = 0;
  let visualGeometryCount = 0;
  let collisionGeometryCount = 0;
  let meshGeometryCount = 0;

  Object.values(resolved.robotData.links).forEach((link) => {
    let linkHasRenderableGeometry = false;

    getVisualGeometryEntries(link).forEach((entry) => {
      visualGeometryCount += 1;
      linkHasRenderableGeometry = true;
      if (entry.geometry.type === GeometryType.MESH) {
        meshGeometryCount += 1;
      }
    });

    if (link.collision.type !== GeometryType.NONE) {
      collisionGeometryCount += 1;
      linkHasRenderableGeometry = true;
      if (link.collision.type === GeometryType.MESH) {
        meshGeometryCount += 1;
      }
    }

    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.NONE) {
        return;
      }

      collisionGeometryCount += 1;
      linkHasRenderableGeometry = true;
      if (body.type === GeometryType.MESH) {
        meshGeometryCount += 1;
      }
    });

    if (linkHasRenderableGeometry) {
      renderableLinkCount += 1;
    }
  });

  return {
    renderableLinkCount,
    visualGeometryCount,
    collisionGeometryCount,
    meshGeometryCount,
  };
}

function compareResolvedRobotRichness(
  left: ResolvedRobotRichness | null,
  right: ResolvedRobotRichness | null,
): number {
  const leftRenderableLinkCount = left?.renderableLinkCount ?? -1;
  const rightRenderableLinkCount = right?.renderableLinkCount ?? -1;
  if (leftRenderableLinkCount !== rightRenderableLinkCount) {
    return rightRenderableLinkCount - leftRenderableLinkCount;
  }

  const leftVisualGeometryCount = left?.visualGeometryCount ?? -1;
  const rightVisualGeometryCount = right?.visualGeometryCount ?? -1;
  if (leftVisualGeometryCount !== rightVisualGeometryCount) {
    return rightVisualGeometryCount - leftVisualGeometryCount;
  }

  const leftMeshGeometryCount = left?.meshGeometryCount ?? -1;
  const rightMeshGeometryCount = right?.meshGeometryCount ?? -1;
  if (leftMeshGeometryCount !== rightMeshGeometryCount) {
    return rightMeshGeometryCount - leftMeshGeometryCount;
  }

  const leftCollisionGeometryCount = left?.collisionGeometryCount ?? -1;
  const rightCollisionGeometryCount = right?.collisionGeometryCount ?? -1;
  return rightCollisionGeometryCount - leftCollisionGeometryCount;
}

function compareImportFileNamePreference(leftName: string, rightName: string): number {
  const leftBase = leftName.split('/').pop() ?? leftName;
  const rightBase = rightName.split('/').pop() ?? rightName;

  if (leftBase.length !== rightBase.length) {
    return leftBase.length - rightBase.length;
  }

  return leftName.localeCompare(rightName);
}

function tokenizeImportIdentity(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function getImportFileStem(fileName: string): string {
  const baseName = fileName.split('/').pop() ?? fileName;
  const lastDotIndex = baseName.lastIndexOf('.');
  return (lastDotIndex >= 0 ? baseName.slice(0, lastDotIndex) : baseName).toLowerCase();
}

function scoreUrdfIdentityAffinity(file: RobotFile, filePool: RobotFile[]): number {
  const packageTokens = new Set(
    filePool
      .filter((entry) => entry.format === 'urdf' || entry.format === 'xacro')
      .flatMap((entry) => collectReferencedPackageNames(entry.content))
      .flatMap((packageName) => tokenizeImportIdentity(packageName)),
  );

  if (packageTokens.size === 0) {
    return 0;
  }

  const fileTokens = new Set(tokenizeImportIdentity(getImportFileStem(file.name)));
  let score = 0;
  fileTokens.forEach((token) => {
    if (packageTokens.has(token)) {
      score += 1;
    }
  });

  return score;
}

function isDerivedVariantUrdfForMjcf(urdfFile: RobotFile, mjcfFile: RobotFile): boolean {
  const urdfStem = getImportFileStem(urdfFile.name);
  const mjcfStem = getImportFileStem(mjcfFile.name);

  if (!urdfStem || !mjcfStem || urdfStem === mjcfStem) {
    return false;
  }

  return urdfStem.startsWith(`${mjcfStem}_`) || urdfStem.startsWith(`${mjcfStem}-`);
}

function pickPreferredUrdfImportFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
  resolveRobotImport: RobotImportResolver = createMemoizedRobotImportResolver(filePool),
): RobotFile | null {
  const cachedResolveRobotImport = memoizeRobotImportResolver(resolveRobotImport);
  const urdfFiles = files.filter((file) => file.format === 'urdf');
  if (urdfFiles.length === 0) {
    return null;
  }

  const rankedCandidates = urdfFiles.map((file) => ({
    file,
    selfContained: isUrdfSelfContainedInImportBundle(file, filePool),
    richness: summarizeResolvedRobotRichness(file, cachedResolveRobotImport),
    identityAffinity: scoreUrdfIdentityAffinity(file, filePool),
  }));

  rankedCandidates.sort((left, right) => {
    if (left.selfContained !== right.selfContained) {
      return Number(right.selfContained) - Number(left.selfContained);
    }

    const richnessComparison = compareResolvedRobotRichness(left.richness, right.richness);
    if (richnessComparison !== 0) {
      return richnessComparison;
    }

    if (left.identityAffinity !== right.identityAffinity) {
      return right.identityAffinity - left.identityAffinity;
    }

    return compareImportFileNamePreference(left.file.name, right.file.name);
  });

  for (const candidate of rankedCandidates) {
    try {
      if (cachedResolveRobotImport(candidate.file).status === 'ready') {
        return candidate.file;
      }
    } catch {
      // Ignore invalid candidates and keep searching in rank order.
    }
  }

  return rankedCandidates[0]?.file ?? urdfFiles[0] ?? null;
}

function isMateriallyRicherRobotCandidate(
  candidate: ResolvedRobotRichness | null,
  baseline: ResolvedRobotRichness | null,
): boolean {
  if (!candidate || !baseline) {
    return false;
  }

  if (candidate.renderableLinkCount > baseline.renderableLinkCount
    && candidate.visualGeometryCount > baseline.visualGeometryCount) {
    return true;
  }

  if (candidate.meshGeometryCount > baseline.meshGeometryCount
    && candidate.renderableLinkCount >= baseline.renderableLinkCount) {
    return true;
  }

  if (candidate.visualGeometryCount >= baseline.visualGeometryCount + 3) {
    return true;
  }

  return false;
}

export function pickPreferredMjcfImportFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
  resolveRobotImport: RobotImportResolver = createMemoizedRobotImportResolver(filePool),
): RobotFile | null {
  const cachedResolveRobotImport = memoizeRobotImportResolver(resolveRobotImport);
  const mjcfFiles = files.filter((file) => file.format === 'mjcf');
  if (mjcfFiles.length === 0) return null;

  const rankedCandidates = mjcfFiles.map((candidate) => ({
    file: candidate,
    structure: collectMjcfCandidateStructure(candidate.content),
  }));

  rankedCandidates.sort((left, right) => {
    const structureComparison = compareMjcfCandidateStructure(left.structure, right.structure);
    if (structureComparison !== 0) {
      return structureComparison;
    }

    const leftBase = left.file.name.split('/').pop() ?? left.file.name;
    const rightBase = right.file.name.split('/').pop() ?? right.file.name;
    if (leftBase.length !== rightBase.length) {
      return leftBase.length - rightBase.length;
    }

    return leftBase.localeCompare(rightBase);
  });

  for (const candidate of rankedCandidates) {
    try {
      if (cachedResolveRobotImport(candidate.file).status === 'ready') {
        return candidate.file;
      }
    } catch {
      // Ignore invalid candidates and keep searching in rank order.
    }
  }

  return mjcfFiles[0] ?? null;
}

export function pickPreferredImportFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
  resolveRobotImport: RobotImportResolver = createMemoizedRobotImportResolver(filePool),
): RobotFile | null {
  const cachedResolveRobotImport = memoizeRobotImportResolver(resolveRobotImport);
  const robotDefinitionFiles = files.filter((file) => file.format !== 'mesh');
  const preferredUrdf = pickPreferredUrdfImportFile(robotDefinitionFiles, filePool, cachedResolveRobotImport);
  const preferredMjcf = pickPreferredMjcfImportFile(robotDefinitionFiles, filePool, cachedResolveRobotImport);
  const preferredUrdfIsSelfContained = preferredUrdf
    ? isUrdfSelfContainedInImportBundle(preferredUrdf, filePool)
    : false;

  const preferredUrdfRichness = preferredUrdf && preferredMjcf && preferredUrdfIsSelfContained
    ? summarizeResolvedRobotRichness(preferredUrdf, cachedResolveRobotImport)
    : null;
  const preferredMjcfRichness = preferredUrdf && preferredMjcf && preferredUrdfIsSelfContained
    ? summarizeResolvedRobotRichness(preferredMjcf, cachedResolveRobotImport)
    : null;

  const shouldPreferMjcfOverUrdf = preferredUrdf !== null
    && preferredMjcf !== null
    && (
      !preferredUrdfIsSelfContained
      || isMateriallyRicherRobotCandidate(preferredMjcfRichness, preferredUrdfRichness)
      || (
        preferredUrdfRichness !== null
        && preferredMjcfRichness !== null
        && isDerivedVariantUrdfForMjcf(preferredUrdf, preferredMjcf)
        && compareResolvedRobotRichness(preferredMjcfRichness, preferredUrdfRichness) <= 0
      )
    );

  if (shouldPreferMjcfOverUrdf && preferredMjcf) {
    return preferredMjcf;
  }

  if (preferredUrdf) {
    return preferredUrdf;
  }

  if (preferredMjcf) {
    return preferredMjcf;
  }

  const preferredUsd = pickPreferredUsdRootFile(robotDefinitionFiles);
  if (preferredUsd) {
    return preferredUsd;
  }

  return robotDefinitionFiles[0] || files[0] || null;
}
