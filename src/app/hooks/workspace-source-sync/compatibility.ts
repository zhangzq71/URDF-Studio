import type { AssemblyState, UrdfJoint } from '@/types';

export function areJointSourceCompatible(
  previous: Record<string, UrdfJoint>,
  next: Record<string, UrdfJoint>,
): boolean {
  type ComparableJoint = UrdfJoint & { angle?: number };
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of nextKeys) {
    const previousJoint = previous[key] as ComparableJoint | undefined;
    const nextJoint = next[key] as ComparableJoint | undefined;
    if (!previousJoint || !nextJoint) {
      return false;
    }
    if (previousJoint === nextJoint) {
      continue;
    }

    const comparedKeys = new Set<keyof ComparableJoint>([
      ...(Object.keys(previousJoint) as Array<keyof ComparableJoint>),
      ...(Object.keys(nextJoint) as Array<keyof ComparableJoint>),
    ]);

    for (const comparedKey of comparedKeys) {
      if (comparedKey === 'angle') {
        continue;
      }
      if (previousJoint[comparedKey] !== nextJoint[comparedKey]) {
        return false;
      }
    }
  }

  return true;
}

export function buildVisibleAssemblyState(
  assemblyState: AssemblyState | null,
): AssemblyState | null {
  if (!assemblyState) {
    return null;
  }

  const visibleComponents = Object.fromEntries(
    Object.entries(assemblyState.components).filter(([, component]) => component.visible !== false),
  );
  if (Object.keys(visibleComponents).length === 0) {
    return null;
  }

  const visibleComponentIds = new Set(Object.keys(visibleComponents));
  const visibleBridges = Object.fromEntries(
    Object.entries(assemblyState.bridges).filter(
      ([, bridge]) =>
        visibleComponentIds.has(bridge.parentComponentId) &&
        visibleComponentIds.has(bridge.childComponentId),
    ),
  );

  return {
    ...assemblyState,
    components: visibleComponents,
    bridges: visibleBridges,
  };
}
