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

  // Desktop-friendly compact sizes with proper alignment
  const desktopSizes = {
    sm: {
      switch: "h-4 w-8",
      dot: "h-3 w-3",
      translate: "translate-x-4",
    },
    md: {
      switch: "h-6 w-11",
      dot: "h-5 w-5",
      translate: "translate-x-5",
    },
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      {label && (
        <span className="text-xs font-medium text-text-secondary select-none cursor-pointer" onClick={handleToggle}>
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
          relative inline-flex items-center shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 p-0.5
          ${checked ? 'bg-system-blue-solid' : 'bg-switch-off'}
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
