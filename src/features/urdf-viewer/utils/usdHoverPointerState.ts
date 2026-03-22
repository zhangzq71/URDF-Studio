export interface MutableValueRef<T> {
  current: T;
}

export interface UsdHoverPointerStateRefs {
  hoverPointerClientRef: MutableValueRef<{ x: number; y: number } | null>;
  hoverPointerInsideRef: MutableValueRef<boolean>;
  hoverNeedsRaycastRef: MutableValueRef<boolean>;
}

export function markUsdHoverRaycastDirty(
  hoverNeedsRaycastRef: MutableValueRef<boolean>,
  requestFrame?: () => void,
): void {
  hoverNeedsRaycastRef.current = true;
  requestFrame?.();
}

export function setUsdHoverPointerState(
  refs: UsdHoverPointerStateRefs,
  pointer: { x: number; y: number },
  requestFrame?: () => void,
): void {
  refs.hoverPointerClientRef.current = pointer;
  refs.hoverPointerInsideRef.current = true;
  refs.hoverNeedsRaycastRef.current = true;
  requestFrame?.();
}

export function clearUsdHoverPointerState(
  refs: UsdHoverPointerStateRefs,
  requestFrame?: () => void,
): void {
  refs.hoverPointerInsideRef.current = false;
  refs.hoverPointerClientRef.current = null;
  refs.hoverNeedsRaycastRef.current = false;
  requestFrame?.();
}
