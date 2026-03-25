import { findAssetByPath } from '@/core/loaders/meshLoader';
import { getCollisionGeometryEntries } from '@/core/robot';
import { GeometryType, type RobotState, type UrdfLink, type UrdfVisual } from '@/types';
import { resolveGeometryVisibilityState } from '../components/nodes/geometryVisibility';

const SUPPORTED_MESH_EXTENSIONS = new Set(['stl', 'obj', 'dae']);

type VisualizerMode = 'skeleton' | 'detail' | 'hardware';

interface BuildVisualizerMeshLoadKeyOptions {
  linkId: string;
  geometryRole: 'visual' | 'collision';
  geometryId: string;
  objectIndex: number;
  meshPath: string;
}

interface CollectVisualizerMeshLoadKeysOptions {
  robot: RobotState;
  mode: VisualizerMode;
  showGeometry: boolean;
  showCollision: boolean;
  assets: Record<string, string>;
}

function getMeshExtension(meshPath?: string): string | null {
  const extension = meshPath?.split('.').pop()?.toLowerCase() ?? null;
  return extension && SUPPORTED_MESH_EXTENSIONS.has(extension) ? extension : null;
}

function shouldTrackMeshGeometry({
  link,
  geometry,
  isCollision,
  mode,
  showGeometry,
  showCollision,
  assets,
}: {
  link: UrdfLink;
  geometry: UrdfVisual | undefined;
  isCollision: boolean;
  mode: VisualizerMode;
  showGeometry: boolean;
  showCollision: boolean;
  assets: Record<string, string>;
}) {
  if (!geometry || geometry.visible === false) {
    return false;
  }

  if (geometry.type !== GeometryType.MESH || !geometry.meshPath) {
    return false;
  }

  if (mode === 'detail' && !isCollision && link.visible === false) {
    return false;
  }

  const visibilityState = resolveGeometryVisibilityState({
    mode,
    isCollision,
    showGeometry,
    showCollision,
  });
  if (!visibilityState.shouldRender) {
    return false;
  }

  if (!getMeshExtension(geometry.meshPath)) {
    return false;
  }

  return Boolean(findAssetByPath(geometry.meshPath, assets));
}

export function buildVisualizerMeshLoadKey({
  linkId,
  geometryRole,
  geometryId,
  objectIndex,
  meshPath,
}: BuildVisualizerMeshLoadKeyOptions): string {
  return [linkId, geometryRole, geometryId, String(objectIndex), meshPath].join('|');
}

export function collectVisualizerMeshLoadKeys({
  robot,
  mode,
  showGeometry,
  showCollision,
  assets,
}: CollectVisualizerMeshLoadKeysOptions): string[] {
  const keys: string[] = [];

  Object.values(robot.links).forEach((link) => {
    if (shouldTrackMeshGeometry({
      link,
      geometry: link.visual,
      isCollision: false,
      mode,
      showGeometry,
      showCollision,
      assets,
    })) {
      keys.push(buildVisualizerMeshLoadKey({
        linkId: link.id,
        geometryRole: 'visual',
        geometryId: 'primary',
        objectIndex: 0,
        meshPath: link.visual.meshPath!,
      }));
    }

    getCollisionGeometryEntries(link).forEach((entry) => {
      if (!shouldTrackMeshGeometry({
        link,
        geometry: entry.geometry,
        isCollision: true,
        mode,
        showGeometry,
        showCollision,
        assets,
      })) {
        return;
      }

      keys.push(buildVisualizerMeshLoadKey({
        linkId: link.id,
        geometryRole: 'collision',
        geometryId: entry.bodyIndex === null ? 'primary' : `extra-${entry.bodyIndex + 1}`,
        objectIndex: entry.objectIndex,
        meshPath: entry.geometry.meshPath!,
      }));
    });
  });

  return keys;
}
