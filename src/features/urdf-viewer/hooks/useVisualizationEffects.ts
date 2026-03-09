import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MathUtils as SharedMathUtils } from '@/shared/utils';
import { getCollisionGeometryByObjectIndex } from '@/core/robot';
import { collisionBaseMaterial, emptyRaycast } from '../utils/materials';
import {
    createJointAxisVisualization,
    createOriginAxes,
    createJointAxisViz,
    createCoMVisual,
    createInertiaBox
} from '../utils/visualizationFactories';
import type { UrdfLink } from '@/types';
import type { ToolMode, URDFViewerProps } from '../types';
import type { HighlightedMeshSnapshot } from './useHighlightManager';

export interface UseVisualizationEffectsOptions {
    robot: THREE.Object3D | null;
    robotVersion: number;
    showCollision: boolean;
    showVisual: boolean;
    highlightMode: 'link' | 'collision';
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
    toolMode: ToolMode;
    selection?: URDFViewerProps['selection'];
    hoveredSelection?: URDFViewerProps['selection'];
    highlightGeometry: (
        linkName: string | null,
        revert: boolean,
        subType?: 'visual' | 'collision',
        meshToHighlight?: THREE.Object3D | null | number
    ) => void;
    highlightedMeshesRef: React.MutableRefObject<Map<THREE.Mesh, HighlightedMeshSnapshot>>;
}

function resolveLinkNameFromObject(object: THREE.Object3D | null): string | null {
    if (!object) return null;
    if (typeof object.userData?.parentLinkName === 'string' && object.userData.parentLinkName) {
        return object.userData.parentLinkName;
    }

    let current: THREE.Object3D | null = object;
    while (current) {
        if ((current as any).isURDFLink && current.name) {
            return current.name;
        }
        current = current.parent;
    }

    return null;
}

function getCollisionGeometryByIndex(linkData: UrdfLink | undefined, colliderIndex: number) {
    if (!linkData) return undefined;
    return getCollisionGeometryByObjectIndex(linkData, colliderIndex)?.geometry;
}

function isVisualGeometryVisible(linkData: UrdfLink | undefined, showVisual: boolean): boolean {
    return showVisual && linkData?.visible !== false && linkData?.visual.visible !== false;
}

function isCollisionGeometryVisible(
    linkData: UrdfLink | undefined,
    colliderIndex: number,
    showCollision: boolean
): boolean {
    const geometry = getCollisionGeometryByIndex(linkData, colliderIndex);
    return showCollision && geometry?.visible !== false;
}

