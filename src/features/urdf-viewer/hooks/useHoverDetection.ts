import { useRef, useEffect, useState, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { highlightFaceMaterial } from '../utils/materials';
import { collectGizmoRaycastTargets, isGizmoObject } from '../utils/raycast';
import {
    collectPickTargets,
    findPickIntersections,
    isCollisionPickObject,
    type PickTargetMode
} from '../utils/pickTargets';
import { resolveInteractionSelectionHit } from '../utils/selectionTargets';
import {
    resolveHoverInteractionResolution,
    type ResolvedHoverInteractionCandidate,
} from '../utils/hoverInteractionResolution';
import {
    resolveTopLayerInteractionSubType,
    resolveTopLayerInteractionSubTypeFromHits
} from '../utils/interactionMode';
import type {
    ToolMode,
    URDFViewerProps,
    ViewerHelperKind,
    ViewerInteractiveLayer,
    ViewerSceneMode,
} from '../types';

export interface UseHoverDetectionOptions {
    robot: THREE.Object3D | null;
    robotVersion: number;
    toolMode: ToolMode;
    hoverSelectionEnabled?: boolean;
    mode?: ViewerSceneMode;
    showCollision: boolean;
    showVisual: boolean;
    showCollisionAlwaysOnTop: boolean;
    interactionLayerPriority?: ViewerInteractiveLayer[];
    selection?: URDFViewerProps['selection'];
    onHover?: (
        type: 'link' | 'joint' | null,
        id: string | null,
        subType?: 'visual' | 'collision',
        objectIndex?: number,
        helperKind?: ViewerHelperKind,
    ) => void;
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
    mouseRef: React.RefObject<THREE.Vector2>;
    raycasterRef: React.RefObject<THREE.Raycaster>;
    hoveredLinkRef: React.RefObject<string | null>;
    isDraggingJoint: React.RefObject<boolean>;
    needsRaycastRef: React.RefObject<boolean>;
    isOrbitDragging?: React.RefObject<boolean>;
    justSelectedRef?: React.RefObject<boolean>;
    isSelectionLockedRef?: React.RefObject<boolean>;
    rayIntersectsBoundingBox: (raycaster: THREE.Raycaster, forceRefresh?: boolean) => boolean;
    highlightGeometry: (
        linkName: string | null,
        revert: boolean,
        subType?: 'visual' | 'collision',
        meshToHighlight?: THREE.Object3D | null | number
    ) => void;
}

export interface UseHoverDetectionResult {
    highlightedFace: { mesh: THREE.Mesh; faceIndex: number } | null;
    setHighlightedFace: React.Dispatch<React.SetStateAction<{ mesh: THREE.Mesh; faceIndex: number } | null>>;
    highlightedFaceMeshRef: React.RefObject<THREE.Mesh | null>;
}

export function useHoverDetection({
    robot,
    robotVersion,
    toolMode,
    hoverSelectionEnabled = true,
    mode,
    showCollision,
    showVisual,
    showCollisionAlwaysOnTop,
    interactionLayerPriority = [],
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
}: UseHoverDetectionOptions): UseHoverDetectionResult {
    const { scene, camera } = useThree();
    type PickTargetCacheEntry = {
        key: string;
        updatedAt: number;
        targets: THREE.Object3D[];
    };

    const [highlightedFace, setHighlightedFace] = useState<{ mesh: THREE.Mesh; faceIndex: number } | null>(null);
    const highlightedFaceMeshRef = useRef<THREE.Mesh | null>(null);
    const emittedHoverSelectionRef = useRef<{
        type: 'link' | 'joint' | null;
        id: string | null;
        subType?: 'visual' | 'collision';
        objectIndex?: number;
        helperKind?: ViewerHelperKind;
    }>({ type: null, id: null });
    const gizmoTargetsRef = useRef<THREE.Object3D[]>([]);
    const gizmoTargetsCacheKeyRef = useRef('');
    const gizmoTargetsUpdatedAtRef = useRef(0);
    const pickTargetCachesRef = useRef<Record<PickTargetMode, PickTargetCacheEntry>>({
        all: { key: '', updatedAt: 0, targets: [] },
        visual: { key: '', updatedAt: 0, targets: [] },
        collision: { key: '', updatedAt: 0, targets: [] }
    });

    // Track last camera position to detect camera movement
    const lastCameraPosRef = useRef(new THREE.Vector3());
    const lastCameraQuaternionRef = useRef(new THREE.Quaternion());
    // Track last toolMode to detect mode changes
    const lastToolModeRef = useRef(toolMode);
    const hoverSuppressedByDragRef = useRef(false);
    const useExternalHover = typeof onHover === 'function';

    const clearRaycastTargetCaches = useCallback(() => {
        gizmoTargetsRef.current = [];
        gizmoTargetsCacheKeyRef.current = '';
        gizmoTargetsUpdatedAtRef.current = 0;

        pickTargetCachesRef.current.all.key = '';
        pickTargetCachesRef.current.all.updatedAt = 0;
        pickTargetCachesRef.current.all.targets = [];

        pickTargetCachesRef.current.visual.key = '';
        pickTargetCachesRef.current.visual.updatedAt = 0;
        pickTargetCachesRef.current.visual.targets = [];

        pickTargetCachesRef.current.collision.key = '';
        pickTargetCachesRef.current.collision.updatedAt = 0;
        pickTargetCachesRef.current.collision.targets = [];
    }, []);

    const getGizmoTargets = () => {
        const nextCacheKey = `${scene.children.length}:${toolMode}:${selection?.type ?? 'none'}:${selection?.id ?? ''}`;
        const now = performance.now();

        if (
            gizmoTargetsCacheKeyRef.current !== nextCacheKey
            || now - gizmoTargetsUpdatedAtRef.current > 120
        ) {
            gizmoTargetsRef.current = collectGizmoRaycastTargets(scene);
            gizmoTargetsCacheKeyRef.current = nextCacheKey;
            gizmoTargetsUpdatedAtRef.current = now;
        }

        return gizmoTargetsRef.current;
    };

    const emitHoverSelection = (
        type: 'link' | 'joint' | null,
        id: string | null,
        subType?: 'visual' | 'collision',
        objectIndex?: number,
        helperKind?: ViewerHelperKind,
    ) => {
        if (!onHover) return;

        const previous = emittedHoverSelectionRef.current;
        if (
            previous.type === type
            && previous.id === id
            && previous.subType === subType
            && (previous.objectIndex ?? 0) === (objectIndex ?? 0)
            && previous.helperKind === helperKind
        ) {
            return;
        }

        emittedHoverSelectionRef.current = { type, id, subType, objectIndex, helperKind };
        onHover(type, id, subType, objectIndex, helperKind);
    };

    const getPickTargets = (targetMode: PickTargetMode) => {
        const cache = pickTargetCachesRef.current[targetMode];
        const nextCacheKey = [
            robotVersion,
            targetMode,
            showCollision ? 'col:1' : 'col:0',
            showVisual ? 'vis:1' : 'vis:0',
            showCollisionAlwaysOnTop ? 'col-top:1' : 'col-top:0',
            linkMeshMapRef.current.size
        ].join(':');
        const now = performance.now();

        if (
            cache.key !== nextCacheKey
            || now - cache.updatedAt > 120
        ) {
            cache.targets = collectPickTargets(linkMeshMapRef.current, targetMode);
            cache.key = nextCacheKey;
            cache.updatedAt = now;
        }

        return cache.targets;
    };

    const getSelectionHighlightSubType = useCallback(() => {
        const activeInteractionSubType = resolveTopLayerInteractionSubType({
            showVisual,
            showCollision,
            collisionAlwaysOnTop: showCollisionAlwaysOnTop,
        });

        return selection?.subType ?? activeInteractionSubType ?? undefined;
    }, [selection?.subType, showCollision, showCollisionAlwaysOnTop, showVisual]);

    const restoreSelectionHighlight = useCallback(() => {
        if (useExternalHover) return;
        if (selection?.type === 'link' && selection.id) {
            highlightGeometry(selection.id, false, getSelectionHighlightSubType(), selection.objectIndex);
        }
    }, [getSelectionHighlightSubType, highlightGeometry, selection, useExternalHover]);

    const clearHoverHighlight = useCallback(() => {
        if (!hoveredLinkRef.current) return;
        if (!useExternalHover) {
            const hoveredSubType = ((hoveredLinkRef as any).currentSubType as 'visual' | 'collision' | null) ?? undefined;
            highlightGeometry(
                hoveredLinkRef.current,
                true,
                hoveredSubType,
                (hoveredLinkRef as any).currentMesh || (hoveredLinkRef as any).currentObjectIndex
            );
        }
        hoveredLinkRef.current = null;
        (hoveredLinkRef as any).currentMesh = null;
        (hoveredLinkRef as any).currentObjectIndex = null;
        (hoveredLinkRef as any).currentSubType = null;
        emitHoverSelection(null, null);
        restoreSelectionHighlight();
    }, [emitHoverSelection, highlightGeometry, hoveredLinkRef, restoreSelectionHighlight, useExternalHover]);

    const resetHoverState = useCallback(() => {
        if (hoveredLinkRef.current) {
            clearHoverHighlight();
        } else {
            emitHoverSelection(null, null);
        }

    }, [clearHoverHighlight, emitHoverSelection, hoveredLinkRef]);

    const clearTransientHoverState = useCallback(() => {
        resetHoverState();
        setHighlightedFace((current) => (current ? null : current));
    }, [resetHoverState]);

    useEffect(() => {
        emittedHoverSelectionRef.current = { type: null, id: null };
        clearTransientHoverState();
        clearRaycastTargetCaches();
        needsRaycastRef.current = true;
    }, [clearRaycastTargetCaches, clearTransientHoverState, needsRaycastRef, robot, robotVersion]);

    useEffect(() => {
        clearTransientHoverState();
        clearRaycastTargetCaches();
        needsRaycastRef.current = true;
    }, [
        clearRaycastTargetCaches,
        clearTransientHoverState,
        interactionLayerPriority,
        needsRaycastRef,
        showCollision,
        showCollisionAlwaysOnTop,
        showVisual,
    ]);

    // Update face highlight mesh
    useEffect(() => {
        if (!highlightedFace) {
            if (highlightedFaceMeshRef.current) {
                highlightedFaceMeshRef.current.visible = false;
            }
            return;
        }

        const { mesh, faceIndex } = highlightedFace;
        const geometry = mesh.geometry;

        if (!geometry) return;

        if (!highlightedFaceMeshRef.current) {
            highlightedFaceMeshRef.current = new THREE.Mesh(new THREE.BufferGeometry(), highlightFaceMaterial);
            highlightedFaceMeshRef.current.renderOrder = 2000;
            scene.add(highlightedFaceMeshRef.current);
        }

        const highlightMesh = highlightedFaceMeshRef.current;
        highlightMesh.visible = true;

        const positionAttribute = geometry.getAttribute('position');
        const indexAttribute = geometry.getIndex();

        const facesToHighlight = [faceIndex];
        const positions: number[] = [];

        for (const fi of facesToHighlight) {
            let a: number, b: number, c: number;
            if (indexAttribute) {
                a = indexAttribute.getX(fi * 3);
                b = indexAttribute.getX(fi * 3 + 1);
                c = indexAttribute.getX(fi * 3 + 2);
            } else {
                a = fi * 3;
                b = fi * 3 + 1;
                c = fi * 3 + 2;
            }

            positions.push(
                positionAttribute.getX(a), positionAttribute.getY(a), positionAttribute.getZ(a),
                positionAttribute.getX(b), positionAttribute.getY(b), positionAttribute.getZ(b),
                positionAttribute.getX(c), positionAttribute.getY(c), positionAttribute.getZ(c)
            );
        }

        const highlightGeo = highlightMesh.geometry;
        const existingPosition = highlightGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (existingPosition && existingPosition.itemSize === 3 && existingPosition.count * 3 === positions.length) {
            existingPosition.copyArray(positions);
            existingPosition.needsUpdate = true;
        } else {
            // Release previous GPU buffer when replacing the attribute.
            const disposable = existingPosition as THREE.BufferAttribute & { dispose?: () => void };
            disposable?.dispose?.();
            highlightGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        }
        highlightGeo.computeVertexNormals();
    }, [highlightedFace, scene]);

    // Sync face highlight transform
    useFrame(() => {
        if (highlightedFace && highlightedFaceMeshRef.current) {
            const mesh = highlightedFace.mesh;
            const highlight = highlightedFaceMeshRef.current;
            mesh.updateMatrixWorld();
            highlight.matrix.copy(mesh.matrixWorld);
            highlight.matrixAutoUpdate = false;
        }
    });

    // Clean up face highlight mesh on unmount
    useEffect(() => {
        return () => {
            emitHoverSelection(null, null);
            if (highlightedFaceMeshRef.current) {
                scene.remove(highlightedFaceMeshRef.current);
                highlightedFaceMeshRef.current.geometry.dispose();
                highlightedFaceMeshRef.current = null;
            }
            clearRaycastTargetCaches();
        };
    }, [clearRaycastTargetCaches, emitHoverSelection, scene]);

    // Clean up face highlight when leaving face mode
    useEffect(() => {
        if (toolMode !== 'face' && highlightedFaceMeshRef.current) {
            highlightedFaceMeshRef.current.visible = false;
        }
    }, [toolMode]);

    // Continuous hover detection (OPTIMIZED: only run when needed)
    useFrame(() => {
        if (!robot) return;

        const hoverSuppressedByDrag =
            isDraggingJoint.current
            || Boolean(isOrbitDragging?.current);
        if (hoverSuppressedByDrag) {
            if (!hoverSuppressedByDragRef.current) {
                clearTransientHoverState();
                needsRaycastRef.current = false;
                hoverSuppressedByDragRef.current = true;
            }
            return;
        }

        hoverSuppressedByDragRef.current = false;

        if (!hoverSelectionEnabled) {
            clearTransientHoverState();
            needsRaycastRef.current = false;
            return;
        }

        // OPTIMIZATION: Check if raycast is needed (mouse moved, camera changed, or toolMode changed)
        const cameraMoved = !camera.position.equals(lastCameraPosRef.current);
        const cameraRotated = !camera.quaternion.equals(lastCameraQuaternionRef.current);
        const toolModeChanged = toolMode !== lastToolModeRef.current;

        if (cameraMoved || cameraRotated) {
            lastCameraPosRef.current.copy(camera.position);
            lastCameraQuaternionRef.current.copy(camera.quaternion);
            needsRaycastRef.current = true;
        }
        if (toolModeChanged) {
            lastToolModeRef.current = toolMode;
            needsRaycastRef.current = true;
        }

        // Skip raycast if no update needed
        if (!needsRaycastRef.current) return;

        const isStandardMode = ['view', 'select', 'translate', 'rotate', 'universal', 'measure'].includes(toolMode || 'select');
        const fallbackInteractionSubType = resolveTopLayerInteractionSubType({
            showVisual,
            showCollision,
            collisionAlwaysOnTop: showCollisionAlwaysOnTop,
        });

        if (isSelectionLockedRef?.current) {
            resetHoverState();
            if (highlightedFace) {
                setHighlightedFace(null);
            }
            return;
        }

        if (justSelectedRef?.current) return;

        needsRaycastRef.current = false;

        // Handle Face Selection Mode
        if (toolMode === 'face') {
            if (!fallbackInteractionSubType) {
                if (highlightedFace) setHighlightedFace(null);
                resetHoverState();
                return;
            }

            raycasterRef.current.setFromCamera(mouseRef.current, camera);
            const gizmoTargets = getGizmoTargets();
            const pickTargets = getPickTargets('all');
            const nearestSceneHit = gizmoTargets.length > 0
                ? raycasterRef.current.intersectObjects(gizmoTargets, false)[0]
                : undefined;
            if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
                if (highlightedFace) setHighlightedFace(null);
                resetHoverState();
                return;
            }

            // PERFORMANCE: Two-phase detection - check bounding box first
            if (pickTargets.length > 0 && !rayIntersectsBoundingBox(raycasterRef.current)) {
                if (highlightedFace) setHighlightedFace(null);
                resetHoverState();
                return;
            }

            const intersects = findPickIntersections(
                robot,
                raycasterRef.current,
                pickTargets,
                'all',
                false,
                interactionLayerPriority,
            );
            const activeInteractionSubType = resolveTopLayerInteractionSubTypeFromHits({
                showVisual,
                showCollision,
                collisionAlwaysOnTop: showCollisionAlwaysOnTop,
                hits: intersects.map((hit) => ({
                    isCollision: isCollisionPickObject(hit.object),
                })),
            });
            if (!activeInteractionSubType) {
                if (highlightedFace) setHighlightedFace(null);
                resetHoverState();
                return;
            }
            const isCollisionInteraction = activeInteractionSubType === 'collision';

            const hit = intersects.find((entry) => (
                isCollisionPickObject(entry.object) === isCollisionInteraction
            ));
            if (hit && hit.faceIndex !== undefined && hit.faceIndex !== null && hit.object instanceof THREE.Mesh) {
                if (highlightedFace?.faceIndex !== hit.faceIndex || highlightedFace?.mesh !== hit.object) {
                    setHighlightedFace({ mesh: hit.object, faceIndex: hit.faceIndex as number });
                }
                if (hoveredLinkRef.current) {
                    clearHoverHighlight();
                }
                return;
            }
            if (highlightedFace) setHighlightedFace(null);
            resetHoverState();
            return;
        }

        // Hide face highlight if not in face mode
        if ((toolMode as any) !== 'face' && highlightedFace) {
            setHighlightedFace(null);
        }

        if (!isStandardMode) {
            resetHoverState();
            return;
        }

        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const gizmoTargets = getGizmoTargets();
        const pickTargets = getPickTargets('all');
        const nearestSceneHit = gizmoTargets.length > 0
            ? raycasterRef.current.intersectObjects(gizmoTargets, false)[0]
            : undefined;
        if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
            resetHoverState();
            return;
        }

        // PERFORMANCE: Two-phase detection - check bounding box first
        if (pickTargets.length > 0 && !rayIntersectsBoundingBox(raycasterRef.current)) {
            // Ray misses robot entirely - clear hover state if needed
            resetHoverState();
            return;
        }

        const intersections = findPickIntersections(
            robot,
            raycasterRef.current,
            pickTargets,
            'all',
            false,
            interactionLayerPriority,
        );
        const resolvedCandidates = (() => {
            const candidates: ResolvedHoverInteractionCandidate[] = [];
            for (const intersection of intersections) {
                const resolved = resolveInteractionSelectionHit(robot, intersection.object);
                if (resolved) {
                    candidates.push({
                        ...resolved,
                        distance: intersection.distance,
                    });
                }
            }

            return candidates;
        })();
        const {
            primaryInteraction: resolvedInteraction,
        } = resolveHoverInteractionResolution(resolvedCandidates);

        if (resolvedInteraction?.targetKind === 'helper') {
            if (hoveredLinkRef.current) {
                clearHoverHighlight();
            }

            hoveredLinkRef.current = null;
            (hoveredLinkRef as any).currentMesh = null;
            (hoveredLinkRef as any).currentObjectIndex = null;
            (hoveredLinkRef as any).currentSubType = null;
            emitHoverSelection(
                resolvedInteraction.type,
                resolvedInteraction.id,
                undefined,
                undefined,
                resolvedInteraction.helperKind,
            );
            return;
        }

        const activeInteractionSubType = resolvedInteraction?.subType ?? fallbackInteractionSubType;
        if (!activeInteractionSubType) {
            resetHoverState();
            return;
        }

        if (!resolvedInteraction) {
            resetHoverState();
            return;
        }

        const newHoveredLink = resolvedInteraction.id;
        const newHoveredMesh = resolvedInteraction.highlightTarget ?? null;
        const newHoveredObjectIndex = resolvedInteraction.objectIndex;

        const previousHoveredMesh = (hoveredLinkRef as any).currentMesh ?? null;
        const previousHoveredObjectIndex = (hoveredLinkRef as any).currentObjectIndex ?? null;
        const previousHoveredSubType = (hoveredLinkRef as any).currentSubType ?? null;
        const nextHoveredSubType = newHoveredLink ? activeInteractionSubType : null;

        if (
            newHoveredLink !== hoveredLinkRef.current
            || newHoveredMesh !== previousHoveredMesh
            || (newHoveredObjectIndex ?? null) !== previousHoveredObjectIndex
            || nextHoveredSubType !== previousHoveredSubType
        ) {
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }

            if (!useExternalHover && newHoveredLink && newHoveredLink !== selection?.id) {
                highlightGeometry(newHoveredLink, false, activeInteractionSubType, newHoveredMesh);
            }

            hoveredLinkRef.current = newHoveredLink;
            (hoveredLinkRef as any).currentMesh = newHoveredMesh;
            (hoveredLinkRef as any).currentObjectIndex = newHoveredObjectIndex ?? null;
            (hoveredLinkRef as any).currentSubType = nextHoveredSubType;
            emitHoverSelection(
                newHoveredLink ? 'link' : null,
                newHoveredLink,
                newHoveredLink ? activeInteractionSubType : undefined,
                newHoveredObjectIndex
            );
        }
    });

    return {
        highlightedFace,
        setHighlightedFace,
        highlightedFaceMeshRef
    };
}
