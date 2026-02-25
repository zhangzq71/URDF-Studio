import React from 'react';

export interface SegmentedControlOption<T> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
}: SegmentedControlProps<T>) {
  const containerPadding = 'p-0.5';
  const itemPadding = size === 'xs' ? 'py-0.5' : (size === 'sm' ? 'py-1' : 'py-1.5');
  const textSize = size === 'xs' ? 'text-[11px]' : (size === 'sm' ? 'text-[13px]' : 'text-sm');
  const iconSize = size === 'xs' ? 'w-3 h-3' : (size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4');

  return (
    <div className={`bg-segmented-bg rounded-lg ${containerPadding} flex ${className}`}>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={String(option.value)}
            onClick={() => !option.disabled && onChange(option.value)}
            disabled={option.disabled}
            className={`
              flex-1 relative flex items-center justify-center gap-1.5
              ${itemPadding} ${textSize} font-medium rounded-md
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isSelected 
                ? 'bg-segmented-active text-text-primary shadow-sm' 
                : 'text-text-tertiary hover:text-text-primary'
              }
            `}
          >
            {option.icon && (
              <span className={`${isSelected ? 'text-current' : 'opacity-70'} ${iconSize} flex items-center justify-center`}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
