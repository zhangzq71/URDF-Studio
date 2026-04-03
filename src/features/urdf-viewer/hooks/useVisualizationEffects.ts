import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    createJointAxisVisualization
} from '../utils/visualizationFactories';
import { syncRobotGeometryVisibility } from '../utils/robotGeometryVisibilitySync';
import { getRobotSceneNodeIndex } from '../utils/robotSceneNodeIndex';
import { getRobotVisualMeshIndex } from '../utils/robotVisualMeshIndex';
import {
    syncInertiaVisualizationForLinks,
    syncJointHelperInteractionStateForJoints,
    syncJointAxesVisualizationForJoints,
    syncLinkHelperInteractionStateForLinks,
    syncOriginAxesVisualizationForLinks
} from '../utils/visualizationObjectSync';
import { isModelOpacitySyncActive, shouldRunVisualizationSync } from '../utils/visualizationSyncActivity';
import type { UrdfLink } from '@/types';
import type { URDFViewerProps } from '../types';
import type { HighlightedMeshSnapshot } from './useHighlightManager';

export interface UseVisualizationEffectsOptions {
    robot: THREE.Object3D | null;
    robotVersion: number;
    showCollision: boolean;
    showVisual: boolean;
    showCollisionAlwaysOnTop: boolean;
    showInertia: boolean;
    showInertiaOverlay?: boolean;
    showCenterOfMass: boolean;
    showCoMOverlay?: boolean;
    centerOfMassSize: number;
    showOrigins: boolean;
    showOriginsOverlay?: boolean;
    originSize: number;
    showJointAxes: boolean;
    showJointAxesOverlay?: boolean;
    jointAxisSize: number;
    modelOpacity: number;
    robotLinks?: Record<string, UrdfLink>;
    selection?: URDFViewerProps['selection'];
    highlightGeometry: (
        linkName: string | null,
        revert: boolean,
        subType?: 'visual' | 'collision',
        meshToHighlight?: THREE.Object3D | null | number
    ) => void;
    highlightedMeshesRef: React.RefObject<Map<THREE.Mesh, HighlightedMeshSnapshot>>;
}

export interface UseVisualizationEffectsResult {
    syncHoverHighlight: (hoveredSelection?: URDFViewerProps['selection']) => void;
}

interface VisualMaterialState {
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
}

