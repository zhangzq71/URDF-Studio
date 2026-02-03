import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || React.useId();

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 ml-0.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] 
            border border-[#E5E5E5] dark:border-[#38383A] 
            text-slate-900 dark:text-white 
            placeholder-slate-400 dark:placeholder-slate-500
            rounded-[8px] 
            ${icon ? 'pl-9 pr-3' : 'px-3'} py-1.5
            text-sm
            focus:outline-none focus:ring-2 focus:ring-[#0060FA]/30 focus:border-[#0060FA]
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500 ml-0.5">{error}</p>}
    </div>
  );
};
