import React from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  indeterminate?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  indeterminate = false,
}) => {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <div className="relative flex items-center">
        <input
          type="checkbox"
          className="peer h-[15px] w-[15px] appearance-none rounded-[4px] border border-border-strong bg-panel-bg shadow-sm transition-[background-color,border-color,box-shadow] duration-150 hover:border-system-blue/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 checked:border-system-blue checked:bg-system-blue"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          ref={(input) => {
            if (input) input.indeterminate = indeterminate;
          }}
        />
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.75" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      {label && (
        <span className="text-xs font-medium text-text-primary">
          {label}
        </span>
      )}
    </label>
  );
};
