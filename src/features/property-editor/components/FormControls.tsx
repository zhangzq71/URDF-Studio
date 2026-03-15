/**
 * Reusable form controls for the PropertyEditor feature.
 * InputGroup, CollapsibleSection, NumberInput, Vec3Input
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import {
  MAX_PROPERTY_DECIMALS,
  formatNumberWithMaxDecimals,
  roundToMaxDecimals,
} from '@/core/utils/numberPrecision';
import {
  PROPERTY_EDITOR_STEPPER_REPEAT_DELAY_MS,
  PROPERTY_EDITOR_STEPPER_REPEAT_INTERVAL_MS,
} from '../constants';

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
export const PROPERTY_EDITOR_NUMBER_FIELD_SHELL_CLASS =
  'flex h-8 w-full items-stretch overflow-hidden rounded-md border border-border-strong bg-input-bg text-text-primary transition-colors focus-within:border-system-blue focus-within:ring-2 focus-within:ring-system-blue/25';
export const PROPERTY_EDITOR_COMPACT_NUMBER_FIELD_SHELL_CLASS =
  'flex h-7 w-full items-stretch overflow-hidden rounded-md border border-border-strong bg-input-bg text-text-primary transition-colors focus-within:border-system-blue focus-within:ring-2 focus-within:ring-system-blue/25';
export const PROPERTY_EDITOR_STEPPER_RAIL_CLASS =
  'flex w-6 shrink-0 flex-col border-l border-border-black/60 bg-element-bg/70';
export const PROPERTY_EDITOR_STEPPER_BUTTON_CLASS =
  'flex flex-1 min-h-0 items-center justify-center px-1 text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary focus:outline-none focus-visible:bg-element-hover focus-visible:text-text-primary';
export const PROPERTY_EDITOR_SECTION_TRIGGER_CLASS =
  'w-full flex items-center justify-between px-2.5 py-2 bg-element-bg hover:bg-element-hover transition-colors text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary';
export const PROPERTY_EDITOR_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-[11px] font-medium text-system-blue hover:text-system-blue-hover transition-colors';
export const PROPERTY_EDITOR_PRIMARY_BUTTON_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-system-blue-solid px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-system-blue-hover';
export const PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border-strong px-2.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-element-hover';
export const PROPERTY_EDITOR_ICON_SEGMENTED_GROUP_CLASS =
  'grid gap-1 rounded-lg border border-border-strong bg-element-bg/70 p-1';
export const PROPERTY_EDITOR_ICON_SEGMENTED_BUTTON_CLASS =
  'inline-flex h-8 w-full items-center justify-center rounded-md text-text-secondary transition-all duration-150 hover:bg-element-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30';

interface IconSegmentedOption<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
}

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

export const IconSegmentedControl = <T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: IconSegmentedOption<T>[];
  ariaLabel: string;
}) => (
  <div
    className={PROPERTY_EDITOR_ICON_SEGMENTED_GROUP_CLASS}
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    role="radiogroup"
    aria-label={ariaLabel}
  >
    {options.map((option) => {
      const Icon = option.icon;
      const isSelected = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isSelected}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={`${PROPERTY_EDITOR_ICON_SEGMENTED_BUTTON_CLASS} ${
            isSelected
              ? 'bg-panel-bg text-system-blue shadow-sm ring-1 ring-border-black/60 dark:bg-segmented-active dark:text-white'
              : ''
          }`}
        >
          <Icon size={15} strokeWidth={isSelected ? 2.2 : 1.9} />
          <span className="sr-only">{option.label}</span>
        </button>
      );
    })}
  </div>
);

const usePressAndHoldStepper = (
  onStep: (direction: 1 | -1) => void,
  repeatIntervalMs: number = PROPERTY_EDITOR_STEPPER_REPEAT_INTERVAL_MS,
) => {
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const suppressClickRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const stopPressAndHold = useCallback(() => {
    clearTimers();
    if (longPressTriggeredRef.current) {
      suppressClickRef.current = true;
    }
    longPressTriggeredRef.current = false;
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const startPressAndHold = useCallback((direction: 1 | -1) => {
    clearTimers();
    longPressTriggeredRef.current = false;
    holdTimeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onStep(direction);
      holdIntervalRef.current = window.setInterval(() => {
        onStep(direction);
      }, repeatIntervalMs);
    }, PROPERTY_EDITOR_STEPPER_REPEAT_DELAY_MS);
  }, [clearTimers, onStep, repeatIntervalMs]);

  const stepperButtonProps = useCallback((direction: 1 | -1, label: string) => ({
    type: 'button' as const,
    'aria-label': label,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startPressAndHold(direction);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
      stopPressAndHold();
    },
    onPointerCancel: () => {
      stopPressAndHold();
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        e.preventDefault();
        return;
      }
      onStep(direction);
    },
  }), [onStep, startPressAndHold, stopPressAndHold]);

  return { stepperButtonProps };
};

const useInputSelectionBehavior = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerFocusIntentRef = useRef(false);

  const clearPointerFocusIntent = useCallback(() => {
    pointerFocusIntentRef.current = false;
  }, []);

  const handleInputPointerDown = useCallback(() => {
    pointerFocusIntentRef.current = true;
  }, []);

  const handleInputFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    if (!pointerFocusIntentRef.current) {
      event.target.select();
    }
    clearPointerFocusIntent();
  }, [clearPointerFocusIntent]);

  const collapseInputSelection = useCallback(() => {
    clearPointerFocusIntent();
    const input = inputRef.current;
    if (!input || document.activeElement !== input) {
      return;
    }

    const caretPosition = input.value.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }, [clearPointerFocusIntent]);

  return {
    inputRef,
    handleInputFocus,
    handleInputPointerDown,
    clearPointerFocusIntent,
    collapseInputSelection,
  };
};

export const NumberInput = ({
  value,
  onChange,
  label,
  suffix,
  step = 0.1,
  compact = false,
  precision = MAX_PROPERTY_DECIMALS,
  repeatIntervalMs,
}: {
  value: number,
  onChange: (val: number) => void,
  label?: string,
  suffix?: string,
  step?: number,
  compact?: boolean,
  precision?: number,
  repeatIntervalMs?: number,
}) => {
  const [localValue, setLocalValue] = useState<string>(
    formatNumberWithMaxDecimals(value ?? 0, precision) || '0',
  );
  const latestCommittedValueRef = useRef<number>(value ?? 0);
  const draftValueRef = useRef<string>(
    formatNumberWithMaxDecimals(value ?? 0, precision) || '0',
  );
  const {
    inputRef,
    handleInputFocus,
    handleInputPointerDown,
    clearPointerFocusIntent,
    collapseInputSelection,
  } = useInputSelectionBehavior();

  useEffect(() => {
    const nextValue = formatNumberWithMaxDecimals(value ?? 0, precision) || '0';
    latestCommittedValueRef.current = value ?? 0;
    draftValueRef.current = nextValue;
    setLocalValue(nextValue);
  }, [precision, value]);

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && isFinite(parsed)) {
      commitValue(parsed);
    } else {
      setLocalValue(formatNumberWithMaxDecimals(value ?? 0, precision) || '0');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyStep(1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyStep(-1);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    draftValueRef.current = e.target.value;
    setLocalValue(e.target.value);
  };

  const commitValue = (nextValue: number) => {
    const rounded = roundToMaxDecimals(nextValue, precision);
    const formatted = formatNumberWithMaxDecimals(rounded, precision) || '0';
    latestCommittedValueRef.current = rounded;
    draftValueRef.current = formatted;
    if (rounded !== value) {
      onChange(rounded);
    }
    setLocalValue(formatted);
  };

  const applyStep = (direction: 1 | -1) => {
    collapseInputSelection();
    const parsed = parseFloat(draftValueRef.current);
    const baseValue = Number.isFinite(parsed) ? parsed : latestCommittedValueRef.current;
    commitValue(baseValue + direction * step);
  };

  const { stepperButtonProps } = usePressAndHoldStepper(applyStep, repeatIntervalMs);

  return (
    <div className="flex flex-col">
      {label && <span className={`${PROPERTY_EDITOR_SUBLABEL_CLASS} mb-1`}>{label}</span>}
      <div className={compact ? PROPERTY_EDITOR_COMPACT_NUMBER_FIELD_SHELL_CLASS : PROPERTY_EDITOR_NUMBER_FIELD_SHELL_CLASS}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={localValue}
          onChange={handleChange}
          onBlur={() => {
            clearPointerFocusIntent();
            handleBlur();
          }}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          onPointerDown={handleInputPointerDown}
          onPointerUp={clearPointerFocusIntent}
          onPointerCancel={clearPointerFocusIntent}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-[12px] leading-4 text-text-primary outline-none"
        />
        {suffix ? (
          <span className="shrink-0 border-l border-border-black/60 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            {suffix}
          </span>
        ) : null}
        <div className={PROPERTY_EDITOR_STEPPER_RAIL_CLASS}>
          <button
            {...stepperButtonProps(1, label ? `Increase ${label}` : 'Increase value')}
            className={PROPERTY_EDITOR_STEPPER_BUTTON_CLASS}
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            {...stepperButtonProps(-1, label ? `Decrease ${label}` : 'Decrease value')}
            className={`${PROPERTY_EDITOR_STEPPER_BUTTON_CLASS} border-t border-border-black/60`}
          >
            <Minus className="h-3 w-3" />
          </button>
        </div>
      </div>
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

const InlineNumberInput = ({
  value,
  onChange,
  label,
  step = 0.1,
  compact = false,
  precision = MAX_PROPERTY_DECIMALS,
  repeatIntervalMs,
}: {
  value: number,
  onChange: (val: number) => void,
  label: string,
  step?: number,
  compact?: boolean,
  precision?: number,
  repeatIntervalMs?: number,
}) => {
  const [localValue, setLocalValue] = useState<string>(
    formatNumberWithMaxDecimals(value ?? 0, precision) || '0',
  );
  const latestCommittedValueRef = useRef<number>(value ?? 0);
  const draftValueRef = useRef<string>(
    formatNumberWithMaxDecimals(value ?? 0, precision) || '0',
  );
  const {
    inputRef,
    handleInputFocus,
    handleInputPointerDown,
    clearPointerFocusIntent,
    collapseInputSelection,
  } = useInputSelectionBehavior();

  useEffect(() => {
    const nextValue = formatNumberWithMaxDecimals(value ?? 0, precision) || '0';
    latestCommittedValueRef.current = value ?? 0;
    draftValueRef.current = nextValue;
    setLocalValue(nextValue);
  }, [precision, value]);

  const commitValue = (nextValue: number) => {
    const rounded = roundToMaxDecimals(nextValue, precision);
    const formatted = formatNumberWithMaxDecimals(rounded, precision) || '0';
    latestCommittedValueRef.current = rounded;
    draftValueRef.current = formatted;
    if (rounded !== value) {
      onChange(rounded);
    }
    setLocalValue(formatted);
  };

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && isFinite(parsed)) {
      commitValue(parsed);
    } else {
      setLocalValue(formatNumberWithMaxDecimals(value ?? 0, precision) || '0');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyStep(1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyStep(-1);
    }
  };

  const applyStep = (direction: 1 | -1) => {
    collapseInputSelection();
    const parsed = parseFloat(draftValueRef.current);
    const baseValue = Number.isFinite(parsed) ? parsed : latestCommittedValueRef.current;
    commitValue(baseValue + direction * step);
  };

  const { stepperButtonProps } = usePressAndHoldStepper(applyStep, repeatIntervalMs);

  return (
    <div className="min-w-0">
      <div className={compact ? PROPERTY_EDITOR_COMPACT_NUMBER_FIELD_SHELL_CLASS : PROPERTY_EDITOR_NUMBER_FIELD_SHELL_CLASS}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={localValue}
          onChange={(e) => {
            draftValueRef.current = e.target.value;
            setLocalValue(e.target.value);
          }}
          onBlur={() => {
            clearPointerFocusIntent();
            handleBlur();
          }}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          onPointerDown={handleInputPointerDown}
          onPointerUp={clearPointerFocusIntent}
          onPointerCancel={clearPointerFocusIntent}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent px-2 text-[12px] leading-4 text-text-primary outline-none"
        />
        <div className={PROPERTY_EDITOR_STEPPER_RAIL_CLASS}>
          <button
            {...stepperButtonProps(1, `Increase ${label}`)}
            className={PROPERTY_EDITOR_STEPPER_BUTTON_CLASS}
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            {...stepperButtonProps(-1, `Decrease ${label}`)}
            className={`${PROPERTY_EDITOR_STEPPER_BUTTON_CLASS} border-t border-border-black/60`}
          >
            <Minus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const AxisNumberGridInput = <T extends string>({
  value,
  onChange,
  labels,
  keys,
  compact = false,
  step,
  precision = MAX_PROPERTY_DECIMALS,
  repeatIntervalMs,
}: {
  value: Partial<Record<T, number>>;
  onChange: (v: Partial<Record<T, number>>) => void;
  labels: string[];
  keys: readonly T[];
  compact?: boolean;
  step?: number;
  precision?: number;
  repeatIntervalMs?: number;
}) => (
  <div className="space-y-1.5">
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}
    >
      {labels.map((label) => (
        <span key={label} className={`${PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS} text-center`}>
          {label}
        </span>
      ))}
    </div>
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}
    >
      {keys.map((key, index) => (
        <InlineNumberInput
          key={String(key)}
          label={labels[index] ?? String(key)}
          value={value[key] ?? 0}
          onChange={(nextValue) => onChange({ ...value, [key]: nextValue })}
          compact={compact}
          step={step}
          precision={precision}
          repeatIntervalMs={repeatIntervalMs}
        />
      ))}
    </div>
  </div>
);

export const Vec3Input = ({ value, onChange, labels, keys = ['x', 'y', 'z'], compact = false, step, precision = MAX_PROPERTY_DECIMALS }: {
  value: Vec3Value;
  onChange: (v: Vec3Value) => void;
  labels: string[];
  keys?: string[];
  compact?: boolean;
  step?: number;
  precision?: number;
}) => (
  <div className="grid grid-cols-3 gap-2">
    <NumberInput
        label={labels[0]}
        value={(value as Record<string, number>)[keys[0]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[0]]: v })}
        compact={compact}
        step={step}
        precision={precision}
    />
    <NumberInput
        label={labels[1]}
        value={(value as Record<string, number>)[keys[1]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[1]]: v })}
        compact={compact}
        step={step}
        precision={precision}
    />
    <NumberInput
        label={labels[2]}
        value={(value as Record<string, number>)[keys[2]] ?? 0}
        onChange={(v: number) => onChange({ ...value, [keys[2]]: v })}
        compact={compact}
        step={step}
        precision={precision}
    />
  </div>
);

export const Vec3InlineInput = ({ value, onChange, labels, keys = ['x', 'y', 'z'], compact = false, step, precision = MAX_PROPERTY_DECIMALS, repeatIntervalMs }: {
  value: Vec3Value;
  onChange: (v: Vec3Value) => void;
  labels: string[];
  keys?: readonly string[];
  compact?: boolean;
  step?: number;
  precision?: number;
  repeatIntervalMs?: number;
}) => (
  <AxisNumberGridInput
    value={value as Record<string, number>}
    onChange={(nextValue) => onChange(nextValue as Vec3Value)}
    labels={labels}
    keys={keys}
    compact={compact}
    step={step}
    precision={precision}
    repeatIntervalMs={repeatIntervalMs}
  />
);
