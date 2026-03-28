import { GeometryType } from '@/types';
import type { UrdfLink } from '@/types';

export interface VisualGeometryEntry {
  geometry: UrdfLink['visual'];
  objectIndex: number;
  bodyIndex: number | null;
}

export function getVisualGeometryEntries(link: UrdfLink): VisualGeometryEntry[] {
  const entries: VisualGeometryEntry[] = [];

  if (link.visual.type !== GeometryType.NONE) {
    entries.push({
      geometry: link.visual,
      objectIndex: entries.length,
      bodyIndex: null,
    });
  }

  (link.visualBodies || []).forEach((body, bodyIndex) => {
    if (body.type === GeometryType.NONE) return;
    entries.push({
      geometry: body,
      objectIndex: entries.length,
      bodyIndex,
    });
  });

  return entries;
}

export function getVisualGeometryByObjectIndex(
  link: UrdfLink,
  objectIndex = 0,
): VisualGeometryEntry | null {
  const entries = getVisualGeometryEntries(link);
  if (entries.length === 0) return null;
  return entries.find((entry) => entry.objectIndex === objectIndex) || entries[0];
}

export function updateVisualGeometryByObjectIndex(
  link: UrdfLink,
  objectIndex: number,
  updates: Partial<UrdfLink['visual']>,
): UrdfLink {
  const target = getVisualGeometryByObjectIndex(link, objectIndex);

  if (!target || target.bodyIndex === null) {
    return {
      ...link,
      visual: {
        ...link.visual,
        ...updates,
      },
    };
  }

  const nextVisualBodies = [...(link.visualBodies || [])];
  nextVisualBodies[target.bodyIndex] = {
    ...nextVisualBodies[target.bodyIndex],
    ...updates,
  };

  return {
    ...link,
    visualBodies: nextVisualBodies,
  };
}
