/**
 * Shared UI Components for Options Panels
 * Extracted common patterns from Visualizer.tsx and URDFViewer.tsx
 */

import React, { useRef, useState, useCallback, ReactNode } from 'react';
import { 
  Checkbox, 
  Slider as UiSlider, 
  SegmentedControl as UiSegmentedControl,
  Separator,
  SegmentedControlOption as UiSegmentedControlOption
} from '@/shared/components/ui';

// Drag grip icon SVG path
const DRAG_GRIP_PATH = "M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z";

// Chevron icons
const ChevronDown = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUp = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const ChevronRight = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const DragGripIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d={DRAG_GRIP_PATH} />
  </svg>
);

// ============== File Icon ==============
const FileIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// ============== Model Header Badge ==============
interface ModelHeaderBadgeProps {
  fileName: string;
}

export const ModelHeaderBadge: React.FC<ModelHeaderBadgeProps> = ({ fileName }) => {
  return (
    <div className="px-3 py-2 bg-slate-50 dark:bg-google-dark-bg border-b border-slate-200 dark:border-google-dark-border">
      <div className="flex items-center gap-2">
        <FileIcon />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5 whitespace-nowrap">
            Loaded Model
          </div>
          <div className="text-[10px] text-slate-700 dark:text-slate-300 font-medium truncate" title={fileName}>
            {fileName}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============== Checkbox Option ==============
interface CheckboxOptionProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  icon?: ReactNode;
  compact?: boolean;
}

export const CheckboxOption: React.FC<CheckboxOptionProps> = ({
  checked,
  onChange,
  label,
  icon,
  compact = false,
}) => {
  // Use the new Checkbox component but preserve the layout logic
  const content = (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[11px] leading-tight">{label}</span>
    </div>
  );

  return (
    <div className={compact ? "px-1 py-0.5" : ""}>
      <Checkbox
        checked={checked}
        onChange={onChange}
        label={content as any} 
        className="text-[11px]" // Ensure checkbox text is small
      />
    </div>
  );
};

// ============== Slider Option ==============
interface SliderOptionProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  indent?: boolean;
  compact?: boolean;
  icon?: ReactNode;
  showPercentage?: boolean;
}

export const SliderOption: React.FC<SliderOptionProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  decimals = 2,
  indent = true,
  compact = false,
  icon,
  showPercentage = false,
}) => {
  const paddingClass = compact
    ? `${indent ? 'pl-4' : ''} pr-3 pb-1`
    : `${indent ? 'pl-6' : ''} pr-3 pb-2`;

  return (
    <div className={paddingClass}>
      <UiSlider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        label={label}
        icon={icon}
        showValue={true}
        formatValue={(val) => showPercentage ? `${Math.round(val * 100)}%` : val.toFixed(decimals)}
        className={compact ? "scale-95 origin-left" : ""}
        labelClassName="text-[10px] text-slate-500 mb-1" // Smaller label
      />
    </div>
  );
};

// ============== Segmented Control (Apple Style with Blue Selection) ==============
// Re-exporting or wrapping the UI component
interface SegmentedControlProps<T> {
  options: UiSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm' | 'md';
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'xs', // Default to xs for option panels
}: SegmentedControlProps<T>) {
  return (
    <div className="mb-1">
      <UiSegmentedControl
        options={options}
        value={value}
        onChange={onChange}
        size={size}
      />
    </div>
  );
}

// Deprecated: Use SegmentedControl instead
export const ToggleButtonGroup = SegmentedControl;

// ============== Section Divider ==============
export const SectionDivider = () => (
  <div className="border-t border-slate-200 dark:border-white/10 my-1" />
);

