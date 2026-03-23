import { useState, useRef, useCallback, useEffect } from 'react';

type PanelType = 'options' | 'joints' | 'measure';
type PanelPosition = { x: number; y: number };

interface DragStart {
  mouseX: number;
  mouseY: number;
  panelX: number;
  panelY: number;
}

interface PositionMap {
  options: PanelPosition | null;
  joints: PanelPosition | null;
  measure: PanelPosition | null;
}

const EMPTY_POSITIONS: PositionMap = {
  options: null,
  joints: null,
  measure: null,
};

const PANEL_EDGE_PADDING = 2;
const MIN_VISIBLE_PANEL_WIDTH = 56;
const MIN_VISIBLE_PANEL_HEADER_HEIGHT = 40;

export function usePanelDrag(
  containerRef: React.RefObject<HTMLDivElement>,
  optionsPanelRef: React.RefObject<HTMLDivElement>,
  jointPanelRef: React.RefObject<HTMLDivElement>,
  measurePanelRef: React.RefObject<HTMLDivElement>
) {
  const [dragging, setDragging] = useState<PanelType | null>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const activePanelRef = useRef<PanelType | null>(null);
  const liveDragPositionRef = useRef<PanelPosition | null>(null);
  const documentListenersAttachedRef = useRef(false);
  const detachDocumentListenersRef = useRef<() => void>(() => {});
  const bodyUserSelectRef = useRef<string>('');
  const bodyCursorRef = useRef<string>('');
  const positionsRef = useRef<PositionMap>(EMPTY_POSITIONS);

  const [optionsPanelPos, setOptionsPanelPos] = useState<PanelPosition | null>(null);
  const [jointPanelPos, setJointPanelPos] = useState<PanelPosition | null>(null);
  const [measurePanelPos, setMeasurePanelPos] = useState<PanelPosition | null>(null);

  const getPanelRef = useCallback((panel: PanelType) => {
    if (panel === 'options') return optionsPanelRef;
    if (panel === 'joints') return jointPanelRef;
    return measurePanelRef;
  }, [jointPanelRef, measurePanelRef, optionsPanelRef]);

  const getCommittedPosition = useCallback((panel: PanelType) => {
    return positionsRef.current[panel];
  }, []);

  const commitPanelPosition = useCallback((panel: PanelType, position: PanelPosition | null) => {
    positionsRef.current[panel] = position;

    if (panel === 'options') {
      setOptionsPanelPos(position);
      return;
    }

    if (panel === 'joints') {
      setJointPanelPos(position);
      return;
    }

    setMeasurePanelPos(position);
  }, []);

  const applyPanelPosition = useCallback((panelRef: React.RefObject<HTMLDivElement>, position: PanelPosition) => {
    if (!panelRef.current) return;

    panelRef.current.style.left = `${position.x}px`;
    panelRef.current.style.top = `${position.y}px`;
    panelRef.current.style.right = 'auto';
    panelRef.current.style.bottom = 'auto';
    panelRef.current.style.transform = 'none';
  }, []);

  const clampPosition = useCallback((position: PanelPosition, panelRef: React.RefObject<HTMLDivElement>) => {
    if (!containerRef.current || !panelRef.current) {
      return position;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    const minX = Math.min(PANEL_EDGE_PADDING, MIN_VISIBLE_PANEL_WIDTH - panelRect.width);
    const maxX = Math.max(PANEL_EDGE_PADDING, containerRect.width - MIN_VISIBLE_PANEL_WIDTH);
    const minY = PANEL_EDGE_PADDING;
    const maxY = Math.max(PANEL_EDGE_PADDING, containerRect.height - MIN_VISIBLE_PANEL_HEADER_HEIGHT);

    return {
      x: Math.max(minX, Math.min(position.x, maxX)),
      y: Math.max(minY, Math.min(position.y, maxY)),
    };
  }, [containerRef]);

  const updatePositionFromPointer = useCallback((clientX: number, clientY: number) => {
    const activePanel = activePanelRef.current;
    if (!activePanel || !dragStartRef.current) return;

    const panelRef = getPanelRef(activePanel);
    if (!panelRef.current) return;

    const nextPosition = clampPosition({
      x: dragStartRef.current.panelX + (clientX - dragStartRef.current.mouseX),
      y: dragStartRef.current.panelY + (clientY - dragStartRef.current.mouseY),
    }, panelRef);

    liveDragPositionRef.current = nextPosition;
    applyPanelPosition(panelRef, nextPosition);
  }, [applyPanelPosition, clampPosition, getPanelRef]);

  const finalizeDrag = useCallback(() => {
    const activePanel = activePanelRef.current;
    const livePosition = liveDragPositionRef.current;

    if (activePanel && livePosition) {
      commitPanelPosition(activePanel, livePosition);
    }

    document.body.style.userSelect = bodyUserSelectRef.current;
    document.body.style.cursor = bodyCursorRef.current;

    activePanelRef.current = null;
    liveDragPositionRef.current = null;
    dragStartRef.current = null;
    setDragging(null);
    detachDocumentListenersRef.current();
  }, [commitPanelPosition]);

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

    // Reuse the DOM node for detach without rebuilding closures.
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

  const handleMouseDown = useCallback((panel: PanelType, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const panelRef = getPanelRef(panel);
    if (!panelRef.current || !containerRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const currentPos = getCommittedPosition(panel);

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: currentPos ? currentPos.x : rect.left - containerRect.left,
      panelY: currentPos ? currentPos.y : rect.top - containerRect.top,
    };
    activePanelRef.current = panel;
    liveDragPositionRef.current = currentPos ?? {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
    };
    bodyUserSelectRef.current = document.body.style.userSelect;
    bodyCursorRef.current = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
    setDragging(panel);
    attachDocumentListeners();
  }, [attachDocumentListeners, containerRef, getCommittedPosition, getPanelRef]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    updatePositionFromPointer(e.clientX, e.clientY);
  }, [updatePositionFromPointer]);

  const handleMouseUp = useCallback(() => {
    finalizeDrag();
  }, [finalizeDrag]);

  useEffect(() => {
    return () => {
      detachDocumentListeners();
    };
  }, [detachDocumentListeners]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      const nextOptions = positionsRef.current.options
        ? clampPosition(positionsRef.current.options, optionsPanelRef)
        : null;
      const nextJoints = positionsRef.current.joints
        ? clampPosition(positionsRef.current.joints, jointPanelRef)
        : null;
      const nextMeasure = positionsRef.current.measure
        ? clampPosition(positionsRef.current.measure, measurePanelRef)
        : null;

      if (
        nextOptions &&
        positionsRef.current.options &&
        (nextOptions.x !== positionsRef.current.options.x || nextOptions.y !== positionsRef.current.options.y)
      ) {
        commitPanelPosition('options', nextOptions);
      }
      if (
        nextJoints &&
        positionsRef.current.joints &&
        (nextJoints.x !== positionsRef.current.joints.x || nextJoints.y !== positionsRef.current.joints.y)
      ) {
        commitPanelPosition('joints', nextJoints);
      }
      if (
        nextMeasure &&
        positionsRef.current.measure &&
        (nextMeasure.x !== positionsRef.current.measure.x || nextMeasure.y !== positionsRef.current.measure.y)
      ) {
        commitPanelPosition('measure', nextMeasure);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [clampPosition, commitPanelPosition, containerRef, jointPanelRef, measurePanelRef, optionsPanelRef]);

  return {
    optionsPanelPos,
    jointPanelPos,
    measurePanelPos,
    dragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
