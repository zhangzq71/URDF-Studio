import { useState, useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { URDFLoader, URDFCollider, URDFVisual } from '@/core/parsers/urdf/loader';
import { disposeObject3D } from '../utils/dispose';
import { enhanceMaterials, collisionBaseMaterial, createMatteMaterial } from '../utils/materials';
import { parseURDFMaterials, applyURDFMaterials } from '../utils/urdfMaterials';
import { offsetRobotToGround } from '../utils/robotPositioning';
import { SHARED_MATERIALS } from '../constants';
import { createLoadingManager, createMeshLoader } from '@/core/loaders';
import { loadMJCFToThreeJS, isMJCFContent } from '@/core/parsers/mjcf';
import { parseURDF } from '@/core/parsers/urdf/parser';
import { processCapsuleGeometries } from '../utils/capsulePostProcessor';
import { GeometryType } from '@/types';
import type { UrdfLink, UrdfVisual as LinkGeometry } from '@/types';

function preprocessURDFForLoader(content: string): string {
    // Remove <transmission> blocks to prevent urdf-loader from finding duplicate joints
    // which can overwrite valid joints with empty origins
    return content.replace(/<transmission[\s\S]*?<\/transmission>/g, '');
}

interface GeometryPatchCandidate {
    linkName: string;
    linkData: UrdfLink;
    visualChanged: boolean;
    collisionChanged: boolean;
}

const DEFAULT_VEC3 = { x: 0, y: 0, z: 0 };
const DEFAULT_RPY = { r: 0, p: 0, y: 0 };

function sameVec3(a: { x: number; y: number; z: number } | undefined, b: { x: number; y: number; z: number } | undefined): boolean {
    const av = a || DEFAULT_VEC3;
    const bv = b || DEFAULT_VEC3;
    return av.x === bv.x && av.y === bv.y && av.z === bv.z;
}

function sameRPY(a: { r: number; p: number; y: number } | undefined, b: { r: number; p: number; y: number } | undefined): boolean {
    const av = a || DEFAULT_RPY;
    const bv = b || DEFAULT_RPY;
    return av.r === bv.r && av.p === bv.p && av.y === bv.y;
}

function sameOrigin(
    a: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } } | undefined,
    b: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } } | undefined
): boolean {
    return sameVec3(a?.xyz, b?.xyz) && sameRPY(a?.rpy, b?.rpy);
}

function sameGeometry(a: LinkGeometry | undefined, b: LinkGeometry | undefined): boolean {
    if (!a || !b) return a === b;
    return (
        a.type === b.type &&
        sameVec3(a.dimensions, b.dimensions) &&
        sameOrigin(a.origin, b.origin) &&
        (a.meshPath || '') === (b.meshPath || '') &&
        (a.color || '') === (b.color || '')
    );
}

function sameInertial(a: UrdfLink['inertial'] | undefined, b: UrdfLink['inertial'] | undefined): boolean {
    if (!a || !b) return a === b;

    return (
        a.mass === b.mass &&
        sameOrigin(a.origin, b.origin) &&
        a.inertia.ixx === b.inertia.ixx &&
        a.inertia.ixy === b.inertia.ixy &&
        a.inertia.ixz === b.inertia.ixz &&
        a.inertia.iyy === b.inertia.iyy &&
        a.inertia.iyz === b.inertia.iyz &&
        a.inertia.izz === b.inertia.izz
    );
}

function isSameLink(prev: UrdfLink, next: UrdfLink): boolean {
    return (
        prev.id === next.id &&
        prev.name === next.name &&
        prev.visible === next.visible &&
        sameInertial(prev.inertial, next.inertial) &&
        sameGeometry(prev.visual, next.visual) &&
        sameGeometry(prev.collision, next.collision)
    );
}

function getGeometryPatchForLink(prev: UrdfLink, next: UrdfLink): GeometryPatchCandidate | null {
    if (isSameLink(prev, next)) return null;

    if (
        prev.id !== next.id ||
        prev.name !== next.name ||
        prev.visible !== next.visible ||
        !sameInertial(prev.inertial, next.inertial)
    ) {
        return null;
    }

    const visualChanged = !sameGeometry(prev.visual, next.visual);
    const collisionChanged = !sameGeometry(prev.collision, next.collision);

    if (!visualChanged && !collisionChanged) return null;

    return {
        linkName: next.name,
        linkData: next,
        visualChanged,
        collisionChanged,
    };
}

