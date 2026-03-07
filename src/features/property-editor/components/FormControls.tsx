/**
 * Reusable form controls for the PropertyEditor feature.
 * InputGroup, CollapsibleSection, NumberInput, Vec3Input
 */
import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const PROPERTY_EDITOR_PANEL_EYEBROW_CLASS =
  'text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary';
export const PROPERTY_EDITOR_PANEL_TITLE_CLASS =
  'text-[13px] font-semibold leading-5 text-text-primary';
export const PROPERTY_EDITOR_SECTION_TITLE_CLASS =
  'text-[11px] font-semibold leading-4 text-text-primary';
export const PROPERTY_EDITOR_FIELD_LABEL_CLASS =
  'block text-[10px] font-semibold uppercase tracking-[0.14em] leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_SUBLABEL_CLASS =
  'text-[10px] font-medium leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_HELPER_TEXT_CLASS =
  'text-[10px] leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_INPUT_CLASS =
  'h-8 w-full rounded-md border border-border-strong bg-input-bg px-2.5 text-[12px] leading-4 text-text-primary focus:outline-none focus:border-system-blue focus:ring-2 focus:ring-system-blue/25';
export const PROPERTY_EDITOR_SELECT_CLASS = `${PROPERTY_EDITOR_INPUT_CLASS} pr-8`;
export const PROPERTY_EDITOR_COMPACT_INPUT_CLASS =
  'h-7 w-full rounded-md border border-border-strong bg-input-bg px-2 text-[12px] leading-4 text-text-primary focus:outline-none focus:border-system-blue focus:ring-2 focus:ring-system-blue/25';
export const PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS =
  'shrink-0 text-[10px] font-semibold leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_SECTION_TRIGGER_CLASS =
  'w-full flex items-center justify-between px-2.5 py-2 bg-element-bg hover:bg-element-hover transition-colors text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary';
export const PROPERTY_EDITOR_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-[11px] font-medium text-system-blue hover:text-system-blue-hover transition-colors';
export const PROPERTY_EDITOR_PRIMARY_BUTTON_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-system-blue-solid px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-system-blue-hover';
export const PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border-strong px-2.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-element-hover';

export const InputGroup = ({ label, children, className = "" }: { label: string, children?: React.ReactNode, className?: string }) => (
  <div className={`mb-2.5 ${className}`}>
    <label className={`${PROPERTY_EDITOR_FIELD_LABEL_CLASS} mb-1`}>{label}</label>
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
        className={PROPERTY_EDITOR_SECTION_TRIGGER_CLASS}
        onClick={toggle}
      >
        <span>{title}</span>
        {isOpen ? <ChevronDown className="w-3 h-3 opacity-60" /> : <ChevronRight className="w-3 h-3 opacity-60" />}
      </button>
      {isOpen && <div className="p-2.5 bg-panel-bg border-t border-border-black">{children}</div>}
    </div>
  );
};

export const NumberInput = ({ value, onChange, label, step = 0.1, compact = false }: { value: number, onChange: (val: number) => void, label?: string, step?: number, compact?: boolean }) => {
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
      {label && <span className={`${PROPERTY_EDITOR_SUBLABEL_CLASS} mb-1`}>{label}</span>}
      <input
        type="number"
        step={step}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleKeyDown}
        className={compact ? PROPERTY_EDITOR_COMPACT_INPUT_CLASS : PROPERTY_EDITOR_INPUT_CLASS}
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

const InlineNumberInput = ({ value, onChange, label, step = 0.1, compact = false }: { value: number, onChange: (val: number) => void, label: string, step?: number, compact?: boolean }) => {
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

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS}>{label}</span>
      <input
        type="number"
        step={step}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleKeyDown}
        className={`${compact ? PROPERTY_EDITOR_COMPACT_INPUT_CLASS : PROPERTY_EDITOR_INPUT_CLASS} min-w-0 flex-1`}
      />
    </div>
  );
};

export const Vec3Input = ({ value, onChange, labels, keys = ['x', 'y', 'z'], compact = false }: {
  value: Vec3Value;
  onChange: (v: Vec3Value) => void;
  labels: string[];
  keys?: string[];
  compact?: boolean;
}) => (
  <div className="grid grid-cols-3 gap-2">
    <NumberInput
        label={labels[0]}
        value={(value as Record<string, number>)[keys[0]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[0]]: v })}
        compact={compact}
    />
    <NumberInput
        label={labels[1]}
        value={(value as Record<string, number>)[keys[1]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[1]]: v })}
        compact={compact}
    />
    <NumberInput
        label={labels[2]}
        value={(value as Record<string, number>)[keys[2]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[2]]: v })}
        compact={compact}
    />
  </div>
);

export const Vec3InlineInput = ({ value, onChange, labels, keys = ['x', 'y', 'z'], compact = false }: {
  value: Vec3Value;
  onChange: (v: Vec3Value) => void;
  labels: string[];
  keys?: string[];
  compact?: boolean;
}) => (
  <div className="grid grid-cols-3 gap-2">
    <InlineNumberInput
      label={labels[0]}
      value={(value as Record<string, number>)[keys[0]] ?? 0}
      onChange={(v: number) => onChange({ ...value, [keys[0]]: v })}
      compact={compact}
    />
    <InlineNumberInput
      label={labels[1]}
      value={(value as Record<string, number>)[keys[1]] ?? 0}
      onChange={(v: number) => onChange({ ...value, [keys[1]]: v })}
      compact={compact}
    />
    <InlineNumberInput
      label={labels[2]}
      value={(value as Record<string, number>)[keys[2]] ?? 0}
      onChange={(v: number) => onChange({ ...value, [keys[2]]: v })}
      compact={compact}
    />
  </div>
);
