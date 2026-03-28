import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const INTERACTION_RECOVERY_DELAY_MS = 180;
export const RESTING_DPR_CAP = 1.75;
export const INTERACTION_DPR_CAP = RESTING_DPR_CAP;

interface ResolveCanvasDprOptions {
  devicePixelRatio: number;
  isInteracting: boolean;
  restingCap?: number;
  interactionCap?: number;
}

export function resolveCanvasDpr({
  devicePixelRatio,
  isInteracting,
  restingCap = RESTING_DPR_CAP,
  interactionCap = INTERACTION_DPR_CAP,
}: ResolveCanvasDprOptions) {
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  const safeRestingCap = restingCap > 0 ? restingCap : RESTING_DPR_CAP;
  const safeInteractionCap = interactionCap > 0 ? interactionCap : INTERACTION_DPR_CAP;
  const activeCap = isInteracting ? Math.min(safeRestingCap, safeInteractionCap) : safeRestingCap;
  return Math.min(safeDevicePixelRatio, activeCap);
}

export function useAdaptiveInteractionQuality(
  recoveryDelayMs = INTERACTION_RECOVERY_DELAY_MS,
) {
  const [isInteracting, setIsInteracting] = useState(false);
  const interactionTimeoutRef = useRef<number | null>(null);

  const clearInteractionTimeout = useCallback(() => {
    if (typeof window === 'undefined' || interactionTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = null;
  }, []);

  const beginInteraction = useCallback(() => {
    clearInteractionTimeout();
    setIsInteracting(true);
  }, [clearInteractionTimeout]);

  const endInteraction = useCallback(
    (delay = recoveryDelayMs) => {
      if (typeof window === 'undefined') {
        setIsInteracting(false);
        return;
      }

      clearInteractionTimeout();
      interactionTimeoutRef.current = window.setTimeout(() => {
        interactionTimeoutRef.current = null;
        setIsInteracting(false);
      }, delay);
    },
    [clearInteractionTimeout, recoveryDelayMs],
  );

  const pulseInteraction = useCallback(
    (delay = recoveryDelayMs) => {
      beginInteraction();
      endInteraction(delay);
    },
    [beginInteraction, endInteraction, recoveryDelayMs],
  );

  useEffect(() => () => clearInteractionTimeout(), [clearInteractionTimeout]);

  const dpr = useMemo(() => {
    if (typeof window === 'undefined') {
      return resolveCanvasDpr({ devicePixelRatio: 1, isInteracting });
    }

    return resolveCanvasDpr({
      devicePixelRatio: window.devicePixelRatio || 1,
      isInteracting,
    });
  }, [isInteracting]);

  return {
    dpr,
    isInteracting,
    beginInteraction,
    endInteraction,
    pulseInteraction,
  };
}
