import { useCallback, useEffect, useRef, useState } from 'react';
import { alignObjectLowestPointToZ } from '@/shared/utils';
import {
  setRegressionRuntimeRobot,
  setRegressionViewerHandlers,
  type RegressionViewerFlags,
} from '@/shared/debug/regressionBridge';
import { isSingleDofJoint } from '../utils/jointTypes';
import type { MeasureState, ToolMode, URDFViewerProps } from '../types';
import { usePanelDrag } from './usePanelDrag';
import { useViewerSettings } from './useViewerSettings';

export const createEmptyMeasureState = (): MeasureState => ({
  measurements: [],
  currentPoints: [],
  tempPoint: null,
});

type Selection = URDFViewerProps['selection'];

interface UseURDFViewerControllerProps {
  onJointChange?: URDFViewerProps['onJointChange'];
  jointAngleState?: URDFViewerProps['jointAngleState'];
  onSelect?: URDFViewerProps['onSelect'];
  onMeshSelect?: URDFViewerProps['onMeshSelect'];
  onHover?: URDFViewerProps['onHover'];
  selection?: Selection;
  showVisual?: URDFViewerProps['showVisual'];
  setShowVisual?: URDFViewerProps['setShowVisual'];
  onTransformPendingChange?: URDFViewerProps['onTransformPendingChange'];
  groundPlaneOffset?: number;
  active?: boolean;
}

