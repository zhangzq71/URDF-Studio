import { GeometryType, type RobotFile } from '@/types';
import { parseMJCF, resolveRobotFileData } from '@/core/parsers';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { pickPreferredUsdRootFile } from '@/core/parsers/usd/usdFormatUtils';

const PACKAGE_REFERENCE_PATTERN = /package:\/\/([^/\s"'<>]+)/g;

function normalizeImportPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
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
  if (!normalizedPackageName) return false;

  return filePool.some((file) => {
    const normalizedPath = normalizeImportPath(file.name).toLowerCase();
    return normalizedPath === normalizedPackageName
      || normalizedPath.startsWith(`${normalizedPackageName}/`)
      || normalizedPath.includes(`/${normalizedPackageName}/`);
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

function summarizeResolvedRobotRichness(file: RobotFile, filePool: RobotFile[]): ResolvedRobotRichness | null {
  const resolved = resolveRobotFileData(file, { availableFiles: filePool });
  if (resolved.status !== 'ready') {
    return null;
  }

  let renderableLinkCount = 0;
  let visualGeometryCount = 0;
  let collisionGeometryCount = 0;
  let meshGeometryCount = 0;

  Object.values(resolved.robotData.links).forEach((link) => {
    let linkHasRenderableGeometry = false;

    if (link.visual.type !== GeometryType.NONE) {
      visualGeometryCount += 1;
      linkHasRenderableGeometry = true;
      if (link.visual.type === GeometryType.MESH) {
        meshGeometryCount += 1;
      }
    }

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
): RobotFile | null {
  const mjcfFiles = files.filter((file) => file.format === 'mjcf');
  if (mjcfFiles.length === 0) return null;

  const parseableCandidates = mjcfFiles.flatMap((candidate) => {
    try {
      const resolved = resolveMJCFSource(candidate, filePool);
      if (parseMJCF(resolved.content) === null) {
        return [];
      }

      return [{
        file: candidate,
        structure: collectMjcfCandidateStructure(candidate.content),
      }];
    } catch {
      return [];
    }
  });

  parseableCandidates.sort((left, right) => {
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

  if (parseableCandidates.length > 0) {
    return parseableCandidates[0]!.file;
  }

  return mjcfFiles[0] ?? null;
}

export function pickPreferredImportFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
): RobotFile | null {
  const robotDefinitionFiles = files.filter((file) => file.format !== 'mesh');
  const preferredUrdf = robotDefinitionFiles.find((file) => file.format === 'urdf') ?? null;
  const preferredMjcf = pickPreferredMjcfImportFile(robotDefinitionFiles, filePool);
  const preferredUrdfIsSelfContained = preferredUrdf
    ? isUrdfSelfContainedInImportBundle(preferredUrdf, filePool)
    : false;

  const preferredUrdfRichness = preferredUrdf && preferredMjcf && preferredUrdfIsSelfContained
    ? summarizeResolvedRobotRichness(preferredUrdf, filePool)
    : null;
  const preferredMjcfRichness = preferredUrdf && preferredMjcf && preferredUrdfIsSelfContained
    ? summarizeResolvedRobotRichness(preferredMjcf, filePool)
    : null;

  const shouldPreferMjcfOverUrdf = preferredUrdf !== null
    && preferredMjcf !== null
    && (
      !preferredUrdfIsSelfContained
      || isMateriallyRicherRobotCandidate(preferredMjcfRichness, preferredUrdfRichness)
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
