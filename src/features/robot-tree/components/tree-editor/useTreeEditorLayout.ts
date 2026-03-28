import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useUIStore } from '@/store';
import { usePointerResize } from '@/shared/hooks/usePointerResize';

const TREE_SIDEBAR_MIN_WIDTH = 220;
const TREE_SIDEBAR_MAX_WIDTH = 520;
const TREE_FILE_BROWSER_MIN_HEIGHT = 140;
const TREE_FILE_BROWSER_MAX_HEIGHT = 420;

interface UseTreeEditorLayoutResult {
  width: number;
  fileBrowserHeight: number;
  isDragging: boolean;
  isFileBrowserOpen: boolean;
  isStructureOpen: boolean;
  setIsFileBrowserOpen: (isOpen: boolean) => void;
  setIsStructureOpen: (isOpen: boolean) => void;
  handleHorizontalResizeStart: (event: ReactMouseEvent) => void;
  handleVerticalResizeStart: (event: ReactMouseEvent) => void;
}

export function useTreeEditorLayout(): UseTreeEditorLayoutResult {
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(true);
  const [isStructureOpen, setIsStructureOpen] = useState(true);
  const width = useUIStore((state) => state.panelLayout.treeSidebarWidth);
  const fileBrowserHeight = useUIStore((state) => state.panelLayout.treeFileBrowserHeight);
  const setPanelLayout = useUIStore((state) => state.setPanelLayout);

  const horizontalResize = usePointerResize({
    axis: 'x',
    cursor: 'col-resize',
    min: TREE_SIDEBAR_MIN_WIDTH,
    max: TREE_SIDEBAR_MAX_WIDTH,
    value: width,
    onChange: (nextWidth) => setPanelLayout('treeSidebarWidth', nextWidth),
  });

  const verticalResize = usePointerResize({
    axis: 'y',
    cursor: 'row-resize',
    min: TREE_FILE_BROWSER_MIN_HEIGHT,
    max: TREE_FILE_BROWSER_MAX_HEIGHT,
    value: fileBrowserHeight,
    onChange: (nextHeight) => setPanelLayout('treeFileBrowserHeight', nextHeight),
  });

  return {
    width,
    fileBrowserHeight,
    isDragging: horizontalResize.isDragging || verticalResize.isDragging,
    isFileBrowserOpen,
    isStructureOpen,
    setIsFileBrowserOpen,
    setIsStructureOpen,
    handleHorizontalResizeStart: horizontalResize.handleResizeStart,
    handleVerticalResizeStart: verticalResize.handleResizeStart,
  };
}
