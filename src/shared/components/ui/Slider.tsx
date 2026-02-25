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
          onInput={(e) => handleChange(parseFloat((e.target as HTMLInputElement).value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          disabled={disabled}
          className="absolute w-full h-10 -top-2.5 opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        />
        {/* Thumb */}
        <div 
          className={`pointer-events-none absolute h-5 w-5 rounded-full bg-white transition-transform duration-150 ease-out top-1/2 -translate-y-1/2 border border-border-strong shadow-sm ${
            isDragging ? 'scale-110' : 'scale-100 group-hover:scale-105'
          }`}
          style={{ left: `calc(${clampedPercentage}% - 10px)` }}
        />
      </div>
    </div>
  );
};
