import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '@/store';
import type { ViewerInteractiveLayer } from '../types';
import { resolveInteractiveLayerPriority } from '../utils/interactiveLayerPriority';

const ORIGIN_OVERLAY_STORAGE_KEY = 'urdf_viewer_origin_overlay_v2';
const SHOW_COLLISION_STORAGE_KEY = 'urdf_viewer_show_collision';
const SHOW_VISUAL_STORAGE_KEY = 'urdf_viewer_show_visual';
const SHOW_CENTER_OF_MASS_STORAGE_KEY = 'urdf_viewer_show_center_of_mass';
const SHOW_INERTIA_STORAGE_KEY = 'urdf_viewer_show_inertia';
const SHOW_ORIGINS_STORAGE_KEY = 'urdf_viewer_show_origins';
const SHOW_JOINT_AXES_STORAGE_KEY = 'urdf_viewer_show_joint_axes';

export interface ViewerSettings {
    showCollision: boolean;
    setShowCollision: React.Dispatch<React.SetStateAction<boolean>>;
    showCollisionAlwaysOnTop: boolean;
    setShowCollisionAlwaysOnTop: React.Dispatch<React.SetStateAction<boolean>>;
    localShowVisual: boolean;
    setLocalShowVisual: React.Dispatch<React.SetStateAction<boolean>>;
    showCenterOfMass: boolean;
    setShowCenterOfMass: React.Dispatch<React.SetStateAction<boolean>>;
    showCoMOverlay: boolean;
    setShowCoMOverlay: React.Dispatch<React.SetStateAction<boolean>>;
    centerOfMassSize: number;
    setCenterOfMassSize: React.Dispatch<React.SetStateAction<number>>;
    showInertia: boolean;
    setShowInertia: React.Dispatch<React.SetStateAction<boolean>>;
    showInertiaOverlay: boolean;
    setShowInertiaOverlay: React.Dispatch<React.SetStateAction<boolean>>;
    showOrigins: boolean;
    setShowOrigins: React.Dispatch<React.SetStateAction<boolean>>;
    showOriginsOverlay: boolean;
    setShowOriginsOverlay: React.Dispatch<React.SetStateAction<boolean>>;
    originSize: number;
    setOriginSize: React.Dispatch<React.SetStateAction<number>>;
    showJointAxes: boolean;
    setShowJointAxes: React.Dispatch<React.SetStateAction<boolean>>;
    showJointAxesOverlay: boolean;
    setShowJointAxesOverlay: React.Dispatch<React.SetStateAction<boolean>>;
    jointAxisSize: number;
    setJointAxisSize: React.Dispatch<React.SetStateAction<number>>;
    interactionLayerPriority: ViewerInteractiveLayer[];
    recordInteractionLayerActivation: (layer: ViewerInteractiveLayer) => void;
    modelOpacity: number;
    setModelOpacity: React.Dispatch<React.SetStateAction<number>>;
    highlightMode: 'link' | 'collision';
    setHighlightMode: React.Dispatch<React.SetStateAction<'link' | 'collision'>>;
    isOptionsCollapsed: boolean;
    toggleOptionsCollapsed: () => void;
    isJointsCollapsed: boolean;
    toggleJointsCollapsed: () => void;
}

