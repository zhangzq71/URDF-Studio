import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useRobotStore } from '@/store/robotStore';
import { JointType } from '@/types';
import { getJointType } from '@/shared/utils/jointTypes';
import {
    fromJointDisplayValue,
    getDefaultJointLimit,
    getJointSliderStep,
    getJointValueUnitLabel,
    isAngularJointType,
    normalizeJointTypeValue,
    supportsFiniteJointLimits,
    toJointDisplayValue,
} from '@/shared/utils/jointUnits';

export interface JointControlItemProps {
    name: string;
    joint: any;
    value: number;
    angleUnit: 'rad' | 'deg';
    isActive: boolean;
    setActiveJoint: (name: string | null) => void;
    handleJointAngleChange: (name: string, val: number) => void;
    handleJointChangeCommit: (name: string, val: number) => void;
    onSelect?: (type: 'link' | 'joint', id: string) => void;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => void;
    isAdvanced?: boolean;
    onUpdate?: (type: 'link' | 'joint', id: string, data: unknown) => void;
}

const JointControlItemComponent: React.FC<JointControlItemProps> = ({
    name,
    joint,
    value,
    angleUnit,
    isActive,
    setActiveJoint,
    handleJointAngleChange,
    handleJointChangeCommit,
    onSelect,
    onHover,
    isAdvanced = false,
    onUpdate,
}) => {
    const jointType = getJointType(joint);
    const limit = joint.limit || { ...getDefaultJointLimit(jointType), effort: 0, velocity: 0 };
    const usesAngularUnits = isAngularJointType(jointType);
    const supportsAdjustableLimits = supportsFiniteJointLimits(jointType);
    const isContinuousJoint = normalizeJointTypeValue(jointType) === JointType.CONTINUOUS;
    const itemRef = useRef<HTMLDivElement>(null);
    const continuousPreviewValueRef = useRef(value);
    const isSliderDraggingRef = useRef(false);
    
    const updateJoint = useRobotStore(state => state.updateJoint);

    const [localLimits, setLocalLimits] = useState({ 
        lower: limit.lower, 
        upper: limit.upper,
        effort: limit.effort || 0,
        velocity: limit.velocity || 0
    });
    
    useEffect(() => {
        setLocalLimits({
            lower: limit.lower,
            upper: limit.upper,
            effort: limit.effort || 0,
            velocity: limit.velocity || 0
        });
    }, [joint.id, limit.lower, limit.upper, limit.effort, limit.velocity]);

    const hasFiniteLimits = supportsAdjustableLimits
        && Number.isFinite(localLimits.lower)
        && Number.isFinite(localLimits.upper);

    const formatLimitInputValue = (limitValue: number | undefined) => (
        Number.isFinite(limitValue) ? Number(limitValue).toFixed(2) : ''
    );

    const updateLimit = useCallback((key: 'lower' | 'upper' | 'effort' | 'velocity', val: number) => {
        const newLimits = { ...localLimits, [key]: val };
        setLocalLimits(newLimits);

        if (key === 'lower' && value < val) {
            handleJointAngleChange(name, val);
            handleJointChangeCommit(name, val);
        } else if (key === 'upper' && value > val) {
            handleJointAngleChange(name, val);
            handleJointChangeCommit(name, val);
        }

        const jointId = joint.id || name;
        if (jointId) {
            if (onUpdate) {
                onUpdate('joint', jointId, {
                    ...joint,
                    limit: newLimits,
                });
            } else {
                updateJoint(jointId, {
                    limit: newLimits
                });
            }
        }
    }, [handleJointAngleChange, handleJointChangeCommit, joint, localLimits, name, onUpdate, updateJoint, value]);

    useEffect(() => {
        if (isActive && itemRef.current) {
            const scrollParent = itemRef.current.closest('.overflow-y-auto');
            if (scrollParent) {
                const parentRect = scrollParent.getBoundingClientRect();
                const itemRect = itemRef.current.getBoundingClientRect();
                
                const currentScroll = scrollParent.scrollTop;
                const itemRelativeTop = itemRect.top - parentRect.top;
                const targetVisualTop = (parentRect.height / 2) - (itemRect.height / 2);
                
                scrollParent.scrollTo({
                    top: currentScroll + (itemRelativeTop - targetVisualTop),
                    behavior: 'smooth'
                });
            } else {
                itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [isActive, name]);

    const [continuousSliderAnchor, setContinuousSliderAnchor] = useState(value);
    const continuousSliderAnchorRef = useRef(value);
    const [sliderPreviewValue, setSliderPreviewValue] = useState(value);
    const [isSliderDragging, setIsSliderDragging] = useState(false);

    const syncContinuousSliderAnchor = useCallback((nextAnchor: number) => {
        continuousSliderAnchorRef.current = nextAnchor;
        setContinuousSliderAnchor(nextAnchor);
    }, []);

    const displayValue = toJointDisplayValue(sliderPreviewValue, jointType, angleUnit);
    const displayMin = hasFiniteLimits
        ? toJointDisplayValue(localLimits.lower, jointType, angleUnit)
        : Number.NEGATIVE_INFINITY;
    const displayMax = hasFiniteLimits
        ? toJointDisplayValue(localLimits.upper, jointType, angleUnit)
        : Number.POSITIVE_INFINITY;
    const displayUnit = getJointValueUnitLabel(jointType, angleUnit);
    const step = getJointSliderStep(jointType, angleUnit);
    const continuousSliderWindow = angleUnit === 'deg' ? 180 : Math.PI;
    const sliderValue = isContinuousJoint
        ? toJointDisplayValue(sliderPreviewValue - continuousSliderAnchor, jointType, angleUnit)
        : displayValue;
    const sliderMin = isContinuousJoint
        ? -continuousSliderWindow
        : hasFiniteLimits
            ? Math.min(displayMin, displayValue)
            : displayValue - (angleUnit === 'deg' && usesAngularUnits ? 180 : Math.PI);
    const sliderMax = isContinuousJoint
        ? continuousSliderWindow
        : hasFiniteLimits
            ? Math.max(displayMax, displayValue)
            : displayValue + (angleUnit === 'deg' && usesAngularUnits ? 180 : Math.PI);
    const sliderRange = sliderMax - sliderMin;
    const sliderPercentage = sliderRange > 0
        ? ((sliderValue - sliderMin) / sliderRange) * 100
        : 0;
    const clampedSliderPercentage = Math.min(Math.max(sliderPercentage, 0), 100);

    const [inputValue, setInputValue] = useState(displayValue.toFixed(2));
    const [isEditingValue, setIsEditingValue] = useState(false);
    const valueInputRef = useRef<HTMLInputElement>(null);
    
    const [isEditingLower, setIsEditingLower] = useState(false);
    const [isEditingUpper, setIsEditingUpper] = useState(false);
    const [isEditingEffort, setIsEditingEffort] = useState(false);
    const [isEditingVelocity, setIsEditingVelocity] = useState(false);
    const lowerInputRef = useRef<HTMLInputElement>(null);
    const upperInputRef = useRef<HTMLInputElement>(null);
    const effortInputRef = useRef<HTMLInputElement>(null);
    const velocityInputRef = useRef<HTMLInputElement>(null);

    const [lowerInput, setLowerInput] = useState(formatLimitInputValue(localLimits.lower));
    const [upperInput, setUpperInput] = useState(formatLimitInputValue(localLimits.upper));

    const [effortInput, setEffortInput] = useState(localLimits.effort.toFixed(2));
    const [velocityInput, setVelocityInput] = useState(localLimits.velocity.toFixed(2));

    useEffect(() => {
        if (!isEditingLower) setLowerInput(formatLimitInputValue(localLimits.lower));
    }, [localLimits.lower, isEditingLower]);

    useEffect(() => {
        if (!isEditingUpper) setUpperInput(formatLimitInputValue(localLimits.upper));
    }, [localLimits.upper, isEditingUpper]);
    
    useEffect(() => {
        if (!isEditingEffort) setEffortInput(localLimits.effort.toFixed(2));
    }, [localLimits.effort, isEditingEffort]);
    
    useEffect(() => {
        if (!isEditingVelocity) setVelocityInput(localLimits.velocity.toFixed(2));
    }, [localLimits.velocity, isEditingVelocity]);

    useEffect(() => {
        if (isSliderDraggingRef.current) {
            return;
        }

        setSliderPreviewValue(value);
        continuousPreviewValueRef.current = value;

        if (isContinuousJoint) {
            syncContinuousSliderAnchor(value);
        }
    }, [isContinuousJoint, syncContinuousSliderAnchor, value]);

    const handleSliderChangeStart = useCallback(() => {
        if (isSliderDraggingRef.current) {
            return;
        }

        isSliderDraggingRef.current = true;
        setIsSliderDragging(true);
        setActiveJoint(name);
        onSelect?.('joint', name);
        setSliderPreviewValue(value);
        continuousPreviewValueRef.current = value;

        if (isContinuousJoint) {
            syncContinuousSliderAnchor(value);
        }
    }, [isContinuousJoint, name, onSelect, setActiveJoint, syncContinuousSliderAnchor, value]);

    const handleSliderChangeEnd = useCallback(() => {
        if (!isSliderDraggingRef.current) {
            return;
        }

        const committedValue = continuousPreviewValueRef.current;

        isSliderDraggingRef.current = false;
        setIsSliderDragging(false);

        if (isContinuousJoint) {
            syncContinuousSliderAnchor(committedValue);
        }

        handleJointChangeCommit(name, committedValue);
    }, [handleJointChangeCommit, isContinuousJoint, name, syncContinuousSliderAnchor]);

    const handleSliderInput = useCallback((nextSliderValue: number) => {
        const nextValue = isContinuousJoint
            ? continuousSliderAnchorRef.current + fromJointDisplayValue(nextSliderValue, jointType, angleUnit)
            : fromJointDisplayValue(nextSliderValue, jointType, angleUnit);

        if (Math.abs(nextValue - continuousPreviewValueRef.current) <= 1e-6) {
            return;
        }

        setSliderPreviewValue(nextValue);
        continuousPreviewValueRef.current = nextValue;
        handleJointAngleChange(name, nextValue);
    }, [angleUnit, handleJointAngleChange, isContinuousJoint, jointType, name]);

    useEffect(() => {
        if (!isSliderDragging) {
            return;
        }

        const handleWindowPointerUp = () => {
            handleSliderChangeEnd();
        };

        window.addEventListener('pointerup', handleWindowPointerUp);
        window.addEventListener('mouseup', handleWindowPointerUp);
        window.addEventListener('touchend', handleWindowPointerUp);
        window.addEventListener('blur', handleWindowPointerUp);

        return () => {
            window.removeEventListener('pointerup', handleWindowPointerUp);
            window.removeEventListener('mouseup', handleWindowPointerUp);
            window.removeEventListener('touchend', handleWindowPointerUp);
            window.removeEventListener('blur', handleWindowPointerUp);
        };
    }, [handleSliderChangeEnd, isSliderDragging]);

    useEffect(() => {
        const currentParsed = parseFloat(inputValue);
        const isDifferent = isNaN(currentParsed) || Math.abs(currentParsed - displayValue) > 0.0001;
        
        if (!isEditingValue && isDifferent) {
            setInputValue(displayValue.toFixed(2));
        }
    }, [displayValue, isEditingValue]);

    const commitChange = useCallback((valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            handleJointChangeCommit(name, fromJointDisplayValue(val, jointType, angleUnit));
        }
        setIsEditingValue(false);
    }, [angleUnit, handleJointChangeCommit, jointType, name]);

    const handleLimitCommit = useCallback((type: 'lower' | 'upper', valStr: string) => {
        if (!hasFiniteLimits) {
            if (type === 'lower') setIsEditingLower(false);
            if (type === 'upper') setIsEditingUpper(false);
            return;
        }

        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            updateLimit(type, fromJointDisplayValue(val, jointType, angleUnit));
        }
        if (type === 'lower') setIsEditingLower(false);
        if (type === 'upper') setIsEditingUpper(false);
    }, [angleUnit, hasFiniteLimits, jointType, updateLimit]);

    const handleAdvancedCommit = useCallback((type: 'effort' | 'velocity', valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            updateLimit(type, val);
        }
        if (type === 'effort') setIsEditingEffort(false);
        if (type === 'velocity') setIsEditingVelocity(false);
    }, [updateLimit]);

    const commitOpenEditors = useCallback(() => {
        if (isEditingValue) commitChange(inputValue);
        if (isEditingLower) handleLimitCommit('lower', lowerInput);
        if (isEditingUpper) handleLimitCommit('upper', upperInput);
        if (isEditingEffort) handleAdvancedCommit('effort', effortInput);
        if (isEditingVelocity) handleAdvancedCommit('velocity', velocityInput);
    }, [
        commitChange,
        effortInput,
        handleAdvancedCommit,
        handleLimitCommit,
        inputValue,
        isEditingEffort,
        isEditingLower,
        isEditingUpper,
        isEditingValue,
        isEditingVelocity,
        lowerInput,
        upperInput,
        velocityInput,
    ]);

    useEffect(() => {
        if (
            !isEditingValue
            && !isEditingLower
            && !isEditingUpper
            && !isEditingEffort
            && !isEditingVelocity
        ) {
            return;
        }

        const handlePointerDownCapture = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;

            const activeInputs = [
                isEditingValue ? valueInputRef.current : null,
                isEditingLower ? lowerInputRef.current : null,
                isEditingUpper ? upperInputRef.current : null,
                isEditingEffort ? effortInputRef.current : null,
                isEditingVelocity ? velocityInputRef.current : null,
            ].filter((input): input is HTMLInputElement => input instanceof HTMLInputElement);

            if (activeInputs.some((input) => input.contains(target))) {
                return;
            }

            commitOpenEditors();
        };

        document.addEventListener('pointerdown', handlePointerDownCapture, true);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDownCapture, true);
        };
    }, [
        commitOpenEditors,
        isEditingEffort,
        isEditingLower,
        isEditingUpper,
        isEditingValue,
        isEditingVelocity,
    ]);

    const mainValueFieldWidthClassName = 'w-[2.35rem]';
    const limitFieldBaseClassName = 'flex h-4 items-center rounded border px-0.5 py-0 font-mono tabular-nums text-[9px] leading-none transition-colors';
    const limitFieldColumnWidthClassName = 'min-w-[2.35rem]';
    const limitInputWidthClassName = 'w-[2.35rem]';

    const renderValueDisplay = () => (
        <div className="flex h-full shrink-0 items-center justify-end gap-0.5 whitespace-nowrap">
            <div 
                onClick={(e) => { e.stopPropagation(); setIsEditingValue(true); }}
                className={`${mainValueFieldWidthClassName} text-right`}
            >
                {isEditingValue ? (
                    <input
                        ref={valueInputRef}
                        autoFocus
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onBlur={() => commitChange(inputValue)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                commitChange(inputValue);
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-full rounded border border-border-strong bg-input-bg px-0.5 py-0 text-right text-[9px] leading-none font-mono tabular-nums text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20"
                    />
                ) : (
                    <div className="flex h-3.5 w-full items-center justify-end whitespace-nowrap rounded border border-transparent px-0.5 py-0 text-right font-mono tabular-nums text-[9px] leading-none text-text-primary transition-colors hover:border-border-strong/70 hover:text-system-blue">
                        {displayValue.toFixed(2)}
                    </div>
                )}
            </div>
            <span className="min-w-[1.1rem] text-left text-[9px] leading-none text-text-tertiary">{displayUnit}</span>
        </div>
    );

    const renderAdvancedInputs = () => (
        <div className="flex items-center gap-2 shrink-0">
            <div 
                className="flex items-center gap-1.5 cursor-text group"
                onClick={(e) => { e.stopPropagation(); setIsEditingEffort(true); }}
            >
                <span className="inline-flex h-4 w-3 items-center justify-center font-serif text-[10px] italic leading-none text-text-tertiary">τ</span>
                {isEditingEffort ? (
                    <input 
                        ref={effortInputRef}
                        autoFocus
                        type="text"
                        value={effortInput}
                        onChange={(e) => setEffortInput(e.target.value)}
                        onBlur={() => handleAdvancedCommit('effort', effortInput)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdvancedCommit('effort', effortInput)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-10 rounded border border-border-strong bg-input-bg px-0.5 py-0 text-center text-[10px] leading-none font-mono text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20"
                    />
                ) : (
                    <span className="flex h-4 w-10 items-center justify-center border-b border-transparent text-center text-[10px] leading-none text-text-secondary transition-colors group-hover:border-border-strong/80 group-hover:text-text-primary">
                        {localLimits.effort.toFixed(2)}
                    </span>
                )}
            </div>
            <div 
                className="flex items-center gap-1.5 cursor-text group"
                onClick={(e) => { e.stopPropagation(); setIsEditingVelocity(true); }}
            >
                <span className="inline-flex h-4 w-3 items-center justify-center font-serif text-[10px] italic leading-none text-text-tertiary">v</span>
                {isEditingVelocity ? (
                    <input 
                        ref={velocityInputRef}
                        autoFocus
                        type="text"
                        value={velocityInput}
                        onChange={(e) => setVelocityInput(e.target.value)}
                        onBlur={() => handleAdvancedCommit('velocity', velocityInput)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdvancedCommit('velocity', velocityInput)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-10 rounded border border-border-strong bg-input-bg px-0.5 py-0 text-center text-[10px] leading-none font-mono text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20"
                    />
                ) : (
                    <span className="flex h-4 w-10 items-center justify-center border-b border-transparent text-center text-[10px] text-text-secondary transition-colors group-hover:border-border-strong/80 group-hover:text-text-primary">
                        {localLimits.velocity.toFixed(2)}
                    </span>
                )}
            </div>
        </div>
    );

    return (
        <div
            ref={itemRef}
            onClick={() => {
                setActiveJoint(name);
                onSelect?.('joint', name);
            }}
            onMouseEnter={() => onHover?.('joint', name, 'visual')}
            className={`cursor-pointer space-y-1 rounded-lg border px-1 py-1.5 transition-colors ${
                isActive
                    ? 'border-system-blue/20 bg-system-blue/10 dark:border-system-blue/30 dark:bg-system-blue/18'
                    : 'border-transparent bg-transparent hover:bg-element-hover/80'
            }`}
        >
            <div className="flex h-6 items-center justify-between gap-1">
                <span
                    className={`text-[11px] font-medium truncate min-w-0 ${
                        isActive 
                            ? 'text-system-blue' 
                            : 'text-text-secondary'
                    } flex-1`}
                    title={name}
                >
                    {name}
                </span>

                {!isAdvanced && renderValueDisplay()}
            </div>

            {isAdvanced && (
                <div className="flex h-6 items-center justify-between gap-1">
                    {renderAdvancedInputs()}
                    {renderValueDisplay()}
                </div>
            )}

            <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-1">
                <div 
                    className={`relative h-4 ${limitFieldColumnWidthClassName}`}
                    onClick={(e) => {
                        if (!hasFiniteLimits) return;
                        e.stopPropagation();
                        setIsEditingLower(true);
                    }}
                >
                    {hasFiniteLimits && isEditingLower ? (
                        <input
                            ref={lowerInputRef}
                            autoFocus
                            type="text"
                            value={lowerInput}
                            onChange={(e) => setLowerInput(e.target.value)}
                            onBlur={() => handleLimitCommit('lower', lowerInput)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLimitCommit('lower', lowerInput);
                            }}
                            className={`absolute left-0 top-0 z-20 ${limitFieldBaseClassName} ${limitInputWidthClassName} border-border-strong bg-input-bg text-right text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20`}
                        />
                    ) : (
                        <div className={`${limitFieldBaseClassName} w-fit cursor-text justify-end border-transparent text-right text-text-tertiary hover:border-border-strong/70 hover:text-system-blue`}>
                            {hasFiniteLimits ? displayMin.toFixed(2) : '−∞'}
                        </div>
                    )}
                </div>

                <div
                    className="relative flex min-w-0 items-center"
                    data-testid="joint-slider-shell"
                >
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-slider-track">
                        <div
                            data-testid="joint-slider-fill"
                            className="h-full bg-slider-accent"
                            style={{ width: `${clampedSliderPercentage}%` }}
                        />
                    </div>
                    <div
                        data-testid="joint-slider-thumb"
                        className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border transition-[transform,box-shadow] duration-75 ${
                            isSliderDragging ? 'scale-110 ring-4 ring-system-blue/15' : 'scale-100'
                        }`}
                        style={{
                            left: `calc(${clampedSliderPercentage}% - 0.4375rem)`,
                            backgroundColor: 'var(--ui-slider-thumb-bg)',
                            borderColor: 'var(--ui-slider-thumb-border)',
                            boxShadow: isSliderDragging
                                ? 'var(--ui-slider-thumb-shadow-active)'
                                : 'var(--ui-slider-thumb-shadow)',
                        }}
                    />
                    <input
                        type="range"
                        min={sliderMin}
                        max={sliderMax}
                        step={step}
                        value={sliderValue}
                        onInput={(e) => {
                            handleSliderInput(parseFloat((e.target as HTMLInputElement).value));
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            handleSliderChangeStart();
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            handleSliderChangeStart();
                        }}
                        onTouchStart={(e) => {
                            e.stopPropagation();
                            handleSliderChangeStart();
                        }}
                        onPointerUp={(e) => {
                            e.stopPropagation();
                            handleSliderChangeEnd();
                        }}
                        onMouseUp={(e) => {
                            e.stopPropagation();
                            handleSliderChangeEnd();
                        }}
                        onTouchEnd={(e) => {
                            e.stopPropagation();
                            handleSliderChangeEnd();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative z-10 block h-4 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                        style={{ accentColor: 'var(--ui-slider-accent)' }}
                    />
                </div>

                <div 
                    className={`relative h-4 ${limitFieldColumnWidthClassName}`}
                    onClick={(e) => {
                        if (!hasFiniteLimits) return;
                        e.stopPropagation();
                        setIsEditingUpper(true);
                    }}
                >
                    {hasFiniteLimits && isEditingUpper ? (
                        <input
                            ref={upperInputRef}
                            autoFocus
                            type="text"
                            value={upperInput}
                            onChange={(e) => setUpperInput(e.target.value)}
                            onBlur={() => handleLimitCommit('upper', upperInput)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLimitCommit('upper', upperInput);
                            }}
                            className={`absolute right-0 top-0 z-20 ${limitFieldBaseClassName} ${limitInputWidthClassName} border-border-strong bg-input-bg text-left text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20`}
                        />
                    ) : (
                        <div className={`${limitFieldBaseClassName} ml-auto w-fit cursor-text justify-start border-transparent text-left text-text-tertiary hover:border-border-strong/70 hover:text-system-blue`}>
                            {hasFiniteLimits ? displayMax.toFixed(2) : '∞'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const JointControlItem = React.memo(JointControlItemComponent);