// ============== Collapsible Section ==============
interface CollapsibleSectionProps {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isCollapsed,
  onToggle,
  children,
}) => {
  return (
    <div className="border-t border-black/5 dark:border-white/5 first:border-t-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
      >
        <span>{title}</span>
        <span className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
          <ChevronRight />
        </span>
      </button>
      <div 
        className={`overflow-hidden transition-all duration-200 ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[300px] opacity-100'
        }`}
      >
        <div className="p-2 space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
};


// ============== Options Panel Header ==============
interface OptionsPanelHeaderProps {
  title: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  expandText?: string;
  collapseText?: string;
  closeText?: string;
  additionalControls?: ReactNode;
}

export const OptionsPanelHeader: React.FC<OptionsPanelHeaderProps> = ({
  title,
  isCollapsed,
  onToggleCollapse,
  onClose,
  onMouseDown,
  expandText = "Expand",
  collapseText = "Collapse",
  closeText = "Close",
  additionalControls,
}) => {
  return (
    <div
      className="text-[10px] text-slate-500 uppercase font-bold tracking-wider px-3 py-2 cursor-move bg-slate-100 dark:bg-google-dark-bg hover:bg-slate-100 dark:hover:bg-google-dark-bg select-none flex items-center justify-between shrink-0"
      onMouseDown={onMouseDown}
    >
      <div className="flex items-center gap-2">
        <DragGripIcon />
        <span className="leading-tight">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        {additionalControls}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="p-1 hover:bg-slate-200 dark:hover:bg-element-hover rounded-md transition-colors"
          title={isCollapsed ? expandText : collapseText}
        >
          {isCollapsed ? <ChevronDown /> : <ChevronUp />}
        </button>
        {onClose && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 text-slate-500 hover:bg-red-500 hover:text-white dark:text-slate-400 dark:hover:bg-red-600 dark:hover:text-white rounded transition-colors"
            title={closeText}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
};

// ============== Options Panel Content ==============
interface OptionsPanelContentProps {
  isCollapsed: boolean;
  children: ReactNode;
  className?: string;
}

export const OptionsPanelContent: React.FC<OptionsPanelContentProps> = ({
  isCollapsed,
  children,
  className = '',
}) => {
  return (
    <div
      className={`transition-all duration-200 ease-in-out ${
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[70vh] opacity-100'
      } ${className} flex flex-col min-h-0`}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0">
         {/* No padding here, padding moved to sections or specific children */}
         {children}
      </div>
    </div>
  );
};

// ============== Options Panel Container ==============
interface OptionsPanelContainerProps {
  children: ReactNode;
  className?: string;
  width?: number | string;
  height?: number | string;
  resizable?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export const OptionsPanelContainer: React.FC<OptionsPanelContainerProps> = ({
  children,
  className = '',
  width = '13rem',
  height,
  resizable = false,
  minWidth = 160,
  maxWidth = 600,
  minHeight = 150,
  maxHeight = 800,
}) => {
  const [panelSize, setPanelSize] = useState<{ width: number | string; height: number | string }>({
    width,
    height: height || 'auto',
  });
  
  const startSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const startPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeDirection = useRef<'right' | 'bottom' | 'corner' | null>(null);

  const handleResizeStart = (e: React.MouseEvent, direction: 'right' | 'bottom' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentElement = e.currentTarget.parentElement;
    if (currentElement) {
        startSize.current = {
            width: currentElement.offsetWidth,
            height: currentElement.offsetHeight
        };
        startPos.current = { x: e.clientX, y: e.clientY };
        resizeDirection.current = direction;
        
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        
        const cursor = direction === 'right' ? 'ew-resize' : direction === 'bottom' ? 'ns-resize' : 'nwse-resize';
        document.body.style.cursor = cursor;
        document.body.style.userSelect = 'none';
    }
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeDirection.current) return;

    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    
    let newWidth = startSize.current.width;
    let newHeight = startSize.current.height;

    if (resizeDirection.current === 'right' || resizeDirection.current === 'corner') {
        newWidth += deltaX;
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;
    }

    if (resizeDirection.current === 'bottom' || resizeDirection.current === 'corner') {
        newHeight += deltaY;
        if (newHeight < minHeight) newHeight = minHeight;
        if (newHeight > maxHeight) newHeight = maxHeight;
    }
    
    setPanelSize(prev => ({
        width: (resizeDirection.current === 'right' || resizeDirection.current === 'corner') ? newWidth : prev.width,
        height: (resizeDirection.current === 'bottom' || resizeDirection.current === 'corner') ? newHeight : prev.height
    }));
  };

  const handleResizeEnd = () => {
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizeDirection.current = null;
  };

  return (
    <div
      className={`bg-white dark:bg-[#1E1E1E] rounded-xl border border-black/5 dark:border-white/10 flex flex-col shadow-xl overflow-hidden relative @container ${className}`}
      style={{ width: panelSize.width, height: panelSize.height }}
    >
      {children}
      {resizable && (
        <>
            {/* Right Handle */}
            <div 
                className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize z-40 hover:bg-blue-500/20 transition-colors"
                onMouseDown={(e) => handleResizeStart(e, 'right')}
            />
            {/* Bottom Handle */}
            <div 
                className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize z-40 hover:bg-blue-500/20 transition-colors"
                onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            />
            {/* Corner Handle */}
            <div 
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-transparent"
                onMouseDown={(e) => handleResizeStart(e, 'corner')}
                title="Resize"
            >
                <svg viewBox="0 0 6 6" className="w-2 h-2 text-slate-400 fill-current transform rotate-45 pointer-events-none">
                    <path d="M4 4 L6 6 M2 2 L6 2 L6 6 L2 6 Z" />
                </svg>
            </div>
        </>
      )}
    </div>
  );
};;

// ============== Draggable Options Panel Hook ==============
interface DraggablePanelState {
  position: { x: number; y: number } | null;
  isCollapsed: boolean;
}

interface UseDraggablePanelReturn {
  panelRef: React.RefObject<HTMLDivElement | null>;
  position: { x: number; y: number } | null;
  isCollapsed: boolean;
  setPosition: (pos: { x: number; y: number } | null) => void;
  toggleCollapsed: () => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: () => void;
}

export function useDraggablePanel(
  initialCollapsed: boolean = false
): UseDraggablePanelReturn {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const dragOffset = useRef({ x: 0, y: 0 });

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (panelRef.current) {
      // Direct DOM manipulation for performance (avoids React re-renders during drag)
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      
      panelRef.current.style.left = `${newX}px`;
      panelRef.current.style.top = `${newY}px`;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Sync final position to React state to persist it
    if (panelRef.current) {
       // We can read the style we just set, or recalculate.
       // Recalculating from the last event would require the event object, 
       // but handleMouseUp usually doesn't need coordinates if we trust the DOM.
       // However, we need to save the 'x' and 'y' numbers.
       // Let's parse them from the style or bounding rect?
       // Bounding rect is safest.
       const rect = panelRef.current.getBoundingClientRect();
       // NOTE: We need the position relative to the viewport/offset parent.
       // Since OptionsPanel uses `fixed` or `absolute` positioning typically...
       // The original logic used `clientX - offset`.
       // We can't easily get `clientX` here if we don't accept the event.
       // But wait, the previous interface had `handleMouseUp: () => void`. 
       // Let's change it to accept `MouseEvent` or just read from DOM.
       
       const left = parseFloat(panelRef.current.style.left || '0');
       const top = parseFloat(panelRef.current.style.top || '0');
       setPosition({ x: left, y: top });
    }
  }, [handleMouseMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  }, [handleMouseMove, handleMouseUp]);

  return {
    panelRef,
    position,
    isCollapsed,
    setPosition,
    toggleCollapsed,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}

// ============== Complete Options Panel ==============
interface OptionsPanelProps {
  title: string;
  show: boolean;
  onClose?: () => void;
  position?: { x: number; y: number } | null;
  defaultPosition?: { top?: string; right?: string; left?: string; bottom?: string; transform?: string };
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
  zIndex?: number;
  width?: number | string;
  height?: number | string;
  resizable?: boolean;
  additionalControls?: ReactNode;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  title,
  show,
  onClose,
  position,
  defaultPosition = { top: '16px', right: '16px' },
  isCollapsed,
  onToggleCollapse,
  onMouseDown,
  panelRef,
  children,
  zIndex = 10,
  width,
  height,
  resizable,
  additionalControls,
}) => {
  if (!show) return null;

  // When position is set (dragged), use pixel positioning without transform
  // When using defaultPosition, preserve all CSS properties including transform
  const style = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto', transform: 'none' }
    : defaultPosition;

  return (
    <div
      ref={panelRef}
      className={`absolute z-${zIndex} pointer-events-auto`}
      style={style as React.CSSProperties}
    >
      <OptionsPanelContainer width={width} height={height} resizable={resizable}>
        <OptionsPanelHeader
          title={title}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          onClose={onClose}
          onMouseDown={onMouseDown}
          additionalControls={additionalControls}
        />
        <OptionsPanelContent isCollapsed={isCollapsed}>
          {children}
        </OptionsPanelContent>
      </OptionsPanelContainer>
    </div>
  );
};

export { DragGripIcon, ChevronDown, ChevronUp, CloseIcon, ChevronRight };