export const useURDFViewerController = ({
  onJointChange,
  jointAngleState,
  onSelect,
  onHover,
  selection,
  showVisual: propShowVisual,
  setShowVisual: propSetShowVisual,
  onTransformPendingChange,
  groundPlaneOffset = 0,
  active = true,
}: UseURDFViewerControllerProps) => {
  const isOrbitDragging = useRef(false);
  const [robot, setRobot] = useState<any>(null);
  const {
    showCollision,
    setShowCollision,
    localShowVisual,
    setLocalShowVisual,
    showJointControls,
    setShowJointControls,
    showCenterOfMass,
    setShowCenterOfMass,
    showCoMOverlay,
    setShowCoMOverlay,
    centerOfMassSize,
    setCenterOfMassSize,
    showInertia,
    setShowInertia,
    showInertiaOverlay,
    setShowInertiaOverlay,
    showOrigins,
    setShowOrigins,
    showOriginsOverlay,
    setShowOriginsOverlay,
    originSize,
    setOriginSize,
    showJointAxes,
    setShowJointAxes,
    showJointAxesOverlay,
    setShowJointAxesOverlay,
    jointAxisSize,
    setJointAxisSize,
    modelOpacity,
    setModelOpacity,
    highlightMode,
    setHighlightMode,
    isOptionsCollapsed,
    toggleOptionsCollapsed,
    isJointsCollapsed,
    toggleJointsCollapsed,
  } = useViewerSettings();

  const showVisual = propShowVisual !== undefined ? propShowVisual : localShowVisual;
  const setShowVisual = propSetShowVisual || setLocalShowVisual;

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [measureState, setMeasureState] = useState<MeasureState>(createEmptyMeasureState);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsPanelRef = useRef<HTMLDivElement>(null);
  const jointPanelRef = useRef<HTMLDivElement>(null);
  const measurePanelRef = useRef<HTMLDivElement>(null);
  const { optionsPanelPos, jointPanelPos, measurePanelPos, handleMouseDown, handleMouseMove, handleMouseUp } =
    usePanelDrag(containerRef, optionsPanelRef, jointPanelRef, measurePanelRef);

  const transformMode = (['translate', 'rotate', 'universal'].includes(toolMode)
    ? toolMode
    : 'select') as 'select' | 'translate' | 'rotate' | 'universal';

  useEffect(() => {
    if (selection?.subType === 'collision') {
      setHighlightMode('collision');
      setShowCollision(true);
    } else if (selection?.subType === 'visual') {
      setHighlightMode('link');
    }
  }, [selection?.subType, setHighlightMode, setShowCollision]);

  const [jointAngles, setJointAngles] = useState<Record<string, number>>({});
  const jointAnglesRef = useRef<Record<string, number>>({});
  const [initialJointAngles, setInitialJointAngles] = useState<Record<string, number>>({});
  const [angleUnit, setAngleUnit] = useState<'rad' | 'deg'>('rad');
  const [activeJoint, setActiveJoint] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const justSelectedRef = useRef(false);
  const transformPendingRef = useRef(false);

  useEffect(() => {
    const releaseDragLock = () => setIsDragging(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsDragging(false);
      }
    };

    window.addEventListener('mouseup', releaseDragLock);
    window.addEventListener('pointerup', releaseDragLock);
    window.addEventListener('blur', releaseDragLock);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('mouseup', releaseDragLock);
      window.removeEventListener('pointerup', releaseDragLock);
      window.removeEventListener('blur', releaseDragLock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    jointAnglesRef.current = jointAngles;
  }, [jointAngles]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    setRegressionRuntimeRobot(robot);

    if (!active) {
      setRegressionViewerHandlers(null);
      return () => {
        setRegressionRuntimeRobot(null);
        setRegressionViewerHandlers(null);
      };
    }

    const applyFlags = (flags: RegressionViewerFlags) => {
      if (flags.showCollision !== undefined) setShowCollision(flags.showCollision);
      if (flags.showVisual !== undefined) setShowVisual(flags.showVisual);
      if (flags.showCenterOfMass !== undefined) setShowCenterOfMass(flags.showCenterOfMass);
      if (flags.showCoMOverlay !== undefined) setShowCoMOverlay(flags.showCoMOverlay);
      if (flags.centerOfMassSize !== undefined) setCenterOfMassSize(flags.centerOfMassSize);
      if (flags.showInertia !== undefined) setShowInertia(flags.showInertia);
      if (flags.showInertiaOverlay !== undefined) setShowInertiaOverlay(flags.showInertiaOverlay);
      if (flags.showOrigins !== undefined) setShowOrigins(flags.showOrigins);
      if (flags.showOriginsOverlay !== undefined) setShowOriginsOverlay(flags.showOriginsOverlay);
      if (flags.originSize !== undefined) setOriginSize(flags.originSize);
      if (flags.showJointAxes !== undefined) setShowJointAxes(flags.showJointAxes);
      if (flags.showJointAxesOverlay !== undefined) setShowJointAxesOverlay(flags.showJointAxesOverlay);
      if (flags.jointAxisSize !== undefined) setJointAxisSize(flags.jointAxisSize);
      if (flags.highlightMode !== undefined) setHighlightMode(flags.highlightMode);
      if (flags.modelOpacity !== undefined) setModelOpacity(flags.modelOpacity);
    };

    setRegressionViewerHandlers({
      getSnapshot: () => ({
        jointAngles: { ...jointAnglesRef.current },
        activeJoint,
        highlightMode,
        flags: {
          showCollision,
          showVisual,
          showCenterOfMass,
          showCoMOverlay,
          centerOfMassSize,
          showInertia,
          showInertiaOverlay,
          showOrigins,
          showOriginsOverlay,
          originSize,
          showJointAxes,
          showJointAxesOverlay,
          jointAxisSize,
          highlightMode,
          modelOpacity,
        },
      }),
      setFlags: applyFlags,
    });

    return () => {
      setRegressionViewerHandlers(null);
      setRegressionRuntimeRobot(null);
    };
  }, [
    active,
    activeJoint,
    centerOfMassSize,
    highlightMode,
    jointAxisSize,
    modelOpacity,
    originSize,
    robot,
    setCenterOfMassSize,
    setHighlightMode,
    setJointAxisSize,
    setModelOpacity,
    setOriginSize,
    setShowCoMOverlay,
    setShowCenterOfMass,
    setShowCollision,
    setShowInertia,
    setShowInertiaOverlay,
    setShowJointAxes,
    setShowJointAxesOverlay,
    setShowOrigins,
    setShowOriginsOverlay,
    setShowVisual,
    showCenterOfMass,
    showCoMOverlay,
    showCollision,
    showInertia,
    showInertiaOverlay,
    showJointAxes,
    showJointAxesOverlay,
    showOrigins,
    showOriginsOverlay,
    showVisual,
  ]);

  const handleRobotLoaded = useCallback((loadedRobot: any) => {
    setRobot(loadedRobot);

    if (loadedRobot.joints) {
      const currentAngles: Record<string, number> = {};
      const defaultAngles: Record<string, number> = {};
      const previousAngles = jointAnglesRef.current;

      Object.keys(loadedRobot.joints).forEach((name) => {
        const loadedJoint = loadedRobot.joints[name];
        if (!isSingleDofJoint(loadedJoint)) return;

        const defaultAngle = loadedJoint.angle || 0;
        defaultAngles[name] = defaultAngle;

        if (previousAngles[name] !== undefined) {
          currentAngles[name] = previousAngles[name];
          loadedJoint.setJointValue?.(previousAngles[name]);
        } else {
          currentAngles[name] = defaultAngle;
        }
      });

      setJointAngles(currentAngles);
      setInitialJointAngles(defaultAngles);
    }

  }, []);

  const handleTransformPending = useCallback(
    (pending: boolean) => {
      transformPendingRef.current = pending;
      onTransformPendingChange?.(pending);
    },
    [onTransformPendingChange]
  );

  useEffect(() => {
    return () => {
      transformPendingRef.current = false;
      onTransformPendingChange?.(false);
    };
  }, [onTransformPendingChange]);

  useEffect(() => {
    if (!robot || !jointAngleState) return;

    setJointAngles((prev) => ({ ...prev, ...jointAngleState }));

    Object.entries(jointAngleState).forEach(([name, angle]) => {
      const joint = robot.joints?.[name];
      if (isSingleDofJoint(joint)) {
        joint.setJointValue?.(angle);
      }
    });
  }, [jointAngleState, robot]);

  useEffect(() => {
    if (!robot?.joints) return;

    setJointAngles((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.keys(robot.joints).forEach((name) => {
        const joint = robot.joints[name];
        if (!isSingleDofJoint(joint)) return;

        const newAngle = joint.angle;
        if (newAngle !== undefined && newAngle !== prev[name]) {
          next[name] = newAngle;
          changed = true;
          joint.setJointValue?.(newAngle);
        }
      });

      return changed ? next : prev;
    });
  }, [robot]);

  const handleJointAngleChange = useCallback(
    (jointName: string, angle: number) => {
      if (!robot?.joints?.[jointName]) return;

      const joint = robot.joints[jointName];
      if (!isSingleDofJoint(joint)) return;

      joint.setJointValue?.(angle);
      setJointAngles((prev) => ({ ...prev, [jointName]: angle }));
    },
    [robot]
  );

  const handleJointChangeCommit = useCallback(
    (jointName: string, angle: number) => {
      onJointChange?.(jointName, angle);
    },
    [onJointChange]
  );

  const handleResetJoints = useCallback(() => {
    if (!robot?.joints) return;

    Object.keys(jointAngles).forEach((name) => {
      const initialAngle = initialJointAngles[name] || 0;
      const joint = robot.joints[name];

      if (joint) {
        const originalIgnoreLimits = joint.ignoreLimits;
        joint.ignoreLimits = true;
        handleJointAngleChange(name, initialAngle);
        joint.ignoreLimits = originalIgnoreLimits;
      } else {
        handleJointAngleChange(name, initialAngle);
      }

      handleJointChangeCommit(name, initialAngle);
    });
  }, [handleJointAngleChange, handleJointChangeCommit, initialJointAngles, jointAngles, robot]);

  const handleSelectWrapper = useCallback(
    (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
      if (transformPendingRef.current) return;

      onSelect?.(type, id, subType);

      if (type === 'link' && robot) {
        const jointName = Object.keys(robot.joints).find((name) => {
          const joint = robot.joints[name];
          return joint?.child?.name === id && isSingleDofJoint(joint);
        });
        setActiveJoint(jointName ?? null);
        return;
      }

      if (type === 'joint') {
        const joint = robot?.joints?.[id];
        setActiveJoint(isSingleDofJoint(joint) ? id : null);
        return;
      }

      setActiveJoint(null);
    },
    [onSelect, robot]
  );

  const handleHoverWrapper = useCallback(
    (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => {
      onHover?.(type, id, subType);
    },
    [onHover]
  );

  const handleAutoFitGround = useCallback(() => {
    if (!robot) return;
    const aligned = alignObjectLowestPointToZ(robot, groundPlaneOffset, {
      includeInvisible: false,
      includeVisual: true,
      includeCollision: false,
    });

    if (aligned === null) {
      alignObjectLowestPointToZ(robot, groundPlaneOffset, {
        includeInvisible: true,
        includeVisual: true,
        includeCollision: false,
      });
    }
  }, [groundPlaneOffset, robot]);

  const handleToolModeChange = useCallback((nextMode: ToolMode) => {
    setToolMode(nextMode);

    if (nextMode !== 'measure') {
      setMeasureState((prev) =>
        prev.currentPoints.length === 0 && prev.tempPoint === null
          ? prev
          : { ...prev, currentPoints: [], tempPoint: null }
      );
    }
  }, []);

  const handleCloseMeasureTool = useCallback(() => {
    setMeasureState(createEmptyMeasureState());
    setToolMode('select');
    onHover?.(null, null);
  }, [onHover]);

  const handlePointerMissed = useCallback(() => {
    if (justSelectedRef.current) return;
    if (transformPendingRef.current) return;
    onSelect?.('link', '');
    setActiveJoint(null);
  }, [onSelect]);

  useEffect(() => {
    if (!active || !robot) return;

    const timers = [0, 80, 220].map((delay) => window.setTimeout(handleAutoFitGround, delay));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, groundPlaneOffset, handleAutoFitGround, robot]);

  useEffect(() => {
    if (!robot) return;

    if (selection?.type === 'joint' && selection.id) {
      const joint = robot.joints[selection.id];
      setActiveJoint(isSingleDofJoint(joint) ? selection.id : null);
      return;
    }

    if (selection?.type === 'link' && selection.id) {
      const jointName = Object.keys(robot.joints).find((name) => {
        const joint = robot.joints[name];
        return joint?.child?.name === selection.id && isSingleDofJoint(joint);
      });
      setActiveJoint(jointName ?? null);
      return;
    }

    setActiveJoint(null);
  }, [robot, selection]);

  return {
    robot,
    setRobot,
    showCollision,
    setShowCollision,
    showVisual,
    setShowVisual,
    showJointControls,
    setShowJointControls,
    showCenterOfMass,
    setShowCenterOfMass,
    showCoMOverlay,
    setShowCoMOverlay,
    centerOfMassSize,
    setCenterOfMassSize,
    showInertia,
    setShowInertia,
    showInertiaOverlay,
    setShowInertiaOverlay,
    showOrigins,
    setShowOrigins,
    showOriginsOverlay,
    setShowOriginsOverlay,
    originSize,
    setOriginSize,
    showJointAxes,
    setShowJointAxes,
    showJointAxesOverlay,
    setShowJointAxesOverlay,
    jointAxisSize,
    setJointAxisSize,
    modelOpacity,
    setModelOpacity,
    highlightMode,
    setHighlightMode,
    isOptionsCollapsed,
    toggleOptionsCollapsed,
    isJointsCollapsed,
    toggleJointsCollapsed,
    toolMode,
    measureState,
    setMeasureState,
    containerRef,
    optionsPanelRef,
    jointPanelRef,
    measurePanelRef,
    optionsPanelPos,
    jointPanelPos,
    measurePanelPos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    transformMode,
    jointAngles,
    angleUnit,
    setAngleUnit,
    activeJoint,
    setActiveJoint,
    isDragging,
    setIsDragging,
    isOrbitDragging,
    justSelectedRef,
    transformPendingRef,
    handleRobotLoaded,
    handleTransformPending,
    handleJointAngleChange,
    handleJointChangeCommit,
    handleResetJoints,
    handleSelectWrapper,
    handleHoverWrapper,
    handleAutoFitGround,
    handleToolModeChange,
    handleCloseMeasureTool,
    handlePointerMissed,
  };
};

export type URDFViewerController = ReturnType<typeof useURDFViewerController>;
