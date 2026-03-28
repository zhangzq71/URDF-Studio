import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { UrdfLink } from '@/types';
import { getCollisionGeometryByObjectIndex } from '@/core/robot';
import {
    highlightMaterial,
    collisionHighlightMaterial
} from '../utils/materials';
import { _pooledRay, _pooledBox3 } from '../constants';
import { collectPickTargets, type PickTargetMode } from '../utils/pickTargets';
import { resolveEffectiveInteractionSubType } from '../utils/interactionMode';

export interface UseHighlightManagerOptions {
    robot: THREE.Object3D | null;
    robotVersion: number;
    highlightMode: 'link' | 'collision';
    showCollision: boolean;
    showVisual: boolean;
    robotLinks?: Record<string, UrdfLink>;
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
}

export interface UseHighlightManagerResult {
    highlightGeometry: (
        linkName: string | null,
        revert: boolean,
        subType?: 'visual' | 'collision',
        meshToHighlight?: THREE.Object3D | null | number
    ) => void;
    revertAllHighlights: () => void;
    getRobotBoundingBox: (forceRefresh?: boolean) => THREE.Box3 | null;
    rayIntersectsBoundingBox: (raycaster: THREE.Raycaster, forceRefresh?: boolean) => boolean;
    highlightedMeshesRef: React.RefObject<Map<THREE.Mesh, HighlightedMeshSnapshot>>;
    boundingBoxNeedsUpdateRef: React.RefObject<boolean>;
    getTriangleVertices: (
        geometry: THREE.BufferGeometry,
        faceIndex: number,
        outV0: THREE.Vector3,
        outV1: THREE.Vector3,
        outV2: THREE.Vector3
    ) => void;
}

interface HighlightedMaterialState {
    transparent: boolean;
    opacity: number;
    depthTest: boolean;
    depthWrite: boolean;
}

export interface HighlightedMeshSnapshot {
    material: THREE.Material | THREE.Material[];
    renderOrder: number;
    materialStates: HighlightedMaterialState[];
}

