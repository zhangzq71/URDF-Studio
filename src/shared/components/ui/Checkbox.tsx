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
          className="peer appearance-none w-4 h-4 border border-[#D1D1D6] dark:border-[#545458] rounded-[4px] bg-white dark:bg-[#2C2C2E] checked:bg-[#007AFF] dark:checked:bg-[#0A84FF] checked:border-transparent focus:outline-none transition-all duration-200"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          ref={(input) => {
            if (input) input.indeterminate = indeterminate;
          }}
        />
        <svg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      {label && (
        <span className="text-xs font-medium text-[#1C1C1E] dark:text-[#EBEBF5]">
          {label}
        </span>
      )}
    </label>
  );
};
