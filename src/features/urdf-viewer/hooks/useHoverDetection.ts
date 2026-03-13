import { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { highlightFaceMaterial } from '../utils/materials';
import { collectGizmoRaycastTargets, isGizmoObject } from '../utils/raycast';
import { collectPickTargets, findPickIntersections, type PickTargetMode } from '../utils/pickTargets';
import { resolveSelectionTarget } from '../utils/selectionTargets';
import type { ToolMode, URDFViewerProps } from '../types';

export interface UseHoverDetectionOptions {
    robot: THREE.Object3D | null;
    robotVersion: number;
    toolMode: ToolMode;
    mode?: 'detail' | 'hardware';
    highlightMode: 'link' | 'collision';
    showCollision: boolean;
    showVisual: boolean;
    selection?: URDFViewerProps['selection'];
    onHover?: (type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision', objectIndex?: number) => void;
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
}: UseHoverDetectionOptions): UseHoverDetectionResult {
    const { scene, camera } = useThree();

    const [highlightedFace, setHighlightedFace] = useState<{ mesh: THREE.Mesh; faceIndex: number } | null>(null);
    const highlightedFaceMeshRef = useRef<THREE.Mesh | null>(null);
    const emittedHoverSelectionRef = useRef<{
        type: 'link' | 'joint' | null;
        id: string | null;
        subType?: 'visual' | 'collision';
        objectIndex?: number;
    }>({ type: null, id: null });
    const gizmoTargetsRef = useRef<THREE.Object3D[]>([]);
    const gizmoTargetsCacheKeyRef = useRef('');
    const gizmoTargetsUpdatedAtRef = useRef(0);
    const pickTargetCachesRef = useRef<Record<PickTargetMode, {
        key: string;
        updatedAt: number;
        targets: THREE.Object3D[];
    }>>({
        all: { key: '', updatedAt: 0, targets: [] },
        visual: { key: '', updatedAt: 0, targets: [] },
        collision: { key: '', updatedAt: 0, targets: [] }
    });

    // Track last camera position to detect camera movement
    const lastCameraPosRef = useRef(new THREE.Vector3());
    // Track last toolMode to detect mode changes
    const lastToolModeRef = useRef(toolMode);
    const useExternalHover = typeof onHover === 'function';

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
        objectIndex?: number
    ) => {
        if (!onHover) return;

        const previous = emittedHoverSelectionRef.current;
        if (
            previous.type === type
            && previous.id === id
            && previous.subType === subType
            && (previous.objectIndex ?? 0) === (objectIndex ?? 0)
        ) {
            return;
        }

        emittedHoverSelectionRef.current = { type, id, subType, objectIndex };
        onHover(type, id, subType, objectIndex);
    };

    const getPickTargets = (targetMode: PickTargetMode) => {
        const cache = pickTargetCachesRef.current[targetMode];
        const nextCacheKey = [
            robotVersion,
            targetMode,
            highlightMode,
            showCollision ? 'col:1' : 'col:0',
            showVisual ? 'vis:1' : 'vis:0',
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
        // Skip in hardware mode to improve performance
        if (mode === 'hardware') return;

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
            pickTargetCachesRef.current.all.targets = [];
            pickTargetCachesRef.current.visual.targets = [];
            pickTargetCachesRef.current.collision.targets = [];
        };
    }, [scene]);

    // Clean up face highlight when leaving face mode
    useEffect(() => {
        if (toolMode !== 'face' && highlightedFaceMeshRef.current) {
            highlightedFaceMeshRef.current.visible = false;
        }
    }, [toolMode]);

    // Continuous hover detection (OPTIMIZED: only run when needed)
    useFrame(() => {
        if (!robot) return;
        if (isDraggingJoint.current) return;
        if (isOrbitDragging?.current) return;

        // Skip hover detection in hardware mode to improve performance
        if (mode === 'hardware') return;

        // OPTIMIZATION: Check if raycast is needed (mouse moved, camera changed, or toolMode changed)
        const cameraMoved = !camera.position.equals(lastCameraPosRef.current);
        const toolModeChanged = toolMode !== lastToolModeRef.current;

        if (cameraMoved) {
            lastCameraPosRef.current.copy(camera.position);
            needsRaycastRef.current = true;
        }
        if (toolModeChanged) {
            lastToolModeRef.current = toolMode;
            needsRaycastRef.current = true;
        }

        // Skip raycast if no update needed
        if (!needsRaycastRef.current) return;

        const isStandardMode = ['view', 'select', 'translate', 'rotate', 'universal'].includes(toolMode || 'select');
        const isCollisionMode = highlightMode === 'collision';
        const selectionSubType: 'visual' | 'collision' = selection?.subType ?? (isCollisionMode ? 'collision' : 'visual');

        const restoreSelectionHighlight = () => {
            if (useExternalHover) return;
            if (selection?.type === 'link' && selection.id) {
                highlightGeometry(selection.id, false, selectionSubType, selection.objectIndex);
            }
        };

        const clearHoverHighlight = () => {
            if (!hoveredLinkRef.current) return;
            if (!useExternalHover) {
                highlightGeometry(
                    hoveredLinkRef.current,
                    true,
                    isCollisionMode ? 'collision' : 'visual',
                    (hoveredLinkRef as any).currentMesh || (hoveredLinkRef as any).currentObjectIndex
                );
            }
            hoveredLinkRef.current = null;
            (hoveredLinkRef as any).currentMesh = null;
            (hoveredLinkRef as any).currentObjectIndex = null;
            (hoveredLinkRef as any).currentSubType = null;
            emitHoverSelection(null, null);
            restoreSelectionHighlight();
        };

        if (isSelectionLockedRef?.current) {
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }
            if (highlightedFace) {
                setHighlightedFace(null);
            }
            emitHoverSelection(null, null);
            return;
        }

        if (justSelectedRef?.current) return;

        needsRaycastRef.current = false;

        // Handle Face Selection Mode
        if (toolMode === 'face') {
            raycasterRef.current.setFromCamera(mouseRef.current, camera);
            const gizmoTargets = getGizmoTargets();
            const pickTargets = getPickTargets(isCollisionMode ? 'collision' : 'visual');
            const nearestSceneHit = gizmoTargets.length > 0
                ? raycasterRef.current.intersectObjects(gizmoTargets, false)[0]
                : undefined;
            if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
                if (highlightedFace) setHighlightedFace(null);
                if (hoveredLinkRef.current) clearHoverHighlight();
                emitHoverSelection(null, null);
                return;
            }

            // PERFORMANCE: Two-phase detection - check bounding box first
            if (pickTargets.length > 0 && !rayIntersectsBoundingBox(raycasterRef.current)) {
                if (highlightedFace) setHighlightedFace(null);
                emitHoverSelection(null, null);
                return;
            }

            const intersects = findPickIntersections(
                robot,
                raycasterRef.current,
                pickTargets,
                isCollisionMode ? 'collision' : 'visual'
            );

            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.faceIndex !== undefined && hit.faceIndex !== null && hit.object instanceof THREE.Mesh) {
                    if (highlightedFace?.faceIndex !== hit.faceIndex || highlightedFace?.mesh !== hit.object) {
                        setHighlightedFace({ mesh: hit.object, faceIndex: hit.faceIndex as number });
                    }
                    if (hoveredLinkRef.current) {
                        clearHoverHighlight();
                    }
                    return;
                }
            }
            if (highlightedFace) setHighlightedFace(null);
            emitHoverSelection(null, null);
            return;
        }

        // Hide face highlight if not in face mode
        if ((toolMode as any) !== 'face' && highlightedFace) {
            setHighlightedFace(null);
        }

        if (!isStandardMode) {
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }
            emitHoverSelection(null, null);
            return;
        }

        // CRITICAL: Skip hover detection if the corresponding display option is not enabled
        if ((isCollisionMode && !showCollision) || (!isCollisionMode && !showVisual)) {
            // Clear any current hover since display is disabled
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }
            emitHoverSelection(null, null);
            return;
        }

        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const gizmoTargets = getGizmoTargets();
        const pickTargets = getPickTargets(isCollisionMode ? 'collision' : 'visual');
        const nearestSceneHit = gizmoTargets.length > 0
            ? raycasterRef.current.intersectObjects(gizmoTargets, false)[0]
            : undefined;
        if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }
            return;
        }

        // PERFORMANCE: Two-phase detection - check bounding box first
        if (pickTargets.length > 0 && !rayIntersectsBoundingBox(raycasterRef.current)) {
            // Ray misses robot entirely - clear hover state if needed
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }
            emitHoverSelection(null, null);
            return;
        }

        const intersections = findPickIntersections(
            robot,
            raycasterRef.current,
            pickTargets,
            isCollisionMode ? 'collision' : 'visual'
        );

        let newHoveredLink: string | null = null;
        let newHoveredMesh: THREE.Object3D | null = null;
        let newHoveredObjectIndex: number | undefined = undefined;

        if (intersections.length > 0) {
            const firstValidHit = intersections[0];

            if (firstValidHit) {
                let linkObj: THREE.Object3D | null = null;

                const parentLinkName = typeof firstValidHit.object.userData?.parentLinkName === 'string'
                    ? firstValidHit.object.userData.parentLinkName
                    : null;
                if (parentLinkName) {
                    newHoveredLink = parentLinkName;
                    linkObj = (robot as any).links?.[parentLinkName] ?? null;
                }

                if (!linkObj) {
                    let current: THREE.Object3D | null = firstValidHit.object;
                    while (current) {
                        if ((current as any).isURDFLink || (current as any).type === 'URDFLink') {
                            newHoveredLink = current.name;
                            linkObj = current;
                            break;
                        }
                        if ((robot as any).links && (robot as any).links[current.name]) {
                            newHoveredLink = current.name;
                            linkObj = current;
                            break;
                        }
                        if (current === robot) break;
                        current = current.parent;
                    }
                }

                if (linkObj && newHoveredLink) {
                    const resolvedTarget = resolveSelectionTarget(firstValidHit.object, linkObj);
                    newHoveredMesh = resolvedTarget.highlightTarget;
                    newHoveredObjectIndex = resolvedTarget.objectIndex;
                } else {
                    newHoveredLink = null;
                }
            }
        }

        if (newHoveredLink !== hoveredLinkRef.current || newHoveredMesh !== (hoveredLinkRef as any).currentMesh) {
            if (hoveredLinkRef.current && hoveredLinkRef.current !== selection?.id) {
                clearHoverHighlight();
            }

            if (!useExternalHover && newHoveredLink && newHoveredLink !== selection?.id) {
                highlightGeometry(newHoveredLink, false, isCollisionMode ? 'collision' : 'visual', newHoveredMesh);
            }

            hoveredLinkRef.current = newHoveredLink;
            (hoveredLinkRef as any).currentMesh = newHoveredMesh;
            (hoveredLinkRef as any).currentObjectIndex = newHoveredObjectIndex ?? null;
            (hoveredLinkRef as any).currentSubType = newHoveredLink ? (isCollisionMode ? 'collision' : 'visual') : null;
            emitHoverSelection(
                newHoveredLink ? 'link' : null,
                newHoveredLink,
                newHoveredLink ? (isCollisionMode ? 'collision' : 'visual') : undefined,
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
