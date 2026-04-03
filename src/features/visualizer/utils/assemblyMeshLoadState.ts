import type { AssemblyState } from '@/types';

export function buildAssemblyComponentMeshLoadKeyMap({
  assemblyState,
  meshLoadKeys,
}: {
  assemblyState: AssemblyState | null | undefined;
  meshLoadKeys: readonly string[];
}): Map<string, Set<string>> {
  const componentMeshLoadKeyMap = new Map<string, Set<string>>();
  if (!assemblyState) {
    return componentMeshLoadKeyMap;
  }

  const componentIdByLinkId = new Map<string, string>();
  Object.values(assemblyState.components).forEach((component) => {
    if (component.visible === false) {
      return;
    }

    componentMeshLoadKeyMap.set(component.id, new Set<string>());
    Object.keys(component.robot.links).forEach((linkId) => {
      componentIdByLinkId.set(linkId, component.id);
    });
  });

  meshLoadKeys.forEach((meshLoadKey) => {
    const [linkId] = meshLoadKey.split('|');
    if (!linkId) {
      return;
    }

    const componentId = componentIdByLinkId.get(linkId);
    if (!componentId) {
      return;
    }

    componentMeshLoadKeyMap.get(componentId)?.add(meshLoadKey);
  });

  return componentMeshLoadKeyMap;
}

export function buildAssemblyComponentLinkOwnerMap(
  assemblyState: AssemblyState | null | undefined,
): Map<string, string> {
  const componentIdByLinkId = new Map<string, string>();
  if (!assemblyState) {
    return componentIdByLinkId;
  }

  Object.values(assemblyState.components).forEach((component) => {
    if (component.visible === false) {
      return;
    }

    Object.keys(component.robot.links).forEach((linkId) => {
      componentIdByLinkId.set(linkId, component.id);
    });
  });

  return componentIdByLinkId;
}

export function resolveReadyAssemblyMeshComponentIds({
  assemblyState,
  componentMeshLoadKeyMap,
  resolvedMeshLoadKeys,
  includeEmptyComponents = true,
}: {
  assemblyState: AssemblyState | null | undefined;
  componentMeshLoadKeyMap: ReadonlyMap<string, ReadonlySet<string>>;
  resolvedMeshLoadKeys: ReadonlySet<string>;
  includeEmptyComponents?: boolean;
}): string[] {
  if (!assemblyState) {
    return [];
  }

  return Object.values(assemblyState.components)
    .filter((component) => component.visible !== false)
    .map((component) => component.id)
    .filter((componentId) => {
      const componentMeshLoadKeys = componentMeshLoadKeyMap.get(componentId);
      if (!componentMeshLoadKeys || componentMeshLoadKeys.size === 0) {
        return includeEmptyComponents;
      }

      for (const meshLoadKey of componentMeshLoadKeys) {
        if (!resolvedMeshLoadKeys.has(meshLoadKey)) {
          return false;
        }
      }

      return true;
    });
}

export function collectAssemblyMeshLoadKeysForComponents({
  componentIds,
  componentMeshLoadKeyMap,
}: {
  componentIds: Iterable<string>;
  componentMeshLoadKeyMap: ReadonlyMap<string, ReadonlySet<string>>;
}): Set<string> {
  const meshLoadKeys = new Set<string>();

  for (const componentId of componentIds) {
    const componentMeshLoadKeys = componentMeshLoadKeyMap.get(componentId);
    if (!componentMeshLoadKeys) {
      continue;
    }

    componentMeshLoadKeys.forEach((meshLoadKey) => {
      meshLoadKeys.add(meshLoadKey);
    });
  }

  return meshLoadKeys;
}