function detectSingleGeometryPatch(
    prevLinks: Record<string, UrdfLink> | null,
    nextLinks: Record<string, UrdfLink> | undefined
): GeometryPatchCandidate | null {
    if (!prevLinks || !nextLinks) return null;

    const prevIds = Object.keys(prevLinks);
    const nextIds = Object.keys(nextLinks);
    if (prevIds.length !== nextIds.length) return null;

    const candidates: GeometryPatchCandidate[] = [];

    for (const id of nextIds) {
        const prev = prevLinks[id];
        const next = nextLinks[id];
        if (!prev || !next) return null;

        const patch = getGeometryPatchForLink(prev, next);
        if (!patch) {
            if (!isSameLink(prev, next)) return null;
            continue;
        }

        candidates.push(patch);
        if (candidates.length > 1) return null;
    }

    return candidates.length === 1 ? candidates[0] : null;
}

function applyOriginToGroup(group: THREE.Object3D, origin: LinkGeometry['origin'] | undefined): void {
    const xyz = origin?.xyz || DEFAULT_VEC3;
    const rpy = origin?.rpy || DEFAULT_RPY;

    group.position.set(xyz.x, xyz.y, xyz.z);
    group.rotation.set(0, 0, 0);
    group.quaternion.setFromEuler(new THREE.Euler(rpy.r, rpy.p, rpy.y, 'ZYX'));
}

function clearGroupChildren(group: THREE.Object3D): void {
    while (group.children.length > 0) {
        disposeObject3D(group.children[0], true, SHARED_MATERIALS);
    }
}

function findRobotLinkObject(robotModel: THREE.Object3D, linkName: string): THREE.Object3D | null {
    const links = (robotModel as any).links as Record<string, THREE.Object3D> | undefined;
    if (links?.[linkName]) return links[linkName];

    let found: THREE.Object3D | null = null;
    robotModel.traverse((child: any) => {
        if (!found && child.isURDFLink && child.name === linkName) {
            found = child;
        }
    });
    return found;
}

function updateVisualMaterial(mesh: THREE.Mesh, color?: string): void {
    const update = (mat: THREE.Material): THREE.Material => {
        const map = (mat as any).map || null;
        const next = createMatteMaterial({
            color: color || ((mat as any).color?.getHexString ? `#${(mat as any).color.getHexString()}` : '#808080'),
            opacity: mat.opacity ?? 1,
            transparent: mat.transparent || (mat.opacity ?? 1) < 1,
            side: mat.side,
            map,
            name: mat.name,
        });
        next.userData.urdfColorApplied = true;
        next.userData.urdfColor = new THREE.Color(color || '#808080');
        return next;
    };

    if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => update(mat));
    } else if (mesh.material) {
        mesh.material = update(mesh.material);
    }
}

function markVisualObject(obj: THREE.Object3D, linkName: string, color: string | undefined, showVisual: boolean): void {
    obj.traverse((child: any) => {
        if (!child.isMesh) return;
        child.userData.parentLinkName = linkName;
        child.userData.isVisualMesh = true;
        child.visible = showVisual;
        updateVisualMaterial(child, color);
    });
}

function markCollisionObject(obj: THREE.Object3D, linkName: string): void {
    obj.traverse((child: any) => {
        if (!child.isMesh) return;
        child.userData.parentLinkName = linkName;
        child.userData.isCollisionMesh = true;
        child.material = collisionBaseMaterial;
        child.renderOrder = 999;
    });
}

function rebuildLinkMeshMapForLink(
    linkMeshMapRef: React.MutableRefObject<Map<string, THREE.Mesh[]>>,
    linkObject: THREE.Object3D,
    linkName: string
): void {
    const visualKey = `${linkName}:visual`;
    const collisionKey = `${linkName}:collision`;
    const visualMeshes: THREE.Mesh[] = [];
    const collisionMeshes: THREE.Mesh[] = [];

    linkObject.traverse((child: any) => {
        if (!child.isMesh) return;
        if (child.userData?.isGizmo || String(child.name || '').startsWith('__')) return;

        let isCollision = Boolean(child.userData?.isCollisionMesh);
        if (!isCollision) {
            let current = child.parent;
            while (current && current !== linkObject.parent) {
                if (current.userData?.isGizmo || String(current.name || '').startsWith('__')) return;
                if ((current as any).isURDFCollider) {
                    isCollision = true;
                    break;
                }
                if (current === linkObject) break;
                current = current.parent;
            }
        }

        if (isCollision) {
            child.userData.isCollisionMesh = true;
            child.userData.parentLinkName = linkName;
            collisionMeshes.push(child as THREE.Mesh);
        } else {
            child.userData.isVisualMesh = true;
            child.userData.parentLinkName = linkName;
            visualMeshes.push(child as THREE.Mesh);
        }
    });

    linkMeshMapRef.current.delete(visualKey);
    linkMeshMapRef.current.delete(collisionKey);
    if (visualMeshes.length > 0) linkMeshMapRef.current.set(visualKey, visualMeshes);
    if (collisionMeshes.length > 0) linkMeshMapRef.current.set(collisionKey, collisionMeshes);
}

