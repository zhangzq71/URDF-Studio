import React, { useRef, useState, useEffect } from 'react';
import { useRobotStore } from '@/store/robotStore';
import { Slider } from '@/shared/components/ui';
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
    isAdvanced = false
}) => {
    const jointType = getJointType(joint);
    const limit = joint.limit || { ...getDefaultJointLimit(jointType), effort: 0, velocity: 0 };
    const usesAngularUnits = isAngularJointType(jointType);
    const supportsAdjustableLimits = supportsFiniteJointLimits(jointType);
    const isContinuousJoint = normalizeJointTypeValue(jointType) === JointType.CONTINUOUS;
    const itemRef = useRef<HTMLDivElement>(null);
    const continuousPreviewValueRef = useRef(value);
    
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

    const updateLimit = (key: 'lower' | 'upper' | 'effort' | 'velocity', val: number) => {
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
            updateJoint(jointId, {
                limit: newLimits
            });
        }
    };

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
    const [isContinuousSliderDragging, setIsContinuousSliderDragging] = useState(false);

    const displayValue = toJointDisplayValue(value, jointType, angleUnit);
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
        ? toJointDisplayValue(value - continuousSliderAnchor, jointType, angleUnit)
        : displayValue;
    const sliderMin = isContinuousJoint
        ? -continuousSliderWindow
        : hasFiniteLimits
            ? displayMin
            : displayValue - (angleUnit === 'deg' && usesAngularUnits ? 180 : Math.PI);
    const sliderMax = isContinuousJoint
        ? continuousSliderWindow
        : hasFiniteLimits
            ? displayMax
            : displayValue + (angleUnit === 'deg' && usesAngularUnits ? 180 : Math.PI);

    const [inputValue, setInputValue] = useState(displayValue.toFixed(2));
    const [isEditingValue, setIsEditingValue] = useState(false);
    
    const [isEditingLower, setIsEditingLower] = useState(false);
    const [isEditingUpper, setIsEditingUpper] = useState(false);
    const [isEditingEffort, setIsEditingEffort] = useState(false);
    const [isEditingVelocity, setIsEditingVelocity] = useState(false);

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
        if (!isContinuousJoint || !isContinuousSliderDragging) {
            setContinuousSliderAnchor(value);
            continuousPreviewValueRef.current = value;
        }
    }, [value, isContinuousJoint, isContinuousSliderDragging]);

    useEffect(() => {
        const currentParsed = parseFloat(inputValue);
        const isDifferent = isNaN(currentParsed) || Math.abs(currentParsed - displayValue) > 0.0001;
        
        if (!isEditingValue && isDifferent) {
            setInputValue(displayValue.toFixed(2));
        }
    }, [displayValue, isEditingValue]);

    const commitChange = (valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            handleJointChangeCommit(name, fromJointDisplayValue(val, jointType, angleUnit));
        }
        setIsEditingValue(false);
    };

    const handleLimitCommit = (type: 'lower' | 'upper', valStr: string) => {
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
    };

    const handleAdvancedCommit = (type: 'effort' | 'velocity', valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            updateLimit(type, val);
        }
        if (type === 'effort') setIsEditingEffort(false);
        if (type === 'velocity') setIsEditingVelocity(false);
    };

    const renderValueDisplay = () => (
        <div className="flex items-center gap-1 shrink-0 h-full">
            <div 
                onClick={(e) => { e.stopPropagation(); setIsEditingValue(true); }}
                className="text-right"
            >
                {isEditingValue ? (
                    <input
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
                        className="h-4 w-10 rounded border border-border-strong bg-input-bg px-0.5 py-0 text-right text-[10px] leading-none font-mono text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20"
                    />
                ) : (
                    <div className="flex h-4 w-10 items-center justify-end whitespace-nowrap rounded border border-transparent px-0.5 py-0 text-right font-mono text-[10px] leading-none text-text-primary transition-colors hover:border-border-strong/70 hover:text-system-blue">
                        {displayValue.toFixed(2)}
                    </div>
                )}
            </div>
            <span className="w-4 text-right text-[9px] leading-none text-text-tertiary">{displayUnit}</span>
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
            className={`cursor-pointer space-y-1.5 rounded-lg border p-2 transition-colors ${
                isActive
                    ? 'border-system-blue/20 bg-system-blue/10 dark:border-system-blue/30 dark:bg-system-blue/18'
                    : 'border-transparent bg-transparent hover:bg-element-hover/80'
            }`}
        >
            <div className="flex justify-between items-center gap-2 h-6">
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
                <div className="flex justify-between items-center gap-2 h-6 pl-1">
                    {renderAdvancedInputs()}
                    {renderValueDisplay()}
                </div>
            )}

            <div className="flex items-center gap-2">
                <div 
                    className="w-10 shrink-0" 
                    onClick={(e) => {
                        if (!hasFiniteLimits) return;
                        e.stopPropagation();
                        setIsEditingLower(true);
                    }}
                >
                    {hasFiniteLimits && isEditingLower ? (
                        <input
                            autoFocus
                            type="text"
                            value={lowerInput}
                            onChange={(e) => setLowerInput(e.target.value)}
                            onBlur={() => handleLimitCommit('lower', lowerInput)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLimitCommit('lower', lowerInput);
                            }}
                            className="h-4 w-full rounded border border-border-strong bg-input-bg px-0.5 py-0 text-center text-[9px] leading-none font-mono text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20"
                        />
                    ) : (
                        <div className="cursor-text truncate text-right font-mono text-[9px] text-text-tertiary hover:text-system-blue">
                            {hasFiniteLimits ? displayMin.toFixed(2) : '−∞'}
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0 px-1">
                    <Slider
                        value={sliderValue}
                        min={sliderMin}
                        max={sliderMax}
                        step={step}
                        onChange={(val) => {
                            const nextValue = isContinuousJoint
                                ? continuousSliderAnchor + fromJointDisplayValue(val, jointType, angleUnit)
                                : fromJointDisplayValue(val, jointType, angleUnit);
                            continuousPreviewValueRef.current = nextValue;
                            handleJointAngleChange(name, nextValue);
                        }}
                        onChangeStart={isContinuousJoint ? () => {
                            setContinuousSliderAnchor(value);
                            continuousPreviewValueRef.current = value;
                            setIsContinuousSliderDragging(true);
                        } : undefined}
                        onChangeEnd={isContinuousJoint ? () => {
                            setContinuousSliderAnchor(continuousPreviewValueRef.current);
                            setIsContinuousSliderDragging(false);
                        } : undefined}
                        showValue={false}
                        className="w-full"
                    />
                </div>

                <div 
                    className="w-10 shrink-0"
                    onClick={(e) => {
                        if (!hasFiniteLimits) return;
                        e.stopPropagation();
                        setIsEditingUpper(true);
                    }}
                >
                    {hasFiniteLimits && isEditingUpper ? (
                        <input
                            autoFocus
                            type="text"
                            value={upperInput}
                            onChange={(e) => setUpperInput(e.target.value)}
                            onBlur={() => handleLimitCommit('upper', upperInput)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLimitCommit('upper', upperInput);
                            }}
                            className="h-4 w-full rounded border border-border-strong bg-input-bg px-0.5 py-0 text-center text-[9px] leading-none font-mono text-text-primary outline-none focus:border-system-blue focus:ring-1 focus:ring-system-blue/20"
                        />
                    ) : (
                        <div className="cursor-text truncate font-mono text-[9px] text-text-tertiary hover:text-system-blue">
                            {hasFiniteLimits ? displayMax.toFixed(2) : '∞'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const JointControlItem = React.memo(JointControlItemComponent);
