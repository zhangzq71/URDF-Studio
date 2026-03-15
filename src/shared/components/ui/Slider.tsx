import React from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
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
  onChangeStart,
  onChangeEnd,
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
  const thumbWidth = 18;
  const halfThumb = thumbWidth / 2;
  const sliderRef = React.useRef<HTMLDivElement>(null);
  const clampToRange = React.useCallback((nextValue: number) => {
    if (!Number.isFinite(nextValue)) return safeMin;
    return Math.min(Math.max(nextValue, safeMin), safeMax);
  }, [safeMin, safeMax]);

  const [localValue, setLocalValue] = React.useState(() => clampToRange(value));
  const [isDragging, setIsDragging] = React.useState(false);
  const [isThumbHovered, setIsThumbHovered] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      setLocalValue(clampToRange(value));
    }
  }, [value, isDragging, clampToRange]);

  const stopDragging = React.useCallback(() => {
    setIsDragging(false);
    onChangeEnd?.();
  }, [onChangeEnd]);

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
  const updateThumbHover = React.useCallback((clientX: number, clientY: number) => {
    if (disabled) {
      setIsThumbHovered(false);
      return;
    }

    const sliderElement = sliderRef.current;
    if (!sliderElement) {
      setIsThumbHovered(false);
      return;
    }

    const rect = sliderElement.getBoundingClientRect();
    const thumbCenterX = rect.left + (clampedPercentage / 100) * rect.width;
    const thumbCenterY = rect.top + rect.height / 2;
    const withinX = Math.abs(clientX - thumbCenterX) <= halfThumb + 6;
    const withinY = Math.abs(clientY - thumbCenterY) <= 14;

    setIsThumbHovered(withinX && withinY);
  }, [clampedPercentage, disabled, halfThumb]);

  const displayValue = formatValue ? formatValue(localValue) : localValue;
  const thumbBoxShadow = disabled
    ? 'var(--ui-slider-thumb-shadow)'
    : isDragging
      ? 'var(--ui-slider-thumb-shadow-active)'
      : isThumbHovered
        ? 'var(--ui-slider-thumb-shadow-hover)'
        : 'var(--ui-slider-thumb-shadow)';
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
      
      <div
        ref={sliderRef}
        className="group relative flex h-6 select-none items-center"
        onPointerEnter={(e) => updateThumbHover(e.clientX, e.clientY)}
        onPointerMove={(e) => updateThumbHover(e.clientX, e.clientY)}
        onPointerLeave={() => setIsThumbHovered(false)}
      >
        {/* Track Background */}
        <div className="absolute h-[3px] w-full overflow-hidden rounded-full bg-slider-track">
          {/* Filled Track */}
          <div 
            className="h-full bg-slider-accent transition-colors duration-200"
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
            onChangeStart?.();
          }}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          className="absolute -top-1.5 z-10 h-8 cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent"
          style={{
            left: `-${halfThumb}px`,
            width: `calc(100% + ${thumbWidth}px)`,
          }}
        />
        {/* Thumb */}
        <div
          className={`pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full transition-[transform,box-shadow] duration-150 ease-out group-focus-within:scale-105 group-focus-within:ring-4 group-focus-within:ring-system-blue/15 ${
            disabled
              ? 'opacity-60'
              : isDragging
                ? 'scale-110 ring-4 ring-system-blue/15'
                : isThumbHovered
                  ? 'scale-[1.04]'
                  : 'scale-100'
          }`}
          data-hovered={isThumbHovered ? 'true' : 'false'}
          style={{
            left: `calc(${clampedPercentage}% - ${halfThumb}px)`,
            backgroundColor: 'var(--ui-slider-thumb-bg)',
            border: '1px solid var(--ui-slider-thumb-border)',
            boxShadow: thumbBoxShadow,
          }}
        />
      </div>
    </div>
  );
};
