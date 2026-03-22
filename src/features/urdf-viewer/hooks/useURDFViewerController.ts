import { useCallback, useEffect, useRef, useState } from 'react';
import { alignObjectLowestPointToZ } from '@/shared/utils';
import {
  setRegressionRuntimeRobot,
  setRegressionViewerHandlers,
  type RegressionViewerFlags,
} from '@/shared/debug/regressionBridge';
import { isSingleDofJoint } from '../utils/jointTypes';
import type { MeasureAnchorMode, MeasureState, ToolMode, URDFViewerProps, ViewerJointMotionStateValue } from '../types';
import { createEmptyMeasureState } from '../utils/measurements';
import { beginInitialGroundAlignment } from '../utils/robotPositioning';
import { usePanelDrag } from './usePanelDrag';
import { useViewerSettings } from './useViewerSettings';

type Selection = URDFViewerProps['selection'];

interface UseURDFViewerControllerProps {
  onJointChange?: URDFViewerProps['onJointChange'];
  syncJointChangesToApp?: boolean;
  showJointPanel?: boolean;
  jointAngleState?: URDFViewerProps['jointAngleState'];
  jointMotionState?: Record<string, ViewerJointMotionStateValue>;
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
  syncJointChangesToApp = false,
  showJointPanel = true,
  jointAngleState,
  jointMotionState,
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
  const [jointPanelRobot, setJointPanelRobot] = useState<any>(null);
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
  const [measureAnchorMode, setMeasureAnchorMode] = useState<MeasureAnchorMode>('frame');
  const [showMeasureDecomposition, setShowMeasureDecomposition] = useState(false);
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
  const queuedJointAnglesRef = useRef<Record<string, number>>({});
  const jointAnglesFrameRef = useRef<number | null>(null);
  const [initialJointAngles, setInitialJointAngles] = useState<Record<string, number>>({});
  const [angleUnit, setAngleUnit] = useState<'rad' | 'deg'>('rad');
  const [activeJoint, setActiveJoint] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const justSelectedRef = useRef(false);
  const transformPendingRef = useRef(false);
  const jointControlRobot = jointPanelRobot || robot;
  const shouldMirrorJointAnglesToState = showJointPanel && showJointControls;

  const emitJointChangeToApp = useCallback((jointName: string, angle: number) => {
    if (!syncJointChangesToApp) {
      return;
    }

    onJointChange?.(jointName, angle);
  }, [onJointChange, syncJointChangesToApp]);

