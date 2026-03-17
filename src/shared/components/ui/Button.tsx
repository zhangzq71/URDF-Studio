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
    primary: "bg-system-blue-solid hover:bg-system-blue-hover active:bg-system-blue-active text-white shadow-sm border border-transparent",
    secondary: "bg-panel-bg border border-border-black text-text-primary hover:bg-element-bg active:bg-element-active shadow-sm",
    ghost: "bg-transparent hover:bg-element-hover text-text-secondary active:bg-element-active",
    danger: "bg-danger hover:bg-danger-hover active:bg-danger-active text-white shadow-sm border border-transparent",
  };

  const sizes = {
    sm: "text-xs px-2.5 py-1 rounded-md gap-1.5",
    md: "text-sm px-4 py-1.5 rounded-lg gap-2",
    lg: "text-base px-5 py-2.5 rounded-xl gap-2.5",
    icon: "p-1.5 rounded-md",
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
