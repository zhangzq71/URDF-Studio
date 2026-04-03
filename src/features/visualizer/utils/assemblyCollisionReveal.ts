import type { AssemblyState } from '@/types';

import {
  buildAssemblyComponentMeshLoadKeyMap,
  collectAssemblyMeshLoadKeysForComponents,
  resolveReadyAssemblyMeshComponentIds,
} from './assemblyMeshLoadState';
import { collectVisualizerCollisionMeshPreloadSpecs } from './visualizerMeshLoading';

export function collectAssemblyCollisionMeshLoadKeysByComponent({
  assemblyState,
  assets,
}: {
  assemblyState: AssemblyState | null | undefined;
  assets: Record<string, string>;
}): {
  componentMeshLoadKeyMap: Map<string, Set<string>>;
  componentMeshLoadKeys: Record<string, string[]>;
} {
  const meshLoadKeys: string[] = [];

  Object.values(assemblyState?.components ?? {}).forEach((component) => {
    if (component.visible === false) {
      return;
    }

    collectVisualizerCollisionMeshPreloadSpecs({
      robot: component.robot,
      assets,
    }).forEach((spec) => {
      meshLoadKeys.push(...spec.meshLoadKeys);
    });
  });

  const componentMeshLoadKeyMap = buildAssemblyComponentMeshLoadKeyMap({
    assemblyState,
    meshLoadKeys,
  });
  const componentMeshLoadKeys = Object.fromEntries(
    Array.from(componentMeshLoadKeyMap.entries()).map(([componentId, keys]) => [
      componentId,
      Array.from(keys),
    ]),
  ) as Record<string, string[]>;

  return {
    componentMeshLoadKeyMap,
    componentMeshLoadKeys,
  };
}

export function resolveAssemblyCollisionRevealState({
  assemblyState,
  componentMeshLoadKeys,
  resolvedMeshLoadKeys,
}: {
  assemblyState: AssemblyState | null | undefined;
  componentMeshLoadKeys: Record<string, readonly string[]>;
  resolvedMeshLoadKeys: ReadonlySet<string>;
}): {
  readyComponentIds: Set<string>;
  readyMeshLoadKeys: Set<string>;
  totalTrackedComponentCount: number;
} {
  const componentMeshLoadKeyMap = new Map<string, Set<string>>(
    Object.entries(componentMeshLoadKeys).map(([componentId, keys]) => [
      componentId,
      new Set(keys),
    ]),
  );
  const readyComponentIds = new Set(
    resolveReadyAssemblyMeshComponentIds({
      assemblyState,
      componentMeshLoadKeyMap,
      resolvedMeshLoadKeys,
      includeEmptyComponents: false,
    }),
  );
  const readyMeshLoadKeys = collectAssemblyMeshLoadKeysForComponents({
    componentIds: readyComponentIds,
    componentMeshLoadKeyMap,
  });
  const totalTrackedComponentCount = Object.values(assemblyState?.components ?? {}).filter(
    (component) =>
      component.visible !== false && (componentMeshLoadKeyMap.get(component.id)?.size ?? 0) > 0,
  ).length;

  return {
    readyComponentIds,
    readyMeshLoadKeys,
    totalTrackedComponentCount,
  };
}
