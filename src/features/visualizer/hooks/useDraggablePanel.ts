import { useState, useRef, useCallback, useEffect } from 'react';

interface PanelPosition {
  x: number;
  y: number;
}

export interface DraggablePanelState {
  containerRef: React.RefObject<HTMLDivElement>;
  optionsPanelRef: React.RefObject<HTMLDivElement>;
  optionsPanelPos: PanelPosition | null;
  setOptionsPanelPos: (pos: PanelPosition | null) => void;
  dragging: boolean;
  isOptionsCollapsed: boolean;
  toggleOptionsCollapsed: () => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
}

/**
 * Custom hook to manage draggable panel functionality
 * Handles panel positioning, dragging state, and collapse state
 */
export function useDraggablePanel(): DraggablePanelState {
  const PANEL_EDGE_PADDING = 2;
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsPanelRef = useRef<HTMLDivElement>(null);
  const [optionsPanelPosState, setOptionsPanelPosState] = useState<PanelPosition | null>(null);
  const optionsPanelPosRef = useRef<PanelPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    panelX: number;
    panelY: number;
  } | null>(null);
  const liveDragPositionRef = useRef<PanelPosition | null>(null);
  const documentListenersAttachedRef = useRef(false);
  const detachDocumentListenersRef = useRef<() => void>(() => {});
  const bodyUserSelectRef = useRef('');
  const bodyCursorRef = useRef('');

  const [isOptionsCollapsed, setIsOptionsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('visualizer_options_collapsed');
      return saved === 'true';
    }
    return false;
  });

  const toggleOptionsCollapsed = useCallback(() => {
    setIsOptionsCollapsed((prev) => {
      const newState = !prev;
      localStorage.setItem('visualizer_options_collapsed', String(newState));
      return newState;
    });
  }, []);

  const setOptionsPanelPos = useCallback((pos: PanelPosition | null) => {
    optionsPanelPosRef.current = pos;
    setOptionsPanelPosState(pos);
  }, []);

  const applyPanelPosition = useCallback((position: PanelPosition) => {
    if (!optionsPanelRef.current) return;

    optionsPanelRef.current.style.left = `${position.x}px`;
    optionsPanelRef.current.style.top = `${position.y}px`;
    optionsPanelRef.current.style.right = 'auto';
    optionsPanelRef.current.style.bottom = 'auto';
    optionsPanelRef.current.style.transform = 'none';
  }, []);

  const clampPosition = useCallback((position: PanelPosition) => {
    if (!containerRef.current || !optionsPanelRef.current) {
      return position;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const panelRect = optionsPanelRef.current.getBoundingClientRect();
    const maxX = Math.max(PANEL_EDGE_PADDING, containerRect.width - panelRect.width - PANEL_EDGE_PADDING);
    const maxY = Math.max(PANEL_EDGE_PADDING, containerRect.height - panelRect.height - PANEL_EDGE_PADDING);

    return {
      x: Math.max(PANEL_EDGE_PADDING, Math.min(position.x, maxX)),
      y: Math.max(PANEL_EDGE_PADDING, Math.min(position.y, maxY)),
    };
  }, []);

  const updatePositionFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!dragStartRef.current || !containerRef.current || !optionsPanelRef.current) {
      return;
    }

    const nextPosition = clampPosition({
      x: dragStartRef.current.panelX + (clientX - dragStartRef.current.mouseX),
      y: dragStartRef.current.panelY + (clientY - dragStartRef.current.mouseY),
    });

    liveDragPositionRef.current = nextPosition;
    applyPanelPosition(nextPosition);
  }, [applyPanelPosition, clampPosition]);

  const finalizeDrag = useCallback(() => {
    if (liveDragPositionRef.current) {
      setOptionsPanelPos(liveDragPositionRef.current);
    }

    document.body.style.userSelect = bodyUserSelectRef.current;
    document.body.style.cursor = bodyCursorRef.current;
    liveDragPositionRef.current = null;
    dragStartRef.current = null;
    setDragging(false);
    detachDocumentListenersRef.current();
  }, [setOptionsPanelPos]);

  const handleDocumentMouseMoveRef = useRef<(event: MouseEvent) => void>(() => {});
  const handleDocumentMouseUpRef = useRef<() => void>(() => {});

  handleDocumentMouseMoveRef.current = (event: MouseEvent) => {
    updatePositionFromPointer(event.clientX, event.clientY);
  };
  handleDocumentMouseUpRef.current = () => {
    finalizeDrag();
  };

  const attachDocumentListeners = useCallback(() => {
    if (documentListenersAttachedRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      handleDocumentMouseMoveRef.current(event);
    };
    const handleMouseUp = () => {
      handleDocumentMouseUpRef.current();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    documentListenersAttachedRef.current = true;

    (attachDocumentListeners as typeof attachDocumentListeners & {
      mouseMove?: (event: MouseEvent) => void;
      mouseUp?: () => void;
    }).mouseMove = handleMouseMove;
    (attachDocumentListeners as typeof attachDocumentListeners & {
      mouseMove?: (event: MouseEvent) => void;
      mouseUp?: () => void;
    }).mouseUp = handleMouseUp;
  }, []);

  const detachDocumentListeners = useCallback(() => {
    if (!documentListenersAttachedRef.current) return;

    const mouseMove = (attachDocumentListeners as typeof attachDocumentListeners & {
      mouseMove?: (event: MouseEvent) => void;
    }).mouseMove;
    const mouseUp = (attachDocumentListeners as typeof attachDocumentListeners & {
      mouseUp?: () => void;
    }).mouseUp;

    if (mouseMove) {
      document.removeEventListener('mousemove', mouseMove);
    }
    if (mouseUp) {
      document.removeEventListener('mouseup', mouseUp);
      window.removeEventListener('blur', mouseUp);
    }

    documentListenersAttachedRef.current = false;
  }, [attachDocumentListeners]);

  detachDocumentListenersRef.current = detachDocumentListeners;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!optionsPanelRef.current || !containerRef.current) return;

    const rect = optionsPanelRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: optionsPanelPosRef.current ? optionsPanelPosRef.current.x : rect.left - containerRect.left,
      panelY: optionsPanelPosRef.current ? optionsPanelPosRef.current.y : rect.top - containerRect.top,
    };
    liveDragPositionRef.current = optionsPanelPosRef.current ?? {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
    };
    bodyUserSelectRef.current = document.body.style.userSelect;
    bodyCursorRef.current = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    setDragging(true);
    attachDocumentListeners();
  }, [attachDocumentListeners]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    updatePositionFromPointer(e.clientX, e.clientY);
  }, [updatePositionFromPointer]);

  const handleMouseUp = useCallback(() => {
    finalizeDrag();
  }, [finalizeDrag]);

  // Add ResizeObserver to clamp position when container resizes
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      const currentPosition = optionsPanelPosRef.current;
      if (!currentPosition) return;

      const nextPosition = clampPosition(currentPosition);
      if (nextPosition.x !== currentPosition.x || nextPosition.y !== currentPosition.y) {
        setOptionsPanelPos(nextPosition);
      }
    });

    observer.observe(containerRef.current);
    return () => {
      document.body.style.userSelect = bodyUserSelectRef.current;
      document.body.style.cursor = bodyCursorRef.current;
      detachDocumentListeners();
      observer.disconnect();
    };
  }, [clampPosition, detachDocumentListeners, setOptionsPanelPos]);

  return {
    containerRef,
    optionsPanelRef,
    optionsPanelPos: optionsPanelPosState,
    setOptionsPanelPos,
    dragging,
    isOptionsCollapsed,
    toggleOptionsCollapsed,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
