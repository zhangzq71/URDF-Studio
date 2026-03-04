import JSZip from 'jszip';
import { parseMJCF, parseURDF, generateMujocoXML, generateURDF } from '@/core/parsers';
import { normalizeMeshPathForExport, resolveMeshAssetUrl } from '@/core/parsers/meshPathUtils';
import { GeometryType, type RobotFile, type RobotState } from '@/types';
import { downloadBlob } from './assetUtils';

export type LibraryExportFormat = 'urdf' | 'mjcf';

export interface ExportLibraryRobotFileOptions {
  file: RobotFile;
  targetFormat: LibraryExportFormat;
  assets: Record<string, string>;
}

export interface ExportLibraryRobotFileResult {
  success: boolean;
  zipFileName?: string;
  missingMeshPaths: string[];
  reason?: 'unsupported-file-format' | 'parse-failed';
}

function toRobotState(file: RobotFile): RobotState | null {
  try {
    switch (file.format) {
      case 'urdf':
        return parseURDF(file.content);
      case 'mjcf':
        return parseMJCF(file.content);
      default:
        return null;
    }
  } catch (error) {
    console.error('[LibraryExport] Failed to parse file', error);
    return null;
  }
}

function getFileBaseName(path: string): string {
  const fileName = path.split('/').pop() ?? path;
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  const trimmed = withoutExt.trim();
  return trimmed.length > 0 ? trimmed : 'robot';
}

function collectReferencedMeshes(robot: RobotState): string[] {
  const referenced = new Set<string>();
  Object.values(robot.links).forEach((link) => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      referenced.add(link.visual.meshPath);
    }
    if (link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      referenced.add(link.collision.meshPath);
    }
    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        referenced.add(body.meshPath);
      }
    });
  });
  return Array.from(referenced);
}

async function addReferencedMeshesToZip(
  robot: RobotState,
  assets: Record<string, string>,
  zip: JSZip,
): Promise<string[]> {
  const missing = new Set<string>();
  const exportedPaths = new Set<string>();
  const meshFolder = zip.folder('meshes');
  const meshes = collectReferencedMeshes(robot);

  const tasks = meshes.map(async (meshPath) => {
    const exportPath = normalizeMeshPathForExport(meshPath);
    if (!exportPath || exportedPaths.has(exportPath)) return;
    exportedPaths.add(exportPath);

    const blobUrl = resolveMeshAssetUrl(meshPath, assets);
    if (!blobUrl) {
      missing.add(meshPath);
      return;
    }

    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      meshFolder?.file(exportPath, blob);
    } catch (error) {
      console.error(`[LibraryExport] Failed to fetch mesh: ${meshPath}`, error);
      missing.add(meshPath);
    }
  });

  await Promise.all(tasks);
  return Array.from(missing);
}

export async function exportLibraryRobotFile(
  options: ExportLibraryRobotFileOptions,
): Promise<ExportLibraryRobotFileResult> {
  const { file, targetFormat, assets } = options;
  const robotState = toRobotState(file);

  if (file.format !== 'urdf' && file.format !== 'mjcf') {
    return {
      success: false,
      missingMeshPaths: [],
      reason: 'unsupported-file-format',
    };
  }

  if (!robotState) {
    return {
      success: false,
      missingMeshPaths: [],
      reason: 'parse-failed',
    };
  }

  const baseName = getFileBaseName(file.name);
  const zip = new JSZip();

  if (targetFormat === 'urdf') {
    const urdfContent = file.format === 'urdf'
      ? file.content
      : generateURDF(robotState, false);
    zip.file(`${baseName}.urdf`, urdfContent);
  } else {
    const mjcfContent = file.format === 'mjcf'
      ? file.content
      : generateMujocoXML(robotState, { meshdir: 'meshes/' });
    zip.file(`${baseName}.xml`, mjcfContent);
  }

  const missingMeshPaths = await addReferencedMeshesToZip(robotState, assets, zip);
  const blob = await zip.generateAsync({ type: 'blob' });
  const zipFileName = `${baseName}_${targetFormat}.zip`;
  downloadBlob(blob, zipFileName);

  return {
    success: true,
    zipFileName,
    missingMeshPaths,
  };
}
