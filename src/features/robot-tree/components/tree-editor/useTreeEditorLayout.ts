import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTreeEditorLayoutResult {
  width: number;
  fileBrowserHeight: number;
  isDragging: boolean;
  isFileBrowserOpen: boolean;
  isStructureOpen: boolean;
  setIsFileBrowserOpen: (isOpen: boolean) => void;
  setIsStructureOpen: (isOpen: boolean) => void;
  handleHorizontalResizeStart: (event: React.MouseEvent) => void;
  handleVerticalResizeStart: (event: React.MouseEvent) => void;
}

export function useTreeEditorLayout(): UseTreeEditorLayoutResult {
  const [width, setWidth] = useState(288);
  const [fileBrowserHeight, setFileBrowserHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(true);
  const [isStructureOpen, setIsStructureOpen] = useState(true);

  const isHorizontalResizingRef = useRef(false);
  const isVerticalResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
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

  const handleHorizontalResizeStart = useCallback((event: React.MouseEvent) => {
    isHorizontalResizingRef.current = true;
    setIsDragging(true);
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    captureBodyInteractionStyles();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [captureBodyInteractionStyles, width]);

  const handleVerticalResizeStart = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    isVerticalResizingRef.current = true;
    setIsDragging(true);
    startYRef.current = event.clientY;
    startHeightRef.current = fileBrowserHeight;
    captureBodyInteractionStyles();
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [captureBodyInteractionStyles, fileBrowserHeight]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (isHorizontalResizingRef.current) {
        const delta = event.clientX - startXRef.current;
        setWidth(Math.max(200, Math.min(600, startWidthRef.current + delta)));
      }

      if (isVerticalResizingRef.current) {
        const delta = event.clientY - startYRef.current;
        setFileBrowserHeight(Math.max(100, Math.min(600, startHeightRef.current + delta)));
      }
    };

    const handleMouseUp = () => {
      isHorizontalResizingRef.current = false;
      isVerticalResizingRef.current = false;
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

  return {
    width,
    fileBrowserHeight,
    isDragging,
    isFileBrowserOpen,
    isStructureOpen,
    setIsFileBrowserOpen,
    setIsStructureOpen,
    handleHorizontalResizeStart,
    handleVerticalResizeStart,
  };
}
