import { DEFAULT_LINK, GeometryType, type RobotData, type RobotFile, type RobotState } from '@/types';
import { parseURDF } from './urdf/parser';
import { parseMJCF } from './mjcf/mjcfParser';
import { resolveMJCFSource } from './mjcf/mjcfSourceResolver';
import { parseSDF } from './sdf/sdfParser';
import { processXacro } from './xacro/xacroParser';
import { rewriteRobotMeshPathsForSource } from './meshPathUtils';
import { syncRobotVisualColorsFromMaterials } from '@/core/robot/materials';

export interface ResolveRobotFileDataOptions {
  availableFiles?: RobotFile[];
  assets?: Record<string, string>;
  allFileContents?: Record<string, string>;
  usdRobotData?: RobotData | null;
}

export type RobotImportErrorReason = 'parse_failed' | 'unsupported_format' | 'source_only_fragment';

export type RobotImportResult =
  | {
    status: 'ready';
    format: RobotFile['format'];
    robotData: RobotData;
    resolvedUrdfContent: string | null;
    resolvedUrdfSourceFilePath: string | null;
  }
  | {
    status: 'needs_hydration';
    format: 'usd';
  }
  | {
    status: 'error';
    format: RobotFile['format'];
    reason: RobotImportErrorReason;
  };

function toRobotData(robot: RobotState | RobotData): RobotData {
  return {
    name: robot.name,
    links: robot.links,
    joints: robot.joints,
    rootLinkId: robot.rootLinkId,
    materials: robot.materials,
    closedLoopConstraints: robot.closedLoopConstraints,
  };
}

export function createUsdPlaceholderRobotData(file: RobotFile): RobotData {
  const robotName = file.name.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'usd_scene';
  const linkId = 'usd_scene_root';

  return {
    name: robotName,
    links: {
      [linkId]: {
        ...DEFAULT_LINK,
        id: linkId,
        name: 'usd_scene_root',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
        },
        inertial: {
          ...DEFAULT_LINK.inertial,
          mass: 0,
        },
      },
    },
    joints: {},
    rootLinkId: linkId,
  };
}

function createMeshRobotData(file: RobotFile): RobotData {
  const meshName = file.name.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'mesh';
  const linkId = 'base_link';

  return {
    name: meshName,
    links: {
      [linkId]: {
        id: linkId,
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#808080',
          meshPath: file.name,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 1.0,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 0.1, ixy: 0, ixz: 0, iyy: 0.1, iyz: 0, izz: 0.1 },
        },
      },
    },
    joints: {},
    rootLinkId: linkId,
  };
}

function createReadyImportResult(
  file: RobotFile,
  robotData: RobotData,
  options: {
    sourceFilePath?: string;
    resolvedUrdfContent?: string | null;
  } = {},
): RobotImportResult {
  const {
    sourceFilePath = file.name,
    resolvedUrdfContent = null,
  } = options;

  return {
    status: 'ready',
    format: file.format,
    robotData: syncRobotVisualColorsFromMaterials(
      rewriteRobotMeshPathsForSource(robotData, sourceFilePath),
    ),
    resolvedUrdfContent,
    resolvedUrdfSourceFilePath: resolvedUrdfContent ? sourceFilePath : null,
  };
}

