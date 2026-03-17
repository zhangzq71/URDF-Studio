/**
 * Reusable form controls for the PropertyEditor feature.
 * InputGroup, CollapsibleSection, NumberInput, Vec3Input
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  MAX_PROPERTY_DECIMALS,
  formatNumberWithMaxDecimals,
  roundToMaxDecimals,
} from '@/core/utils/numberPrecision';
import { CollapsibleSection as SharedCollapsibleSection } from '@/shared/components/Panel/OptionsPanel';
import {
  PROPERTY_EDITOR_STEPPER_REPEAT_DELAY_MS,
  PROPERTY_EDITOR_STEPPER_REPEAT_INTERVAL_MS,
} from '../constants';

export const PROPERTY_EDITOR_PANEL_EYEBROW_CLASS =
  'text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary';
export const PROPERTY_EDITOR_PANEL_TITLE_CLASS =
  'text-[11px] font-semibold leading-4 text-text-primary';
export const PROPERTY_EDITOR_SECTION_TITLE_CLASS =
  'text-[10px] font-semibold leading-4 text-text-primary';
export const PROPERTY_EDITOR_FIELD_LABEL_CLASS =
  'block text-[10px] font-semibold uppercase tracking-[0.12em] leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_INLINE_FIELD_LABEL_CLASS =
  'shrink-0 text-[10px] font-semibold leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_SUBLABEL_CLASS =
  'text-[9px] font-semibold leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_HELPER_TEXT_CLASS =
  'text-[9px] leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_INPUT_CLASS =
  'h-6 w-full rounded-md border border-border-strong bg-input-bg px-1.5 text-[11px] leading-4 text-text-primary focus:outline-none focus:border-system-blue focus:ring-2 focus:ring-system-blue/25';
export const PROPERTY_EDITOR_READONLY_VALUE_CLASS =
  `${PROPERTY_EDITOR_INPUT_CLASS} flex items-center bg-element-bg/60`;
export const PROPERTY_EDITOR_SELECT_CLASS = `${PROPERTY_EDITOR_INPUT_CLASS} pr-7`;
export const PROPERTY_EDITOR_COMPACT_INPUT_CLASS =
  'h-[22px] w-full rounded-md border border-border-strong bg-input-bg px-1.5 text-[10px] leading-4 text-text-primary focus:outline-none focus:border-system-blue focus:ring-2 focus:ring-system-blue/25';
export const PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS =
  'shrink-0 text-[9px] font-semibold leading-4 text-text-tertiary';
export const PROPERTY_EDITOR_NUMBER_FIELD_SHELL_CLASS =
  'flex h-6 w-full items-stretch overflow-hidden rounded-md border border-border-strong bg-input-bg text-text-primary transition-colors focus-within:border-system-blue focus-within:ring-2 focus-within:ring-system-blue/25';
export const PROPERTY_EDITOR_COMPACT_NUMBER_FIELD_SHELL_CLASS =
  'flex h-[22px] w-full items-stretch overflow-hidden rounded-md border border-border-strong bg-input-bg text-text-primary transition-colors focus-within:border-system-blue focus-within:ring-2 focus-within:ring-system-blue/25';
export const PROPERTY_EDITOR_STEPPER_RAIL_CLASS =
  'flex w-4 shrink-0 flex-col border-l border-border-black/60 bg-element-bg/70';
export const PROPERTY_EDITOR_STEPPER_BUTTON_CLASS =
  'flex flex-1 min-h-0 items-center justify-center px-1 text-text-secondary transition-colors hover:bg-element-hover hover:text-text-primary focus:outline-none focus-visible:bg-element-hover focus-visible:text-text-primary';
export const PROPERTY_EDITOR_SECTION_TRIGGER_CLASS =
  'w-full flex items-center justify-between px-2 py-1.5 bg-element-bg hover:bg-element-hover transition-colors text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary';
export const PROPERTY_EDITOR_SECTION_HEADER_CLASS =
  'px-2 py-1.5 bg-element-bg text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary';
export const PROPERTY_EDITOR_LINK_CLASS =
  'inline-flex items-center gap-1 text-[10px] font-medium text-system-blue hover:text-system-blue-hover transition-colors';
export const PROPERTY_EDITOR_PRIMARY_BUTTON_CLASS =
  'inline-flex h-6 items-center justify-center gap-1 rounded-md bg-system-blue-solid px-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-system-blue-hover';
export const PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS =
  'inline-flex h-6 items-center justify-center gap-1 rounded-md border border-border-strong px-1.5 text-[10px] font-medium text-text-secondary transition-colors hover:bg-element-hover';
export const PROPERTY_EDITOR_ICON_SEGMENTED_GROUP_CLASS =
  'grid gap-0.5 rounded-md border border-border-strong bg-element-bg/70 p-0.5';
export const PROPERTY_EDITOR_ICON_SEGMENTED_BUTTON_CLASS =
  'inline-flex h-6 w-full items-center justify-center rounded-md text-text-secondary transition-all duration-150 hover:bg-element-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30';

interface IconSegmentedOption<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
}

export const InputGroup = ({ label, children, className = "" }: { label: string, children?: React.ReactNode, className?: string }) => (
  <div className={`mb-1.5 ${className}`}>
    <label className={`${PROPERTY_EDITOR_FIELD_LABEL_CLASS} mb-0.5`}>{label}</label>
    {children}
  </div>
);

export const InlineInputGroup = ({
  label,
  children,
  className = '',
  labelWidthClassName = 'w-12',
  align = 'center',
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
  labelWidthClassName?: string;
  align?: 'start' | 'center';
}) => (
  <div className={`mb-1.5 ${className}`}>
    <div className={`flex gap-2 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <label className={`${PROPERTY_EDITOR_INLINE_FIELD_LABEL_CLASS} ${labelWidthClassName}`}>
        {label}
      </label>
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  </div>
);

export const ReadonlyValueField = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`${PROPERTY_EDITOR_READONLY_VALUE_CLASS} ${className}`}>{children}</div>
);

export const ReadonlyStatField = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="space-y-0.5">
    <div className={PROPERTY_EDITOR_SUBLABEL_CLASS}>{label}</div>
    <ReadonlyValueField>{value}</ReadonlyValueField>
  </div>
);

export const ReadonlyVectorStatRow = ({
  axisLabels = ['X', 'Y', 'Z'],
  label,
  values,
}: {
  axisLabels?: [string, string, string];
  label: string;
  values: [string, string, string];
}) => (
  <div className="grid grid-cols-[28px_repeat(3,minmax(0,1fr))] gap-1.5 items-end">
      <div className="flex h-6 items-center text-[9px] font-semibold leading-4 text-text-tertiary">
      {label}
    </div>
    {axisLabels.map((axisLabel, index) => (
      <ReadonlyStatField key={axisLabel} label={axisLabel} value={values[index]} />
    ))}
  </div>
);

export const CollapsibleSection = ({ title, children, defaultOpen = true, className = "", storageKey }: { title: string, children: React.ReactNode, defaultOpen?: boolean, className?: string, storageKey?: string }) => {
  return (
    <SharedCollapsibleSection
      title={title}
      defaultOpen={defaultOpen}
      storageKey={storageKey}
      className={`rounded-lg border border-border-black overflow-hidden ${className}`}
      useDividerStyle={false}
      triggerClassName={PROPERTY_EDITOR_SECTION_TRIGGER_CLASS}
      iconClassName="opacity-60"
      contentInnerClassName="border-t border-border-black bg-panel-bg p-1.5"
    >
      {children}
    </SharedCollapsibleSection>
  );
};

export const StaticSection = ({
  title,
  children,
  className = '',
  contentClassName = 'border-t border-border-black bg-panel-bg p-1.5',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <div className={`overflow-hidden rounded-lg border border-border-black ${className}`}>
    <div className={PROPERTY_EDITOR_SECTION_HEADER_CLASS}>{title}</div>
    <div className={contentClassName}>{children}</div>
  </div>
);

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
      {label && <span className={`${PROPERTY_EDITOR_SUBLABEL_CLASS} mb-0.5`}>{label}</span>}
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
          className={`min-w-0 flex-1 bg-transparent leading-4 text-text-primary outline-none ${
            compact ? 'px-1 text-[10px]' : 'px-1.5 text-[11px]'
          }`}
        />
        {suffix ? (
          <span className="shrink-0 border-l border-border-black/60 px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            {suffix}
          </span>
        ) : null}
        <div className={PROPERTY_EDITOR_STEPPER_RAIL_CLASS}>
          <button
            {...stepperButtonProps(1, label ? `Increase ${label}` : 'Increase value')}
            className={PROPERTY_EDITOR_STEPPER_BUTTON_CLASS}
          >
            <Plus className="h-2 w-2" />
          </button>
          <button
            {...stepperButtonProps(-1, label ? `Decrease ${label}` : 'Decrease value')}
            className={`${PROPERTY_EDITOR_STEPPER_BUTTON_CLASS} border-t border-border-black/60`}
          >
            <Minus className="h-2 w-2" />
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
          className={`min-w-0 flex-1 bg-transparent leading-4 text-text-primary outline-none ${
            compact ? 'px-1 text-[10px]' : 'px-1.5 text-[11px]'
          }`}
        />
        <div className={PROPERTY_EDITOR_STEPPER_RAIL_CLASS}>
          <button
            {...stepperButtonProps(1, `Increase ${label}`)}
            className={PROPERTY_EDITOR_STEPPER_BUTTON_CLASS}
          >
            <Plus className="h-2 w-2" />
          </button>
          <button
            {...stepperButtonProps(-1, `Decrease ${label}`)}
            className={`${PROPERTY_EDITOR_STEPPER_BUTTON_CLASS} border-t border-border-black/60`}
          >
            <Minus className="h-2 w-2" />
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
  <div className="space-y-0.5">
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}
    >
      {labels.map((label) => (
        <span key={label} className={`${PROPERTY_EDITOR_INLINE_AXIS_LABEL_CLASS} text-center`}>
          {label}
        </span>
      ))}
    </div>
    <div
      className="grid gap-1"
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
