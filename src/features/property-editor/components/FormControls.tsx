/**
 * Reusable form controls for the PropertyEditor feature.
 * InputGroup, CollapsibleSection, NumberInput, Vec3Input
 */
import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const InputGroup = ({ label, children, className = "" }: { label: string, children?: React.ReactNode, className?: string }) => (
  <div className={`mb-3 ${className}`}>
    <label className="block text-[10px] uppercase tracking-wider text-text-tertiary mb-1 font-semibold">{label}</label>
    {children}
  </div>
);

export const CollapsibleSection = ({ title, children, defaultOpen = true, className = "", storageKey }: { title: string, children: React.ReactNode, defaultOpen?: boolean, className?: string, storageKey?: string }) => {
  const [isOpen, setIsOpen] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`collapse_state_${storageKey}`);
      if (saved !== null) return saved === 'true';
    }
    return defaultOpen;
  });

  const toggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`collapse_state_${storageKey}`, String(newState));
    }
  };

  return (
    <div className={`border border-border-black rounded-lg overflow-hidden ${className}`}>
      <button
        className="w-full flex items-center justify-between p-2 bg-element-bg hover:bg-element-hover transition-colors text-xs font-bold text-text-secondary"
        onClick={toggle}
      >
        <span>{title}</span>
        {isOpen ? <ChevronDown className="w-3 h-3 opacity-60" /> : <ChevronRight className="w-3 h-3 opacity-60" />}
      </button>
      {isOpen && <div className="p-3 bg-panel-bg border-t border-border-black">{children}</div>}
    </div>
  );
};

export const NumberInput = ({ value, onChange, label, step = 0.1 }: { value: number, onChange: (val: number) => void, label?: string, step?: number }) => {
  const [localValue, setLocalValue] = useState<string>(value?.toString() || '0');

  useEffect(() => {
    setLocalValue(value?.toString() || '0');
  }, [value]);

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && isFinite(parsed)) {
      if (parsed !== value) {
        onChange(parsed);
      }
      setLocalValue(parsed.toString());
    } else {
      setLocalValue(value?.toString() || '0');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  return (
    <div className="flex flex-col">
      {label && <span className="text-[10px] text-text-tertiary mb-0.5">{label}</span>}
      <input
        type="number"
        step={step}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleKeyDown}
        className="bg-input-bg border border-border-strong rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-system-blue w-full"
      />
    </div>
  );
};

export interface Vec3Value {
  x?: number;
  y?: number;
  z?: number;
  r?: number;
  p?: number;
}

export const Vec3Input = ({ value, onChange, labels, keys = ['x', 'y', 'z'] }: {
  value: Vec3Value;
  onChange: (v: Vec3Value) => void;
  labels: string[];
  keys?: string[];
}) => (
  <div className="grid grid-cols-3 gap-2">
    <NumberInput
        label={labels[0]}
        value={(value as Record<string, number>)[keys[0]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[0]]: v })}
    />
    <NumberInput
        label={labels[1]}
        value={(value as Record<string, number>)[keys[1]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[1]]: v })}
    />
    <NumberInput
        label={labels[2]}
        value={(value as Record<string, number>)[keys[2]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[2]]: v })}
    />
  </div>
);