function createErrorImportResult(file: RobotFile, reason: RobotImportErrorReason): RobotImportResult {
  return {
    status: 'error',
    format: file.format,
    reason,
  };
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getFileName(filePath: string): string {
  const normalized = normalizeFilePath(filePath);
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

export function isStandaloneXacroEntry(file: RobotFile): boolean {
  const lowerName = getFileName(file.name).toLowerCase();
  return lowerName === 'robot.xacro' || lowerName.endsWith('.urdf.xacro');
}

export function findStandaloneXacroTruthFile(
  file: RobotFile,
  availableFiles: RobotFile[],
): RobotFile | null {
  if (!isStandaloneXacroEntry(file)) {
    return null;
  }

  const normalizedFileName = normalizeFilePath(file.name);
  const pathParts = normalizedFileName.split('/');
  if (pathParts.length < 3) {
    return null;
  }

  const packageDir = pathParts.slice(0, -2).join('/');
  const packageName = pathParts[pathParts.length - 3] || '';
  const urdfDir = `${packageDir}/urdf/`;

  const candidateTruthFiles = availableFiles.filter((candidate) => {
    if (candidate.format !== 'urdf') {
      return false;
    }

    return normalizeFilePath(candidate.name).startsWith(urdfDir);
  });

  if (candidateTruthFiles.length === 0) {
    return null;
  }

  const preferredFileNames = [
    `${packageName}.urdf`,
    `${packageName.replace(/_description$/i, '')}.urdf`,
    `${getFileName(normalizedFileName).replace(/\.xacro$/i, '')}.urdf`,
  ];

  for (const preferredFileName of preferredFileNames) {
    const match = candidateTruthFiles.find((candidate) => getFileName(candidate.name) === preferredFileName);
    if (match) {
      return match;
    }
  }

  return candidateTruthFiles.length === 1 ? candidateTruthFiles[0] : null;
}

export function isSourceOnlyXacroDocument(urdfContent: string): boolean {
  return /<robot\b/i.test(urdfContent) && !/<link\b/i.test(urdfContent);
}

export function resolveRobotFileData(
  file: RobotFile,
  options: ResolveRobotFileDataOptions = {},
): RobotImportResult {
  const {
    availableFiles = [],
    assets = {},
    allFileContents = {},
    usdRobotData = null,
  } = options;

  try {
    switch (file.format) {
      case 'urdf': {
        const parsed = parseURDF(file.content);
        return parsed
          ? createReadyImportResult(file, toRobotData(parsed))
          : createErrorImportResult(file, 'parse_failed');
      }
      case 'mjcf': {
        const resolved = resolveMJCFSource(file, availableFiles);
        const parsed = parseMJCF(resolved.content);
        return parsed
          ? createReadyImportResult(file, toRobotData(parsed))
          : createErrorImportResult(file, 'parse_failed');
      }
      case 'sdf': {
        const parsed = parseSDF(file.content, {
          allFileContents,
          sourcePath: file.name,
        });
        return parsed
          ? createReadyImportResult(file, toRobotData(parsed))
          : createErrorImportResult(file, 'parse_failed');
      }
      case 'usd':
        return usdRobotData
          ? createReadyImportResult(file, usdRobotData)
          : {
            status: 'needs_hydration',
            format: 'usd',
          };
      case 'xacro': {
        const truthFile = findStandaloneXacroTruthFile(file, availableFiles);
        if (truthFile) {
          const truthRobot = parseURDF(truthFile.content);
          if (truthRobot) {
            return createReadyImportResult(file, toRobotData(truthRobot), {
              sourceFilePath: truthFile.name,
              resolvedUrdfContent: truthFile.content,
            });
          }
        }

        const fileMap: Record<string, string> = {};
        availableFiles.forEach((candidate) => {
          fileMap[candidate.name] = candidate.content;
        });
        Object.entries(allFileContents).forEach(([path, content]) => {
          if (typeof content === 'string') {
            fileMap[path] = content;
          }
        });
        Object.entries(assets).forEach(([path, content]) => {
          if (typeof content === 'string') {
            fileMap[path] = content;
          }
        });
        const pathParts = file.name.split('/');
        pathParts.pop();
        const urdfContent = processXacro(file.content, {}, fileMap, pathParts.join('/'));
        const parsed = parseURDF(urdfContent);
        if (parsed) {
          return createReadyImportResult(file, toRobotData(parsed), {
            resolvedUrdfContent: urdfContent,
          });
        }

        return createErrorImportResult(
          file,
          isSourceOnlyXacroDocument(urdfContent) ? 'source_only_fragment' : 'parse_failed',
        );
      }
      case 'mesh':
        return createReadyImportResult(file, createMeshRobotData(file));
      default:
        return createErrorImportResult(file, 'unsupported_format');
    }
  } catch (error) {
    console.error('[importRobotFile] Failed to resolve robot file:', error);
    return createErrorImportResult(file, 'parse_failed');
  }
}
