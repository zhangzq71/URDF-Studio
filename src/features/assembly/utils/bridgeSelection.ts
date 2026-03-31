import type { AssemblyComponent, AssemblyState } from '@/types';
import type { Selection } from '@/store/selectionStore';

export type BridgePickTarget = 'parent' | 'child';

export interface ResolvedAssemblySelection {
  componentId: string;
  componentName: string;
  linkId: string;
  linkName: string;
}

export interface BridgeInteractionState {
  pickTarget: BridgePickTarget;
  parentComponentId: string;
  childComponentId: string;
}

export function resolveAssemblySelection(
  assemblyState: AssemblyState,
  selection: Selection,
): ResolvedAssemblySelection | null {
  if (!selection.id || !selection.type) {
    return null;
  }

  for (const component of Object.values(assemblyState.components)) {
    if (selection.type === 'link') {
      const link = component.robot.links[selection.id];
      if (link) {
        return {
          componentId: component.id,
          componentName: component.name,
          linkId: link.id,
          linkName: link.name,
        };
      }
      continue;
    }

    const joint = component.robot.joints[selection.id];
    if (!joint) {
      continue;
    }

    const childLink = component.robot.links[joint.childLinkId];
    if (!childLink) {
      continue;
    }

    return {
      componentId: component.id,
      componentName: component.name,
      linkId: childLink.id,
      linkName: childLink.name,
    };
  }

  return null;
}

export function resolveBlockedBridgeComponentId({
  pickTarget,
  parentComponentId,
  childComponentId,
}: BridgeInteractionState): string | null {
  if (pickTarget === 'parent') {
    return childComponentId || null;
  }

  return parentComponentId || null;
}

export function isAssemblySelectionAllowedForBridge(
  assemblyState: AssemblyState,
  selection: Selection,
  blockedComponentId: string | null,
): boolean {
  if (!selection.id || !selection.type || !blockedComponentId) {
    return true;
  }

  const resolvedSelection = resolveAssemblySelection(assemblyState, selection);
  if (!resolvedSelection) {
    return false;
  }

  return resolvedSelection.componentId !== blockedComponentId;
}

export function filterSelectableBridgeComponents(
  components: AssemblyComponent[],
  blockedComponentId: string | null,
): AssemblyComponent[] {
  if (!blockedComponentId) {
    return components;
  }

  return components.filter((component) => component.id !== blockedComponentId);
}
