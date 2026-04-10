import type { RobotData, UrdfVisual } from '@/types';
import { DEFAULT_VISUAL_COLOR, GeometryType } from '@/types';
import { syncRobotMaterialsForLinkUpdate } from '@/core/robot/materials';
import { resolveMeshTextAuthoredMaterials } from './meshTextMaterialMetadata';

type RobotMaterialEntry = NonNullable<RobotData['materials']>[string];

const IMPLICIT_MESH_PREVIEW_COLOR = '#808080';

function normalizeMaterialValue(value?: string | null): string | undefined {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : undefined;
}

function hasAuthoredMaterialOverride(
  geometry: Pick<UrdfVisual, 'authoredMaterials'> | null | undefined,
): boolean {
  return (geometry?.authoredMaterials?.length ?? 0) > 0;
}

function isImplicitMeshFallbackColor(value?: string | null): boolean {
  const normalized = normalizeMaterialValue(value)?.toLowerCase();
  return (
    !normalized ||
    normalized === DEFAULT_VISUAL_COLOR.toLowerCase() ||
    normalized === IMPLICIT_MESH_PREVIEW_COLOR
  );
}

function shouldBackfillMeshMaterials(
  geometry: UrdfVisual | null | undefined,
  existingMaterial?: RobotMaterialEntry,
): geometry is UrdfVisual & { meshPath: string } {
  return (
    geometry?.type === GeometryType.MESH &&
    typeof geometry.meshPath === 'string' &&
    geometry.meshPath.trim().length > 0 &&
    isImplicitMeshFallbackColor(geometry.color) &&
    !hasAuthoredMaterialOverride(geometry) &&
    !normalizeMaterialValue(existingMaterial?.color) &&
    !normalizeMaterialValue(existingMaterial?.texture)
  );
}

function syncGeometryMeshMaterials(
  geometry: UrdfVisual,
  options: {
    allFileContents?: Record<string, string>;
    assetPaths?: Iterable<string>;
  },
  existingMaterial?: RobotMaterialEntry,
): UrdfVisual {
  if (!shouldBackfillMeshMaterials(geometry, existingMaterial)) {
    return geometry;
  }

  const authoredMaterials = resolveMeshTextAuthoredMaterials(geometry.meshPath, options);
  if (authoredMaterials.length === 0) {
    return geometry;
  }

  if (authoredMaterials.length > 1) {
    return {
      ...geometry,
      color: '',
      authoredMaterials,
    };
  }

  const [primaryMaterial] = authoredMaterials;
  const nextColor =
    normalizeMaterialValue(primaryMaterial?.color) ??
    (normalizeMaterialValue(primaryMaterial?.texture) ? '#ffffff' : undefined);

  return {
    ...geometry,
    ...(nextColor ? { color: nextColor } : { color: '' }),
    authoredMaterials,
  };
}

export function syncRobotMeshTextMaterialMetadata(
  robotData: RobotData,
  options: {
    allFileContents?: Record<string, string>;
    assetPaths?: Iterable<string>;
  } = {},
): RobotData {
  const assetPathEntries = options.assetPaths ? Array.from(options.assetPaths) : [];
  if (Object.keys(options.allFileContents ?? {}).length === 0 && assetPathEntries.length === 0) {
    return robotData;
  }

  let linksChanged = false;
  let nextMaterials = robotData.materials;

  const nextLinks = Object.fromEntries(
    Object.entries(robotData.links).map(([linkId, link]) => {
      const existingMaterial = robotData.materials?.[link.id] ?? robotData.materials?.[link.name];
      let linkChanged = false;

      const nextVisual = syncGeometryMeshMaterials(link.visual, options, existingMaterial);
      if (nextVisual !== link.visual) {
        linkChanged = true;
      }

      const nextVisualBodies = link.visualBodies?.map((geometry) => {
        const nextGeometry = syncGeometryMeshMaterials(geometry, options);
        if (nextGeometry !== geometry) {
          linkChanged = true;
        }
        return nextGeometry;
      });

      if (!linkChanged) {
        return [linkId, link];
      }

      linksChanged = true;
      const nextLink = {
        ...link,
        visual: nextVisual,
        ...(nextVisualBodies ? { visualBodies: nextVisualBodies } : {}),
      };
      nextMaterials = syncRobotMaterialsForLinkUpdate(nextMaterials, nextLink, link);
      return [linkId, nextLink];
    }),
  ) as RobotData['links'];

  if (!linksChanged) {
    return robotData;
  }

  return {
    ...robotData,
    links: nextLinks,
    ...(nextMaterials ? { materials: nextMaterials } : {}),
  };
}
