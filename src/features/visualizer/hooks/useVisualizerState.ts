import { useState, useEffect } from 'react';

export interface VisualizerState {
  // Skeleton mode settings
  showGeometry: boolean;
  setShowGeometry: (show: boolean) => void;
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
  showJointAxes: boolean;
  setShowJointAxes: (show: boolean) => void;
  showSkeletonOrigin: boolean;
  setShowSkeletonOrigin: (show: boolean) => void;
  jointAxisSize: number;
  setJointAxisSize: (size: number) => void;
  frameSize: number;
  setFrameSize: (size: number) => void;
  labelScale: number;
  setLabelScale: (scale: number) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;

  // Detail mode settings
  showDetailOrigin: boolean;
  setShowDetailOrigin: (show: boolean) => void;
  showDetailLabels: boolean;
  setShowDetailLabels: (show: boolean) => void;
  showCollision: boolean;
  setShowCollision: (show: boolean) => void;
  showVisual: boolean;
  setShowVisual: (show: boolean) => void;

  // Hardware mode settings
  showHardwareOrigin: boolean;
  setShowHardwareOrigin: (show: boolean) => void;
  showHardwareLabels: boolean;
  setShowHardwareLabels: (show: boolean) => void;

  // Inertia and center of mass settings
  showInertia: boolean;
  setShowInertia: (show: boolean) => void;
  showCenterOfMass: boolean;
  setShowCenterOfMass: (show: boolean) => void;
}

interface UseVisualizerStateProps {
  propShowVisual?: boolean;
  propSetShowVisual?: (show: boolean) => void;
}

/**
 * Custom hook to manage all visualizer display states
 * Handles state for skeleton, detail, and hardware modes
 */
export function useVisualizerState({
  propShowVisual,
  propSetShowVisual,
}: UseVisualizerStateProps = {}): VisualizerState {
  // Skeleton Settings
  const [showGeometry, setShowGeometry] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showJointAxes, setShowJointAxes] = useState(false);
  const [showSkeletonOrigin, setShowSkeletonOrigin] = useState(true);
  const [jointAxisSize, setJointAxisSize] = useState(0.35);
  const [frameSize, setFrameSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('urdf_viewer_origin_size');
      return saved ? Math.min(parseFloat(saved), 0.8) : 0.15;
    }
    return 0.15;
  });

  // Save frameSize to localStorage to sync with detail mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('urdf_viewer_origin_size', frameSize.toString());
    }
  }, [frameSize]);

  const [labelScale, setLabelScale] = useState(1.0);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');

  // Detail Settings
  const [showDetailOrigin, setShowDetailOrigin] = useState(false);
  const [showDetailLabels, setShowDetailLabels] = useState(false);
  const [showCollision, setShowCollision] = useState(false);

  // Handle showVisual (controlled or uncontrolled)
  const [localShowVisual, setLocalShowVisual] = useState(true);
  const showVisual = propShowVisual !== undefined ? propShowVisual : localShowVisual;
  const setShowVisual = propSetShowVisual || setLocalShowVisual;

  // Hardware Settings
  const [showHardwareOrigin, setShowHardwareOrigin] = useState(false);
  const [showHardwareLabels, setShowHardwareLabels] = useState(false);

  // Inertia and Center of Mass Settings
  const [showInertia, setShowInertia] = useState(false);
  const [showCenterOfMass, setShowCenterOfMass] = useState(false);

  return {
    // Skeleton
    showGeometry,
    setShowGeometry,
    showLabels,
    setShowLabels,
    showJointAxes,
    setShowJointAxes,
    showSkeletonOrigin,
    setShowSkeletonOrigin,
    jointAxisSize,
    setJointAxisSize,
    frameSize,
    setFrameSize,
    labelScale,
    setLabelScale,
    transformMode,
    setTransformMode,

    // Detail
    showDetailOrigin,
    setShowDetailOrigin,
    showDetailLabels,
    setShowDetailLabels,
    showCollision,
    setShowCollision,
    showVisual,
    setShowVisual,

    // Hardware
    showHardwareOrigin,
    setShowHardwareOrigin,
    showHardwareLabels,
    setShowHardwareLabels,

    // Inertia and Center of Mass
    showInertia,
    setShowInertia,
    showCenterOfMass,
    setShowCenterOfMass,
  };
}