function getColliderIndex(collider: THREE.Object3D): number {
    const linkObject = collider.parent && (collider.parent as any).isURDFLink
        ? collider.parent
        : null;
    if (!linkObject) return 0;

    const colliders = linkObject.children.filter((child: any) => child.isURDFCollider);
    const colliderIndex = colliders.indexOf(collider);
    return colliderIndex >= 0 ? colliderIndex : 0;
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
    highlightMode,
    showInertia,
    showInertiaOverlay = true,
    showCenterOfMass,
    showCoMOverlay = true,
    centerOfMassSize,
    showOrigins,
    showOriginsOverlay = true,
    originSize,
    showJointAxes,
    showJointAxesOverlay = true,
    jointAxisSize,
    modelOpacity,
    robotLinks,
    toolMode,
    selection,
    hoveredSelection,
    highlightGeometry,
    highlightedMeshesRef
}: UseVisualizationEffectsOptions): void {
    const { invalidate, scene } = useThree();

    // Track current selection/hover for cleanup
    const currentSelectionRef = useRef<{ id: string | null; subType: string | null; objectIndex?: number }>({ id: null, subType: null });
    const currentHoverRef = useRef<{ id: string | null; subType: string | null; objectIndex?: number }>({ id: null, subType: null });
    const visualMaterialStateRef = useRef<Map<THREE.Material, VisualMaterialState>>(new Map());

    // Refs for visibility state
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);

    useEffect(() => {
        visualMaterialStateRef.current.clear();
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

    const resolveHighlightTarget = (
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
    };

    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);

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

        robot.traverse((child: any) => {
            const linkName = resolveLinkNameFromObject(child);
            const linkData = linkName ? robotLinks?.[linkName] : undefined;

            if (child.isURDFCollider) {
                const colliderIndex = getColliderIndex(child);
                const isVisible = isCollisionGeometryVisible(linkData, colliderIndex, showCollision);

                child.visible = isVisible;
                child.traverse((inner: any) => {
                    if (!inner.isMesh) return;

                    inner.userData.isCollisionMesh = true;
                    inner.raycast = (highlightMode === 'collision' && isVisible)
                        ? THREE.Mesh.prototype.raycast
                        : emptyRaycast;

                    if (isVisible) {
                        inner.visible = true;
                        if (inner.__origMaterial) {
                            inner.__origMaterial = collisionBaseMaterial;
                        }
                        inner.material = collisionBaseMaterial;
                        inner.renderOrder = 999;
                    } else {
                        inner.visible = false;
                    }
                });
                return;
            }

            if (child.userData?.isVisualGroup) {
                child.visible = isVisualGeometryVisible(linkData, showVisual);
                return;
            }

            if (
                child.parent
                && child.parent.isURDFLink
                && !child.isURDFJoint
                && !child.isURDFCollider
                && child.userData?.isGizmo !== true
            ) {
                child.visible = isVisualGeometryVisible(linkData, showVisual);
            }

            if (child.isMesh && child.userData?.isVisual) {
                child.visible = isVisualGeometryVisible(linkData, showVisual);
            }

            if (child.isMesh && !child.userData?.isCollision && !child.userData?.isCollisionMesh) {
                let parent = child.parent;
                let isUrdfVisual = false;
                while (parent && parent !== robot) {
                    if ((parent as any).isURDFVisual) {
                        isUrdfVisual = true;
                        break;
                    }
                    if ((parent as any).isURDFCollider) {
                        break;
                    }
                    parent = parent.parent;
                }

                if (isUrdfVisual) {
                    child.visible = isVisualGeometryVisible(linkData, showVisual);
                }
            }
        });

        invalidate();
    }, [robot, showCollision, showVisual, robotLinks, robotVersion, highlightMode, invalidate]);

    // Update link axes, joint axes visibility, and model opacity
    useEffect(() => {
        if (!robot) return;

        robot.traverse((child: any) => {
            // Handle link coordinate axes (RGB = XYZ)
            if (child.name === '__link_axes_helper__') {
                child.visible = showOrigins;
                const scale = originSize || 1.0;
                child.scale.set(scale, scale, scale);
            }

            // Handle joint axis helpers
            if (child.name === '__joint_axis_helper__') {
                child.visible = showJointAxes;
                const scale = jointAxisSize || 1.0;
                child.scale.set(scale, scale, scale);
            }

            // Handle debug AxesHelper for joint pivot verification
            if (child.name === '__debug_joint_axes__') {
                child.visible = showJointAxes;
                const scale = jointAxisSize || 1.0;
                child.scale.set(scale, scale, scale);
            }

            // Handle URDF joint axis visualization
            if (child.isURDFJoint && child.axis) {
                let axisHelper = child.children.find((c: any) => c.name === '__joint_axis_helper__');
                if (!axisHelper && showJointAxes) {
                    const axis = child.axis as THREE.Vector3;
                    axisHelper = createJointAxisVisualization(axis, jointAxisSize);
                    child.add(axisHelper);
                }
                if (axisHelper) {
                    axisHelper.visible = showJointAxes;
                    const scale = jointAxisSize || 1.0;
                    axisHelper.scale.set(scale, scale, scale);
                }
            }

            // Apply model opacity to VISUAL meshes only
            if (child.isMesh) {
                if (child.userData?.isGizmo) return;

                const isCollision = child.isURDFCollider ||
                    child.userData?.isCollisionMesh ||
                    child.userData?.isCollision;
                if (isCollision) return;

                let parent = child.parent;
                while (parent && parent !== robot) {
                    if (parent.userData?.isGizmo ||
                        parent.isURDFCollider ||
                        parent.userData?.isCollisionMesh ||
                        parent.name === '__inertia_visual__' ||
                        parent.name === '__com_visual__' ||
                        parent.name === '__inertia_box__' ||
                        parent.name === '__origin_axes__' ||
                        parent.name === '__joint_axis_helper__') {
                        return;
                    }
                    parent = parent.parent;
                }

                if (child.material) {
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
                            }
                        }
                    });
                }
            }
        });

        invalidate();
    }, [robot, showOrigins, originSize, showJointAxes, jointAxisSize, modelOpacity, robotVersion, invalidate]);

    // Effect to handle inertia and CoM visualization
    useEffect(() => {
        if (!robot) return;

        robot.traverse((child: any) => {
            if (!child.isURDFLink) return;

            const linkName = child.name;
            const linkData = robotLinks?.[linkName];
            const inertialData = linkData?.inertial;

            if (inertialData && inertialData.mass > 0) {
                let vizGroup = child.children.find((c: any) => c.name === '__inertia_visual__');

                if (!vizGroup) {
                    vizGroup = new THREE.Group();
                    vizGroup.name = '__inertia_visual__';
                    vizGroup.userData = { isGizmo: true };
                    child.add(vizGroup);
                }

                // CoM Indicator
                let comVisual = vizGroup.children.find((c: any) => c.name === '__com_visual__');
                if (!comVisual) {
                    comVisual = createCoMVisual();
                    vizGroup.add(comVisual);
                }

                // Apply size scale based on centerOfMassSize
                const sizeScale = centerOfMassSize / 0.01;
                comVisual.scale.set(sizeScale, sizeScale, sizeScale);

                comVisual.visible = showCenterOfMass;
                if (showCenterOfMass) {
                    comVisual.traverse((c: any) => {
                        if (c.material) {
                            c.material.opacity = 0.95;
                            c.material.transparent = true;
                            // When showCoMOverlay is true, disable depth test to show on top
                            c.material.depthTest = !showCoMOverlay;
                            c.material.depthWrite = !showCoMOverlay;
                        }
                        if (c.isMesh) {
                            c.renderOrder = showCoMOverlay ? 10001 : 0;
                        }
                    });
                }

                // Inertia Box
                let inertiaBox = vizGroup.children.find((c: any) => c.name === '__inertia_box__');

                if (!inertiaBox) {
                    let maxLinkSize: number | undefined;
                    try {
                        const linkBox = new THREE.Box3().setFromObject(child);
                        const linkSize = linkBox.getSize(new THREE.Vector3());
                        maxLinkSize = Math.max(linkSize.x, linkSize.y, linkSize.z);
                        if (!isFinite(maxLinkSize) || maxLinkSize <= 0) {
                            maxLinkSize = undefined;
                        }
                    } catch (e) {
                        maxLinkSize = undefined;
                    }

                    const boxData = SharedMathUtils.computeInertiaBox(inertialData, maxLinkSize);

                    if (boxData) {
                        const { width, height, depth, rotation } = boxData;
                        inertiaBox = createInertiaBox(width, height, depth, rotation);
                        vizGroup.add(inertiaBox);
                    }
                }

                if (inertiaBox) {
                    inertiaBox.visible = showInertia;
                    if (showInertia) {
                        inertiaBox.traverse((c: any) => {
                            if (c.material) {
                                const baseMat = c.material as THREE.Material & { opacity?: number };
                                if (c.type === 'Mesh') {
                                    baseMat.opacity = 0.25;
                                } else if (c.type === 'LineSegments') {
                                    baseMat.opacity = 0.6;
                                }

                                // Apply overlay settings
                                baseMat.transparent = true;
                                baseMat.depthTest = !showInertiaOverlay;
                                baseMat.depthWrite = !showInertiaOverlay;
                            }
                            if (c.isMesh || c.type === 'LineSegments') {
                                c.renderOrder = showInertiaOverlay ? 10001 : 0;
                            }
                        });
                    }
                }

                if (inertialData.origin) {
                    const origin = inertialData.origin;
                    const xyz = origin.xyz || { x: 0, y: 0, z: 0 };
                    const rpy = origin.rpy || { r: 0, p: 0, y: 0 };
                    vizGroup.position.set(xyz.x, xyz.y, xyz.z);
                    vizGroup.rotation.set(rpy.r, rpy.p, rpy.y);
                }

                vizGroup.visible = showInertia || showCenterOfMass;
            }
        });

        invalidate();
    }, [robot, showInertia, showInertiaOverlay, showCenterOfMass, showCoMOverlay, centerOfMassSize, robotVersion, invalidate, robotLinks]);

    // Effect to handle origin axes visualization for each link
    useEffect(() => {
        if (!robot) return;

        robot.traverse((child: any) => {
            if (child.isURDFLink) {
                let originAxes = child.children.find((c: any) => c.name === '__origin_axes__');

                if (!originAxes && showOrigins) {
                    originAxes = createOriginAxes(originSize);
                    child.add(originAxes);
                }

                if (originAxes) {
                    originAxes.visible = showOrigins;
                    if (showOrigins) {
                        const currentSize = originSize;
                        originAxes.scale.setScalar(1);

                        // Checks and recreation if size changed
                        const existingAxisMesh = originAxes.children[0];
                        if (existingAxisMesh && existingAxisMesh.geometry) {
                            const params = (existingAxisMesh.geometry as THREE.CylinderGeometry).parameters;
                            if (params && Math.abs(params.height - currentSize) > 0.001) {
                                while (originAxes.children.length > 0) {
                                    const c = originAxes.children[0];
                                    originAxes.remove(c);
                                    if ((c as any).geometry) (c as any).geometry.dispose();
                                    if ((c as any).material) (c as any).material.dispose();
                                }

                                const newAxes = createOriginAxes(currentSize);
                                // Re-parent generated children directly to avoid clone allocations/leaks.
                                while (newAxes.children.length > 0) {
                                    originAxes.add(newAxes.children[0]);
                                }
                            }
                        }

                        // Update overlay state via traversal (Applied AFTER potential recreation)
                        originAxes.traverse((c: any) => {
                            if (c.material) {
                                // If overlay is true, disable depth test to show on top
                                c.material.depthTest = !showOriginsOverlay;
                                c.material.depthWrite = !showOriginsOverlay;
                                // FORCE transparent = true when overlay is on.
                                // This ensures these meshes are rendered in the transparent queue (after opaque objects).
                                // Combined with high renderOrder, this guarantees they appear on top of transparent robot parts.
                                c.material.transparent = showOriginsOverlay ? true : false;
                                c.material.needsUpdate = true;
                            }
                            if (c.isMesh) {
                                c.renderOrder = showOriginsOverlay ? 10001 : 0;
                            }
                        });
                    }
                }
            }
        });

        invalidate();
    }, [robot, showOrigins, showOriginsOverlay, originSize, robotVersion, invalidate]);

    // Effect to handle joint axes visualization
    useEffect(() => {
        if (!robot) return;

        robot.traverse((child: any) => {
            if (child.isURDFJoint && child.jointType !== 'fixed') {
                let jointAxisViz = child.children.find((c: any) => c.name === '__joint_axis__');

                if (!jointAxisViz && showJointAxes) {
                    const axis = child.axis || new THREE.Vector3(0, 0, 1);
                    jointAxisViz = createJointAxisViz(child.jointType, axis, jointAxisSize);
                    child.add(jointAxisViz);
                }

                if (jointAxisViz) {
                    jointAxisViz.visible = showJointAxes;

                    if (showJointAxes) {
                        if (!jointAxisViz.userData.originalScale) {
                            jointAxisViz.userData.originalScale = jointAxisSize;
                        }

                        const currentScale = jointAxisSize;
                        const originalScale = jointAxisViz.userData.originalScale;

                        if (Math.abs(currentScale - originalScale) > 0.01) {
                            child.remove(jointAxisViz);
                            jointAxisViz.traverse((obj: any) => {
                                if (obj.geometry) obj.geometry.dispose();
                                if (obj.material) obj.material.dispose();
                            });

                            const axis = child.axis || new THREE.Vector3(0, 0, 1);
                            const newJointAxisViz = createJointAxisViz(child.jointType, axis, currentScale);
                            child.add(newJointAxisViz);
                            // Important: Update the reference so the traversal below applies to the NEW object
                            jointAxisViz = newJointAxisViz;
                        }

                        // Update overlay state via traversal (Applied AFTER potential recreation)
                        jointAxisViz.traverse((c: any) => {
                            if (c.material) {
                                // If overlay is true, disable depth test to show on top
                                c.material.depthTest = !showJointAxesOverlay;
                                c.material.depthWrite = !showJointAxesOverlay;
                                // FORCE transparent = true when overlay is on.
                                // This ensures these meshes are rendered in the transparent queue (after opaque objects).
                                // Combined with high renderOrder, this guarantees they appear on top of transparent robot parts.
                                c.material.transparent = showJointAxesOverlay ? true : false;
                                if (showJointAxesOverlay && c.material.opacity === undefined) {
                                     c.material.opacity = 1.0;
                                }
                                c.material.needsUpdate = true;
                            }
                            if (c.isMesh) {
                                c.renderOrder = showJointAxesOverlay ? 10001 : 0;
                            }
                        });
                    }
                }
            }
        });

        invalidate();
    }, [robot, showJointAxes, showJointAxesOverlay, jointAxisSize, robotVersion, invalidate]);

    // Effect to handle selection highlighting
    useEffect(() => {
        if (!robot) return;

        if (toolMode === 'measure') {
            if (currentSelectionRef.current.id) {
                highlightGeometry(currentSelectionRef.current.id, true, currentSelectionRef.current.subType as any, currentSelectionRef.current.objectIndex);
            }
            currentSelectionRef.current = { id: null, subType: null };
            return;
        }

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
    }, [robot, selection?.type, selection?.id, selection?.subType, selection?.objectIndex, highlightGeometry, robotVersion, highlightMode, showCollision, showVisual, toolMode]);

    // Effect to handle hover highlighting
    useEffect(() => {
        if (!robot) return;

        if (toolMode === 'measure') {
            if (currentHoverRef.current.id) {
                highlightGeometry(currentHoverRef.current.id, true, currentHoverRef.current.subType as any, currentHoverRef.current.objectIndex);
            }
            currentHoverRef.current = { id: null, subType: null };
            return;
        }

        const { id: selectionHighlightId, subType: selectionHighlightSubType, objectIndex: selectionHighlightObjectIndex } = resolveHighlightTarget(selection);

        if (currentHoverRef.current.id) {
            if (currentHoverRef.current.id !== selectionHighlightId || currentHoverRef.current.subType !== selectionHighlightSubType || currentHoverRef.current.objectIndex !== selectionHighlightObjectIndex) {
                highlightGeometry(currentHoverRef.current.id, true, currentHoverRef.current.subType as any, currentHoverRef.current.objectIndex);
                if (selectionHighlightId) {
                    highlightGeometry(selectionHighlightId, false, selectionHighlightSubType, selectionHighlightObjectIndex);
                }
            }
        }

        const { id: hoverTargetId, subType: hoverTargetSubType, objectIndex: hoverTargetObjectIndex } = resolveHighlightTarget(hoveredSelection);
        if (hoverTargetId) {
            highlightGeometry(hoverTargetId, false, hoverTargetSubType, hoverTargetObjectIndex);
            currentHoverRef.current = { id: hoverTargetId, subType: hoverTargetSubType || null, objectIndex: hoverTargetObjectIndex };
        } else {
            currentHoverRef.current = { id: null, subType: null };
        }
    }, [robot, hoveredSelection?.type, hoveredSelection?.id, hoveredSelection?.subType, hoveredSelection?.objectIndex, selection?.type, selection?.id, selection?.subType, selection?.objectIndex, highlightGeometry, robotVersion, toolMode, highlightMode, showVisual, showCollision]);
}
