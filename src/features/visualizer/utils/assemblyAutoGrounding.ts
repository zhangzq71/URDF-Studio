import { cloneAssemblyTransform } from '@/core/robot/assemblyTransforms';
import { getLowestMeshZ } from '@/shared/utils';
import type { AssemblyState, AssemblyTransform, RobotData } from '@/types';
import type * as THREE from 'three';
import { resolveAssemblyComponentTransformTarget } from './assemblyTransformControlsShared';

export interface AssemblyAutoGroundAdjustment {
  componentId: string;
  transform: AssemblyTransform;
}

export interface AssemblyAutoGroundResolution {
  adjustments: AssemblyAutoGroundAdjustment[];
  measuredComponentIds: string[];
}

export interface AssemblyAutoGroundTrackingState {
  initialized: boolean;
  knownComponentIds: Set<string>;
  pendingComponentIds: Set<string>;
}

interface ResolveAssemblyAutoGroundingOptions {
  robot: Pick<RobotData, 'joints'>;
  assemblyState: AssemblyState | null | undefined;
  jointPivots: Record<string, THREE.Group | null>;
  groundPlaneOffset: number;
  tolerance?: number;
  componentIds?: readonly string[] | null;
}

interface ResolveReadyAssemblyAutoGroundComponentIdsOptions {
  assemblyState: AssemblyState | null | undefined;
  pendingComponentIds: Iterable<string>;
  expectedMeshLoadKeys: readonly string[];
  resolvedMeshLoadKeys: ReadonlySet<string>;
}

function buildLiveAssemblyComponentIdSet(
  assemblyState: AssemblyState | null | undefined,
): Set<string> {
  return new Set(Object.keys(assemblyState?.components ?? {}));
}

export function createInitialAssemblyAutoGroundTrackingState(): AssemblyAutoGroundTrackingState {
  return {
    initialized: false,
    knownComponentIds: new Set<string>(),
    pendingComponentIds: new Set<string>(),
  };
}

export function resolveNextAssemblyAutoGroundTrackingState({
  previousState,
  assemblyState,
}: {
  previousState: AssemblyAutoGroundTrackingState;
  assemblyState: AssemblyState | null | undefined;
}): AssemblyAutoGroundTrackingState {
  if (!assemblyState) {
    return createInitialAssemblyAutoGroundTrackingState();
  }

  const liveComponentIds = buildLiveAssemblyComponentIdSet(assemblyState);

  if (!previousState.initialized) {
    return {
      initialized: true,
      knownComponentIds: liveComponentIds,
      pendingComponentIds: new Set<string>(),
    };
  }

  const nextKnownComponentIds = new Set<string>();
  const nextPendingComponentIds = new Set<string>();

  previousState.knownComponentIds.forEach((componentId) => {
    if (liveComponentIds.has(componentId)) {
      nextKnownComponentIds.add(componentId);
    }
  });
  previousState.pendingComponentIds.forEach((componentId) => {
    if (liveComponentIds.has(componentId)) {
      nextPendingComponentIds.add(componentId);
    }
  });

  liveComponentIds.forEach((componentId) => {
    if (!nextKnownComponentIds.has(componentId)) {
      nextKnownComponentIds.add(componentId);
      nextPendingComponentIds.add(componentId);
    }
  });

  return {
    initialized: true,
    knownComponentIds: nextKnownComponentIds,
    pendingComponentIds: nextPendingComponentIds,
  };
}

export function resolveReadyAssemblyAutoGroundComponentIds({
  assemblyState,
  pendingComponentIds,
  expectedMeshLoadKeys,
  resolvedMeshLoadKeys,
}: ResolveReadyAssemblyAutoGroundComponentIdsOptions): string[] {
  if (!assemblyState) {
    return [];
  }

  return [...pendingComponentIds].filter((componentId) => {
    const component = assemblyState.components[componentId];
    if (!component || component.visible === false) {
      return false;
    }

    const componentLinkIds = new Set(Object.keys(component.robot.links));
    const componentMeshLoadKeys = expectedMeshLoadKeys.filter((meshLoadKey) => {
      const [linkId] = meshLoadKey.split('|');
      return Boolean(linkId) && componentLinkIds.has(linkId);
    });

    if (componentMeshLoadKeys.length === 0) {
      return true;
    }

    return componentMeshLoadKeys.every((meshLoadKey) => resolvedMeshLoadKeys.has(meshLoadKey));
  });
}

function measureComponentLowestPoint(target: THREE.Group): number | null {
  return getLowestMeshZ(target, {
    includeInvisible: false,
    includeVisual: true,
    includeCollision: false,
  }) ?? getLowestMeshZ(target, {
    includeInvisible: true,
    includeVisual: true,
    includeCollision: false,
  });
}

export function resolveAssemblyAutoGrounding({
  robot,
  assemblyState,
  jointPivots,
  groundPlaneOffset,
  tolerance = 1e-3,
  componentIds = null,
}: ResolveAssemblyAutoGroundingOptions): AssemblyAutoGroundResolution {
  if (!assemblyState) {
    return {
      adjustments: [],
      measuredComponentIds: [],
    };
  }

  const requestedComponentIds = componentIds
    ? new Set(componentIds)
    : null;
  const adjustments: AssemblyAutoGroundAdjustment[] = [];
  const measuredComponentIds: string[] = [];

  Object.values(assemblyState.components).forEach((component) => {
    if (!component.visible) {
      return;
    }

    if (requestedComponentIds && !requestedComponentIds.has(component.id)) {
      return;
    }

    const target = resolveAssemblyComponentTransformTarget({
      robot,
      assemblyState,
      componentId: component.id,
      jointPivots,
    });

    if (!target || target.kind !== 'component' || !target.object) {
      return;
    }

    const lowestPoint = measureComponentLowestPoint(target.object);
    if (!Number.isFinite(lowestPoint)) {
      return;
    }

    measuredComponentIds.push(component.id);
    const deltaZ = groundPlaneOffset - Number(lowestPoint);
    if (Math.abs(deltaZ) <= tolerance) {
      return;
    }

    const nextTransform = cloneAssemblyTransform(component.transform);
    nextTransform.position.z += deltaZ;
    adjustments.push({
      componentId: component.id,
      transform: nextTransform,
    });
  });

  return {
    adjustments,
    measuredComponentIds,
  };
}
