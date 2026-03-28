import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface UsePointerResizeOptions {
  axis: 'x' | 'y';
  cursor: 'col-resize' | 'row-resize';
  direction?: 1 | -1;
  max: number;
  min: number;
  onChange: (nextValue: number) => void;
  value: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function usePointerResize({
  axis,
  cursor,
  direction = 1,
  max,
  min,
  onChange,
  value,
}: UsePointerResizeOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const isResizingRef = useRef(false);
  const startPointerRef = useRef(0);
  const startValueRef = useRef(value);
  const bodyCursorRef = useRef('');
  const bodyUserSelectRef = useRef('');

  const captureBodyInteractionStyles = useCallback(() => {
    bodyCursorRef.current = document.body.style.cursor;
    bodyUserSelectRef.current = document.body.style.userSelect;
  }, []);

  const restoreBodyInteractionStyles = useCallback(() => {
    document.body.style.cursor = bodyCursorRef.current;
    document.body.style.userSelect = bodyUserSelectRef.current;
  }, []);

  const handleResizeStart = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    setIsDragging(true);
    startPointerRef.current = axis === 'x' ? event.clientX : event.clientY;
    startValueRef.current = value;
    captureBodyInteractionStyles();
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
  }, [axis, captureBodyInteractionStyles, cursor, value]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) {
        return;
      }

      const currentPointer = axis === 'x' ? event.clientX : event.clientY;
      const delta = (currentPointer - startPointerRef.current) * direction;
      onChange(clamp(startValueRef.current + delta, min, max));
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) {
        return;
      }

      isResizingRef.current = false;
      setIsDragging(false);
      restoreBodyInteractionStyles();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      restoreBodyInteractionStyles();
    };
  }, [axis, direction, max, min, onChange, restoreBodyInteractionStyles]);

  return {
    handleResizeStart,
    isDragging,
  };
}