export function useHighlightManager({
    robot,
    robotVersion,
    highlightMode,
    showCollision,
    showVisual,
    robotLinks,
    linkMeshMapRef
}: UseHighlightManagerOptions): UseHighlightManagerResult {
    const BOUNDING_BOX_CACHE_MS = 33;
    // PERFORMANCE: Cached robot bounding box for two-phase detection
    const robotBoundingBoxRef = useRef<THREE.Box3 | null>(null);
    const robotBoundingBoxUpdatedAtRef = useRef(0);
    const boundingBoxNeedsUpdateRef = useRef(true);

    // Map to track currently highlighted meshes for O(1) revert instead of traverse
    const highlightedMeshesRef = useRef<Map<THREE.Mesh, HighlightedMeshSnapshot>>(new Map());

    // Refs for visibility state
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);
    const robotLinksRef = useRef(robotLinks);

    // PERFORMANCE: Pre-allocated vectors for triangle vertices (object pooling)

    // Keep refs in sync
    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);
    useEffect(() => { robotLinksRef.current = robotLinks; }, [robotLinks]);

    // PERFORMANCE: Update robot bounding box when robot changes
    useEffect(() => {
        if (robot) {
            boundingBoxNeedsUpdateRef.current = true;
            robotBoundingBoxUpdatedAtRef.current = 0;
        }
    }, [robot, robotVersion]);

    // Visibility mode changes alter which meshes participate in setFromObject().
    // Mark bbox dirty so hover broad-phase remains accurate after toggles.
    useEffect(() => {
        if (robot) {
            boundingBoxNeedsUpdateRef.current = true;
            robotBoundingBoxUpdatedAtRef.current = 0;
        }
    }, [robot, showCollision, showVisual, highlightMode, robotLinks]);

    const getCollisionGeometryByIndex = useCallback((linkData: UrdfLink | undefined, colliderIndex: number) => {
        if (!linkData) return undefined;
        return getCollisionGeometryByObjectIndex(linkData, colliderIndex)?.geometry;
    }, []);

    const getColliderIndex = useCallback((collider: THREE.Object3D): number => {
        const linkObject = collider.parent && (collider.parent as any).isURDFLink
            ? collider.parent
            : null;
        if (!linkObject) return 0;

        const colliders = linkObject.children.filter((child: any) => child.isURDFCollider);
        const colliderIndex = colliders.indexOf(collider);
        return colliderIndex >= 0 ? colliderIndex : 0;
    }, []);

    const getMeshVisibility = useCallback((mesh: THREE.Mesh) => {
        const linkName = typeof mesh.userData?.parentLinkName === 'string'
            ? mesh.userData.parentLinkName
            : undefined;
        const linkData = linkName ? robotLinksRef.current?.[linkName] : undefined;

        if (mesh.userData?.isCollisionMesh || (mesh.parent && (mesh.parent as any).isURDFCollider)) {
            const colliderRoot = mesh.parent && (mesh.parent as any).isURDFCollider
                ? mesh.parent
                : null;
            const colliderIndex = colliderRoot ? getColliderIndex(colliderRoot) : 0;
            const geometry = getCollisionGeometryByIndex(linkData, colliderIndex);
            return showCollisionRef.current && geometry?.visible !== false;
        }

        return showVisualRef.current
            && linkData?.visible !== false
            && linkData?.visual.visible !== false;
    }, [getColliderIndex, getCollisionGeometryByIndex]);

    const getActiveBoundingMode = useCallback((): PickTargetMode | null => {
        const { subType } = resolveEffectiveInteractionSubType(
            highlightMode,
            showVisualRef.current,
            showCollisionRef.current
        );

        return subType;
    }, [highlightMode]);

    // Helper to get/update robot bounding box (cached)
    const getRobotBoundingBox = useCallback((forceRefresh = false) => {
        if (!robot) return null;

        if (!robotBoundingBoxRef.current) {
            robotBoundingBoxRef.current = new THREE.Box3();
        }

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const shouldRefresh =
            forceRefresh
            || boundingBoxNeedsUpdateRef.current
            || robotBoundingBoxUpdatedAtRef.current === 0
            || now - robotBoundingBoxUpdatedAtRef.current >= BOUNDING_BOX_CACHE_MS;

        if (shouldRefresh) {
            const targetMode = getActiveBoundingMode();
            const boundingBox = robotBoundingBoxRef.current;
            const pickTargets = targetMode
                ? collectPickTargets(linkMeshMapRef.current, targetMode)
                : [];

            boundingBox.makeEmpty();

            if (pickTargets.length > 0) {
                if (forceRefresh || boundingBoxNeedsUpdateRef.current || robotBoundingBoxUpdatedAtRef.current === 0) {
                    robot.updateMatrixWorld(true);
                }

                for (let i = 0; i < pickTargets.length; i += 1) {
                    const mesh = pickTargets[i] as THREE.Mesh;
                    const geometry = mesh.geometry;

                    if (!geometry) continue;
                    if (!geometry.boundingBox) {
                        geometry.computeBoundingBox();
                    }
                    if (!geometry.boundingBox) continue;

                    _pooledBox3.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
                    boundingBox.union(_pooledBox3);
                }

                if (!boundingBox.isEmpty()) {
                    boundingBox.expandByScalar(0.05);
                }
            }

            boundingBoxNeedsUpdateRef.current = false;
            robotBoundingBoxUpdatedAtRef.current = now;
        }

        return robotBoundingBoxRef.current.isEmpty() ? null : robotBoundingBoxRef.current;
    }, [robot, getActiveBoundingMode, linkMeshMapRef]);

    // PERFORMANCE: Two-phase detection - check bounding box first
    const rayIntersectsBoundingBox = useCallback((raycaster: THREE.Raycaster, forceRefresh = false): boolean => {
        const bbox = getRobotBoundingBox(forceRefresh);
        if (!bbox) return false;
        // Use pooled ray to avoid allocation
        _pooledRay.copy(raycaster.ray);
        return _pooledRay.intersectsBox(bbox);
    }, [getRobotBoundingBox]);

    // Helper function to get triangle vertices - writes to provided output vectors (no allocation)
    const getTriangleVertices = useCallback((
        geometry: THREE.BufferGeometry,
        faceIndex: number,
        outV0: THREE.Vector3,
        outV1: THREE.Vector3,
        outV2: THREE.Vector3
    ): void => {
        const positionAttribute = geometry.getAttribute('position');
        const indexAttribute = geometry.getIndex();

        let a: number, b: number, c: number;
        if (indexAttribute) {
            a = indexAttribute.getX(faceIndex * 3);
            b = indexAttribute.getX(faceIndex * 3 + 1);
            c = indexAttribute.getX(faceIndex * 3 + 2);
        } else {
            a = faceIndex * 3;
            b = faceIndex * 3 + 1;
            c = faceIndex * 3 + 2;
        }

        // Write directly to output vectors - no allocation
        outV0.set(positionAttribute.getX(a), positionAttribute.getY(a), positionAttribute.getZ(a));
        outV1.set(positionAttribute.getX(b), positionAttribute.getY(b), positionAttribute.getZ(b));
        outV2.set(positionAttribute.getX(c), positionAttribute.getY(c), positionAttribute.getZ(c));
    }, []);

    const captureHighlightedMeshSnapshot = useCallback((mesh: THREE.Mesh): HighlightedMeshSnapshot => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        return {
            material: mesh.material,
            renderOrder: mesh.renderOrder,
            materialStates: materials.map((material) => ({
                transparent: material?.transparent ?? false,
                opacity: material?.opacity ?? 1,
                depthTest: material?.depthTest ?? true,
                depthWrite: material?.depthWrite ?? true,
            })),
        };
    }, []);

    const restoreHighlightedMeshSnapshot = useCallback((
        mesh: THREE.Mesh,
        snapshot: HighlightedMeshSnapshot,
        shouldBeVisible: boolean,
    ) => {
        mesh.material = snapshot.material;
        mesh.renderOrder = snapshot.renderOrder;
        mesh.visible = shouldBeVisible;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material, index) => {
            const materialState = snapshot.materialStates[index];
            if (!material || !materialState) return;

            material.transparent = materialState.transparent;
            material.opacity = materialState.opacity;
            material.depthTest = materialState.depthTest;
            material.depthWrite = materialState.depthWrite;
        });
    }, []);

    // Revert all highlighted meshes using the tracked Map (O(n) where n = highlighted, not total)
    const revertAllHighlights = useCallback(() => {
        highlightedMeshesRef.current.forEach((snapshot, mesh) => {
            const isCollider = (mesh as any).isURDFCollider || mesh.userData.isCollisionMesh;
            const shouldBeVisible = getMeshVisibility(mesh);
            restoreHighlightedMeshSnapshot(mesh, snapshot, shouldBeVisible);

            if (isCollider) {
                if (mesh.parent && (mesh.parent as any).isURDFCollider) mesh.parent.visible = shouldBeVisible;
            }
        });
        highlightedMeshesRef.current.clear();
    }, [getMeshVisibility, restoreHighlightedMeshSnapshot]);

    // PERFORMANCE: Helper function to highlight/unhighlight link geometry
    // Uses pre-built linkMeshMap for O(1) lookup instead of traverse
    const highlightGeometry = useCallback((
        linkName: string | null,
        revert: boolean,
        subType: 'visual' | 'collision' | undefined = undefined,
        meshToHighlight?: THREE.Object3D | null | number
    ) => {
        if (!robot) return;

        try {
            const targetSubType = subType || (highlightMode === 'collision' ? 'collision' : 'visual');

            // CRITICAL: Check if the corresponding display option is enabled
            // In link mode, only highlight if showVisual is true
            // In collision mode, only highlight if showCollision is true
            if (!revert) {
                if (targetSubType === 'visual' && !showVisual) {
                    // Link mode but visual display is off - don't highlight
                    return;
                }
                if (targetSubType === 'collision' && !showCollision) {
                    // Collision mode but collision display is off - don't highlight
                    return;
                }
                if (linkName) {
                    const linkData = robotLinksRef.current?.[linkName];
                    if (targetSubType === 'visual' && (linkData?.visible === false || linkData?.visual.visible === false)) {
                        return;
                    }
                    if (targetSubType === 'collision') {
                        const collisionIndex = typeof meshToHighlight === 'number' ? meshToHighlight : 0;
                        const geometry = getCollisionGeometryByIndex(linkData, collisionIndex);
                        if (geometry?.visible === false) {
                            return;
                        }
                    }
                }
            }

            // OPTIMIZED: Use Map-based revert instead of traversing
            if (revert) {
                revertAllHighlights();
                return;
            }

            // PERFORMANCE: If highlighting a specific object subtree, use direct access.
            if (meshToHighlight && typeof meshToHighlight !== 'number') {
                let highlightedAnyMesh = false;

                (meshToHighlight as THREE.Object3D).traverse((child: any) => {
                    if (!child.isMesh || child.userData?.isGizmo) return;
                    if (!getMeshVisibility(child)) return;

                    highlightedAnyMesh = true;
                    if (!highlightedMeshesRef.current.has(child)) {
                        highlightedMeshesRef.current.set(child, captureHighlightedMeshSnapshot(child));
                    }
                    child.material = targetSubType === 'collision' ? collisionHighlightMaterial : highlightMaterial;
                    child.visible = true;
                    if (child.parent) child.parent.visible = true;

                    if (targetSubType === 'collision' && child.material) {
                        (child.material as any).transparent = true;
                        (child.material as any).opacity = 1.0;
                        (child.material as any).depthTest = false;
                        (child.material as any).depthWrite = false;
                        child.renderOrder = 1000;
                    }
                });

                if (highlightedAnyMesh) {
                    return;
                }
            }

            // PERFORMANCE: Use pre-built linkMeshMap for O(1) lookup
            if (linkName) {
                if (typeof meshToHighlight === 'number') {
                    const linkObj = (robot as any).links?.[linkName];
                    if (linkObj) {
                        const isCollision = targetSubType === 'collision';
                        const siblings = linkObj.children.filter((c: any) => isCollision ? c.isURDFCollider : c.isURDFVisual);
                        const targetGroup = siblings[meshToHighlight];
                        if (targetGroup) {
                            targetGroup.traverse((c: any) => {
                                if (c.isMesh && !c.userData?.isGizmo) {
                                    if (!getMeshVisibility(c)) return;
                                    if (!highlightedMeshesRef.current.has(c)) {
                                        highlightedMeshesRef.current.set(c, captureHighlightedMeshSnapshot(c));
                                    }
                                    c.material = targetSubType === 'collision' ? collisionHighlightMaterial : highlightMaterial;
                                    c.visible = true;
                                    if (c.parent) c.parent.visible = true;

                                    if (targetSubType === 'collision' && c.material) {
                                        (c.material as any).transparent = true;
                                        (c.material as any).opacity = 1.0;
                                        (c.material as any).depthTest = false;
                                        (c.material as any).depthWrite = false;
                                        c.renderOrder = 1000;
                                    }
                                }
                            });
                            return;
                        }
                    }
                }

                const mapKey = `${linkName}:${targetSubType}`;
                const meshes = linkMeshMapRef.current.get(mapKey);

                if (meshes && meshes.length > 0) {

                    for (let i = 0; i < meshes.length; i++) {
                        const mesh = meshes[i];
                        if (mesh.userData?.isGizmo) continue;
                        if (!getMeshVisibility(mesh)) continue;

                        if (!highlightedMeshesRef.current.has(mesh)) {
                            highlightedMeshesRef.current.set(mesh, captureHighlightedMeshSnapshot(mesh));
                        }
                        mesh.material = targetSubType === 'collision' ? collisionHighlightMaterial : highlightMaterial;
                        mesh.visible = true;
                        if (mesh.parent) mesh.parent.visible = true;

                        if (targetSubType === 'collision' && mesh.material) {
                            (mesh.material as any).transparent = true;
                            (mesh.material as any).opacity = 1.0;
                            (mesh.material as any).depthTest = false;
                            (mesh.material as any).depthWrite = false;
                            mesh.renderOrder = 1000;
                        }
                    }
                    return;
                }

                // Fallback to traverse if map lookup fails (shouldn't happen normally)
                const linkObj = (robot as any).links?.[linkName];
                if (linkObj) {
                    const fallbackTraverse = (c: any) => {
                        if (c.isURDFJoint || c.userData?.isGizmo) return;
                        if (c.isMesh) {
                            const isCollider = c.isURDFCollider || c.userData.isCollisionMesh;
                            const shouldHighlight = (targetSubType === 'collision' && isCollider) || (targetSubType === 'visual' && !isCollider);
                            if (shouldHighlight && getMeshVisibility(c)) {
                                if (!highlightedMeshesRef.current.has(c)) {
                                    highlightedMeshesRef.current.set(c, captureHighlightedMeshSnapshot(c));
                                }
                                c.material = targetSubType === 'collision' ? collisionHighlightMaterial : highlightMaterial;
                                c.visible = true;
                                if (c.parent) c.parent.visible = true;

                                if (targetSubType === 'collision' && c.material) {
                                    (c.material as any).transparent = true;
                                    (c.material as any).opacity = 1.0;
                                    (c.material as any).depthTest = false;
                                    (c.material as any).depthWrite = false;
                                    c.renderOrder = 1000;
                                }
                            }
                        }
                        c.children?.forEach(fallbackTraverse);
                    };
                    fallbackTraverse(linkObj);
                }
            }
        } catch (err) {
            console.error("Error in highlightGeometry:", err);
        }
    }, [robot, showCollision, showVisual, highlightMode, revertAllHighlights, linkMeshMapRef, getCollisionGeometryByIndex, getMeshVisibility, captureHighlightedMeshSnapshot]);

    return {
        highlightGeometry,
        revertAllHighlights,
        getRobotBoundingBox,
        rayIntersectsBoundingBox,
        highlightedMeshesRef,
        boundingBoxNeedsUpdateRef,
        getTriangleVertices
    };
}
