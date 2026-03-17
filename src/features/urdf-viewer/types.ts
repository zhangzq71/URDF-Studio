import React from 'react';
import * as THREE from 'three';
import type { Language, translations } from '@/shared/i18n';
import type { Theme, UrdfJoint, UrdfLink } from '@/types';

export type ToolMode = 'select' | 'translate' | 'rotate' | 'universal' | 'view' | 'face' | 'measure';

export interface MeasureState {
    measurements: [THREE.Vector3, THREE.Vector3][];
    currentPoints: THREE.Vector3[];
    tempPoint: THREE.Vector3 | null;
}

export interface URDFViewerProps {
    urdfContent: string;
    assets: Record<string, string>;
    onJointChange?: (jointName: string, angle: number) => void;
    jointAngleState?: Record<string, number>;
    lang: Language;
    mode?: 'detail' | 'hardware';
    onSelect?: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
    onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision', objectIndex?: number) => void;
    theme: Theme;
    selection?: { type: 'link' | 'joint' | null; id: string | null; subType?: 'visual' | 'collision'; objectIndex?: number };
    hoveredSelection?: { type: 'link' | 'joint' | null; id: string | null; subType?: 'visual' | 'collision'; objectIndex?: number };
    robotLinks?: Record<string, UrdfLink>;
    robotJoints?: Record<string, UrdfJoint>;
    focusTarget?: string | null;
    showVisual?: boolean;
    setShowVisual?: (show: boolean) => void;
    showToolbar?: boolean;
    setShowToolbar?: (show: boolean) => void;
    showOptionsPanel?: boolean;
    setShowOptionsPanel?: (show: boolean) => void;
    showJointPanel?: boolean;
    setShowJointPanel?: (show: boolean) => void;
    onCollisionTransformPreview?: (linkName: string, position: {x: number, y: number, z: number}, rotation: {r: number, p: number, y: number}, objectIndex?: number) => void;
    onCollisionTransform?: (linkName: string, position: {x: number, y: number, z: number}, rotation: {r: number, p: number, y: number}, objectIndex?: number) => void;
    snapshotAction?: React.RefObject<(() => void) | null>;
    /** True when previewing a standalone mesh asset from the library (STL/DAE/OBJ/GLB). */
    isMeshPreview?: boolean;
    /** Notify parent when collision transform has a pending confirm/cancel state */
    onTransformPendingChange?: (pending: boolean) => void;
}

export interface RobotModelProps {
    urdfContent: string;
    assets: Record<string, string>;
    sourceFilePath?: string;
    onRobotLoaded?: (robot: any) => void;
    showCollision?: boolean;
    showVisual?: boolean;
    onSelect?: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision', objectIndex?: number) => void;
    onMeshSelect?: (linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => void;
    onJointChange?: (name: string, angle: number) => void;
    onJointChangeCommit?: (name: string, angle: number) => void;
    jointAngles?: Record<string, number>;
    setIsDragging?: (dragging: boolean) => void;
    setActiveJoint?: (jointName: string | null) => void;
    justSelectedRef?: React.RefObject<boolean>;
    t: typeof translations['en'];
    mode?: 'detail' | 'hardware';
    highlightMode?: 'link' | 'collision';
    showInertia?: boolean;
    showInertiaOverlay?: boolean;
    showCenterOfMass?: boolean;
    showCoMOverlay?: boolean;
    centerOfMassSize?: number;
    showOrigins?: boolean;
    showOriginsOverlay?: boolean;
    originSize?: number;
    showJointAxes?: boolean;
    showJointAxesOverlay?: boolean;
    jointAxisSize?: number;
    modelOpacity?: number;
    robotLinks?: Record<string, UrdfLink>;
    robotJoints?: Record<string, UrdfJoint>;
    focusTarget?: string | null;
    transformMode?: 'select' | 'translate' | 'rotate' | 'universal';
    toolMode?: ToolMode;
    onCollisionTransformPreview?: (linkName: string, position: {x: number, y: number, z: number}, rotation: {r: number, p: number, y: number}, objectIndex?: number) => void;
    onCollisionTransformEnd?: (linkName: string, position: {x: number, y: number, z: number}, rotation: {r: number, p: number, y: number}, objectIndex?: number) => void;
    isOrbitDragging?: React.RefObject<boolean>;
    onTransformPending?: (pending: boolean) => void;
    isSelectionLockedRef?: React.RefObject<boolean>;
    selection?: URDFViewerProps['selection'];
    hoverSelectionEnabled?: boolean;
    isMeshPreview?: boolean;
}

export interface CollisionTransformControlsProps {
    robot: THREE.Object3D | null;
    robotVersion?: number;
    selection: URDFViewerProps['selection'];
    transformMode: 'select' | 'translate' | 'rotate' | 'universal';
    setIsDragging: (dragging: boolean) => void;
    onTransformChange?: (linkId: string, position: {x: number, y: number, z: number}, rotation: {r: number, p: number, y: number}, objectIndex?: number) => void;
    onTransformEnd?: (linkId: string, position: {x: number, y: number, z: number}, rotation: {r: number, p: number, y: number}, objectIndex?: number) => void;
    robotLinks?: Record<string, UrdfLink>;
    onTransformPending?: (pending: boolean) => void;
}

// Re-exported from shared layer
export type { JointControlItemProps } from '@/shared/components/Panel/JointControlItem';

export interface ViewerToolbarProps {
    activeMode: ToolMode;
    setMode: (mode: ToolMode) => void;
    onClose?: () => void;
    lang?: Language;
}

export interface MeasureToolProps {
    active: boolean;
    robot: THREE.Object3D | null;
    measureState: MeasureState;
    setMeasureState: React.Dispatch<React.SetStateAction<MeasureState>>;
    deleteTooltip?: string;
}

export interface JointInteractionProps {
    joint: any;
    value: number;
    onChange: (val: number) => void;
    onCommit?: (val: number) => void;
    setIsDragging?: (dragging: boolean) => void;
    onInteractionLockChange?: (locked: boolean) => void;
}
