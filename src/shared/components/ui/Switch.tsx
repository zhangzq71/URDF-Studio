import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
}) => {
  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const sizes = {
    sm: {
      switch: "h-4 w-7",
      dot: "h-3 w-3",
      translate: "translate-x-3",
    },
    md: {
      switch: "h-[31px] w-[51px]", // Standard iOS size is roughly this, but let's stick to a bit smaller for desktop: h-6 w-11
      dot: "h-[27px] w-[27px]",
      translate: "translate-x-[20px]",
    },
  };
  
  // Overriding sizes for a more desktop-friendly compact look while maintaining the style
  const desktopSizes = {
    sm: {
      switch: "h-4 w-8 p-[2px]",
      dot: "h-3 w-3",
      translate: "translate-x-4",
    },
    md: {
      switch: "h-6 w-10 p-[2px]",
      dot: "h-5 w-5",
      translate: "translate-x-4",
    },
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      {label && (
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 select-none cursor-pointer" onClick={handleToggle}>
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleToggle}
        disabled={disabled}
        className={`
          relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none box-content
          ${checked ? 'bg-[#007AFF] dark:bg-[#0A84FF]' : 'bg-[#E9E9EA] dark:bg-[#1C1C1E]'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${desktopSizes[size].switch}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block transform rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] ring-0 
            transition duration-200 ease-in-out
            ${checked ? desktopSizes[size].translate : 'translate-x-0'}
            ${desktopSizes[size].dot}
          `}
        />
      </button>
    </div>
  );
};
