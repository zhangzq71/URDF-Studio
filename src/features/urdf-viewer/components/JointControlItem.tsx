import React, { useRef, useState, useEffect } from 'react';
import { useRobotStore } from '@/store/robotStore';
import { Slider } from '@/shared/components/ui';
import type { JointControlItemProps } from '../types';

export const JointControlItem: React.FC<JointControlItemProps> = ({
    name,
    joint,
    jointAngles,
    angleUnit,
    activeJoint,
    setActiveJoint,
    handleJointAngleChange,
    handleJointChangeCommit,
    onSelect,
    isAdvanced = false
}) => {
    const limit = joint.limit || { lower: -Math.PI, upper: Math.PI, effort: 0, velocity: 0 };
    const value = jointAngles[name] || 0;
    const itemRef = useRef<HTMLDivElement>(null);
    
    // Get store actions
    const updateJoint = useRobotStore(state => state.updateJoint);
    const storeJoint = useRobotStore(state => Object.values(state.joints).find(j => j.name === name));

    // State for limits editing
    const [localLimits, setLocalLimits] = useState({ 
        lower: limit.lower, 
        upper: limit.upper,
        effort: limit.effort || 0,
        velocity: limit.velocity || 0
    });
    
    // Update local limits when joint changes
    useEffect(() => {
        setLocalLimits({
            lower: limit.lower,
            upper: limit.upper,
            effort: limit.effort || 0,
            velocity: limit.velocity || 0
        });
    }, [joint.id, limit.lower, limit.upper, limit.effort, limit.velocity]);

    // Update joint limit in the robot model and store
    const updateLimit = (key: 'lower' | 'upper' | 'effort' | 'velocity', val: number) => {
        // Update local state first
        const newLimits = { ...localLimits, [key]: val };
        setLocalLimits(newLimits);
        
        // Update actual joint object (Three.js model)
        if (joint.limit) {
            joint.limit[key] = val;
            
            // If we're updating lower/upper, we might need to clamp the current angle
            if (key === 'lower' && value < val) {
                handleJointAngleChange(name, val);
                handleJointChangeCommit(name, val);
            } else if (key === 'upper' && value > val) {
                handleJointAngleChange(name, val);
                handleJointChangeCommit(name, val);
            }
        }

        // Update Store (Persistent State)
        if (storeJoint) {
            updateJoint(storeJoint.id, {
                limit: {
                    ...storeJoint.limit,
                    [key]: val
                }
            });
        }
    };

    // Auto-scroll into view when active
    useEffect(() => {
        if (activeJoint === name && itemRef.current) {
            // Use manual scroll calculation instead of scrollIntoView to prevent 
            // the parent OptionsPanelContainer (which has overflow-hidden) from scrolling 
            // and hiding the header.
            const scrollParent = itemRef.current.closest('.overflow-y-auto');
            if (scrollParent) {
                const parentRect = scrollParent.getBoundingClientRect();
                const itemRect = itemRef.current.getBoundingClientRect();
                
                // Calculate target scroll position to center the item
                // itemRelativeTop = itemRect.top - parentRect.top;
                // We want: itemRelativeTop to be (parentHeight/2) - (itemHeight/2)
                // Current scrollTop affects itemRect.top.
                // NewScrollTop = CurrentScrollTop + (itemRelativeTop - (TargetVisualTop))
                
                const currentScroll = scrollParent.scrollTop;
                const itemRelativeTop = itemRect.top - parentRect.top;
                const targetVisualTop = (parentRect.height / 2) - (itemRect.height / 2);
                
                scrollParent.scrollTo({
                    top: currentScroll + (itemRelativeTop - targetVisualTop),
                    behavior: 'smooth'
                });
            } else {
                // Fallback using 'nearest' which is less aggressive than 'center'
                itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [activeJoint, name]);

    // Convert for display
    const displayValue = angleUnit === 'deg' ? value * 180 / Math.PI : value;
    const displayMin = angleUnit === 'deg' ? localLimits.lower * 180 / Math.PI : localLimits.lower;
    const displayMax = angleUnit === 'deg' ? localLimits.upper * 180 / Math.PI : localLimits.upper;
    const step = angleUnit === 'deg' ? 1 : 0.01;

    // Local state for the input field
    const [inputValue, setInputValue] = useState(displayValue.toFixed(2));
    const [isEditingValue, setIsEditingValue] = useState(false);
    
    // Editable limit states
    const [isEditingLower, setIsEditingLower] = useState(false);
    const [isEditingUpper, setIsEditingUpper] = useState(false);
    const [isEditingEffort, setIsEditingEffort] = useState(false);
    const [isEditingVelocity, setIsEditingVelocity] = useState(false);

    const [lowerInput, setLowerInput] = useState(displayMin.toFixed(2));
    const [upperInput, setUpperInput] = useState(displayMax.toFixed(2));

    // Advanced inputs state
    const [effortInput, setEffortInput] = useState(localLimits.effort.toFixed(2));
    const [velocityInput, setVelocityInput] = useState(localLimits.velocity.toFixed(2));

    // Sync inputs when display values change (unless editing)
    useEffect(() => {
        if (!isEditingLower) setLowerInput(displayMin.toFixed(2));
    }, [displayMin, isEditingLower]);

    useEffect(() => {
        if (!isEditingUpper) setUpperInput(displayMax.toFixed(2));
    }, [displayMax, isEditingUpper]);
    
    useEffect(() => {
        if (!isEditingEffort) setEffortInput(localLimits.effort.toFixed(2));
    }, [localLimits.effort, isEditingEffort]);
    
    useEffect(() => {
        if (!isEditingVelocity) setVelocityInput(localLimits.velocity.toFixed(2));
    }, [localLimits.velocity, isEditingVelocity]);

    useEffect(() => {
        // Only update local input if the incoming value is different from what we currently have (numerically)
        // to avoid overwriting "1." with "1.00" while typing
        const currentParsed = parseFloat(inputValue);
        // Check if values are effectively different (handling potential NaN for empty input)
        const isDifferent = isNaN(currentParsed) || Math.abs(currentParsed - displayValue) > 0.0001;
        
        if (!isEditingValue && isDifferent) {
            setInputValue(displayValue.toFixed(2));
        }
    }, [displayValue, isEditingValue]);

    const commitChange = (valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            const radVal = angleUnit === 'deg' ? val * Math.PI / 180 : val;
            handleJointChangeCommit(name, radVal);
        }
        setIsEditingValue(false);
    };

    const handleLimitCommit = (type: 'lower' | 'upper', valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            const radVal = angleUnit === 'deg' ? val * Math.PI / 180 : val;
            updateLimit(type, radVal);
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
                        className="w-[4.5rem] bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 text-right text-[10px] text-slate-900 dark:text-slate-200 focus:border-google-blue outline-none transition-colors"
                    />
                ) : (
                    <div className="text-[10px] text-slate-900 dark:text-slate-200 hover:text-google-blue dark:hover:text-google-blue-light cursor-text px-1.5 py-0.5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 rounded transition-colors whitespace-nowrap min-w-[3rem] text-right">
                        {displayValue.toFixed(2)}
                    </div>
                )}
            </div>
            <span className="text-[10px] text-slate-400 w-5 text-right">{angleUnit === 'deg' ? 'deg' : 'rad'}</span>
        </div>
    );

    const renderAdvancedInputs = () => (
        <div className="flex items-center gap-3 shrink-0">
             {/* Max Effort */}
            <div 
                className="flex items-center gap-1.5 cursor-text group"
                onClick={(e) => { e.stopPropagation(); setIsEditingEffort(true); }}
            >
                <span className="text-[10px] text-slate-400 font-serif italic">τ</span>
                {isEditingEffort ? (
                    <input 
                        autoFocus
                        type="text"
                        value={effortInput}
                        onChange={(e) => setEffortInput(e.target.value)}
                        onBlur={() => handleAdvancedCommit('effort', effortInput)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdvancedCommit('effort', effortInput)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-12 bg-white dark:bg-black/20 border border-blue-400 rounded px-0.5 py-0 text-center text-[10px] outline-none h-4 leading-none"
                    />
                ) : (
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 border-b border-transparent group-hover:border-slate-300 dark:group-hover:border-white/20 transition-colors w-12 text-center h-4 flex items-center justify-center">
                        {localLimits.effort.toFixed(2)}
                    </span>
                )}
            </div>
            {/* Max Velocity */}
            <div 
                className="flex items-center gap-1.5 cursor-text group"
                onClick={(e) => { e.stopPropagation(); setIsEditingVelocity(true); }}
            >
                <span className="text-[10px] text-slate-400 font-serif italic">v</span>
                {isEditingVelocity ? (
                    <input 
                        autoFocus
                        type="text"
                        value={velocityInput}
                        onChange={(e) => setVelocityInput(e.target.value)}
                        onBlur={() => handleAdvancedCommit('velocity', velocityInput)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdvancedCommit('velocity', velocityInput)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-12 bg-white dark:bg-black/20 border border-blue-400 rounded px-0.5 py-0 text-center text-[10px] outline-none h-4 leading-none"
                    />
                ) : (
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 border-b border-transparent group-hover:border-slate-300 dark:group-hover:border-white/20 transition-colors w-12 text-center h-4 flex items-center justify-center">
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
            className={`space-y-1.5 p-2 rounded-lg transition-colors cursor-pointer border ${
                activeJoint === name
                    ? 'bg-blue-50 dark:bg-google-blue/10 border-blue-200 dark:border-google-blue/30'
                    : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
        >
            {/* Header Row: Name (+ Value if NOT Advanced) */}
            <div className="flex justify-between items-center gap-2 h-6">
                <span
                    className={`text-[11px] font-medium truncate min-w-0 ${
                        activeJoint === name 
                            ? 'text-google-blue dark:text-google-blue-light' 
                            : 'text-slate-700 dark:text-slate-300'
                    } flex-1`}
                    title={name}
                >
                    {name}
                </span>

                {!isAdvanced && renderValueDisplay()}
            </div>

            {/* Advanced Row: Inputs + Value (Only if Advanced) */}
            {isAdvanced && (
                <div className="flex justify-between items-center gap-2 h-6 pl-1">
                    {renderAdvancedInputs()}
                    {renderValueDisplay()}
                </div>
            )}

            {/* Slider Row */}
            <div className="flex items-center gap-2">
                {/* Min Limit */}
                <div 
                    className="w-10 shrink-0" 
                    onClick={(e) => { e.stopPropagation(); setIsEditingLower(true); }}
                >
                    {isEditingLower ? (
                        <input
                            autoFocus
                            type="text"
                            value={lowerInput}
                            onChange={(e) => setLowerInput(e.target.value)}
                            onBlur={() => handleLimitCommit('lower', lowerInput)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLimitCommit('lower', lowerInput);
                            }}
                            className="w-full bg-white dark:bg-black/20 border border-blue-400 rounded px-0.5 py-0 text-center text-[9px] outline-none"
                        />
                    ) : (
                        <div className="text-[9px] text-slate-400 text-right font-mono hover:text-blue-500 cursor-text truncate">
                            {displayMin.toFixed(2)}
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0 px-1">
                    <Slider
                        value={displayValue}
                        min={displayMin}
                        max={displayMax}
                        step={step}
                        onChange={(val) => {
                            const radVal = angleUnit === 'deg' ? val * Math.PI / 180 : val;
                            handleJointAngleChange(name, radVal);
                        }}
                        showValue={false}
                        className="w-full"
                    />
                </div>

                {/* Max Limit */}
                <div 
                    className="w-10 shrink-0"
                    onClick={(e) => { e.stopPropagation(); setIsEditingUpper(true); }}
                >
                    {isEditingUpper ? (
                        <input
                            autoFocus
                            type="text"
                            value={upperInput}
                            onChange={(e) => setUpperInput(e.target.value)}
                            onBlur={() => handleLimitCommit('upper', upperInput)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLimitCommit('upper', upperInput);
                            }}
                            className="w-full bg-white dark:bg-black/20 border border-blue-400 rounded px-0.5 py-0 text-center text-[9px] outline-none"
                        />
                    ) : (
                        <div className="text-[9px] text-slate-400 font-mono hover:text-blue-500 cursor-text truncate">
                            {displayMax.toFixed(2)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
