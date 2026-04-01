import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelectionStore } from '@/store/selectionStore';
import { alignObjectLowestPointToZ } from '@/shared/utils';
import { createJointPanelStore } from '@/shared/utils/jointPanelStore';
import {
  normalizeViewerJointAngleState,
  resolveViewerJointKey,
} from '@/shared/utils/jointPanelState';
import {
  setRegressionRuntimeRobot,
  setRegressionViewerHandlers,
  type RegressionViewerFlags,
} from '@/shared/debug/regressionBridge';
import { isSingleDofJoint } from '../utils/jointTypes';
import { resolveActiveViewerJointKeyFromSelection } from '../utils/activeJointSelection';
import type {
  MeasureAnchorMode,
  MeasureState,
  ToolMode,
  URDFViewerProps,
  ViewerHelperKind,
  ViewerJointMotionStateValue
} from '../types';
import { resolveInitialJointControlState } from '../utils/jointControlState';
import { createEmptyMeasureState } from '../utils/measurements';
import { beginInitialGroundAlignment } from '../utils/robotPositioning';
import {
  createScopedToolModeState,
  resolveScopedToolModeState,
} from '../utils/scopedToolMode';
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
  setGroundPlaneOffset?: (offset: number) => void;
  groundPlaneOffsetReadOnly?: boolean;
  active?: boolean;
  jointStateScopeKey?: string | null;
  defaultToolMode?: ToolMode;
  toolModeScopeKey?: string | null;
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
  setGroundPlaneOffset,
  groundPlaneOffsetReadOnly = false,
  active = true,
  jointStateScopeKey = null,
  defaultToolMode = 'select',
  toolModeScopeKey = null,
}: UseURDFViewerControllerProps) => {
  const setHoverFrozen = useSelectionStore((state) => state.setHoverFrozen);
  const isOrbitDragging = useRef(false);
  const [robot, setRobot] = useState<any>(null);
  const [jointPanelRobot, setJointPanelRobot] = useState<any>(null);
  const {
    showCollision,
    setShowCollision,
    showCollisionAlwaysOnTop,
    setShowCollisionAlwaysOnTop,
    localShowVisual,
    setLocalShowVisual,
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
    interactionLayerPriority,
    recordInteractionLayerActivation,
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
  const setShowVisual = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((nextValue) => {
    const resolvedValue = typeof nextValue === 'function'
      ? nextValue(showVisual)
      : nextValue;
    (propSetShowVisual || setLocalShowVisual)(resolvedValue);
    if (resolvedValue) {
      recordInteractionLayerActivation('visual');
    }
  }, [propSetShowVisual, recordInteractionLayerActivation, setLocalShowVisual, showVisual]);

  const normalizedToolModeScopeKey = toolModeScopeKey ?? null;
  const [toolModeState, setToolModeState] = useState(() => createScopedToolModeState(
    normalizedToolModeScopeKey,
    defaultToolMode,
  ));
  const resolvedToolModeState = useMemo(() => resolveScopedToolModeState(
    toolModeState,
    normalizedToolModeScopeKey,
    defaultToolMode,
  ), [defaultToolMode, normalizedToolModeScopeKey, toolModeState]);
  const toolMode = resolvedToolModeState.mode;
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
  const updateGroundPlaneOffset = useCallback((nextOffset: number) => {
    setGroundPlaneOffset?.(nextOffset);
  }, [setGroundPlaneOffset]);

  useEffect(() => {
    if (resolvedToolModeState === toolModeState) {
      return;
    }

    setToolModeState(resolvedToolModeState);
  }, [resolvedToolModeState, toolModeState]);

  useEffect(() => {
    if (selection?.subType === 'collision') {
      setHighlightMode('collision');
      setShowCollision(true);
    } else if (selection?.subType === 'visual') {
      setHighlightMode('link');
    }
  }, [selection?.subType, setHighlightMode, setShowCollision]);

  const jointPanelStoreRef = useRef(createJointPanelStore());
  const jointAnglesRef = useRef<Record<string, number>>(jointPanelStoreRef.current.getSnapshot().jointAngles);
  const initialJointAnglesRef = useRef<Record<string, number>>({});
  const jointStateScopeRef = useRef<string | null>(null);
  const [angleUnit, setAngleUnit] = useState<'rad' | 'deg'>('rad');
  const activeJointRef = useRef<string | null>(jointPanelStoreRef.current.getSnapshot().activeJoint);
  const [isDragging, setIsDragging] = useState(false);
  const sceneRefreshRef = useRef<(() => void) | null>(null);
  const pendingSceneRefreshFrameRef = useRef<number | null>(null);
  const previousGroundPlaneOffsetRef = useRef(groundPlaneOffset);

  const justSelectedRef = useRef(false);
  const transformPendingRef = useRef(false);
  const jointControlRobot = jointPanelRobot || robot;
  const jointControlJoints = jointControlRobot?.joints;

  const emitJointChangeToApp = useCallback((jointName: string, angle: number) => {
    if (!syncJointChangesToApp) {
      return;
    }

    onJointChange?.(jointName, angle);
  }, [onJointChange, syncJointChangesToApp]);

  const syncJointAngleSnapshot = useCallback(() => {
    jointAnglesRef.current = jointPanelStoreRef.current.getSnapshot().jointAngles;
  }, []);

  const syncActiveJointSnapshot = useCallback(() => {
    activeJointRef.current = jointPanelStoreRef.current.getSnapshot().activeJoint;
  }, []);

  const patchJointPanelAngles = useCallback((nextJointAngles: Record<string, number>) => {
    const changed = jointPanelStoreRef.current.patchJointAngles(nextJointAngles);
    if (changed) {
      syncJointAngleSnapshot();
    }
    return changed;
  }, [syncJointAngleSnapshot]);

  const replaceJointPanelAngles = useCallback((nextJointAngles: Record<string, number>) => {
    const changed = jointPanelStoreRef.current.replaceJointAngles(nextJointAngles);
    syncJointAngleSnapshot();
    return changed;
  }, [syncJointAngleSnapshot]);

  const setPanelActiveJoint = useCallback((jointName: string | null) => {
    const changed = jointPanelStoreRef.current.setActiveJoint(jointName);
    syncActiveJointSnapshot();
    return changed;
  }, [syncActiveJointSnapshot]);

  const flushSceneRefresh = useCallback(() => {
    pendingSceneRefreshFrameRef.current = null;
    sceneRefreshRef.current?.();
  }, []);

  const requestSceneRefresh = useCallback(() => {
    if (pendingSceneRefreshFrameRef.current !== null) {
      return;
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      flushSceneRefresh();
      return;
    }

    pendingSceneRefreshFrameRef.current = window.requestAnimationFrame(() => {
      flushSceneRefresh();
    });
  }, [flushSceneRefresh]);

  const registerSceneRefresh = useCallback((refreshScene: (() => void) | null) => {
    sceneRefreshRef.current = refreshScene;
  }, []);

  const getJointAnglesSnapshot = useCallback(() => ({ ...jointAnglesRef.current }), []);

  const getInitialJointAnglesForNextLoad = useCallback(() => {
    if (!jointStateScopeKey) {
      return {};
    }

    if (jointStateScopeRef.current !== jointStateScopeKey) {
      return {};
    }

    return { ...jointAnglesRef.current };
  }, [jointStateScopeKey]);

  useEffect(() => {
    if (!active) return;
    setHoverFrozen(isDragging || transformPendingRef.current);
  }, [active, isDragging, setHoverFrozen]);

  useEffect(() => {
    if (!active) {
      setHoverFrozen(false);
    }
  }, [active, setHoverFrozen]);

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
    return () => {
      if (pendingSceneRefreshFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pendingSceneRefreshFrameRef.current);
        pendingSceneRefreshFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const regressionDebugEnabled = import.meta.env.DEV
      || (typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('regressionDebug') === '1');
    if (!regressionDebugEnabled) {
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
      if (flags.showCollisionAlwaysOnTop !== undefined) setShowCollisionAlwaysOnTop(flags.showCollisionAlwaysOnTop);
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
        activeJoint: activeJointRef.current,
        toolMode,
        highlightMode,
        flags: {
          showCollision,
          showCollisionAlwaysOnTop,
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
      setToolMode: (nextMode) => {
        const normalizedMode = String(nextMode || '').trim();
        const allowedModes: ToolMode[] = [
          'select',
          'translate',
          'rotate',
          'universal',
          'view',
          'face',
          'measure',
        ];
        const resolvedMode = allowedModes.includes(normalizedMode as ToolMode)
          ? normalizedMode as ToolMode
          : toolMode;
        const changed = resolvedMode !== toolMode;

        if (changed) {
          setToolModeState({
            scopeKey: normalizedToolModeScopeKey,
            explicit: true,
            mode: resolvedMode,
          });
          if (resolvedMode !== 'measure') {
            setMeasureState((prev) => (
              !prev.hoverTarget
                ? prev
                : { ...prev, hoverTarget: null }
            ));
          }
        }

        return {
          changed,
          activeMode: resolvedMode,
        };
      },
      setJointAngles: (nextJointAngles) => {
        if (!nextJointAngles || typeof nextJointAngles !== 'object') {
          return { changed: false };
        }

        let changed = false;

        Object.entries(nextJointAngles).forEach(([jointName, angle]) => {
          if (!Number.isFinite(Number(angle))) {
            return;
          }

          const numericAngle = Number(angle);
          const joint = robot?.joints?.[jointName];
          if (joint && isSingleDofJoint(joint)) {
            joint.setJointValue?.(numericAngle);
          }

          if (jointAnglesRef.current[jointName] !== numericAngle) {
            changed = true;
          }
        });

        if (changed) {
          patchJointPanelAngles(nextJointAngles);
        }

        robot?.updateMatrixWorld?.(true);
        requestSceneRefresh();
        return { changed };
      },
    });

    return () => {
      setRegressionViewerHandlers(null);
      setRegressionRuntimeRobot(null);
    };
  }, [
    active,
    centerOfMassSize,
    highlightMode,
    jointAxisSize,
    modelOpacity,
    originSize,
    patchJointPanelAngles,
    requestSceneRefresh,
    robot,
    setCenterOfMassSize,
    setHighlightMode,
    setJointAxisSize,
    setModelOpacity,
      normalizedToolModeScopeKey,
      setOriginSize,
      setShowCoMOverlay,
      setShowCenterOfMass,
    setShowCollision,
    setShowCollisionAlwaysOnTop,
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
    showCollisionAlwaysOnTop,
    showInertia,
    showInertiaOverlay,
    showJointAxes,
    showJointAxesOverlay,
    showOrigins,
    showOriginsOverlay,
    showVisual,
    setMeasureState,
    toolMode,
  ]);

  const initializeJointControlState = useCallback((loadedRobot: any) => {
    const preservePreviousAngles = jointStateScopeRef.current !== null && jointStateScopeRef.current === jointStateScopeKey;
    const { currentAngles, defaultAngles } = resolveInitialJointControlState({
      joints: loadedRobot?.joints,
      previousAngles: jointAnglesRef.current,
      preservePreviousAngles,
      isControllableJoint: isSingleDofJoint,
    });

    replaceJointPanelAngles(currentAngles);
    initialJointAnglesRef.current = defaultAngles;
    setPanelActiveJoint(null);
    jointStateScopeRef.current = jointStateScopeKey;
  }, [jointStateScopeKey, replaceJointPanelAngles, setPanelActiveJoint]);

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
    const normalizedAngles = normalizeViewerJointAngleState(jointControlJoints, nextAngles);

    if (jointControlRobot?.joints) {
      Object.entries(normalizedAngles).forEach(([jointKey, angle]) => {
        const joint = jointControlRobot.joints?.[jointKey];
        if (joint && isSingleDofJoint(joint)) {
          joint.angle = angle;
          emitJointChangeToApp(joint.name || jointKey, angle);
        }
      });
    }

    patchJointPanelAngles(normalizedAngles);
  }, [emitJointChangeToApp, jointControlJoints, jointControlRobot, patchJointPanelAngles]);

  const handleRuntimeJointAngleChange = useCallback((jointName: string, angle: number) => {
    const jointKey = resolveViewerJointKey(jointControlJoints, jointName);
    if (!jointKey) {
      return;
    }

    const joint = jointControlRobot?.joints?.[jointKey];
    const resolvedAngle = Number.isFinite(Number(joint?.angle ?? joint?.jointValue))
      ? Number(joint?.angle ?? joint?.jointValue)
      : angle;

    patchJointPanelAngles({ [jointKey]: resolvedAngle });
  }, [jointControlJoints, jointControlRobot, patchJointPanelAngles]);

  const handleTransformPending = useCallback(
    (pending: boolean) => {
      transformPendingRef.current = pending;
      if (active) {
        setHoverFrozen(pending || isDragging);
      }
      onTransformPendingChange?.(pending);
    },
    [active, isDragging, onTransformPendingChange, setHoverFrozen]
  );

  useEffect(() => {
    return () => {
      transformPendingRef.current = false;
      setHoverFrozen(false);
      onTransformPendingChange?.(false);
    };
  }, [onTransformPendingChange, setHoverFrozen]);

  useEffect(() => {
    if (!jointControlRobot || (!jointAngleState && !jointMotionState)) return;

    const nextAngleState = jointMotionState
      ? Object.fromEntries(
          Object.entries(jointMotionState)
            .filter(([, motion]) => typeof motion?.angle === 'number')
            .map(([name, motion]) => [name, motion.angle as number]),
        )
      : jointAngleState ?? {};
    const normalizedAngleState = normalizeViewerJointAngleState(jointControlJoints, nextAngleState);
    let shouldRefresh = false;

    if (Object.keys(normalizedAngleState).length > 0) {
      if (patchJointPanelAngles(normalizedAngleState)) {
        shouldRefresh = true;
      }
    }

    Object.entries(jointMotionState ?? {}).forEach(([name, motion]) => {
      const jointKey = resolveViewerJointKey(jointControlJoints, name);
      const joint = jointKey ? jointControlRobot.joints?.[jointKey] : undefined;
      if (!joint || !motion) {
        return;
      }

      if (typeof motion.angle === 'number' && isSingleDofJoint(joint)) {
        joint.setJointValue?.(motion.angle);
        shouldRefresh = true;
      }

      if (motion.quaternion && typeof (joint as any).setJointQuaternion === 'function') {
        (joint as any).setJointQuaternion(motion.quaternion);
        shouldRefresh = true;
      }
    });

    if (!jointMotionState) {
      Object.entries(normalizedAngleState).forEach(([name, angle]) => {
        const joint = jointControlRobot.joints?.[name];
        if (isSingleDofJoint(joint)) {
          joint.setJointValue?.(angle);
          shouldRefresh = true;
        }
      });
    }

    if (shouldRefresh) {
      requestSceneRefresh();
    }
  }, [jointAngleState, jointControlJoints, jointControlRobot, jointMotionState, patchJointPanelAngles, requestSceneRefresh]);

  const handleJointAngleChange = useCallback(
    (jointName: string, angle: number) => {
      const jointKey = resolveViewerJointKey(jointControlJoints, jointName);
      if (!jointKey || !jointControlRobot?.joints?.[jointKey]) return;

      const joint = jointControlRobot.joints[jointKey];
      if (!isSingleDofJoint(joint)) return;

      let shouldRefresh = false;
      if ((joint.angle ?? joint.jointValue) !== angle) {
        joint.setJointValue?.(angle);
        shouldRefresh = true;
      }

      const resolvedAngle = Number.isFinite(Number(joint.angle ?? joint.jointValue))
        ? Number(joint.angle ?? joint.jointValue)
        : angle;

      if (patchJointPanelAngles({ [jointKey]: resolvedAngle })) {
        shouldRefresh = true;
      }

      emitJointChangeToApp(joint.name || jointKey || jointName, resolvedAngle);

      if (shouldRefresh) {
        requestSceneRefresh();
      }
    },
    [emitJointChangeToApp, jointControlJoints, jointControlRobot, patchJointPanelAngles, requestSceneRefresh]
  );

  const handleActiveJointChange = useCallback((jointName: string | null) => {
    if (!jointName) {
      setPanelActiveJoint(null);
      return;
    }

    const jointKey = resolveViewerJointKey(jointControlJoints, jointName);
    const joint = jointKey ? jointControlRobot?.joints?.[jointKey] : undefined;
    setPanelActiveJoint(isSingleDofJoint(joint) ? jointKey : null);
  }, [jointControlJoints, jointControlRobot, setPanelActiveJoint]);

  const handleJointChangeCommit = useCallback(
    (jointName: string, angle: number) => {
      const jointKey = resolveViewerJointKey(jointControlJoints, jointName);
      const joint = jointKey ? jointControlRobot?.joints?.[jointKey] : undefined;
      let shouldRefresh = false;
      if (joint && isSingleDofJoint(joint) && (joint.angle ?? joint.jointValue) !== angle) {
        joint.setJointValue?.(angle);
        shouldRefresh = true;
      }

      const resolvedAngle = Number.isFinite(Number(joint?.angle ?? joint?.jointValue))
        ? Number(joint?.angle ?? joint?.jointValue)
        : angle;

      if (jointKey) {
        if (patchJointPanelAngles({ [jointKey]: resolvedAngle })) {
          shouldRefresh = true;
        }
      }
      (joint as { finalizeJointValue?: () => void } | undefined)?.finalizeJointValue?.();

      if (shouldRefresh) {
        requestSceneRefresh();
      }

      const resolvedJointName = joint?.name || jointKey || jointName;
      emitJointChangeToApp(resolvedJointName, resolvedAngle);
    },
    [emitJointChangeToApp, jointControlJoints, jointControlRobot, patchJointPanelAngles, requestSceneRefresh]
  );

  const handleResetJoints = useCallback(() => {
    if (!jointControlRobot?.joints) return;

    Object.keys(jointAnglesRef.current).forEach((name) => {
      const initialAngle = initialJointAnglesRef.current[name] || 0;
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
  }, [handleJointAngleChange, handleJointChangeCommit, jointControlRobot]);

  const handleSelectWrapper = useCallback(
    (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision', helperKind?: ViewerHelperKind) => {
      if (transformPendingRef.current) return;

      onSelect?.(type, id, subType, helperKind);
      const activeJointKey = resolveActiveViewerJointKeyFromSelection(
        jointControlJoints,
        type && id ? { type, id } : null,
      );
      setPanelActiveJoint(activeJointKey);
    },
    [jointControlJoints, jointControlRobot, onSelect, setPanelActiveJoint]
  );

  const handleHoverWrapper = useCallback(
    (
      type: 'link' | 'joint' | null,
      id: string | null,
      subType?: 'visual' | 'collision',
      objectIndex?: number,
      helperKind?: ViewerHelperKind,
    ) => {
      onHover?.(type, id, subType, objectIndex, helperKind);
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
    requestSceneRefresh();
  }, [groundPlaneOffset, requestSceneRefresh, robot]);

  const handleToolModeChange = useCallback((nextMode: ToolMode) => {
    setToolModeState({
      scopeKey: normalizedToolModeScopeKey,
      explicit: true,
      mode: nextMode,
    });

    if (nextMode !== 'measure') {
      setMeasureState((prev) =>
        !prev.hoverTarget
          ? prev
          : { ...prev, hoverTarget: null }
      );
    }
  }, [normalizedToolModeScopeKey]);

  const handleCloseMeasureTool = useCallback(() => {
    setMeasureState(createEmptyMeasureState());
    setToolModeState({
      scopeKey: normalizedToolModeScopeKey,
      explicit: true,
      mode: 'select',
    });
    onHover?.(null, null);
  }, [normalizedToolModeScopeKey, onHover]);

  const handlePointerMissed = useCallback(() => {
    if (justSelectedRef.current) return;
    if (transformPendingRef.current) return;
    onSelect?.('link', '');
    setPanelActiveJoint(null);
  }, [onSelect, setPanelActiveJoint]);

  useEffect(() => {
    if (!active || !robot) return;
    if (!beginInitialGroundAlignment(robot)) return;

    const timers = [0, 80, 220].map((delay) => window.setTimeout(handleAutoFitGround, delay));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, groundPlaneOffset, handleAutoFitGround, robot]);

  useEffect(() => {
    const previousGroundPlaneOffset = previousGroundPlaneOffsetRef.current;
    previousGroundPlaneOffsetRef.current = groundPlaneOffset;

    if (!active || !robot) {
      return;
    }

    if (Object.is(previousGroundPlaneOffset, groundPlaneOffset)) {
      return;
    }

    handleAutoFitGround();
  }, [active, groundPlaneOffset, handleAutoFitGround, robot]);

  useEffect(() => {
    if (!jointControlRobot) return;
    const activeJointKey = resolveActiveViewerJointKeyFromSelection(
      jointControlJoints,
      selection,
    );
    setPanelActiveJoint(activeJointKey);
  }, [jointControlJoints, jointControlRobot, selection, setPanelActiveJoint]);

  return {
    robot,
    setRobot,
    jointPanelRobot,
    setJointPanelRobot,
    showCollision,
    showCollisionAlwaysOnTop,
    setShowCollisionAlwaysOnTop,
    setShowCollision,
    showVisual,
    setShowVisual,
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
    interactionLayerPriority,
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
    jointPanelStore: jointPanelStoreRef.current,
    getJointAnglesSnapshot,
    getInitialJointAnglesForNextLoad,
    registerSceneRefresh,
    angleUnit,
    setAngleUnit,
    setActiveJoint: setPanelActiveJoint,
    handleActiveJointChange,
    isDragging,
    setIsDragging,
    isOrbitDragging,
    justSelectedRef,
    transformPendingRef,
    handleRobotLoaded,
    handleJointPanelRobotLoaded,
    handleRuntimeJointAnglesChange,
    handleRuntimeJointAngleChange,
    handleTransformPending,
    handleJointAngleChange,
    handleJointChangeCommit,
    handleResetJoints,
    handleSelectWrapper,
    handleHoverWrapper,
    handleAutoFitGround,
    groundPlaneOffset,
    setGroundPlaneOffset: updateGroundPlaneOffset,
    groundPlaneOffsetReadOnly,
    handleToolModeChange,
    handleCloseMeasureTool,
    handlePointerMissed,
  };
};

export type URDFViewerController = ReturnType<typeof useURDFViewerController>;
