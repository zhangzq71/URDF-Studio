import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  bordered?: boolean;
  glass?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  bordered = true,
  glass = false, // Kept for API compatibility but implementation will ignore blur
}) => {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  // Enforce solid backgrounds
  const bgClass = 'bg-white dark:bg-[#1C1C1E]';
    
  const borderClass = bordered 
    ? 'border border-[#E5E5E5] dark:border-[#38383A]' 
    : '';

  return (
    <div className={`rounded-[12px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${bgClass} ${borderClass} ${paddings[padding]} ${className}`}>
      {children}
    </div>
  );
};
