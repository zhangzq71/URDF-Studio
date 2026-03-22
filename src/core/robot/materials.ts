import { GeometryType, type RobotData, type UrdfLink } from '@/types';

type RobotMaterials = RobotData['materials'];
type RobotMaterialEntry = NonNullable<RobotMaterials>[string];

function normalizeMaterialValue(value?: string | null): string | undefined {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : undefined;
}

function materialEntriesEqual(
  left: RobotMaterialEntry | undefined,
  right: RobotMaterialEntry | undefined,
): boolean {
  return left?.color === right?.color
    && left?.texture === right?.texture;
}

function resolveExistingMaterialEntry(
  materials: RobotMaterials | undefined,
  nextLink: UrdfLink,
  previousLink?: UrdfLink,
): RobotMaterialEntry | undefined {
  return materials?.[nextLink.id]
    || materials?.[nextLink.name]
    || (previousLink?.name ? materials?.[previousLink.name] : undefined);
}

export function syncRobotMaterialsForLinkUpdate(
  materials: RobotMaterials | undefined,
  nextLink: UrdfLink,
  previousLink?: UrdfLink,
): RobotMaterials | undefined {
  const existingEntry = resolveExistingMaterialEntry(materials, nextLink, previousLink);
  const shouldTrackEntry = nextLink.visual.type !== GeometryType.NONE
    || Boolean(existingEntry?.color || existingEntry?.texture);

  if (!shouldTrackEntry) {
    return materials;
  }

  const nextEntry: RobotMaterialEntry = {
    ...(existingEntry || {}),
  };
  const nextColor = normalizeMaterialValue(nextLink.visual.color);

  if (nextColor) {
    nextEntry.color = nextColor;
  } else {
    delete nextEntry.color;
  }

  if (!nextEntry.color && !nextEntry.texture) {
    if (!materials || !Object.prototype.hasOwnProperty.call(materials, nextLink.id)) {
      return materials;
    }

    const nextMaterials = { ...materials };
    delete nextMaterials[nextLink.id];
    return Object.keys(nextMaterials).length > 0 ? nextMaterials : undefined;
  }

  const currentIdEntry = materials?.[nextLink.id];
  if (materialEntriesEqual(currentIdEntry, nextEntry)) {
    return materials;
  }

  return {
    ...(materials || {}),
    [nextLink.id]: nextEntry,
  };
}
