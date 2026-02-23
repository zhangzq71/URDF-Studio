import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, RefObject } from 'react';

export type ResizeDirection = 'right' | 'bottom' | 'corner' | 'e' | 's' | 'se';

interface Position {
  x: number;
  y: number;
}

interface WindowSize {
  width: number;
  height: number;
}

interface DragBoundsOptions {
  allowNegativeX?: boolean;
  minVisibleWidth?: number;
  topMargin?: number;
  bottomMargin?: number;
}

export interface DraggableWindowOptions {
  isOpen?: boolean;
  defaultPosition?: Position;
  defaultSize: WindowSize;
  minSize?: WindowSize;
  enableMinimize?: boolean;
  enableMaximize?: boolean;
  centerOnMount?: boolean;
  clampResizeToViewport?: boolean;
  dragBounds?: DragBoundsOptions;
}

export interface DraggableWindowReturn {
  isMaximized: boolean;
  isMinimized: boolean;
  position: Position;
  size: WindowSize;
  isDragging: boolean;
  isResizing: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  handleDragStart: (e: MouseEvent) => void;
  handleResizeStart: (e: MouseEvent, direction: ResizeDirection) => void;
  toggleMaximize: () => void;
  toggleMinimize: () => void;
  windowStyle: CSSProperties;
}

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
};

const normalizeResizeDirection = (direction: ResizeDirection): 'right' | 'bottom' | 'corner' => {
  if (direction === 'e') return 'right';
  if (direction === 's') return 'bottom';
  return 'corner';
};

