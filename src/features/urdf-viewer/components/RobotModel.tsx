import React, { memo, useRef, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CollisionTransformControls } from './CollisionTransformControls';
import { ViewerLoadingHud } from './ViewerLoadingHud';
import type { RobotModelProps } from '../types';
import { isSingleDofJoint } from '../utils/jointTypes';
import { buildViewerLoadingHudState } from '../utils/viewerLoadingHud';
import {
    beginInitialGroundAlignment,
    hasInitialGroundAlignment,
    offsetRobotToGround,
} from '../utils/robotPositioning';

import { useRobotLoader } from '../hooks/useRobotLoader';
import { useHighlightManager } from '../hooks/useHighlightManager';
import { useCameraFocus } from '../hooks/useCameraFocus';
import { useMouseInteraction } from '../hooks/useMouseInteraction';
import { useHoverDetection } from '../hooks/useHoverDetection';
import { useVisualizationEffects } from '../hooks/useVisualizationEffects';

// Wrap with memo and custom comparison to prevent unnecessary re-renders
export const RobotModel: React.FC<RobotModelProps> = memo(({
    urdfContent,
    assets,
    sourceFormat = 'auto',
    sourceFilePath,
    onRobotLoaded,
    showCollision = false,
    showVisual = true,
    onSelect,
    onHover,
    onMeshSelect,
    onJointChange,
    onJointChangeCommit,
    jointAngles,
    setIsDragging,
    setActiveJoint,
    justSelectedRef,
    t,
    mode,
    selection,
    hoverSelectionEnabled = true,
    highlightMode = 'link',
    showInertia = false,
    showCenterOfMass = false,
    showCoMOverlay = true,
    centerOfMassSize = 0.01,
    showOrigins = false,
    showOriginsOverlay = true,
    originSize = 1.0,
    showJointAxes = false,
    showJointAxesOverlay = true,
    jointAxisSize = 1.0,
    modelOpacity = 1.0,
    robotLinks,
    robotJoints,
    focusTarget,
    transformMode = 'select',
    toolMode = 'select',
    onCollisionTransformPreview,
    onCollisionTransformEnd,
    isOrbitDragging,
    onTransformPending,
    isSelectionLockedRef,
    isMeshPreview = false,
    hoveredSelection,
    groundPlaneOffset = 0,
}) => {
    const { invalidate } = useThree();
    const needsInitialGroundFitRef = useRef(true);
    const initialGroundFitTimersRef = useRef<number[]>([]);
    const appliedJointAnglesRef = useRef<Record<string, number>>({});
    const autoFrameScopeFallbackRef = useRef<string | null>(null);

    if (!autoFrameScopeFallbackRef.current) {
        autoFrameScopeFallbackRef.current = `viewer-session:${Math.random().toString(36).slice(2)}`;
    }

    const clearInitialGroundFitTimers = () => {
        initialGroundFitTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        initialGroundFitTimersRef.current = [];
    };

    // Keep ref for setIsDragging to avoid stale closures
    const setIsDraggingRef = useRef(setIsDragging);
    useEffect(() => {
        setIsDraggingRef.current = setIsDragging;
    }, [setIsDragging]);

    const handleCollisionTransformDragging = useCallback((dragging: boolean) => {
        setIsDraggingRef.current?.(dragging);
    }, []);

    // ============================================================
    // HOOK: Robot Loading
    // ============================================================
    const {
        robot,
        error,
        isLoading,
        loadingProgress,
        robotVersion,
        linkMeshMapRef
    } = useRobotLoader({
        urdfContent,
        assets,
        sourceFormat,
        sourceFilePath,
        showCollision,
        showVisual,
        isMeshPreview,
        robotLinks,
        robotJoints,
        initialJointAngles: jointAngles,
        onRobotLoaded,
        groundPlaneOffset,
    });

    // ============================================================
    // HOOK: Highlight Manager
    // ============================================================
    const {
        highlightGeometry,
        rayIntersectsBoundingBox,
        highlightedMeshesRef,
        boundingBoxNeedsUpdateRef
    } = useHighlightManager({
        robot,
        robotVersion,
        highlightMode,
        showCollision,
        showVisual,
        robotLinks,
        linkMeshMapRef
    });

    // ============================================================
    // HOOK: Camera Focus
    // ============================================================
    useCameraFocus({
        robot,
        focusTarget,
        selection,
        mode,
        autoFrameOnRobotChange: !focusTarget && !isLoading,
        autoFrameScopeKey: sourceFilePath ?? autoFrameScopeFallbackRef.current,
    });

    // ============================================================
    // HOOK: Mouse Interaction
    // ============================================================
    const {
        mouseRef,
        raycasterRef,
        hoveredLinkRef,
        isDraggingJoint,
        needsRaycastRef
    } = useMouseInteraction({
        robot,
        robotVersion,
        toolMode,
        mode,
        highlightMode,
        showCollision,
        showVisual,
        linkMeshMapRef,
        onHover,
        onSelect,
        onMeshSelect,
        onJointChange,
        onJointChangeCommit,
        throttleJointChangeDuringDrag: true,
        setIsDragging,
        setActiveJoint,
        justSelectedRef,
        isOrbitDragging,
        isSelectionLockedRef,
        highlightGeometry
    });

    // ============================================================
    // HOOK: Hover Detection
    // ============================================================
    useHoverDetection({
        robot,
        robotVersion,
        toolMode,
        mode,
        highlightMode,
        showCollision,
        showVisual,
        selection,
        onHover,
        linkMeshMapRef,
        mouseRef,
        raycasterRef,
        hoveredLinkRef,
        isDraggingJoint,
        needsRaycastRef,
        isOrbitDragging,
        justSelectedRef,
        isSelectionLockedRef,
        rayIntersectsBoundingBox,
        highlightGeometry
    });

    // ============================================================
    // HOOK: Visualization Effects
    // ============================================================
    const { syncHoverHighlight } = useVisualizationEffects({
        robot,
        robotVersion,
        showCollision,
        showVisual,
        highlightMode,
        showInertia,
        showCenterOfMass,
        showCoMOverlay,
        centerOfMassSize,
        showOrigins,
        showOriginsOverlay,
        originSize,
        showJointAxes,
        showJointAxesOverlay,
        jointAxisSize,
        modelOpacity,
        robotLinks,
        selection,
        highlightGeometry,
        highlightedMeshesRef
    });

    useEffect(() => {
        if (hoveredSelection === undefined) return;
        syncHoverHighlight(hoveredSelection);
    }, [
        hoveredSelection?.type,
        hoveredSelection?.id,
        hoveredSelection?.subType,
        hoveredSelection?.objectIndex,
        syncHoverHighlight,
        hoveredSelection,
    ]);

    useEffect(() => {
        needsInitialGroundFitRef.current = true;
        appliedJointAnglesRef.current = {};
        return () => {
            clearInitialGroundFitTimers();
        };
    }, [robot, robotVersion]);

    // ============================================================
    // Apply joint angles when jointAngles prop changes
    // ============================================================
    useEffect(() => {
        if (!robot || !jointAngles) return;

        const joints = (robot as any).joints;
        if (!joints) return;
        let hasJointTransformChanges = false;

        Object.entries(jointAngles).forEach(([jointName, angle]) => {
            const joint = joints[jointName];
            const currentAngle = joint?.angle ?? joint?.jointValue;

            if (currentAngle === angle) {
                appliedJointAnglesRef.current[jointName] = angle;
                return;
            }

            if (isSingleDofJoint(joint) && typeof joint.setJointValue === 'function') {
                joint.setJointValue(angle);
                hasJointTransformChanges = true;
            }

            appliedJointAnglesRef.current[jointName] = angle;
        });

        if (needsInitialGroundFitRef.current && Object.keys(jointAngles).length > 0) {
            needsInitialGroundFitRef.current = false;
            clearInitialGroundFitTimers();

            if (beginInitialGroundAlignment(robot)) {
                initialGroundFitTimersRef.current = [0, 80, 220, 500].map((delay) =>
                    window.setTimeout(() => {
                        offsetRobotToGround(robot, groundPlaneOffset);
                        boundingBoxNeedsUpdateRef.current = true;
                        needsRaycastRef.current = true;
                        invalidate();
                    }, delay)
                );
            }
        }

        if (!hasJointTransformChanges) {
            return () => {
                clearInitialGroundFitTimers();
            };
        }

        if (hasInitialGroundAlignment(robot)) {
            needsInitialGroundFitRef.current = false;
        }

        robot.updateMatrixWorld(true);
        boundingBoxNeedsUpdateRef.current = true;
        needsRaycastRef.current = true;
        invalidate();

        return () => {
            clearInitialGroundFitTimers();
        };
    }, [robot, jointAngles, groundPlaneOffset, invalidate, boundingBoxNeedsUpdateRef, needsRaycastRef]);

    // ============================================================
    // RENDER
    // ============================================================
    const loadingHudState = buildViewerLoadingHudState({
        loadedCount: loadingProgress?.loadedCount,
        totalCount: loadingProgress?.totalCount,
        fallbackDetail: t.loadingRobotPreparing,
    });

    if (error) {
        return (
            <Html center>
                <div className="bg-red-900/80 text-red-200 px-4 py-2 rounded text-sm">
                    Error: {error}
                </div>
            </Html>
        );
    }

    return (
        <>
            {robot ? <primitive object={robot} /> : null}
            {isLoading ? (
                <Html fullscreen>
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-4">
                        <ViewerLoadingHud
                            title={t.loadingRobot}
                            detail={loadingHudState.detail}
                            progress={loadingHudState.progress}
                        />
                    </div>
                </Html>
            ) : null}
            {(() => {
                const shouldShow = mode === 'detail' && highlightMode === 'collision' && transformMode !== 'select' && selection?.subType === 'collision';
                return shouldShow ? (
                    <CollisionTransformControls
                        robot={robot}
                        robotVersion={robotVersion}
                        selection={selection}
                        transformMode={transformMode}
                        setIsDragging={handleCollisionTransformDragging}
                        onTransformChange={onCollisionTransformPreview}
                        onTransformEnd={onCollisionTransformEnd}
                        robotLinks={robotLinks}
                        onTransformPending={onTransformPending}
                    />
                ) : null;
            })()}
        </>
    );
});