export function useVisualizationEffects({
    robot,
    robotVersion,
    showCollision,
    showVisual,
    showCollisionAlwaysOnTop,
    showInertia,
    showInertiaOverlay = true,
    showCenterOfMass,
    showCoMOverlay = true,
    centerOfMassSize,
    showOrigins,
    showOriginsOverlay = false,
    originSize,
    showJointAxes,
    showJointAxesOverlay = true,
    jointAxisSize,
    modelOpacity,
    robotLinks,
    selection,
    highlightGeometry,
    highlightedMeshesRef
}: UseVisualizationEffectsOptions): UseVisualizationEffectsResult {
    const { invalidate } = useThree();

    // Track current selection/hover for cleanup
    const currentSelectionRef = useRef<{ id: string | null; subType: string | null; objectIndex?: number }>({ id: null, subType: null });
    const currentHoverRef = useRef<{ id: string | null; subType: string | null; objectIndex?: number }>({ id: null, subType: null });
    const latestHoverSelectionRef = useRef<URDFViewerProps['selection']>(undefined);
    const selectionRef = useRef(selection);
    const visualMaterialStateRef = useRef<Map<THREE.Material, VisualMaterialState>>(new Map());
    const pooledLinkBoxRef = useRef(new THREE.Box3());
    const pooledLinkSizeRef = useRef(new THREE.Vector3());
    const helperVisibilityActiveRef = useRef(false);
    const modelOpacityActiveRef = useRef(false);
    const inertiaVisualizationActiveRef = useRef(false);
    const originAxesActiveRef = useRef(false);
    const jointAxesVisualizationActiveRef = useRef(false);

    // Refs for visibility state
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);

    useEffect(() => {
        visualMaterialStateRef.current.clear();
    }, [robot]);

    useEffect(() => {
        helperVisibilityActiveRef.current = false;
        modelOpacityActiveRef.current = false;
        inertiaVisualizationActiveRef.current = false;
        originAxesActiveRef.current = false;
        jointAxesVisualizationActiveRef.current = false;
    }, [robot]);

    const getVisualMaterialState = (material: THREE.Material): VisualMaterialState => {
        const cachedState = visualMaterialStateRef.current.get(material);
        if (cachedState) return cachedState;

        const state: VisualMaterialState = {
            opacity: material.opacity ?? 1,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
        };

        visualMaterialStateRef.current.set(material, state);
        return state;
    };

    const resolveHighlightTarget = useCallback((
        candidate?: URDFViewerProps['selection']
    ): { id: string | null; subType: 'visual' | 'collision' | undefined; objectIndex?: number } => {
        if (!robot || !candidate?.id || !candidate.type) {
            return { id: null, subType: undefined };
        }

        if (candidate.type === 'link') {
            return { id: candidate.id, subType: candidate.subType, objectIndex: candidate.objectIndex };
        }

        const jointObj = robot.getObjectByName(candidate.id);
        if (!jointObj) {
            return { id: null, subType: candidate.subType, objectIndex: candidate.objectIndex };
        }

        const childLink = jointObj.children.find((c: any) => c.isURDFLink);
        if (!childLink) {
            return { id: null, subType: candidate.subType, objectIndex: candidate.objectIndex };
        }

        return { id: childLink.name, subType: candidate.subType, objectIndex: candidate.objectIndex };
    }, [robot]);

    const syncHelperInteractionHighlight = useCallback((hoveredSelection?: URDFViewerProps['selection']) => {
        if (!robot) return;

        const activeSelection = selectionRef.current;
        const hoveredLinkId = hoveredSelection?.type === 'link' && !hoveredSelection.subType
            ? hoveredSelection.id
            : null;
        const hoveredHelperKind = hoveredSelection?.helperKind ?? null;
        const hoveredJointId = hoveredSelection?.type === 'joint' && !hoveredSelection.subType
            ? hoveredSelection.id
            : null;
        const selectedLinkId = activeSelection?.type === 'link' && !activeSelection.subType
            ? activeSelection.id
            : null;
        const selectedHelperKind = activeSelection?.helperKind ?? null;
        const selectedJointId = activeSelection?.type === 'joint' && !activeSelection.subType
            ? activeSelection.id
            : null;
        const { links, joints } = getRobotSceneNodeIndex(robot);

        const linkHelpersMutated = syncLinkHelperInteractionStateForLinks({
            links,
            hoveredLinkId,
            hoveredHelperKind,
            selectedLinkId,
            selectedHelperKind,
        });
        const jointHelpersMutated = syncJointHelperInteractionStateForJoints({
            joints,
            hoveredJointId,
            hoveredHelperKind,
            selectedJointId,
            selectedHelperKind,
        });
        const didMutate = linkHelpersMutated || jointHelpersMutated;

        if (didMutate) {
            invalidate();
        }
    }, [invalidate, robot]);

    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);
    useEffect(() => {
        selectionRef.current = selection;
    }, [selection?.type, selection?.id, selection?.subType, selection?.objectIndex]);

    // Clean up all tracked highlights on unmount
    useEffect(() => {
        return () => {
            highlightedMeshesRef.current.forEach((snapshot, mesh) => {
                mesh.material = snapshot.material;
                mesh.renderOrder = snapshot.renderOrder;
            });
            highlightedMeshesRef.current.clear();
        };
    }, [highlightedMeshesRef]);

    // Sync per-link / per-geometry visibility for visual and collision content.
    useEffect(() => {
        if (!robot) return;

        // Snapshot the currently-highlighted meshes so we can skip their material
        // assignment. Overwriting a highlighted mesh's material with the base
        // collision material causes a one-frame flash (base → highlight → base …)
        // every time robotLinks or robotVersion changes (e.g. dimension +/-).
        const didMutate = syncRobotGeometryVisibility({
            robot,
            robotLinks,
            showCollision,
            showVisual,
            showCollisionAlwaysOnTop,
            highlightedMeshes: highlightedMeshesRef.current,
        });

        if (didMutate) {
            invalidate();
        }
    }, [robot, showCollision, showVisual, showCollisionAlwaysOnTop, robotLinks, robotVersion, invalidate, highlightedMeshesRef]);

    // Update helper visibility without touching all visual materials
    useEffect(() => {
        if (!robot) return;
        const helperVisibilityActive = showOrigins || showJointAxes;
        if (!shouldRunVisualizationSync(helperVisibilityActive, helperVisibilityActiveRef.current)) {
            return;
        }

        const { links, joints } = getRobotSceneNodeIndex(robot);
        let didMutate = false;

        links.forEach((link: any) => {
            const linkAxesHelper = link.children.find((child: any) => child.name === '__link_axes_helper__');
            if (!linkAxesHelper) return;

            if (linkAxesHelper.visible !== showOrigins) {
                linkAxesHelper.visible = showOrigins;
                didMutate = true;
            }

            const scale = originSize || 1.0;
            if (
                linkAxesHelper.scale.x !== scale
                || linkAxesHelper.scale.y !== scale
                || linkAxesHelper.scale.z !== scale
            ) {
                linkAxesHelper.scale.set(scale, scale, scale);
                didMutate = true;
            }
        });

        joints.forEach((joint: any) => {
            let axisHelper = joint.children.find((child: any) => child.name === '__joint_axis_helper__');
            if (!axisHelper && joint.axis && showJointAxes) {
                const axis = joint.axis as THREE.Vector3;
                axisHelper = createJointAxisVisualization(axis, jointAxisSize);
                joint.add(axisHelper);
                didMutate = true;
            }

            if (axisHelper) {
                if (axisHelper.visible !== showJointAxes) {
                    axisHelper.visible = showJointAxes;
                    didMutate = true;
                }

                const scale = jointAxisSize || 1.0;
                if (
                    axisHelper.scale.x !== scale
                    || axisHelper.scale.y !== scale
                    || axisHelper.scale.z !== scale
                ) {
                    axisHelper.scale.set(scale, scale, scale);
                    didMutate = true;
                }
            }

            const debugJointAxes = joint.children.find((child: any) => child.name === '__debug_joint_axes__');
            if (!debugJointAxes) return;

            if (debugJointAxes.visible !== showJointAxes) {
                debugJointAxes.visible = showJointAxes;
                didMutate = true;
            }

            const scale = jointAxisSize || 1.0;
            if (
                debugJointAxes.scale.x !== scale
                || debugJointAxes.scale.y !== scale
                || debugJointAxes.scale.z !== scale
            ) {
                debugJointAxes.scale.set(scale, scale, scale);
                didMutate = true;
            }
        });

        if (didMutate) {
            invalidate();
        }
        helperVisibilityActiveRef.current = helperVisibilityActive;
    }, [robot, showOrigins, originSize, showJointAxes, jointAxisSize, robotVersion, invalidate]);

    // Apply model opacity to visual meshes only
    useEffect(() => {
        if (!robot) return;
        const modelOpacityActive = isModelOpacitySyncActive(modelOpacity);
        if (!shouldRunVisualizationSync(modelOpacityActive, modelOpacityActiveRef.current)) {
            return;
        }

        let didMutate = false;

        getRobotVisualMeshIndex(robot, robotVersion).forEach((child: any) => {
            if (!child.material) return;

            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat: any) => {
                if (mat &&
                    !mat.userData?.isSharedMaterial &&
                    !mat.userData?.isCollisionMaterial &&
                    mat.depthTest !== false) {
                    const baseState = getVisualMaterialState(mat);
                    const nextOpacity = THREE.MathUtils.clamp(baseState.opacity * modelOpacity, 0, 1);
                    const nextTransparent = baseState.transparent || nextOpacity < 1.0;
                    const nextDepthWrite = baseState.depthWrite;

                    if (
                        mat.transparent !== nextTransparent ||
                        mat.opacity !== nextOpacity ||
                        mat.depthWrite !== nextDepthWrite
                    ) {
                        mat.transparent = nextTransparent;
                        mat.opacity = nextOpacity;
                        mat.depthWrite = nextDepthWrite;
                        mat.needsUpdate = true;
                        didMutate = true;
                    }
                }
            });
        });

        if (didMutate) {
            invalidate();
        }
        modelOpacityActiveRef.current = modelOpacityActive;
    }, [robot, modelOpacity, robotVersion, invalidate]);

    // Effect to handle inertia and CoM visualization
    useEffect(() => {
        if (!robot) return;
        const inertiaVisualizationActive = showInertia || showCenterOfMass;
        if (!shouldRunVisualizationSync(inertiaVisualizationActive, inertiaVisualizationActiveRef.current)) {
            return;
        }

        const didMutate = syncInertiaVisualizationForLinks({
            links: getRobotSceneNodeIndex(robot).links,
            robotLinks,
            showInertia,
            showInertiaOverlay,
            showCenterOfMass,
            showCoMOverlay,
            centerOfMassSize,
            pooledLinkBox: pooledLinkBoxRef.current,
            pooledLinkSize: pooledLinkSizeRef.current,
        });

        if (didMutate) {
            invalidate();
        }
        inertiaVisualizationActiveRef.current = inertiaVisualizationActive;
    }, [robot, showInertia, showInertiaOverlay, showCenterOfMass, showCoMOverlay, centerOfMassSize, robotVersion, invalidate, robotLinks]);

    // Effect to handle origin axes visualization for each link
    useEffect(() => {
        if (!robot) return;
        if (!shouldRunVisualizationSync(showOrigins, originAxesActiveRef.current)) {
            return;
        }

        const didMutate = syncOriginAxesVisualizationForLinks({
            links: getRobotSceneNodeIndex(robot).links,
            showOrigins,
            showOriginsOverlay,
            originSize,
        });

        if (didMutate) {
            invalidate();
        }
        originAxesActiveRef.current = showOrigins;
    }, [robot, showOrigins, showOriginsOverlay, originSize, robotVersion, invalidate]);

    // Effect to handle joint axes visualization
    useEffect(() => {
        if (!robot) return;
        if (!shouldRunVisualizationSync(showJointAxes, jointAxesVisualizationActiveRef.current)) {
            return;
        }

        const didMutate = syncJointAxesVisualizationForJoints({
            joints: getRobotSceneNodeIndex(robot).joints,
            showJointAxes,
            showJointAxesOverlay,
            jointAxisSize,
        });

        if (didMutate) {
            invalidate();
        }
        jointAxesVisualizationActiveRef.current = showJointAxes;
    }, [robot, showJointAxes, showJointAxesOverlay, jointAxisSize, robotVersion, invalidate]);

    const syncHoverHighlight = useCallback((hoveredSelection?: URDFViewerProps['selection']) => {
        latestHoverSelectionRef.current = hoveredSelection;

        if (!robot) return;

        let didMutateGeometryHighlight = false;
        syncHelperInteractionHighlight(hoveredSelection);

        const activeSelection = selectionRef.current;
        const {
            id: selectionHighlightId,
            subType: selectionHighlightSubType,
            objectIndex: selectionHighlightObjectIndex
        } = resolveHighlightTarget(activeSelection);

        if (currentHoverRef.current.id) {
            if (
                currentHoverRef.current.id !== selectionHighlightId
                || currentHoverRef.current.subType !== selectionHighlightSubType
                || currentHoverRef.current.objectIndex !== selectionHighlightObjectIndex
            ) {
                highlightGeometry(
                    currentHoverRef.current.id,
                    true,
                    currentHoverRef.current.subType as any,
                    currentHoverRef.current.objectIndex
                );
                didMutateGeometryHighlight = true;
                if (selectionHighlightId) {
                    highlightGeometry(
                        selectionHighlightId,
                        false,
                        selectionHighlightSubType,
                        selectionHighlightObjectIndex
                    );
                    didMutateGeometryHighlight = true;
                }
            }
        }

        const {
            id: hoverTargetId,
            subType: hoverTargetSubType,
            objectIndex: hoverTargetObjectIndex
        } = resolveHighlightTarget(hoveredSelection);

        if (hoverTargetId) {
            const hoverStateChanged =
                currentHoverRef.current.id !== hoverTargetId
                || currentHoverRef.current.subType !== (hoverTargetSubType || null)
                || currentHoverRef.current.objectIndex !== hoverTargetObjectIndex;
            highlightGeometry(hoverTargetId, false, hoverTargetSubType, hoverTargetObjectIndex);
            currentHoverRef.current = {
                id: hoverTargetId,
                subType: hoverTargetSubType || null,
                objectIndex: hoverTargetObjectIndex
            };
            if (hoverStateChanged || didMutateGeometryHighlight) {
                invalidate();
            }
            return;
        }

        const hadHoverHighlight =
            currentHoverRef.current.id !== null
            || currentHoverRef.current.subType !== null
            || currentHoverRef.current.objectIndex !== undefined;
        currentHoverRef.current = { id: null, subType: null };
        if (didMutateGeometryHighlight || hadHoverHighlight) {
            invalidate();
        }
    }, [robot, highlightGeometry, resolveHighlightTarget, syncHelperInteractionHighlight]);

    // Effect to handle selection highlighting
    useEffect(() => {
        if (!robot) return;

        if (currentSelectionRef.current.id) {
            highlightGeometry(currentSelectionRef.current.id, true, currentSelectionRef.current.subType as any, currentSelectionRef.current.objectIndex);
        }

        const { id: targetId, subType: targetSubType, objectIndex: targetObjectIndex } = resolveHighlightTarget(selection);

        if (targetId) {
            highlightGeometry(targetId, false, targetSubType, targetObjectIndex);
            currentSelectionRef.current = { id: targetId, subType: targetSubType || null, objectIndex: targetObjectIndex };
        } else {
            currentSelectionRef.current = { id: null, subType: null };
        }
        syncHoverHighlight(latestHoverSelectionRef.current);
    }, [robot, selection?.type, selection?.id, selection?.subType, selection?.objectIndex, highlightGeometry, robotVersion, showCollision, showVisual, syncHoverHighlight]);

    useEffect(() => {
        if (!robot) return;
        syncHelperInteractionHighlight(latestHoverSelectionRef.current);
    }, [
        robot,
        robotVersion,
        showInertia,
        showInertiaOverlay,
        showCenterOfMass,
        showCoMOverlay,
        centerOfMassSize,
        showOrigins,
        showOriginsOverlay,
        originSize,
        showJointAxes,
        showJointAxesOverlay,
        jointAxisSize,
        selection?.type,
        selection?.id,
        selection?.subType,
        selection?.objectIndex,
        syncHelperInteractionHighlight,
    ]);

    return { syncHoverHighlight };
}