export const useDraggableWindow = ({
  isOpen,
  defaultPosition = { x: 100, y: 100 },
  defaultSize,
  minSize = { width: 600, height: 400 },
  enableMinimize = true,
  enableMaximize = true,
  centerOnMount = true,
  clampResizeToViewport = true,
  dragBounds,
}: DraggableWindowOptions): DraggableWindowReturn => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [size, setSize] = useState<WindowSize>(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTransform, setDragTransform] = useState<Position>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'right' | 'bottom' | 'corner' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<Position>({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: defaultSize.width, height: defaultSize.height });
  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  const dragTransformRef = useRef(dragTransform);
  const centeredOnceRef = useRef(false);
  const preMaximizeRef = useRef<{ position: Position; size: WindowSize } | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    dragTransformRef.current = dragTransform;
  }, [dragTransform]);

  const getDragLimits = useCallback(
    (currentSize: WindowSize) => {
      const allowNegativeX = dragBounds?.allowNegativeX ?? false;
      const minVisibleWidth = dragBounds?.minVisibleWidth ?? 100;
      const minX = allowNegativeX ? -currentSize.width + minVisibleWidth : 0;
      const maxX = allowNegativeX
        ? window.innerWidth - minVisibleWidth
        : window.innerWidth - currentSize.width;
      const minY = dragBounds?.topMargin ?? 0;
      const maxY = window.innerHeight - (dragBounds?.bottomMargin ?? 48);
      return { minX, maxX, minY, maxY };
    },
    [dragBounds?.allowNegativeX, dragBounds?.bottomMargin, dragBounds?.minVisibleWidth, dragBounds?.topMargin],
  );

  const centerWindow = useCallback(() => {
    const currentSize = sizeRef.current;
    const centerX = (window.innerWidth - currentSize.width) / 2;
    const centerY = (window.innerHeight - currentSize.height) / 2;
    setPosition({
      x: Math.max(0, centerX),
      y: Math.max(0, centerY),
    });
  }, []);

  useEffect(() => {
    if (!centerOnMount) return;

    if (typeof isOpen === 'boolean') {
      if (isOpen) {
        centerWindow();
      }
      return;
    }

    if (!centeredOnceRef.current) {
      centeredOnceRef.current = true;
      centerWindow();
    }
  }, [centerOnMount, centerWindow, isOpen]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const nextTransform = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      dragTransformRef.current = nextTransform;
      setDragTransform(nextTransform);
    };

    const handleMouseUp = () => {
      const transform = dragTransformRef.current;
      if (transform.x !== 0 || transform.y !== 0) {
        const limits = getDragLimits(sizeRef.current);
        const nextX = clamp(positionRef.current.x + transform.x, limits.minX, limits.maxX);
        const nextY = clamp(positionRef.current.y + transform.y, limits.minY, limits.maxY);
        setPosition({ x: nextX, y: nextY });
      }
      dragTransformRef.current = { x: 0, y: 0 };
      setDragTransform({ x: 0, y: 0 });
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getDragLimits, isDragging]);

  useEffect(() => {
    if (!isResizing || !resizeDirection) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;

      const maxWidth = clampResizeToViewport
        ? window.innerWidth - positionRef.current.x
        : Number.POSITIVE_INFINITY;
      const maxHeight = clampResizeToViewport
        ? window.innerHeight - positionRef.current.y
        : Number.POSITIVE_INFINITY;

      const shouldResizeWidth = resizeDirection === 'right' || resizeDirection === 'corner';
      const shouldResizeHeight = resizeDirection === 'bottom' || resizeDirection === 'corner';

      setSize((prev) => {
        const nextWidth = shouldResizeWidth
          ? clamp(resizeStartRef.current.width + deltaX, minSize.width, maxWidth)
          : prev.width;
        const nextHeight = shouldResizeHeight
          ? clamp(resizeStartRef.current.height + deltaY, minSize.height, maxHeight)
          : prev.height;

        if (nextWidth === prev.width && nextHeight === prev.height) {
          return prev;
        }

        return { width: nextWidth, height: nextHeight };
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [clampResizeToViewport, isResizing, minSize.height, minSize.width, resizeDirection]);

  const handleDragStart = useCallback(
    (e: MouseEvent) => {
      if (isMaximized) return;

      const target = e.target as HTMLElement;
      if (target.closest('button, input, textarea, select, [data-window-control]')) {
        return;
      }

      e.preventDefault();
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      dragTransformRef.current = { x: 0, y: 0 };
      setDragTransform({ x: 0, y: 0 });
      setIsDragging(true);
    },
    [isMaximized],
  );

  const handleResizeStart = useCallback(
    (e: MouseEvent, direction: ResizeDirection) => {
      if (isMaximized || isMinimized) return;

      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeDirection(normalizeResizeDirection(direction));
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
      };
    },
    [isMaximized, isMinimized],
  );

  const toggleMaximize = useCallback(() => {
    if (!enableMaximize) return;

    setIsMaximized((prev) => {
      if (prev) {
        if (preMaximizeRef.current) {
          setPosition(preMaximizeRef.current.position);
          setSize(preMaximizeRef.current.size);
        }
        return false;
      }

      preMaximizeRef.current = {
        position: positionRef.current,
        size: sizeRef.current,
      };
      setIsMinimized(false);
      return true;
    });
  }, [enableMaximize]);

  const toggleMinimize = useCallback(() => {
    if (!enableMinimize) return;
    setIsMinimized((prev) => !prev);
  }, [enableMinimize]);

  const windowStyle = useMemo<CSSProperties>(() => {
    if (isMaximized) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        transform: 'none',
      };
    }

    if (isMinimized) {
      return {
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: 48,
        transform: 'none',
      };
    }

    return {
      position: 'fixed',
      left: position.x,
      top: position.y,
      width: size.width,
      height: size.height,
      transform: isDragging ? `translate(${dragTransform.x}px, ${dragTransform.y}px)` : 'none',
    };
  }, [dragTransform.x, dragTransform.y, isDragging, isMaximized, isMinimized, position.x, position.y, size.height, size.width]);

  return {
    isMaximized,
    isMinimized,
    position,
    size,
    isDragging,
    isResizing,
    containerRef,
    handleDragStart,
    handleResizeStart,
    toggleMaximize,
    toggleMinimize,
    windowStyle,
  };
};
