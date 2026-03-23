/**
 * Hook for managing a resizable sidebar panel.
 * Handles drag-to-resize with mouse events.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useResizablePanel(collapsed?: boolean) {
  const [width, setWidth] = useState(272);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const bodyCursorRef = useRef('');
  const bodyUserSelectRef = useRef('');

  const displayWidth = collapsed ? 0 : Math.max(width, 256);

  const captureBodyInteractionStyles = useCallback(() => {
    bodyCursorRef.current = document.body.style.cursor;
    bodyUserSelectRef.current = document.body.style.userSelect;
  }, []);

  const restoreBodyInteractionStyles = useCallback(() => {
    document.body.style.cursor = bodyCursorRef.current;
    document.body.style.userSelect = bodyUserSelectRef.current;
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    setIsDragging(true);
    startX.current = e.clientX;
    startWidth.current = width;
    captureBodyInteractionStyles();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [captureBodyInteractionStyles, width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(256, Math.min(800, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
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
  }, [restoreBodyInteractionStyles]);

  return { width, displayWidth, isDragging, handleResizeMouseDown };
}
