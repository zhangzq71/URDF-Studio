import { useUIStore } from '@/store';
import { usePointerResize } from '@/shared/hooks/usePointerResize';

const PROPERTY_EDITOR_MIN_WIDTH = 220;
const PROPERTY_EDITOR_MAX_WIDTH = 420;

export function useResizablePanel(collapsed?: boolean) {
  const width = useUIStore((state) => state.panelLayout.propertyEditorWidth);
  const setPanelLayout = useUIStore((state) => state.setPanelLayout);

  const resize = usePointerResize({
    axis: 'x',
    cursor: 'col-resize',
    direction: -1,
    min: PROPERTY_EDITOR_MIN_WIDTH,
    max: PROPERTY_EDITOR_MAX_WIDTH,
    value: width,
    onChange: (nextWidth) => setPanelLayout('propertyEditorWidth', nextWidth),
  });

  return {
    width,
    displayWidth: collapsed ? 0 : width,
    isDragging: resize.isDragging,
    handleResizeMouseDown: resize.handleResizeStart,
  };
}
