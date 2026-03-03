import React from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
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
  showValue = true,
  formatValue,
  icon,
  className = '',
  disabled = false,
}) => {
  const [localValue, setLocalValue] = React.useState(value);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  React.useEffect(() => {
    if (!isDragging) return;

    const stopDragging = () => setIsDragging(false);

    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);

    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
    };
  }, [isDragging]);

  const handleChange = (newValue: number) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const percentage = ((localValue - min) / (max - min)) * 100;
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
              <span className="text-xs font-medium text-text-primary">
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
            className="h-full bg-slider-accent transition-colors duration-200"
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => handleChange(parseFloat((e.target as HTMLInputElement).value))}
          onPointerDown={() => setIsDragging(true)}
          disabled={disabled}
          className="absolute w-full h-10 -top-2.5 opacity-0 cursor-default disabled:cursor-default z-10 appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:w-[24px] [&::-webkit-slider-thumb]:rounded-[999px] [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[24px] [&::-moz-range-thumb]:rounded-[999px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
        />
        {/* Thumb */}
        <div 
          className={`pointer-events-none absolute h-3.5 w-6 rounded-[999px] bg-white transition-transform duration-150 ease-out top-1/2 -translate-y-1/2 border border-border-strong shadow-sm ${
            isDragging ? 'scale-105' : 'scale-100 group-hover:scale-[1.02]'
          }`}
          style={{ left: `calc(${clampedPercentage}% - 12px)` }}
        />
      </div>
    </div>
  );
};