  const flushQueuedJointAngles = useCallback(() => {
    jointAnglesFrameRef.current = null;
    const queuedEntries = Object.entries(queuedJointAnglesRef.current);
    if (queuedEntries.length === 0) {
      return;
    }

    queuedJointAnglesRef.current = {};
    setJointAngles((prev) => {
      let changed = false;
      const next = { ...prev };

      queuedEntries.forEach(([jointName, angle]) => {
        if (next[jointName] !== angle) {
          next[jointName] = angle;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, []);

  const queueJointAngleState = useCallback((jointName: string, angle: number, immediate = false) => {
    jointAnglesRef.current[jointName] = angle;

    if (!shouldMirrorJointAnglesToState) {
      return;
    }

    queuedJointAnglesRef.current[jointName] = angle;

    if (immediate) {
      if (jointAnglesFrameRef.current !== null) {
        window.cancelAnimationFrame(jointAnglesFrameRef.current);
        jointAnglesFrameRef.current = null;
      }
      flushQueuedJointAngles();
      return;
    }

    if (jointAnglesFrameRef.current === null) {
      jointAnglesFrameRef.current = window.requestAnimationFrame(() => {
        flushQueuedJointAngles();
      });
    }
  }, [flushQueuedJointAngles, shouldMirrorJointAnglesToState]);

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
    return () => {
      if (jointAnglesFrameRef.current !== null) {
        window.cancelAnimationFrame(jointAnglesFrameRef.current);
      }
    };
  }, []);

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
      setJointAngles: (nextJointAngles) => {
        if (!nextJointAngles || typeof nextJointAngles !== 'object') {
          return { changed: false };
        }

        let changed = false;

        setJointAngles((prev) => {
          const merged = { ...prev };

          Object.entries(nextJointAngles).forEach(([jointName, angle]) => {
            if (!Number.isFinite(Number(angle))) {
              return;
            }

            const numericAngle = Number(angle);
            const joint = robot?.joints?.[jointName];
            if (joint && isSingleDofJoint(joint)) {
              joint.setJointValue?.(numericAngle);
            }

            if (merged[jointName] !== numericAngle) {
              merged[jointName] = numericAngle;
              changed = true;
            }
          });

          return changed ? merged : prev;
        });

        robot?.updateMatrixWorld?.(true);
        return { changed };
      },
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

  const initializeJointControlState = useCallback((loadedRobot: any) => {
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

  const handleRobotLoaded = useCallback((loadedRobot: any) => {
    setJointPanelRobot(null);
    setRobot(loadedRobot);
    initializeJointControlState(loadedRobot);
  }, [initializeJointControlState]);

  const handleJointPanelRobotLoaded = useCallback((loadedRobot: any | null) => {
    setJointPanelRobot(loadedRobot);
    if (!loadedRobot) {
      return;
    }
    initializeJointControlState(loadedRobot);
  }, [initializeJointControlState]);

  const handleRuntimeJointAnglesChange = useCallback((nextAngles: Record<string, number>) => {
    if (!nextAngles || typeof nextAngles !== 'object') return;
    const changedEntries: Array<[string, number]> = [];

    if (jointPanelRobot?.joints) {
      Object.entries(nextAngles).forEach(([jointName, angle]) => {
        const joint = jointPanelRobot.joints?.[jointName];
        if (joint && isSingleDofJoint(joint)) {
          joint.angle = angle;
        }
      });
    }

    Object.entries(nextAngles).forEach(([jointName, angle]) => {
      if (!Number.isFinite(Number(angle))) return;
      if (jointAnglesRef.current[jointName] !== angle) {
        changedEntries.push([jointName, angle]);
      }
    });

    changedEntries.forEach(([jointName, angle]) => {
      queueJointAngleState(jointName, angle);
    });
  }, [jointPanelRobot, queueJointAngleState]);

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
    if (!jointControlRobot || (!jointAngleState && !jointMotionState)) return;

    const nextAngleState = jointMotionState
      ? Object.fromEntries(
          Object.entries(jointMotionState)
            .filter(([, motion]) => typeof motion?.angle === 'number')
            .map(([name, motion]) => [name, motion.angle as number]),
        )
      : jointAngleState ?? {};

    if (Object.keys(nextAngleState).length > 0) {
      setJointAngles((prev) => ({ ...prev, ...nextAngleState }));
    }

    Object.entries(jointMotionState ?? {}).forEach(([name, motion]) => {
      const joint = jointControlRobot.joints?.[name];
      if (!joint || !motion) {
        return;
      }

      if (typeof motion.angle === 'number' && isSingleDofJoint(joint)) {
        joint.setJointValue?.(motion.angle);
      }

      if (motion.quaternion && typeof (joint as any).setJointQuaternion === 'function') {
        (joint as any).setJointQuaternion(motion.quaternion);
      }
    });

    if (!jointMotionState) {
      Object.entries(jointAngleState ?? {}).forEach(([name, angle]) => {
        const joint = jointControlRobot.joints?.[name];
        if (isSingleDofJoint(joint)) {
          joint.setJointValue?.(angle);
        }
      });
    }
  }, [jointAngleState, jointControlRobot, jointMotionState]);

  useEffect(() => {
    if (!jointControlRobot?.joints) return;
    if (!shouldMirrorJointAnglesToState) return;

    setJointAngles((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.keys(jointControlRobot.joints).forEach((name) => {
        const joint = jointControlRobot.joints[name];
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
  }, [jointControlRobot, shouldMirrorJointAnglesToState]);

  const handleJointAngleChange = useCallback(
    (jointName: string, angle: number) => {
      if (!jointControlRobot?.joints?.[jointName]) return;

      const joint = jointControlRobot.joints[jointName];
      if (!isSingleDofJoint(joint)) return;

      if ((joint.angle ?? joint.jointValue) !== angle) {
        joint.setJointValue?.(angle);
      }

      if (jointAnglesRef.current[jointName] === angle) {
        return;
      }

      queueJointAngleState(jointName, angle);
    },
    [jointControlRobot, queueJointAngleState]
  );

  const handleJointChangeCommit = useCallback(
    (jointName: string, angle: number) => {
      const joint = jointControlRobot?.joints?.[jointName];
      if (joint && isSingleDofJoint(joint) && (joint.angle ?? joint.jointValue) !== angle) {
        joint.setJointValue?.(angle);
      }

      queueJointAngleState(jointName, angle, true);

      const resolvedJointName = joint?.name || jointName;
      emitJointChangeToApp(resolvedJointName, angle);
    },
    [emitJointChangeToApp, jointControlRobot, queueJointAngleState]
  );

  const handleResetJoints = useCallback(() => {
    if (!jointControlRobot?.joints) return;

    Object.keys(jointAngles).forEach((name) => {
      const initialAngle = initialJointAngles[name] || 0;
      const joint = jointControlRobot.joints[name];

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
  }, [handleJointAngleChange, handleJointChangeCommit, initialJointAngles, jointAngles, jointControlRobot]);

  const handleSelectWrapper = useCallback(
    (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
      if (transformPendingRef.current) return;

      onSelect?.(type, id, subType);

      if (type === 'link' && jointControlRobot) {
        const jointName = Object.keys(jointControlRobot.joints).find((name) => {
          const joint = jointControlRobot.joints[name];
          return joint?.child?.name === id && isSingleDofJoint(joint);
        });
        setActiveJoint(jointName ?? null);
        return;
      }

      if (type === 'joint') {
        const joint = jointControlRobot?.joints?.[id];
        setActiveJoint(isSingleDofJoint(joint) ? id : null);
        return;
      }

      setActiveJoint(null);
    },
    [jointControlRobot, onSelect]
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
        !prev.hoverTarget
          ? prev
          : { ...prev, hoverTarget: null }
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
    if (!beginInitialGroundAlignment(robot)) return;

    const timers = [0, 80, 220].map((delay) => window.setTimeout(handleAutoFitGround, delay));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, groundPlaneOffset, handleAutoFitGround, robot]);

  useEffect(() => {
    if (!jointControlRobot) return;

    if (selection?.type === 'joint' && selection.id) {
      const joint = jointControlRobot.joints[selection.id];
      setActiveJoint(isSingleDofJoint(joint) ? selection.id : null);
      return;
    }

    if (selection?.type === 'link' && selection.id) {
      const jointName = Object.keys(jointControlRobot.joints).find((name) => {
        const joint = jointControlRobot.joints[name];
        return joint?.child?.name === selection.id && isSingleDofJoint(joint);
      });
      setActiveJoint(jointName ?? null);
      return;
    }

    setActiveJoint(null);
  }, [jointControlRobot, selection]);

  return {
    robot,
    setRobot,
    jointPanelRobot,
    setJointPanelRobot,
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
    measureAnchorMode,
    setMeasureAnchorMode,
    showMeasureDecomposition,
    setShowMeasureDecomposition,
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
    handleJointPanelRobotLoaded,
    handleRuntimeJointAnglesChange,
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
