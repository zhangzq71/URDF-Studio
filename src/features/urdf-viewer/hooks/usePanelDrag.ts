import { useState, useRef, useCallback, useEffect } from 'react';

type PanelType = 'options' | 'joints' | 'measure';

interface DragState {
    dragging: PanelType | null;
    dragStart: { mouseX: number; mouseY: number; panelX: number; panelY: number } | null;
}

interface PanelPositions {
    optionsPanelPos: { x: number; y: number } | null;
    jointPanelPos: { x: number; y: number } | null;
    measurePanelPos: { x: number; y: number } | null;
}

export function usePanelDrag(
    containerRef: React.RefObject<HTMLDivElement>,
    optionsPanelRef: React.RefObject<HTMLDivElement>,
    jointPanelRef: React.RefObject<HTMLDivElement>,
    measurePanelRef: React.RefObject<HTMLDivElement>
) {
    const [dragging, setDragging] = useState<PanelType | null>(null);
    const dragStartRef = useRef<DragState['dragStart']>(null);
    
    const [optionsPanelPos, setOptionsPanelPos] = useState<{ x: number; y: number } | null>(null);
    const [jointPanelPos, setJointPanelPos] = useState<{ x: number; y: number } | null>(null);
    const [measurePanelPos, setMeasurePanelPos] = useState<{ x: number; y: number } | null>(null);

    const handleMouseDown = useCallback((panel: PanelType, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const panelRef = panel === 'options' ? optionsPanelRef :
                        panel === 'joints' ? jointPanelRef : measurePanelRef;

        if (!panelRef.current || !containerRef.current) return;

        const rect = panelRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();

        // Get the current position state to check if panel was already moved
        const currentPos = panel === 'options' ? optionsPanelPos :
                          panel === 'joints' ? jointPanelPos : measurePanelPos;

        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            // If panel has been moved before, use the stored position, otherwise calculate from DOM
            panelX: currentPos ? currentPos.x : rect.left - containerRect.left,
            panelY: currentPos ? currentPos.y : rect.top - containerRect.top
        };
        setDragging(panel);
    }, [optionsPanelPos, jointPanelPos, measurePanelPos]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging || !dragStartRef.current || !containerRef.current) return;

        const panelRef = dragging === 'options' ? optionsPanelRef :
            dragging === 'joints' ? jointPanelRef : measurePanelRef;
        if (!panelRef.current) return;

        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;

        const containerRect = containerRef.current.getBoundingClientRect();
        const panelRect = panelRef.current.getBoundingClientRect();

        let newX = dragStartRef.current.panelX + deltaX;
        let newY = dragStartRef.current.panelY + deltaY;

        const padding = 2;
        const maxX = containerRect.width - panelRect.width - padding;
        const maxY = containerRect.height - panelRect.height - padding;

        newX = Math.max(padding, Math.min(newX, Math.max(padding, maxX)));
        newY = Math.max(padding, Math.min(newY, Math.max(padding, maxY)));

        // Set position, which will override defaultPosition including transform
        if (dragging === 'options') {
            setOptionsPanelPos({ x: newX, y: newY });
        } else if (dragging === 'joints') {
            setJointPanelPos({ x: newX, y: newY });
        } else if (dragging === 'measure') {
            setMeasurePanelPos({ x: newX, y: newY });
        }
    }, [dragging]);

    const handleMouseUp = useCallback(() => {
        setDragging(null);
        dragStartRef.current = null;
    }, []);

    // Add ResizeObserver to clamp positions when container resizes
    useEffect(() => {
        if (!containerRef.current) return;

        const clamp = (pos: {x: number, y: number} | null, panelRef: React.RefObject<HTMLDivElement>) => {
            if (!pos || !panelRef.current || !containerRef.current) return pos;
            const containerRect = containerRef.current.getBoundingClientRect();
            const panelRect = panelRef.current.getBoundingClientRect();
            const padding = 2;
            const maxX = Math.max(padding, containerRect.width - panelRect.width - padding);
            const maxY = Math.max(padding, containerRect.height - panelRect.height - padding);
            
            if (pos.x > maxX || pos.y > maxY) {
                 return {
                     x: Math.min(pos.x, maxX),
                     y: Math.min(pos.y, maxY)
                 };
            }
            return pos;
        };

        const observer = new ResizeObserver(() => {
             setOptionsPanelPos(prev => {
                 const newPos = clamp(prev, optionsPanelRef);
                 return newPos === prev ? prev : newPos;
             });
             setJointPanelPos(prev => {
                 const newPos = clamp(prev, jointPanelRef);
                 return newPos === prev ? prev : newPos;
             });
             setMeasurePanelPos(prev => {
                 const newPos = clamp(prev, measurePanelRef);
                 return newPos === prev ? prev : newPos;
             });
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []); // Empty dependency array as refs are stable

    return {
        optionsPanelPos,
        jointPanelPos,
        measurePanelPos,
        dragging,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp
    };
}