interface PatchCategoryOptions {
    robotModel: THREE.Object3D;
    linkObject: THREE.Object3D;
    linkName: string;
    category: 'visual' | 'collision';
    geometry: LinkGeometry;
    assets: Record<string, string>;
    showVisual: boolean;
    showCollision: boolean;
    linkMeshMapRef: React.MutableRefObject<Map<string, THREE.Mesh[]>>;
    invalidate: () => void;
}

function patchGeometryCategory({
    robotModel,
    linkObject,
    linkName,
    category,
    geometry,
    assets,
    showVisual,
    showCollision,
    linkMeshMapRef,
    invalidate,
}: PatchCategoryOptions): void {
    const isCollision = category === 'collision';

    const groupPredicate = isCollision
        ? (child: THREE.Object3D) => (child as any).isURDFCollider
        : (child: THREE.Object3D) => (child as any).isURDFVisual;

    let targetGroup = linkObject.children.find(groupPredicate) as THREE.Object3D | undefined;

    if (!targetGroup) {
        targetGroup = isCollision ? new URDFCollider() : new URDFVisual();
        linkObject.add(targetGroup);
    }

    targetGroup.visible = isCollision ? showCollision : true;
    clearGroupChildren(targetGroup);
    applyOriginToGroup(targetGroup, geometry.origin);

    const patchToken = ((targetGroup.userData.__patchToken as number) || 0) + 1;
    targetGroup.userData.__patchToken = patchToken;

    const dims = geometry.dimensions || DEFAULT_VEC3;
    const addPrimitive = (mesh: THREE.Mesh) => {
        if (isCollision) {
            markCollisionObject(mesh, linkName);
        } else {
            markVisualObject(mesh, linkName, geometry.color, showVisual);
        }
        targetGroup!.add(mesh);
    };

    if (geometry.type === GeometryType.NONE) {
        rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
        offsetRobotToGround(robotModel);
        invalidate();
        return;
    }

    if (geometry.type === GeometryType.BOX) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            isCollision ? collisionBaseMaterial : createMatteMaterial({ color: geometry.color || '#808080' })
        );
        mesh.scale.set(dims.x || 0.1, dims.y || 0.1, dims.z || 0.1);
        addPrimitive(mesh);
    } else if (geometry.type === GeometryType.SPHERE) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 30, 30),
            isCollision ? collisionBaseMaterial : createMatteMaterial({ color: geometry.color || '#808080' })
        );
        const radius = dims.x || 0.1;
        mesh.scale.set(radius, radius, radius);
        addPrimitive(mesh);
    } else if (geometry.type === GeometryType.CYLINDER) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 1, 30),
            isCollision ? collisionBaseMaterial : createMatteMaterial({ color: geometry.color || '#808080' })
        );
        mesh.scale.set(dims.x || 0.05, dims.y || 0.5, dims.z || dims.x || 0.05);
        mesh.rotation.set(Math.PI / 2, 0, 0);
        addPrimitive(mesh);
    } else if (geometry.type === GeometryType.CAPSULE) {
        const radius = Math.max(dims.x || 0.05, 1e-5);
        const totalLength = Math.max(dims.y || 0.5, radius * 2);
        const bodyLength = Math.max(totalLength - 2 * radius, 0);
        const mesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, bodyLength, 8, 16),
            isCollision ? collisionBaseMaterial : createMatteMaterial({ color: geometry.color || '#808080' })
        );
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        addPrimitive(mesh);
    } else if (geometry.type === GeometryType.MESH) {
        if (!geometry.meshPath) {
            rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
            offsetRobotToGround(robotModel);
            invalidate();
            return;
        }

        const urdfDir = '';
        const manager = createLoadingManager(assets, urdfDir);
        const meshLoader = createMeshLoader(assets, manager, urdfDir);

        meshLoader(geometry.meshPath, manager, (obj, err) => {
            if (!obj) return;

            if ((targetGroup!.userData.__patchToken as number) !== patchToken) {
                disposeObject3D(obj, true, SHARED_MATERIALS);
                return;
            }

            if (err) {
                console.error('[URDFViewer] Failed to patch mesh geometry:', err);
            }

            obj.position.set(0, 0, 0);
            obj.quaternion.identity();

            if (isCollision) {
                markCollisionObject(obj, linkName);
            } else {
                markVisualObject(obj, linkName, geometry.color, showVisual);
            }

            targetGroup!.add(obj);
            rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
            offsetRobotToGround(robotModel);
            invalidate();
        });

        return;
    }

    rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
    offsetRobotToGround(robotModel);
    invalidate();
}

