import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  width?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className = '',
  width = 'w-[400px]',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Overlay - No blur, just dim */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal - Solid colors, Strong shadow, larger radius */}
      <div 
        className={`
          relative bg-white dark:bg-[#2C2C2E] 
          rounded-[16px]
          shadow-[0_12px_32px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.5)]
          overflow-hidden flex flex-col
          transform transition-all duration-200 scale-100 opacity-100
          ${width} ${className}
        `}
      >
        {/* Header */}
        <div className="bg-[#F5F5F7] dark:bg-[#2C2C2E] px-4 py-3 border-b border-[#E5E5E5] dark:border-black/50 flex items-center justify-between shrink-0">
          <h2 className="text-[13px] font-semibold text-black dark:text-white truncate">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[#86868B] hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[70vh] bg-white dark:bg-[#2C2C2E]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="bg-[#F5F5F7] dark:bg-[#2C2C2E] px-4 py-3 border-t border-[#E5E5E5] dark:border-black/50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