export function useViewerSettings(): ViewerSettings {
    const modelOpacity = useUIStore((state) => state.viewOptions.modelOpacity);
    const setViewOption = useUIStore((state) => state.setViewOption);
    const [showCollisionState, setShowCollisionState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(SHOW_COLLISION_STORAGE_KEY) === 'true';
        }
        return false;
    });
    const [showCollisionAlwaysOnTop, setShowCollisionAlwaysOnTop] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_collision_always_on_top');
            return saved !== 'false'; // Default true to preserve current behavior
        }
        return true;
    });
    const [localShowVisualState, setLocalShowVisualState] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(SHOW_VISUAL_STORAGE_KEY);
            return saved !== 'false';
        }
        return true;
    });
    const [showCenterOfMassState, setShowCenterOfMassState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(SHOW_CENTER_OF_MASS_STORAGE_KEY) === 'true';
        }
        return false;
    });
    const [showCoMOverlay, setShowCoMOverlay] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_com_overlay');
            return saved !== 'false'; // Default true
        }
        return true;
    });
    const [centerOfMassSize, setCenterOfMassSize] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_com_size');
            return saved ? Math.min(parseFloat(saved), 0.5) : 0.01;
        }
        return 0.01;
    });
    const [showInertiaState, setShowInertiaState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(SHOW_INERTIA_STORAGE_KEY) === 'true';
        }
        return false;
    });
    const [showInertiaOverlay, setShowInertiaOverlay] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_inertia_overlay');
            return saved !== 'false';
        }
        return true;
    });
    const [showOriginsState, setShowOriginsState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(SHOW_ORIGINS_STORAGE_KEY) === 'true';
        }
        return false;
    });
    const [showOriginsOverlay, setShowOriginsOverlay] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(ORIGIN_OVERLAY_STORAGE_KEY);
            return saved === 'true';
        }
        return false;
    });
    const [originSize, setOriginSize] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_origin_size');
            return saved ? Math.min(parseFloat(saved), 0.5) : 0.1;
        }
        return 0.1;
    });
    const [showJointAxesState, setShowJointAxesState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(SHOW_JOINT_AXES_STORAGE_KEY) === 'true';
        }
        return false;
    });
    const [showJointAxesOverlay, setShowJointAxesOverlay] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_joint_axis_overlay');
            return saved !== 'false';
        }
        return true;
    });
    const [jointAxisSize, setJointAxisSize] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_joint_axis_size');
            return saved ? Math.min(parseFloat(saved), 2.0) : 0.1;
        }
        return 0.1;
    });
    const [highlightMode, setHighlightMode] = useState<'link' | 'collision'>('link');
    const [interactionActivationOrder, setInteractionActivationOrder] = useState<Record<ViewerInteractiveLayer, number>>({
        visual: 1,
        collision: 0,
        'origin-axes': 0,
        'joint-axis': 0,
        'center-of-mass': 0,
        inertia: 0,
    });

    const [isOptionsCollapsed, setIsOptionsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_options_collapsed');
            return saved === 'true';
        }
        return false;
    });
    const [isJointsCollapsed, setIsJointsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('urdf_viewer_joints_collapsed');
            return saved === 'true';
        }
        return false;
    });

    useEffect(() => {
        localStorage.setItem(SHOW_COLLISION_STORAGE_KEY, showCollisionState.toString());
    }, [showCollisionState]);

    useEffect(() => {
        localStorage.setItem(SHOW_VISUAL_STORAGE_KEY, localShowVisualState.toString());
    }, [localShowVisualState]);

    useEffect(() => {
        localStorage.setItem(SHOW_CENTER_OF_MASS_STORAGE_KEY, showCenterOfMassState.toString());
    }, [showCenterOfMassState]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_origin_size', originSize.toString());
    }, [originSize]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_com_size', centerOfMassSize.toString());
    }, [centerOfMassSize]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_com_overlay', showCoMOverlay.toString());
    }, [showCoMOverlay]);

    useEffect(() => {
        localStorage.setItem(SHOW_INERTIA_STORAGE_KEY, showInertiaState.toString());
    }, [showInertiaState]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_inertia_overlay', showInertiaOverlay.toString());
    }, [showInertiaOverlay]);

    useEffect(() => {
        localStorage.setItem(SHOW_ORIGINS_STORAGE_KEY, showOriginsState.toString());
    }, [showOriginsState]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_joint_axis_size', jointAxisSize.toString());
    }, [jointAxisSize]);

    useEffect(() => {
        localStorage.setItem(ORIGIN_OVERLAY_STORAGE_KEY, showOriginsOverlay.toString());
    }, [showOriginsOverlay]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_joint_axis_overlay', showJointAxesOverlay.toString());
    }, [showJointAxesOverlay]);

    useEffect(() => {
        localStorage.setItem(SHOW_JOINT_AXES_STORAGE_KEY, showJointAxesState.toString());
    }, [showJointAxesState]);

    useEffect(() => {
        localStorage.setItem('urdf_viewer_collision_always_on_top', showCollisionAlwaysOnTop.toString());
    }, [showCollisionAlwaysOnTop]);

    const bumpInteractionLayer = useCallback((layer: ViewerInteractiveLayer) => {
        setInteractionActivationOrder((previous) => {
            const nextOrder = Math.max(...Object.values(previous)) + 1;
            if (previous[layer] === nextOrder) {
                return previous;
            }

            return {
                ...previous,
                [layer]: nextOrder,
            };
        });
    }, []);

    const showCollision = showCollisionState;
    const localShowVisual = localShowVisualState;
    const showCenterOfMass = showCenterOfMassState;
    const showInertia = showInertiaState;
    const showOrigins = showOriginsState;
    const showJointAxes = showJointAxesState;

    const setShowCollision: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showCollisionState) : nextValue;
        setShowCollisionState(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('collision');
        }
    }, [bumpInteractionLayer, showCollisionState]);

    const setLocalShowVisual: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(localShowVisualState) : nextValue;
        setLocalShowVisualState(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('visual');
        }
    }, [bumpInteractionLayer, localShowVisualState]);

    const setShowCenterOfMass: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showCenterOfMassState) : nextValue;
        setShowCenterOfMassState(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('center-of-mass');
        }
    }, [bumpInteractionLayer, showCenterOfMassState]);

    const setShowInertia: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showInertiaState) : nextValue;
        setShowInertiaState(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('inertia');
        }
    }, [bumpInteractionLayer, showInertiaState]);

    const setShowOrigins: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showOriginsState) : nextValue;
        setShowOriginsState(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('origin-axes');
        }
    }, [bumpInteractionLayer, showOriginsState]);

    const setShowJointAxes: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showJointAxesState) : nextValue;
        setShowJointAxesState(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('joint-axis');
        }
    }, [bumpInteractionLayer, showJointAxesState]);

    const setShowCollisionAlwaysOnTopTracked: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showCollisionAlwaysOnTop) : nextValue;
        setShowCollisionAlwaysOnTop(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('collision');
        }
    }, [bumpInteractionLayer, showCollisionAlwaysOnTop]);

    const setShowCoMOverlayTracked: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showCoMOverlay) : nextValue;
        setShowCoMOverlay(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('center-of-mass');
        }
    }, [bumpInteractionLayer, showCoMOverlay]);

    const setShowInertiaOverlayTracked: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showInertiaOverlay) : nextValue;
        setShowInertiaOverlay(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('inertia');
        }
    }, [bumpInteractionLayer, showInertiaOverlay]);

    const setShowOriginsOverlayTracked: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showOriginsOverlay) : nextValue;
        setShowOriginsOverlay(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('origin-axes');
        }
    }, [bumpInteractionLayer, showOriginsOverlay]);

    const setShowJointAxesOverlayTracked: React.Dispatch<React.SetStateAction<boolean>> = useCallback((nextValue) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(showJointAxesOverlay) : nextValue;
        setShowJointAxesOverlay(resolvedValue);
        if (resolvedValue) {
            bumpInteractionLayer('joint-axis');
        }
    }, [bumpInteractionLayer, showJointAxesOverlay]);

    const interactionLayerPriority = useMemo(() => resolveInteractiveLayerPriority({
        showVisual: localShowVisual,
        showCollision,
        showCollisionAlwaysOnTop,
        showOrigins,
        showOriginsOverlay,
        showJointAxes,
        showJointAxesOverlay,
        showCenterOfMass,
        showCoMOverlay,
        showInertia,
        showInertiaOverlay,
        activationOrder: interactionActivationOrder,
    }), [
        interactionActivationOrder,
        localShowVisual,
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
    ]);

    const setModelOpacity: React.Dispatch<React.SetStateAction<number>> = (nextValue) => {
        const resolvedValue = typeof nextValue === 'function'
            ? nextValue(modelOpacity)
            : nextValue;
        const clampedValue = Number.isFinite(resolvedValue)
            ? Math.max(0.1, Math.min(1, resolvedValue))
            : 1;
        setViewOption('modelOpacity', clampedValue);
    };

    const toggleOptionsCollapsed = () => {
        setIsOptionsCollapsed(prev => {
            const newState = !prev;
            localStorage.setItem('urdf_viewer_options_collapsed', String(newState));
            return newState;
        });
    };

    const toggleJointsCollapsed = () => {
        setIsJointsCollapsed(prev => {
            const newState = !prev;
            localStorage.setItem('urdf_viewer_joints_collapsed', String(newState));
            return newState;
        });
    };

    return {
        showCollision, setShowCollision,
        showCollisionAlwaysOnTop, setShowCollisionAlwaysOnTop: setShowCollisionAlwaysOnTopTracked,
        localShowVisual, setLocalShowVisual,
        showCenterOfMass, setShowCenterOfMass,
        showCoMOverlay, setShowCoMOverlay: setShowCoMOverlayTracked,
        centerOfMassSize, setCenterOfMassSize,
        showInertia, setShowInertia,
        showInertiaOverlay, setShowInertiaOverlay: setShowInertiaOverlayTracked,
        showOrigins, setShowOrigins,
        showOriginsOverlay, setShowOriginsOverlay: setShowOriginsOverlayTracked,
        originSize, setOriginSize,
        showJointAxes, setShowJointAxes,
        showJointAxesOverlay, setShowJointAxesOverlay: setShowJointAxesOverlayTracked,
        jointAxisSize, setJointAxisSize,
        interactionLayerPriority,
        recordInteractionLayerActivation: bumpInteractionLayer,
        modelOpacity, setModelOpacity,
        highlightMode, setHighlightMode,
        isOptionsCollapsed, toggleOptionsCollapsed,
        isJointsCollapsed, toggleJointsCollapsed
    };
}