interface ApplyGeometryPatchOptions {
    robotModel: THREE.Object3D;
    patch: GeometryPatchCandidate;
    assets: Record<string, string>;
    showVisual: boolean;
    showCollision: boolean;
    linkMeshMapRef: React.MutableRefObject<Map<string, THREE.Mesh[]>>;
    invalidate: () => void;
}

function applyGeometryPatchInPlace({
    robotModel,
    patch,
    assets,
    showVisual,
    showCollision,
    linkMeshMapRef,
    invalidate,
}: ApplyGeometryPatchOptions): boolean {
    const linkObject = findRobotLinkObject(robotModel, patch.linkName);
    if (!linkObject) return false;

    if (patch.visualChanged) {
        patchGeometryCategory({
            robotModel,
            linkObject,
            linkName: patch.linkName,
            category: 'visual',
            geometry: patch.linkData.visual,
            assets,
            showVisual,
            showCollision,
            linkMeshMapRef,
            invalidate,
        });
    }

    if (patch.collisionChanged) {
        patchGeometryCategory({
            robotModel,
            linkObject,
            linkName: patch.linkName,
            category: 'collision',
            geometry: patch.linkData.collision,
            assets,
            showVisual,
            showCollision,
            linkMeshMapRef,
            invalidate,
        });
    }

    return true;
}

export interface UseRobotLoaderOptions {
    urdfContent: string;
    assets: Record<string, string>;
    showCollision: boolean;
    showVisual: boolean;
    robotLinks?: Record<string, UrdfLink>;
    onRobotLoaded?: (robot: THREE.Object3D) => void;
}

export interface UseRobotLoaderResult {
    robot: THREE.Object3D | null;
    error: string | null;
    robotVersion: number;
    robotRef: React.MutableRefObject<THREE.Object3D | null>;
    linkMeshMapRef: React.MutableRefObject<Map<string, THREE.Mesh[]>>;
}

