import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

export const CanvasResizeSync = ({ transitionMs = 260 }: { transitionMs?: number }) => {
  const { gl, size, invalidate, setFrameloop } = useThree();
  const loopFrameRef = useRef<number | null>(null);
  const resizeWatchUntilRef = useRef(0);
  const restoreFrameLoopTimerRef = useRef<number | null>(null);

  const beginSmoothResize = useCallback(() => {
    setFrameloop('always');
    if (restoreFrameLoopTimerRef.current !== null) {
      clearTimeout(restoreFrameLoopTimerRef.current);
    }
    restoreFrameLoopTimerRef.current = window.setTimeout(() => {
      setFrameloop('demand');
      invalidate();
      restoreFrameLoopTimerRef.current = null;
    }, transitionMs + 120);
    invalidate();
  }, [invalidate, setFrameloop, transitionMs]);

  const ensureResizeWatch = useCallback((durationMs = transitionMs + 120) => {
    const now = performance.now();
    resizeWatchUntilRef.current = Math.max(resizeWatchUntilRef.current, now + durationMs);
    if (loopFrameRef.current !== null) return;

    const loop = () => {
      loopFrameRef.current = null;
      invalidate();
      if (performance.now() < resizeWatchUntilRef.current) {
        loopFrameRef.current = requestAnimationFrame(loop);
      }
    };

    loopFrameRef.current = requestAnimationFrame(loop);
  }, [invalidate, transitionMs]);

  useEffect(() => {
    invalidate();
  }, [invalidate, size.height, size.width]);

  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    const handleResizeActivity = () => {
      beginSmoothResize();
      ensureResizeWatch();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResizeActivity);
      resizeObserver.observe(parent);
    }

    window.addEventListener('resize', handleResizeActivity);

    return () => {
      window.removeEventListener('resize', handleResizeActivity);
      resizeObserver?.disconnect();
      if (loopFrameRef.current !== null) {
        cancelAnimationFrame(loopFrameRef.current);
        loopFrameRef.current = null;
      }
      if (restoreFrameLoopTimerRef.current !== null) {
        clearTimeout(restoreFrameLoopTimerRef.current);
        restoreFrameLoopTimerRef.current = null;
      }
      setFrameloop('demand');
    };
  }, [beginSmoothResize, ensureResizeWatch, gl, setFrameloop]);

  return null;
};
