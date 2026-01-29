import { useState, useRef, useCallback } from 'react';

export interface DraggablePanelState {
  containerRef: React.RefObject<HTMLDivElement>;
  optionsPanelRef: React.RefObject<HTMLDivElement>;
  optionsPanelPos: { x: number; y: number } | null;
  setOptionsPanelPos: (pos: { x: number; y: number } | null) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsPanelRef = useRef<HTMLDivElement>(null);
  const [optionsPanelPos, setOptionsPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    panelX: number;
    panelY: number;
  } | null>(null);

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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!optionsPanelRef.current || !containerRef.current) return;

    const rect = optionsPanelRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: rect.left - containerRect.left,
      panelY: rect.top - containerRect.top,
    };
    setDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !dragStartRef.current || !containerRef.current || !optionsPanelRef.current)
        return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      const containerRect = containerRef.current.getBoundingClientRect();
      const panelRect = optionsPanelRef.current.getBoundingClientRect();

      // Calculate new position
      let newX = dragStartRef.current.panelX + deltaX;
      let newY = dragStartRef.current.panelY + deltaY;

      // Boundary constraints: ensure panel doesn't exceed container bounds
      const padding = 2;
      const maxX = containerRect.width - panelRect.width - padding;
      const maxY = containerRect.height - panelRect.height - padding;

      // Ensure newX and newY are within [padding, max] range
      newX = Math.max(padding, Math.min(newX, Math.max(padding, maxX)));
      newY = Math.max(padding, Math.min(newY, Math.max(padding, maxY)));

      setOptionsPanelPos({ x: newX, y: newY });
    },
    [dragging]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    dragStartRef.current = null;
  }, []);

  return {
    containerRef,
    optionsPanelRef,
    optionsPanelPos,
    setOptionsPanelPos,
    dragging,
    isOptionsCollapsed,
    toggleOptionsCollapsed,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