export function useRobotLoader({
    urdfContent,
    assets,
    showCollision,
    showVisual,
    robotLinks,
    onRobotLoaded
}: UseRobotLoaderOptions): UseRobotLoaderResult {
    const [robot, setRobot] = useState<THREE.Object3D | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [robotVersion, setRobotVersion] = useState(0);
    const { invalidate } = useThree();

    // Ref to track current robot for proper cleanup (avoids stale closure issues)
    const robotRef = useRef<THREE.Object3D | null>(null);
    // Track component mount state for preventing state updates after unmount
    const isMountedRef = useRef(true);
    // Track loading abort controller to cancel duplicate loads
    const loadAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

    // Refs for visibility state (used in loading callback)
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);

    // PERFORMANCE: Pre-built map of linkName -> meshes for O(1) highlight lookup
    const linkMeshMapRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
    // Track previous link snapshot to detect one-link geometry patches
    const prevRobotLinksRef = useRef<Record<string, UrdfLink> | null>(robotLinks || null);
    // Skip one matching urdfContent-driven full reload when incremental patch succeeds
    const skipReloadForContentRef = useRef<string | null>(null);

    // Keep refs in sync
    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);

    // Incremental path: update exactly one changed link geometry in-place and skip next full URDF reload.
    useEffect(() => {
        if (!robotLinks) return;

        const previousLinks = prevRobotLinksRef.current;
        prevRobotLinksRef.current = robotLinks;

        if (!previousLinks || !robotRef.current) return;
        if (isMJCFContent(urdfContent)) return;

        const patch = detectSingleGeometryPatch(previousLinks, robotLinks);
        if (!patch) return;

        const applied = applyGeometryPatchInPlace({
            robotModel: robotRef.current,
            patch,
            assets,
            showVisual: showVisualRef.current,
            showCollision: showCollisionRef.current,
            linkMeshMapRef,
            invalidate,
        });

        if (!applied) return;

        skipReloadForContentRef.current = urdfContent;
        setRobotVersion((v) => v + 1);
        setError(null);
    }, [robotLinks, urdfContent, assets, invalidate]);

    // Track component mount state for preventing state updates after unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Cleanup on unmount ONLY
    useEffect(() => {
        return () => {
            // Deep cleanup of robot resources on unmount
            if (robotRef.current) {
                // Remove from scene
                if (robotRef.current.parent) {
                    robotRef.current.parent.remove(robotRef.current);
                }
                // Dispose all geometries, materials (except shared), and textures
                disposeObject3D(robotRef.current, true, SHARED_MATERIALS);
                robotRef.current = null;
            }
        };
    }, []);

    // Load robot with proper cleanup and abort handling
    useEffect(() => {
        if (!urdfContent) return;
        if (skipReloadForContentRef.current === urdfContent) {
            skipReloadForContentRef.current = null;
            return;
        }
        if (skipReloadForContentRef.current && skipReloadForContentRef.current !== urdfContent) {
            skipReloadForContentRef.current = null;
        }

        // Create abort controller for this load
        const abortController = { aborted: false };
        loadAbortRef.current = abortController;

        const loadRobot = async () => {
            try {
                // NOTE: We do NOT cleanup the previous robot here immediately.
                // We wait until the new robot is ready to avoid flickering/rendering disposed objects.

                let robotModel: THREE.Object3D | null = null;

                // Check if content is MJCF (MuJoCo XML)
                if (isMJCFContent(urdfContent)) {
                    robotModel = await loadMJCFToThreeJS(urdfContent, assets);

                    if (abortController.aborted) {
                        if (robotModel) {
                            disposeObject3D(robotModel, true, SHARED_MATERIALS);
                        }
                        return;
                    }
                } else {
                    // Standard URDF loading
                    const urdfDir = '';
                    const manager = createLoadingManager(assets, urdfDir);
                    manager.onLoad = () => {
                        if (!robotModel || abortController.aborted || !isMountedRef.current) return;

                        const materials = parseURDFMaterials(urdfContent);
                        applyURDFMaterials(robotModel, materials);
                        processCapsuleGeometries(robotModel, urdfContent);
                        enhanceMaterials(robotModel);
                        offsetRobotToGround(robotModel);
                        setRobotVersion(v => v + 1);
                        invalidate();
                    };
                    // Use new local URDFLoader
                    const loader = new URDFLoader(manager);
                    loader.parseCollision = true;
                    loader.parseVisual = true;
                    // Fix: loader.loadMeshCb expects 3 args (path, manager, done)
                    loader.loadMeshCb = createMeshLoader(assets, manager, urdfDir);
                    loader.packages = '';

                    const cleanContent = preprocessURDFForLoader(urdfContent);
                    robotModel = loader.parse(cleanContent);

                    // Extract full joint limits (effort, velocity) which urdf-loader might miss
                    const fullRobotState = parseURDF(urdfContent);
                    if (fullRobotState && fullRobotState.joints && (robotModel as any).joints) {
                        Object.entries((robotModel as any).joints).forEach(([name, joint]: [string, any]) => {
                             const parsedJoint = fullRobotState.joints[name];
                             if (parsedJoint && parsedJoint.limit) {
                                 // Ensure limit object exists on the threejs joint
                                 if (!joint.limit) joint.limit = {};
                                 
                                 // Update missing properties
                                 joint.limit.effort = parsedJoint.limit.effort;
                                 joint.limit.velocity = parsedJoint.limit.velocity;
                                 
                                 // Also ensure lower/upper are consistent if they were missing
                                 if (joint.limit.lower === undefined) joint.limit.lower = parsedJoint.limit.lower;
                                 if (joint.limit.upper === undefined) joint.limit.upper = parsedJoint.limit.upper;
                             }
                        });
                    }

                    // Check if load was aborted (e.g., by StrictMode remount or urdfContent change)
                    if (abortController.aborted) {
                        // Dispose the loaded model since we don't need it
                        if (robotModel) {
                            disposeObject3D(robotModel, true, SHARED_MATERIALS);
                        }
                        return;
                    }
                }

                if (robotModel && isMountedRef.current) {
                    // Apply URDF materials from XML (urdf-loader doesn't handle inline rgba)
                    if (!isMJCFContent(urdfContent)) {
                        const materials = parseURDFMaterials(urdfContent);
                        applyURDFMaterials(robotModel, materials);

                        // Process capsule geometries (urdf-loader doesn't support capsule natively)
                        processCapsuleGeometries(robotModel, urdfContent);
                    }

                    // Offset robot so bottom is at ground level (Y=0)
                    offsetRobotToGround(robotModel);

                    enhanceMaterials(robotModel);

                    // PERFORMANCE: Build linkName -> meshes map and inject userData in single traverse
                    // This eliminates the need for traverse in highlightGeometry
                    const newLinkMeshMap = new Map<string, THREE.Mesh[]>();

                    robotModel.traverse((child: any) => {
                        // Find parent link for this object
                        let parentLink: any = null;
                        let current = child;
                        while (current) {
                            if (current.isURDFLink || (robotModel as any).links?.[current.name]) {
                                parentLink = current;
                                break;
                            }
                            current = current.parent;
                        }

                        // Handle collision meshes
                        if (child.isURDFCollider) {
                            child.visible = showCollisionRef.current;
                            child.traverse((inner: any) => {
                                if (inner.isMesh) {
                                    inner.userData.isCollisionMesh = true;
                                    // Inject parent link name for fast lookup
                                    if (parentLink) {
                                        inner.userData.parentLinkName = parentLink.name;
                                    }
                                    // Add to link mesh map
                                    if (parentLink) {
                                        const key = `${parentLink.name}:collision`;
                                        if (!newLinkMeshMap.has(key)) {
                                            newLinkMeshMap.set(key, []);
                                        }
                                        newLinkMeshMap.get(key)!.push(inner);
                                    }
                                }
                            });
                        }
                        // Handle visual meshes
                        else if (child.isMesh && !child.userData.isCollisionMesh) {
                            // Check if it's a visual (not a joint or collider)
                            let isVisual = false;
                            let checkParent = child.parent;
                            while (checkParent) {
                                if (checkParent.isURDFCollider) {
                                    break; // Already handled as collision
                                }
                                if (checkParent.isURDFLink) {
                                    isVisual = true;
                                    break;
                                }
                                checkParent = checkParent.parent;
                            }

                            if (isVisual && parentLink) {
                                child.userData.parentLinkName = parentLink.name;
                                child.userData.isVisualMesh = true;
                                const key = `${parentLink.name}:visual`;
                                if (!newLinkMeshMap.has(key)) {
                                    newLinkMeshMap.set(key, []);
                                }
                                newLinkMeshMap.get(key)!.push(child);
                            }

                            child.visible = showVisualRef.current;
                        }
                    });

                    // Cleanup previous robot NOW, before replacing it
                    if (robotRef.current) {
                        // Remove from scene first
                        if (robotRef.current.parent) {
                            robotRef.current.parent.remove(robotRef.current);
                        }
                        // Deep dispose with shared materials exclusion
                        disposeObject3D(robotRef.current, true, SHARED_MATERIALS);
                        robotRef.current = null;
                    }

                    // Store the pre-built map
                    linkMeshMapRef.current = newLinkMeshMap;

                    // Store in ref for cleanup
                    robotRef.current = robotModel;
                    setRobot(robotModel);
                    setError(null);

                    if (onRobotLoaded) {
                        onRobotLoaded(robotModel);
                    }
                } else if (robotModel) {
                     // Aborted or unmounted after load but before we could use it
                     disposeObject3D(robotModel, true, SHARED_MATERIALS);
                }
            } catch (err) {
                if (!abortController.aborted && isMountedRef.current) {
                    console.error('[URDFViewer] Failed to load URDF:', err);
                    setError(err instanceof Error ? err.message : 'Unknown error');
                }
            }
        };

        loadRobot();

        // Cleanup function - runs when dependencies change
        return () => {
            // Mark this load as aborted to prevent state updates
            abortController.aborted = true;

            // NOTE: We do NOT dispose robotRef.current here.
            // We allow the old robot to persist until the new one is ready, 
            // or until the component unmounts (handled by the separate useEffect).
        };
    }, [urdfContent, assets, invalidate, onRobotLoaded]);

    return {
        robot,
        error,
        robotVersion,
        robotRef,
        linkMeshMapRef
    };
}
