import { findAssetByPath } from '@/core/loaders/meshLoader';
import { getSourceFileDirectory } from '@/core/parsers/meshPathUtils';
import { getCollisionGeometryEntries, getVisualGeometryEntries } from '@/core/robot';
import {
  GeometryType,
  type AppMode,
  type RobotData,
  type RobotState,
  type UrdfLink,
  type UrdfVisual,
} from '@/types';
import { resolveGeometryVisibilityState } from '../components/nodes/geometryVisibility';

const SUPPORTED_MESH_EXTENSIONS = new Set(['stl', 'obj', 'dae', 'gltf', 'glb']);

type VisualizerMode = AppMode;

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

export interface VisualizerMeshPreloadSpec {
  assetBaseDir: string;
  assetUrl: string;
  extension: string;
  meshLoadKeys: string[];
  meshPath: string;
}

interface ResolveVisualizerCollisionMeshPrewarmConcurrencyOptions {
  hardwareConcurrency?: number;
  specCount: number;
}

function getMeshExtension(meshPath?: string): string | null {
  const extension = meshPath?.split('.').pop()?.toLowerCase() ?? null;
  return extension && SUPPORTED_MESH_EXTENSIONS.has(extension) ? extension : null;
}

function resolveMeshPreloadSpec(
  meshPath: string | undefined,
  assets: Record<string, string>,
): VisualizerMeshPreloadSpec | null {
  const extension = getMeshExtension(meshPath);
  if (!meshPath || !extension) {
    return null;
  }

  const assetUrl = findAssetByPath(meshPath, assets);
  if (!assetUrl) {
    return null;
  }

  return {
    assetBaseDir: getSourceFileDirectory(meshPath),
    assetUrl,
    extension,
    meshLoadKeys: [],
    meshPath,
  };
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

  if (link.visible === false) {
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
    getVisualGeometryEntries(link).forEach((entry) => {
      if (
        !shouldTrackMeshGeometry({
          link,
          geometry: entry.geometry,
          isCollision: false,
          mode,
          showGeometry,
          showCollision,
          assets,
        })
      ) {
        return;
      }

      keys.push(
        buildVisualizerMeshLoadKey({
          linkId: link.id,
          geometryRole: 'visual',
          geometryId: entry.bodyIndex === null ? 'primary' : `extra-${entry.bodyIndex + 1}`,
          objectIndex: entry.objectIndex,
          meshPath: entry.geometry.meshPath!,
        }),
      );
    });

    getCollisionGeometryEntries(link).forEach((entry) => {
      if (
        !shouldTrackMeshGeometry({
          link,
          geometry: entry.geometry,
          isCollision: true,
          mode,
          showGeometry,
          showCollision,
          assets,
        })
      ) {
        return;
      }

      keys.push(
        buildVisualizerMeshLoadKey({
          linkId: link.id,
          geometryRole: 'collision',
          geometryId: entry.bodyIndex === null ? 'primary' : `extra-${entry.bodyIndex + 1}`,
          objectIndex: entry.objectIndex,
          meshPath: entry.geometry.meshPath!,
        }),
      );
    });
  });

  return keys;
}

export function collectVisualizerCollisionMeshPreloadSpecs({
  robot,
  assets,
}: {
  robot: Pick<RobotData, 'links'>;
  assets: Record<string, string>;
}): VisualizerMeshPreloadSpec[] {
  const specsByAssetUrl = new Map<string, VisualizerMeshPreloadSpec>();

  Object.values(robot.links).forEach((link) => {
    if (link.visible === false) {
      return;
    }

    getCollisionGeometryEntries(link).forEach((entry) => {
      const geometry = entry.geometry;
      if (!geometry || geometry.visible === false || geometry.type !== GeometryType.MESH) {
        return;
      }

      const spec = resolveMeshPreloadSpec(geometry.meshPath, assets);
      if (!spec) {
        return;
      }

      const meshLoadKey = buildVisualizerMeshLoadKey({
        linkId: link.id,
        geometryRole: 'collision',
        geometryId: entry.bodyIndex === null ? 'primary' : `extra-${entry.bodyIndex + 1}`,
        objectIndex: entry.objectIndex,
        meshPath: geometry.meshPath!,
      });
      const existingSpec = specsByAssetUrl.get(spec.assetUrl);
      if (!existingSpec) {
        specsByAssetUrl.set(spec.assetUrl, {
          ...spec,
          meshLoadKeys: [meshLoadKey],
        });
        return;
      }

      if (!existingSpec.meshLoadKeys.includes(meshLoadKey)) {
        existingSpec.meshLoadKeys.push(meshLoadKey);
      }
    });
  });

  return Array.from(specsByAssetUrl.values());
}

export function resolveVisualizerCollisionMeshPrewarmConcurrency({
  hardwareConcurrency = typeof navigator !== 'undefined'
    ? Number(navigator.hardwareConcurrency || 2)
    : 2,
  specCount,
}: ResolveVisualizerCollisionMeshPrewarmConcurrencyOptions): number {
  const normalizedSpecCount = Math.max(0, Math.floor(specCount));
  if (normalizedSpecCount <= 1) {
    return normalizedSpecCount;
  }

  const normalizedHardwareConcurrency =
    Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : 2;
  // Keep the background preload bounded so it can exploit existing mesh parse
  // worker pools without flooding the main thread or network with one task per
  // mesh or per robot.
  const concurrencyBudget = Math.max(1, Math.min(4, Math.ceil(normalizedHardwareConcurrency / 3)));

  return Math.min(normalizedSpecCount, concurrencyBudget);
}
