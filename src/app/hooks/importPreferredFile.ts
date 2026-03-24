import type { RobotFile } from '@/types';
import { parseMJCF } from '@/core/parsers';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { pickPreferredUsdRootFile } from '@/core/parsers/usd/usdFormatUtils';

const AUXILIARY_MJCF_NAME_PATTERN = /(actuator|actuators|keyframe|position|velocity|motor|ctrl|filtered)/i;
const MJCF_IMPORT_CONTEXT_PATTERN = /(^|[/_-])(mujoco|mjcf)(?=[/_.-]|$)/i;
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

function hasMjcfImportContext(files: RobotFile[]): boolean {
  return files.some((file) => MJCF_IMPORT_CONTEXT_PATTERN.test(normalizeImportPath(file.name)));
}

function sortMjcfCandidates(left: RobotFile, right: RobotFile): number {
  const leftBase = left.name.split('/').pop() ?? left.name;
  const rightBase = right.name.split('/').pop() ?? right.name;
  const leftDir = left.name.split('/').slice(-2, -1)[0] ?? '';
  const rightDir = right.name.split('/').slice(-2, -1)[0] ?? '';
  const leftIsScene = /scene/i.test(leftBase);
  const rightIsScene = /scene/i.test(rightBase);
  if (leftIsScene !== rightIsScene) {
    return leftIsScene ? 1 : -1;
  }

  const leftIsAuxiliary = AUXILIARY_MJCF_NAME_PATTERN.test(leftBase);
  const rightIsAuxiliary = AUXILIARY_MJCF_NAME_PATTERN.test(rightBase);
  if (leftIsAuxiliary !== rightIsAuxiliary) {
    return leftIsAuxiliary ? 1 : -1;
  }

  const leftMatchesDir = leftBase.toLowerCase() === `${leftDir.toLowerCase()}.xml`
    || leftBase.toLowerCase() === `${leftDir.toLowerCase()}.mjcf`;
  const rightMatchesDir = rightBase.toLowerCase() === `${rightDir.toLowerCase()}.xml`
    || rightBase.toLowerCase() === `${rightDir.toLowerCase()}.mjcf`;
  if (leftMatchesDir !== rightMatchesDir) {
    return leftMatchesDir ? -1 : 1;
  }

  if (leftBase.length !== rightBase.length) {
    return leftBase.length - rightBase.length;
  }

  return leftBase.localeCompare(rightBase);
}

export function pickPreferredMjcfImportFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
): RobotFile | null {
  const mjcfFiles = files.filter((file) => file.format === 'mjcf');
  if (mjcfFiles.length === 0) return null;

  const sortedMjcfCandidates = [...mjcfFiles].sort(sortMjcfCandidates);

  for (const candidate of sortedMjcfCandidates) {
    try {
      const resolved = resolveMJCFSource(candidate, filePool);
      if (parseMJCF(resolved.content) !== null) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return sortedMjcfCandidates[0] ?? null;
}

export function pickPreferredImportFile(
  files: RobotFile[],
  filePool: RobotFile[] = files,
): RobotFile | null {
  const robotDefinitionFiles = files.filter((file) => file.format !== 'mesh');
  const preferredUrdf = robotDefinitionFiles.find((file) => file.format === 'urdf') ?? null;
  const preferredMjcf = pickPreferredMjcfImportFile(robotDefinitionFiles, filePool);

  const shouldPreferMjcfOverUrdf = preferredUrdf !== null
    && preferredMjcf !== null
    && (
      hasMjcfImportContext(robotDefinitionFiles)
      || !isUrdfSelfContainedInImportBundle(preferredUrdf, filePool)
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
