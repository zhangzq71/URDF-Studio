import {
  generateURDF,
  processXacro,
  parseURDF,
} from '@/core/parsers';
import { GeometryType, type RobotFile, type RobotState } from '@/types';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';

function buildMeshPreviewState(file: RobotFile): RobotState {
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
    selection: { type: null, id: null },
  };
}

/**
 * Convert a RobotFile to URDF content for preview.
 * Supports urdf, xacro, mjcf, usd, and mesh formats.
 */
export function computePreviewUrdf(
  file: RobotFile,
  availableFiles: RobotFile[],
): string | null {
  try {
    if (file.format === 'urdf') {
      return file.content;
    }

    if (file.format === 'xacro') {
      const fileMap: Record<string, string> = {};
      availableFiles.forEach((candidate) => {
        fileMap[candidate.name] = candidate.content;
      });
      const pathParts = file.name.split('/');
      pathParts.pop();
      const basePath = pathParts.join('/');
      const urdfFromXacro = processXacro(file.content, {}, fileMap, basePath);
      return parseURDF(urdfFromXacro) ? urdfFromXacro : '';
    }

    if (file.format === 'mjcf') {
      return resolveMJCFSource(file, availableFiles).content;
    }

    if (file.format === 'usd') {
      return '';
    }

    if (file.format === 'mesh') {
      return generateURDF(buildMeshPreviewState(file), { preserveMeshPaths: true });
    }
  } catch (error) {
    console.error('[filePreview] Failed to build preview:', error);
  }

  return null;
}
