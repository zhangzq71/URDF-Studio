export interface ResolveAssemblyRootComponentSelectionAvailabilityOptions {
  shouldRenderAssembly: boolean;
  sourceSceneAssemblyComponentId?: string | null;
}

export function resolveAssemblyRootComponentSelectionAvailability({
  shouldRenderAssembly,
  sourceSceneAssemblyComponentId = null,
}: ResolveAssemblyRootComponentSelectionAvailabilityOptions): boolean {
  return shouldRenderAssembly || Boolean(sourceSceneAssemblyComponentId);
}
