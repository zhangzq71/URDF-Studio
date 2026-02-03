import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none";
  
  const variants = {
    primary: "bg-[#0060FA] hover:bg-[#0050D0] active:bg-[#0040B0] text-white shadow-sm border border-transparent",
    secondary: "bg-white dark:bg-white/10 border border-[#E5E5E5] dark:border-transparent text-slate-700 dark:text-white hover:bg-[#F5F5F7] dark:hover:bg-white/15 active:bg-[#E5E5E5] dark:active:bg-white/20 shadow-sm",
    ghost: "bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 active:bg-black/10 dark:active:bg-white/20",
    danger: "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm border border-transparent",
  };

  const sizes = {
    sm: "text-xs px-2.5 py-1 rounded-[6px] gap-1.5",
    md: "text-sm px-4 py-1.5 rounded-[8px] gap-2",
    lg: "text-base px-5 py-2.5 rounded-[10px] gap-2.5",
    icon: "p-1.5 rounded-[6px]",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && icon && <span className="flex items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
};
