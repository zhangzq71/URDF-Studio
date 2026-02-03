import React, { useRef, useState, useEffect } from 'react';
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
    onSelect
}) => {
    const limit = joint.limit || { lower: -Math.PI, upper: Math.PI };
    const value = jointAngles[name] || 0;
    const itemRef = useRef<HTMLDivElement>(null);

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
    const displayMin = angleUnit === 'deg' ? limit.lower * 180 / Math.PI : limit.lower;
    const displayMax = angleUnit === 'deg' ? limit.upper * 180 / Math.PI : limit.upper;
    const step = angleUnit === 'deg' ? 1 : 0.01;

    // Local state for the input field
    const [inputValue, setInputValue] = useState(displayValue.toFixed(2));

    useEffect(() => {
        // Only update local input if the incoming value is different from what we currently have (numerically)
        // to avoid overwriting "1." with "1.00" while typing
        const currentParsed = parseFloat(inputValue);
        // Check if values are effectively different (handling potential NaN for empty input)
        const isDifferent = isNaN(currentParsed) || Math.abs(currentParsed - displayValue) > 0.0001;
        
        if (isDifferent) {
            setInputValue(displayValue.toFixed(2));
        }
    }, [displayValue]);

    const commitChange = (valStr: string) => {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            const radVal = angleUnit === 'deg' ? val * Math.PI / 180 : val;
            handleJointChangeCommit(name, radVal);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const s = e.target.value;
        setInputValue(s);
        const val = parseFloat(s);
        if (!isNaN(val)) {
            const radVal = angleUnit === 'deg' ? val * Math.PI / 180 : val;
            handleJointAngleChange(name, radVal);
        }
    };

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
            {/* Header: Name and Input */}
            <div className="flex justify-between items-center gap-2">
                <span
                    className={`text-[11px] font-medium truncate flex-1 min-w-0 ${
                        activeJoint === name 
                            ? 'text-google-blue dark:text-google-blue-light' 
                            : 'text-slate-700 dark:text-slate-300'
                    }`}
                    title={name}
                >
                    {name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={() => commitChange(inputValue)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                commitChange(inputValue);
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-14 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 text-right text-[10px] text-slate-900 dark:text-slate-200 focus:border-google-blue outline-none transition-colors"
                    />
                    <span className="text-[10px] text-slate-400 w-5 text-right">{angleUnit === 'deg' ? 'deg' : 'rad'}</span>
                </div>
            </div>

            {/* Slider Row */}
            <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-400 w-7 text-right font-mono">{displayMin.toFixed(2)}</span>
                <div className="flex-1 min-w-0 px-3">
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
                <span className="text-[9px] text-slate-400 w-7 font-mono">{displayMax.toFixed(2)}</span>
            </div>
        </div>
    );
};
