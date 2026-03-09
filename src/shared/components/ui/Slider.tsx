import React from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  labelClassName?: string;
  showValue?: boolean;
  formatValue?: (val: number) => string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  labelClassName = '',
  showValue = true,
  formatValue,
  icon,
  className = '',
  disabled = false,
}) => {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const thumbWidth = 24;
  const halfThumb = thumbWidth / 2;
  const clampToRange = React.useCallback((nextValue: number) => {
    if (!Number.isFinite(nextValue)) return safeMin;
    return Math.min(Math.max(nextValue, safeMin), safeMax);
  }, [safeMin, safeMax]);

  const [localValue, setLocalValue] = React.useState(() => clampToRange(value));
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      setLocalValue(clampToRange(value));
    }
  }, [value, isDragging, clampToRange]);

  const stopDragging = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (!isDragging) return;

    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);
    window.addEventListener('blur', stopDragging);

    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, [isDragging, stopDragging]);

  const handleChange = React.useCallback((newValue: number) => {
    const clampedValue = clampToRange(newValue);
    setLocalValue(clampedValue);
    onChange(clampedValue);
  }, [clampToRange, onChange]);

  const range = safeMax - safeMin;
  const percentage = range > 0 ? ((localValue - safeMin) / range) * 100 : 0;
  // Visual Clamping: Ensure the slider UI stays within bounds even if value is out of range
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  
  const displayValue = formatValue ? formatValue(localValue) : localValue;

  return (
    <div className={`w-full ${className} touch-none`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {icon && <span className="text-text-tertiary">{icon}</span>}
            {label && (
              <span className={`text-xs font-medium text-text-primary ${labelClassName}`}>
                {label}
              </span>
            )}
          </div>
          {showValue && (
            <span className="text-xs font-mono text-text-tertiary tabular-nums bg-element-bg px-1.5 py-0.5 rounded-md">
              {displayValue}
            </span>
          )}
        </div>
      )}
      
      <div className="relative flex items-center h-5 select-none group">
        {/* Track Background */}
        <div className="absolute w-full h-[4px] bg-border-black rounded-full overflow-hidden">
          {/* Filled Track */}
          <div 
            className="h-full bg-system-blue-solid transition-colors duration-200"
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>
        <input
          type="range"
          min={safeMin}
          max={safeMax}
          step={step}
          value={localValue}
          onInput={(e) => handleChange(parseFloat((e.target as HTMLInputElement).value))}
          onChange={(e) => handleChange(parseFloat((e.target as HTMLInputElement).value))}
          onPointerDown={(e) => {
            e.stopPropagation();
            setIsDragging(true);
          }}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          className="absolute h-10 -top-2.5 opacity-0 cursor-default disabled:cursor-default z-10 appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:w-[24px] [&::-webkit-slider-thumb]:rounded-[999px] [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[24px] [&::-moz-range-thumb]:rounded-[999px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
          style={{
            left: `-${halfThumb}px`,
            width: `calc(100% + ${thumbWidth}px)`,
          }}
        />
        {/* Thumb */}
        <div 
          className={`pointer-events-none absolute h-3.5 w-6 rounded-[999px] bg-white transition-transform duration-150 ease-out top-1/2 -translate-y-1/2 border border-border-strong shadow-sm ${
            isDragging ? 'scale-105' : 'scale-100 group-hover:scale-[1.02]'
          }`}
          style={{ left: `calc(${clampedPercentage}% - ${halfThumb}px)` }}
        />
      </div>
    </div>
  );
};
