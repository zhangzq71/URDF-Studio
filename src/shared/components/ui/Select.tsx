import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  label?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || React.useId();

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 ml-0.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`
            w-full appearance-none
            bg-[#FFFFFF] dark:bg-[#1C1C1E] 
            border border-[#E5E5E5] dark:border-[#38383A] 
            text-slate-900 dark:text-white 
            rounded-[8px] 
            px-3 py-1.5
            text-sm
            focus:outline-none focus:ring-2 focus:ring-[#0060FA]/30 focus:border-[#0060FA]
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : ''}
            ${className}
          `}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-500 ml-0.5">{error}</p>}
    </div>
  );
};
