import { useState, useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useUIStore } from '@/store';
import { URDFLoader, URDFCollider, URDFVisual, URDFJoint as RuntimeURDFJoint } from '@/core/parsers/urdf/loader';
import { disposeObject3D, disposeMaterial } from '../utils/dispose';
import { enhanceMaterials, collisionBaseMaterial, createMatteMaterial } from '../utils/materials';
import { parseURDFMaterials, applyURDFMaterials } from '../utils/urdfMaterials';
import { offsetRobotToGround } from '../utils/robotPositioning';
import { SHARED_MATERIALS } from '../constants';
import { createLoadingManager, createMeshLoader } from '@/core/loaders';
import { loadMJCFToThreeJS, isMJCFContent } from '@/core/parsers/mjcf';
import { parseURDF } from '@/core/parsers/urdf/parser';
import { getCollisionGeometryEntries } from '@/core/robot';
import { GeometryType } from '@/types';
import type { UrdfJoint, UrdfLink, UrdfVisual as LinkGeometry } from '@/types';
import { isSingleDofJoint } from '../utils/jointTypes';

function preprocessURDFForLoader(content: string): string {
    // Remove <transmission> blocks to prevent urdf-loader from finding duplicate joints
    // which can overwrite valid joints with empty origins
    return content.replace(/<transmission[\s\S]*?<\/transmission>/g, '');
}

interface GeometryPatchCandidate {
    linkName: string;
    previousLinkData: UrdfLink;
    linkData: UrdfLink;
    visualChanged: boolean;
    collisionChanged: boolean;
    collisionBodiesChanged: boolean;
    inertialChanged: boolean;
    visibilityChanged: boolean;
}

interface JointPatchCandidate {
    jointName: string;
    previousJointData: UrdfJoint;
    jointData: UrdfJoint;
}

const DEFAULT_VEC3 = { x: 0, y: 0, z: 0 };
const DEFAULT_RPY = { r: 0, p: 0, y: 0 };

function sameVisibleFlag(a: boolean | undefined, b: boolean | undefined): boolean {
    return (a ?? true) === (b ?? true);
}

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
        (a.color || '') === (b.color || '') &&
        sameVisibleFlag(a.visible, b.visible)
    );
}

function sameGeometryList(a: LinkGeometry[] | undefined, b: LinkGeometry[] | undefined): boolean {
    const listA = a || [];
    const listB = b || [];

    return (
        listA.length === listB.length &&
        listA.every((geometry, index) => sameGeometry(geometry, listB[index]))
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
        sameGeometry(prev.collision, next.collision) &&
        sameGeometryList(prev.collisionBodies, next.collisionBodies)
    );
}

function getGeometryPatchForLink(prev: UrdfLink, next: UrdfLink): GeometryPatchCandidate | null {
    if (isSameLink(prev, next)) return null;

    if (prev.id !== next.id || prev.name !== next.name) {
        return null;
    }

    const inertialChanged = !sameInertial(prev.inertial, next.inertial);
    const visibilityChanged = prev.visible !== next.visible;
    const visualChanged = !sameGeometry(prev.visual, next.visual);
    const collisionChanged = !sameGeometry(prev.collision, next.collision);
    const collisionBodiesChanged = !sameGeometryList(prev.collisionBodies, next.collisionBodies);

    if (!visualChanged && !collisionChanged && !collisionBodiesChanged && !inertialChanged && !visibilityChanged) {
        return null;
    }

    return {
        linkName: next.name,
        previousLinkData: prev,
        linkData: next,
        visualChanged,
        collisionChanged,
        collisionBodiesChanged,
        inertialChanged,
        visibilityChanged,
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

function sameLimit(a: UrdfJoint['limit'], b: UrdfJoint['limit']): boolean {
    return (
        a.lower === b.lower &&
        a.upper === b.upper &&
        a.effort === b.effort &&
        a.velocity === b.velocity
    );
}

function sameDynamics(a: UrdfJoint['dynamics'], b: UrdfJoint['dynamics']): boolean {
    return a.damping === b.damping && a.friction === b.friction;
}

function sameHardware(a: UrdfJoint['hardware'], b: UrdfJoint['hardware']): boolean {
    return (
        a.armature === b.armature &&
        a.motorType === b.motorType &&
        a.motorId === b.motorId &&
        a.motorDirection === b.motorDirection
    );
}

function isSameJoint(prev: UrdfJoint, next: UrdfJoint): boolean {
    return (
        prev.id === next.id &&
        prev.name === next.name &&
        prev.parentLinkId === next.parentLinkId &&
        prev.childLinkId === next.childLinkId &&
        prev.type === next.type &&
        sameOrigin(prev.origin, next.origin) &&
        sameVec3(prev.axis, next.axis) &&
        sameLimit(prev.limit, next.limit) &&
        sameDynamics(prev.dynamics, next.dynamics) &&
        sameHardware(prev.hardware, next.hardware)
    );
}

function getJointPatchForJoint(prev: UrdfJoint, next: UrdfJoint): JointPatchCandidate | null {
    if (isSameJoint(prev, next)) return null;

    if (
        prev.id !== next.id ||
        prev.name !== next.name ||
        prev.parentLinkId !== next.parentLinkId ||
        prev.childLinkId !== next.childLinkId
    ) {
        return null;
    }

    return {
        jointName: next.name,
        previousJointData: prev,
        jointData: next,
    };
}

function detectSingleJointPatch(
    prevJoints: Record<string, UrdfJoint> | null,
    nextJoints: Record<string, UrdfJoint> | undefined
): JointPatchCandidate | null {
    if (!prevJoints || !nextJoints) return null;

    const prevIds = Object.keys(prevJoints);
    const nextIds = Object.keys(nextJoints);
    if (prevIds.length !== nextIds.length) return null;

    const candidates: JointPatchCandidate[] = [];

    for (const id of nextIds) {
        const prev = prevJoints[id];
        const next = nextJoints[id];
        if (!prev || !next) return null;

        const patch = getJointPatchForJoint(prev, next);
        if (!patch) {
            if (!isSameJoint(prev, next)) return null;
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

function applyOriginToJoint(joint: RuntimeURDFJoint, origin: UrdfJoint['origin'] | undefined): void {
    const xyz = origin?.xyz || DEFAULT_VEC3;
    const rpy = origin?.rpy || DEFAULT_RPY;

    joint.position.set(xyz.x, xyz.y, xyz.z);
    joint.rotation.set(0, 0, 0);
    joint.quaternion.setFromEuler(new THREE.Euler(rpy.r, rpy.p, rpy.y, 'ZYX'));
}

function clearGroupChildren(group: THREE.Object3D): void {
    while (group.children.length > 0) {
        disposeObject3D(group.children[0], true, SHARED_MATERIALS);
    }
}

function disposeReplacedMaterials(
    material: THREE.Material | THREE.Material[] | undefined,
    disposedMaterials: Set<THREE.Material>,
    disposeTextures: boolean
): void {
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
        if (!mat || disposedMaterials.has(mat) || SHARED_MATERIALS.has(mat)) continue;
        disposeMaterial(mat, disposeTextures, SHARED_MATERIALS);
        disposedMaterials.add(mat);
    }
}

function disposeTempMaterialMap(materials: Map<string, THREE.Material>): void {
    materials.forEach((material) => {
        if (!SHARED_MATERIALS.has(material)) {
            disposeMaterial(material, true, SHARED_MATERIALS);
        }
    });
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

function updateVisualMaterial(
    mesh: THREE.Mesh,
    color: string | undefined,
    disposedMaterials: Set<THREE.Material>
): void {
    const previousMaterial = mesh.material as THREE.Material | THREE.Material[] | undefined;

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

    // Preserve texture ownership when old map is reused by the new material.
    disposeReplacedMaterials(previousMaterial, disposedMaterials, false);
}

function markVisualObject(obj: THREE.Object3D, linkName: string, color: string | undefined, showVisual: boolean): void {
    const disposedMaterials = new Set<THREE.Material>();

    obj.traverse((child: any) => {
        if (!child.isMesh) return;
        child.userData.parentLinkName = linkName;
        child.userData.isVisualMesh = true;
        child.visible = showVisual;
        updateVisualMaterial(child, color, disposedMaterials);
    });
}

function markCollisionObject(obj: THREE.Object3D, linkName: string): void {
    const disposedMaterials = new Set<THREE.Material>();

    obj.traverse((child: any) => {
        if (!child.isMesh) return;
        const previousMaterial = child.material as THREE.Material | THREE.Material[] | undefined;
        child.userData.parentLinkName = linkName;
        child.userData.isCollisionMesh = true;
        child.material = collisionBaseMaterial;
        child.renderOrder = 999;

        disposeReplacedMaterials(previousMaterial, disposedMaterials, true);
    });
}

function rebuildLinkMeshMapForLink(
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>,
    linkObject: THREE.Object3D,
    linkName: string
): void {
    const visualKey = `${linkName}:visual`;
    const collisionKey = `${linkName}:collision`;
    const visualMeshes: THREE.Mesh[] = [];
    const collisionMeshes: THREE.Mesh[] = [];

    const collectGroupMeshes = (group: THREE.Object3D, kind: 'visual' | 'collision') => {
        group.traverse((child: any) => {
            if (!child.isMesh) return;
            if (child.userData?.isGizmo || String(child.name || '').startsWith('__')) return;

            child.userData.parentLinkName = linkName;

            if (kind === 'collision') {
                child.userData.isCollisionMesh = true;
                child.userData.isVisualMesh = false;
                collisionMeshes.push(child as THREE.Mesh);
            } else {
                child.userData.isVisualMesh = true;
                child.userData.isCollisionMesh = false;
                visualMeshes.push(child as THREE.Mesh);
            }
        });
    };

    linkObject.children.forEach((child: any) => {
        if (child.userData?.isGizmo || String(child.name || '').startsWith('__')) return;

        if (child.isURDFCollider) {
            collectGroupMeshes(child, 'collision');
            return;
        }

        if (child.isURDFVisual) {
            collectGroupMeshes(child, 'visual');
            return;
        }

        if (child.isMesh) {
            child.userData.parentLinkName = linkName;
            child.userData.isVisualMesh = true;
            child.userData.isCollisionMesh = false;
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
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
    invalidate: () => void;
    isPatchTargetValid?: () => boolean;
    targetGroup?: THREE.Object3D;
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
    isPatchTargetValid,
    targetGroup: explicitTargetGroup,
}: PatchCategoryOptions): void {
    const isCollision = category === 'collision';

    const groupPredicate = isCollision
        ? (child: THREE.Object3D) => (child as any).isURDFCollider
        : (child: THREE.Object3D) => (child as any).isURDFVisual;

    let targetGroup = explicitTargetGroup ?? (linkObject.children.find(groupPredicate) as THREE.Object3D | undefined);

    if (!targetGroup) {
        targetGroup = isCollision ? new URDFCollider() : new URDFVisual();
        linkObject.add(targetGroup);
    } else if (targetGroup.parent !== linkObject) {
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
        robotModel.updateMatrixWorld(true);
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
        // Keep capsule axis consistent with CylinderGeometry in this loader pipeline.
        mesh.rotation.set(Math.PI / 2, 0, 0);
        addPrimitive(mesh);
    } else if (geometry.type === GeometryType.MESH) {
        if (!geometry.meshPath) {
            rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
            robotModel.updateMatrixWorld(true);
            invalidate();
            return;
        }

        const urdfDir = '';
        const manager = createLoadingManager(assets, urdfDir);
        const meshLoader = createMeshLoader(assets, manager, urdfDir);

        meshLoader(geometry.meshPath, manager, (obj, err) => {
            if (!obj) return;

            if (
                (targetGroup!.userData.__patchToken as number) !== patchToken ||
                (isPatchTargetValid && !isPatchTargetValid())
            ) {
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
            robotModel.updateMatrixWorld(true);
            invalidate();
        });

        return;
    }

    rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
    robotModel.updateMatrixWorld(true);
    invalidate();
}

function getDirectCollisionGroups(linkObject: THREE.Object3D): THREE.Object3D[] {
    return linkObject.children.filter((child: any) => child.isURDFCollider) as THREE.Object3D[];
}

function patchCollisionEntriesInPlace({
    robotModel,
    linkObject,
    linkName,
    previousLinkData,
    nextLinkData,
    assets,
    showVisual,
    showCollision,
    linkMeshMapRef,
    invalidate,
    isPatchTargetValid,
}: {
    robotModel: THREE.Object3D;
    linkObject: THREE.Object3D;
    linkName: string;
    previousLinkData: UrdfLink;
    nextLinkData: UrdfLink;
    assets: Record<string, string>;
    showVisual: boolean;
    showCollision: boolean;
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
    invalidate: () => void;
    isPatchTargetValid?: () => boolean;
}): boolean {
    const previousEntries = getCollisionGeometryEntries(previousLinkData);
    const nextEntries = getCollisionGeometryEntries(nextLinkData);
    const existingGroups = getDirectCollisionGroups(linkObject);

    if (existingGroups.length !== previousEntries.length) {
        return false;
    }

    let applied = false;
    const sharedCount = Math.min(previousEntries.length, nextEntries.length);

    for (let index = 0; index < sharedCount; index += 1) {
        const previousEntry = previousEntries[index];
        const nextEntry = nextEntries[index];
        const group = existingGroups[index];

        if (!previousEntry || !nextEntry || !group) {
            return false;
        }

        if (sameGeometry(previousEntry.geometry, nextEntry.geometry)) {
            continue;
        }

        applied = true;

        if (patchGeometryGroupInPlace({
            robotModel,
            linkObject,
            category: 'collision',
            linkData: nextLinkData,
            previousGeometry: previousEntry.geometry,
            geometry: nextEntry.geometry,
            showVisual,
            showCollision,
            invalidate,
            targetGroup: group,
        })) {
            continue;
        }

        patchGeometryCategory({
            robotModel,
            linkObject,
            linkName,
            category: 'collision',
            geometry: nextEntry.geometry,
            assets,
            showVisual,
            showCollision,
            linkMeshMapRef,
            invalidate,
            isPatchTargetValid,
            targetGroup: group,
        });
    }

    if (existingGroups.length > nextEntries.length) {
        existingGroups.slice(nextEntries.length).forEach((group) => {
            linkObject.remove(group);
            disposeObject3D(group, true, SHARED_MATERIALS);
        });
        applied = true;
    }

    if (nextEntries.length > existingGroups.length) {
        nextEntries.slice(existingGroups.length).forEach((entry) => {
            const targetGroup = new URDFCollider();
            linkObject.add(targetGroup);
            patchGeometryCategory({
                robotModel,
                linkObject,
                linkName,
                category: 'collision',
                geometry: entry.geometry,
                assets,
                showVisual,
                showCollision,
                linkMeshMapRef,
                invalidate,
                isPatchTargetValid,
                targetGroup,
            });
        });
        applied = true;
    }

    if (!applied) {
        return true;
    }

    rebuildLinkMeshMapForLink(linkMeshMapRef, linkObject, linkName);
    robotModel.updateMatrixWorld(true);
    invalidate();
    return true;
}

function sameGeometryStructure(a: LinkGeometry | undefined, b: LinkGeometry | undefined): boolean {
    if (!a || !b) return a === b;
    return a.type === b.type && (a.meshPath || '') === (b.meshPath || '');
}

function canPatchGeometryInPlace(
    previousGeometry: LinkGeometry | undefined,
    geometry: LinkGeometry | undefined,
    category: 'visual' | 'collision',
): boolean {
    if (!previousGeometry || !geometry) return false;
    if (!sameGeometryStructure(previousGeometry, geometry)) return false;
    if (geometry.type === GeometryType.NONE) return false;

    const dimensionsChanged = !sameVec3(previousGeometry.dimensions, geometry.dimensions);
    const colorChanged = (previousGeometry.color || '') !== (geometry.color || '');

    if (dimensionsChanged && geometry.type === GeometryType.MESH) return false;
    if (colorChanged && category === 'collision') return false;

    return true;
}

function findFirstMeshInObject(object: THREE.Object3D): THREE.Mesh | null {
    let firstMesh: THREE.Mesh | null = null;

    object.traverse((child: any) => {
        if (!firstMesh && child.isMesh) {
            firstMesh = child as THREE.Mesh;
        }
    });

    return firstMesh;
}

function patchPrimitiveDimensionsInPlace(targetGroup: THREE.Object3D, geometry: LinkGeometry): boolean {
    const mesh = findFirstMeshInObject(targetGroup);
    if (!mesh) return false;

    const dims = geometry.dimensions || DEFAULT_VEC3;

    switch (geometry.type) {
        case GeometryType.BOX:
            mesh.scale.set(dims.x || 0.1, dims.y || 0.1, dims.z || 0.1);
            return true;
        case GeometryType.SPHERE: {
            const radius = dims.x || 0.1;
            mesh.scale.set(radius, radius, radius);
            return true;
        }
        case GeometryType.CYLINDER:
            mesh.scale.set(dims.x || 0.05, dims.y || 0.5, dims.z || dims.x || 0.05);
            mesh.rotation.set(Math.PI / 2, 0, 0);
            return true;
        case GeometryType.CAPSULE: {
            const radius = Math.max(dims.x || 0.05, 1e-5);
            const totalLength = Math.max(dims.y || 0.5, radius * 2);
            const bodyLength = Math.max(totalLength - 2 * radius, 0);
            const previousMeshGeometry = mesh.geometry;
            mesh.geometry = new THREE.CapsuleGeometry(radius, bodyLength, 8, 16);
            previousMeshGeometry?.dispose?.();
            mesh.scale.set(1, 1, 1);
            mesh.rotation.set(Math.PI / 2, 0, 0);
            return true;
        }
        default:
            return false;
    }
}

function patchGeometryGroupInPlace({
    robotModel,
    linkObject,
    category,
    linkData,
    previousGeometry,
    geometry,
    showVisual,
    showCollision,
    invalidate,
    targetGroup: explicitTargetGroup,
}: {
    robotModel: THREE.Object3D;
    linkObject: THREE.Object3D;
    category: 'visual' | 'collision';
    linkData: UrdfLink;
    previousGeometry: LinkGeometry | undefined;
    geometry: LinkGeometry | undefined;
    showVisual: boolean;
    showCollision: boolean;
    invalidate: () => void;
    targetGroup?: THREE.Object3D;
}): boolean {
    if (!previousGeometry || !geometry) return false;
    if (!canPatchGeometryInPlace(previousGeometry, geometry, category)) return false;

    const isCollision = category === 'collision';
    const groupPredicate = isCollision
        ? (child: THREE.Object3D) => (child as any).isURDFCollider
        : (child: THREE.Object3D) => (child as any).isURDFVisual;

    const targetGroup = explicitTargetGroup ?? (linkObject.children.find(groupPredicate) as THREE.Object3D | undefined);
    if (!targetGroup) return false;

    const originChanged = !sameOrigin(previousGeometry.origin, geometry.origin);
    const visibilityChanged = !sameVisibleFlag(previousGeometry.visible, geometry.visible);
    const dimensionsChanged = !sameVec3(previousGeometry.dimensions, geometry.dimensions);
    const colorChanged = (previousGeometry.color || '') !== (geometry.color || '');

    if (originChanged) {
        applyOriginToGroup(targetGroup, geometry.origin);
    }

    const isVisible = isCollision
        ? (showCollision && geometry.visible !== false)
        : (showVisual && linkData.visible !== false && geometry.visible !== false);

    if (visibilityChanged || category === 'visual') {
        targetGroup.visible = isVisible;
        targetGroup.traverse((child: any) => {
            if (child.isMesh) {
                child.visible = isVisible;
            }
        });
    }

    if (dimensionsChanged && !patchPrimitiveDimensionsInPlace(targetGroup, geometry)) {
        return false;
    }

    if (!isCollision && colorChanged) {
        const disposedMaterials = new Set<THREE.Material>();
        targetGroup.traverse((child: any) => {
            if (child.isMesh) {
                updateVisualMaterial(child as THREE.Mesh, geometry.color, disposedMaterials);
            }
        });
    }

    robotModel.updateMatrixWorld(true);
    invalidate();
    return true;
}

interface ApplyGeometryPatchOptions {
    robotModel: THREE.Object3D;
    patch: GeometryPatchCandidate;
    assets: Record<string, string>;
    showVisual: boolean;
    showCollision: boolean;
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
    invalidate: () => void;
    isPatchTargetValid?: () => boolean;
}

function applyGeometryPatchInPlace({
    robotModel,
    patch,
    assets,
    showVisual,
    showCollision,
    linkMeshMapRef,
    invalidate,
    isPatchTargetValid,
}: ApplyGeometryPatchOptions): boolean {
    const linkObject = findRobotLinkObject(robotModel, patch.linkName);
    if (!linkObject) return false;

    if (patch.visualChanged) {
        if (!patchGeometryGroupInPlace({
            robotModel,
            linkObject,
            category: 'visual',
            linkData: patch.linkData,
            previousGeometry: patch.previousLinkData.visual,
            geometry: patch.linkData.visual,
            showVisual,
            showCollision,
            invalidate,
        })) {
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
                isPatchTargetValid,
            });
        }
    }

    if (patch.collisionChanged || patch.collisionBodiesChanged) {
        const collisionPatched = patchCollisionEntriesInPlace({
            robotModel,
            linkObject,
            linkName: patch.linkName,
            previousLinkData: patch.previousLinkData,
            nextLinkData: patch.linkData,
            assets,
            showVisual,
            showCollision,
            linkMeshMapRef,
            invalidate,
            isPatchTargetValid,
        });

        if (!collisionPatched) {
            if (!patchGeometryGroupInPlace({
                robotModel,
                linkObject,
                category: 'collision',
                linkData: patch.linkData,
                previousGeometry: patch.previousLinkData.collision,
                geometry: patch.linkData.collision,
                showVisual,
                showCollision,
                invalidate,
            })) {
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
                    isPatchTargetValid,
                });
            }
        }
    }

    return true;
}

function patchJointInPlace(
    robotModel: THREE.Object3D,
    patch: JointPatchCandidate,
    invalidate: () => void
): boolean {
    const joints = (robotModel as any).joints as Record<string, RuntimeURDFJoint> | undefined;
    const joint = joints?.[patch.jointName];
    if (!joint) return false;

    const currentValues = Array.isArray(joint.jointValue) ? [...joint.jointValue] : [];

    joint.jointType = patch.jointData.type as RuntimeURDFJoint['jointType'];
    applyOriginToJoint(joint, patch.jointData.origin);
    joint.origPosition = joint.position.clone();
    joint.origQuaternion = joint.quaternion.clone();

    const axis = patch.jointData.axis;
    const axisLengthSq = axis.x * axis.x + axis.y * axis.y + axis.z * axis.z;
    if (axisLengthSq > 0) {
        joint.axis.set(axis.x, axis.y, axis.z).normalize();
    } else if (joint.jointType === 'planar') {
        joint.axis.set(0, 0, 1);
    } else {
        joint.axis.set(1, 0, 0);
    }

    joint.limit.lower = patch.jointData.limit.lower;
    joint.limit.upper = patch.jointData.limit.upper;
    joint.limit.effort = patch.jointData.limit.effort;
    joint.limit.velocity = patch.jointData.limit.velocity;

    switch (joint.jointType) {
        case 'fixed':
            joint.position.copy(joint.origPosition);
            joint.quaternion.copy(joint.origQuaternion);
            joint.jointValue = [];
            joint.matrixWorldNeedsUpdate = true;
            break;
        case 'continuous':
        case 'revolute':
        case 'prismatic':
            joint.setJointValue(currentValues[0] ?? 0);
            break;
        case 'planar':
            joint.setJointValue(
                currentValues[0] ?? 0,
                currentValues[1] ?? 0,
                currentValues[2] ?? 0,
            );
            break;
        case 'floating':
            joint.setJointValue(
                currentValues[0] ?? 0,
                currentValues[1] ?? 0,
                currentValues[2] ?? 0,
                currentValues[3] ?? 0,
                currentValues[4] ?? 0,
                currentValues[5] ?? 0,
            );
            break;
        default:
            break;
    }

    robotModel.updateMatrixWorld(true);
    invalidate();
    return true;
}

export interface UseRobotLoaderOptions {
    urdfContent: string;
    assets: Record<string, string>;
    showCollision: boolean;
    showVisual: boolean;
    isMeshPreview?: boolean;
    robotLinks?: Record<string, UrdfLink>;
    robotJoints?: Record<string, UrdfJoint>;
    initialJointAngles?: Record<string, number>;
    onRobotLoaded?: (robot: THREE.Object3D) => void;
}

export interface UseRobotLoaderResult {
    robot: THREE.Object3D | null;
    error: string | null;
    robotVersion: number;
    robotRef: React.RefObject<THREE.Object3D | null>;
    linkMeshMapRef: React.RefObject<Map<string, THREE.Mesh[]>>;
}

export function useRobotLoader({
    urdfContent,
    assets,
    showCollision,
    showVisual,
    isMeshPreview = false,
    robotLinks,
    robotJoints,
    initialJointAngles,
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
    // Dispose the previously rendered robot only after the new one has had a chance to mount,
    // otherwise the canvas can flash a blank frame during file switching.
    const pendingDisposeRobotRef = useRef<THREE.Object3D | null>(null);
    const pendingDisposeFrameRef = useRef<number | null>(null);
    const groundAlignTimerRef = useRef<number[]>([]);

    // Refs for visibility state (used in loading callback)
    const showVisualRef = useRef(showVisual);
    const showCollisionRef = useRef(showCollision);
    const initialJointAnglesRef = useRef(initialJointAngles);

    // PERFORMANCE: Pre-built map of linkName -> meshes for O(1) highlight lookup
    const linkMeshMapRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
    // Track previous link snapshot to detect one-link geometry patches
    const prevRobotLinksRef = useRef<Record<string, UrdfLink> | null>(robotLinks || null);
    // Track previous joint snapshot to detect one-joint metadata/origin patches
    const prevRobotJointsRef = useRef<Record<string, UrdfJoint> | null>(robotJoints || null);
    // Skip exactly one upcoming urdfContent-driven full reload per successful
    // incremental patch. A counter is more robust than strict content matching
    // when robotLinks/robotJoints and urdfContent updates are not perfectly in sync.
    const skipReloadCountRef = useRef(0);

    // Keep refs in sync
    useEffect(() => { showVisualRef.current = showVisual; }, [showVisual]);
    useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);
    useEffect(() => { initialJointAnglesRef.current = initialJointAngles; }, [initialJointAngles]);

    const disposeRobotObject = useCallback((robotObject: THREE.Object3D | null) => {
        if (!robotObject) return;
        if (robotObject.parent) {
            robotObject.parent.remove(robotObject);
        }
        disposeObject3D(robotObject, true, SHARED_MATERIALS);
    }, []);

    const flushPendingRobotDispose = useCallback(() => {
        if (pendingDisposeFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(pendingDisposeFrameRef.current);
            pendingDisposeFrameRef.current = null;
        }

        if (pendingDisposeRobotRef.current) {
            const robotToDispose = pendingDisposeRobotRef.current;
            pendingDisposeRobotRef.current = null;
            disposeRobotObject(robotToDispose);
        }
    }, [disposeRobotObject]);

    const clearGroundAlignTimers = useCallback(() => {
        groundAlignTimerRef.current.forEach((timer) => window.clearTimeout(timer));
        groundAlignTimerRef.current = [];
    }, []);

    const schedulePreviousRobotDispose = useCallback((previousRobot: THREE.Object3D | null) => {
        if (!previousRobot) return;

        flushPendingRobotDispose();
        pendingDisposeRobotRef.current = previousRobot;

        const disposePreviousRobot = () => {
            pendingDisposeFrameRef.current = null;
            const robotToDispose = pendingDisposeRobotRef.current;
            pendingDisposeRobotRef.current = null;

            if (!robotToDispose || robotToDispose === robotRef.current) {
                return;
            }

            disposeRobotObject(robotToDispose);
        };

        if (typeof window !== 'undefined') {
            pendingDisposeFrameRef.current = window.requestAnimationFrame(() => {
                pendingDisposeFrameRef.current = window.requestAnimationFrame(disposePreviousRobot);
            });
            return;
        }

        queueMicrotask(disposePreviousRobot);
    }, [disposeRobotObject, flushPendingRobotDispose]);

    const scheduleGroundAlignment = useCallback((loadedRobot: THREE.Object3D) => {
        if (typeof window === 'undefined') {
            offsetRobotToGround(loadedRobot, useUIStore.getState().groundPlaneOffset);
            return;
        }

        clearGroundAlignTimers();

        groundAlignTimerRef.current = [0, 80, 220, 500].map((delay) =>
            window.setTimeout(() => {
                if (!isMountedRef.current) return;
                if (robotRef.current !== loadedRobot) return;

                offsetRobotToGround(loadedRobot, useUIStore.getState().groundPlaneOffset);
                invalidate();
            }, delay)
        );
    }, [clearGroundAlignTimers, invalidate]);

    // Incremental path: update exactly one changed link geometry in-place and skip next full URDF reload.
    useEffect(() => {
        if (isMeshPreview) return;
        if (!robotLinks) return;

        const previousLinks = prevRobotLinksRef.current;
        const currentRobot = robotRef.current;
        prevRobotLinksRef.current = robotLinks;

        if (!previousLinks || !currentRobot) return;
        if (isMJCFContent(urdfContent)) return;

        const patch = detectSingleGeometryPatch(previousLinks, robotLinks);
        if (!patch) return;

        const applied = applyGeometryPatchInPlace({
            robotModel: currentRobot,
            patch,
            assets,
            showVisual: showVisualRef.current,
            showCollision: showCollisionRef.current,
            linkMeshMapRef,
            invalidate,
            isPatchTargetValid: () => isMountedRef.current && robotRef.current === currentRobot,
        });

        if (!applied) return;

        skipReloadCountRef.current += 1;
        setRobotVersion((v) => v + 1);
        setError(null);
    }, [robotLinks, urdfContent, assets, invalidate, isMeshPreview]);

    // Incremental path: update exactly one changed joint in-place and skip next full URDF reload.
    useEffect(() => {
        if (isMeshPreview) return;
        if (!robotJoints) return;

        const previousJoints = prevRobotJointsRef.current;
        const currentRobot = robotRef.current;
        prevRobotJointsRef.current = robotJoints;

        if (!previousJoints || !currentRobot) return;
        if (isMJCFContent(urdfContent)) return;

        const patch = detectSingleJointPatch(previousJoints, robotJoints);
        if (!patch) return;

        const applied = patchJointInPlace(currentRobot, patch, invalidate);
        if (!applied) return;

        skipReloadCountRef.current += 1;
        setRobotVersion((v) => v + 1);
        setError(null);
    }, [robotJoints, urdfContent, invalidate, isMeshPreview]);

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
            clearGroundAlignTimers();
            flushPendingRobotDispose();

            // Deep cleanup of robot resources on unmount
            if (robotRef.current) {
                disposeRobotObject(robotRef.current);
                robotRef.current = null;
            }
        };
    }, [clearGroundAlignTimers, disposeRobotObject, flushPendingRobotDispose]);

    useEffect(() => {
        if (!robot) return;

        scheduleGroundAlignment(robot);

        return () => {
            clearGroundAlignTimers();
        };
    }, [clearGroundAlignTimers, robot, robotVersion, scheduleGroundAlignment, showCollision, showVisual]);

    // Load robot with proper cleanup and abort handling
    useEffect(() => {
        if (!urdfContent) return;
        if (skipReloadCountRef.current > 0) {
            skipReloadCountRef.current -= 1;
            return;
        }

        // Create abort controller for this load
        const abortController = { aborted: false };
        loadAbortRef.current = abortController;

        const loadRobot = async () => {
            try {
                // NOTE: We do NOT cleanup the previous robot here immediately.
                // We wait until the new robot is ready to avoid flickering/rendering disposed objects.

                let robotModel: THREE.Object3D | null = null;
                const isMJCFAsset = isMJCFContent(urdfContent);

                const finalizeLoadedRobot = (loadedRobot: THREE.Object3D) => {
                    if (abortController.aborted || !isMountedRef.current) {
                        if (robotRef.current !== loadedRobot) {
                            disposeObject3D(loadedRobot, true, SHARED_MATERIALS);
                        }
                        return;
                    }

                    if (!isMJCFAsset) {
                        const materials = parseURDFMaterials(urdfContent);
                        try {
                            applyURDFMaterials(loadedRobot, materials);
                        } finally {
                            disposeTempMaterialMap(materials);
                        }

                    }

                    enhanceMaterials(loadedRobot);

                    const newLinkMeshMap = new Map<string, THREE.Mesh[]>();

                    loadedRobot.traverse((child: any) => {
                        let parentLink: any = null;
                        let current = child;
                        while (current) {
                            if (current.isURDFLink || (loadedRobot as any).links?.[current.name]) {
                                parentLink = current;
                                break;
                            }
                            current = current.parent;
                        }

                        if (child.isURDFCollider) {
                            child.visible = showCollisionRef.current;
                            if (parentLink) {
                                markCollisionObject(child, parentLink.name);
                            } else {
                                child.traverse((inner: any) => {
                                    if (!inner.isMesh) return;
                                    inner.userData.isCollisionMesh = true;
                                    inner.material = collisionBaseMaterial;
                                    inner.renderOrder = 999;
                                });
                            }
                            child.traverse((inner: any) => {
                                if (!inner.isMesh) return;

                                inner.userData.isCollisionMesh = true;
                                if (parentLink) {
                                    inner.userData.parentLinkName = parentLink.name;
                                    const key = `${parentLink.name}:collision`;
                                    if (!newLinkMeshMap.has(key)) {
                                        newLinkMeshMap.set(key, []);
                                    }
                                    newLinkMeshMap.get(key)!.push(inner);
                                }
                            });
                            return;
                        }

                        if (!child.isMesh || child.userData.isCollisionMesh) {
                            return;
                        }

                        let isVisual = false;
                        let checkParent = child.parent;
                        while (checkParent) {
                            if (checkParent.isURDFCollider) {
                                break;
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
                    });

                    const nextJointAngles = initialJointAnglesRef.current;
                    if (nextJointAngles && (loadedRobot as any).joints) {
                        Object.entries(nextJointAngles).forEach(([jointName, angle]) => {
                            const joint = (loadedRobot as any).joints?.[jointName];
                            if (!isSingleDofJoint(joint) || typeof angle !== 'number') {
                                return;
                            }

                            joint.setJointValue?.(angle);
                        });
                        loadedRobot.updateMatrixWorld(true);
                    }

                    const groundPlaneOffset = useUIStore.getState().groundPlaneOffset;
                    offsetRobotToGround(loadedRobot, groundPlaneOffset);

                    const previousRobot = robotRef.current;

                    linkMeshMapRef.current = newLinkMeshMap;
                    robotRef.current = loadedRobot;
                    setRobot(loadedRobot);
                    setRobotVersion((v) => v + 1);
                    setError(null);
                    invalidate();
                    scheduleGroundAlignment(loadedRobot);

                    if (previousRobot && previousRobot !== loadedRobot) {
                        schedulePreviousRobotDispose(previousRobot);
                    }

                    onRobotLoaded?.(loadedRobot);
                };

                // Check if content is MJCF (MuJoCo XML)
                if (isMJCFAsset) {
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
                        if (!robotModel) return;
                        finalizeLoadedRobot(robotModel);
                    };
                    // Use new local URDFLoader
                    const loader = new URDFLoader(manager);
                    loader.parseCollision = true;
                    loader.parseVisual = true;
                    // Fix: loader.loadMeshCb expects 3 args (path, manager, done)
                    loader.loadMeshCb = createMeshLoader(assets, manager, urdfDir);
                    loader.packages = '';

                    const loadCompletionKey = '__urdf_studio_robot_finalize__';
                    manager.itemStart(loadCompletionKey);
                    try {
                        const cleanContent = preprocessURDFForLoader(urdfContent);
                        robotModel = loader.parse(cleanContent);

                        const fullRobotState = parseURDF(urdfContent);
                        if (fullRobotState && fullRobotState.joints && (robotModel as any).joints) {
                            Object.entries((robotModel as any).joints).forEach(([name, joint]: [string, any]) => {
                                const parsedJoint = fullRobotState.joints[name];
                                if (parsedJoint && parsedJoint.limit) {
                                    if (!joint.limit) joint.limit = {};
                                    joint.limit.effort = parsedJoint.limit.effort;
                                    joint.limit.velocity = parsedJoint.limit.velocity;
                                    if (joint.limit.lower === undefined) joint.limit.lower = parsedJoint.limit.lower;
                                    if (joint.limit.upper === undefined) joint.limit.upper = parsedJoint.limit.upper;
                                }
                            });
                        }

                        if (abortController.aborted) {
                            if (robotModel) {
                                disposeObject3D(robotModel, true, SHARED_MATERIALS);
                            }
                            return;
                        }
                    } finally {
                        manager.itemEnd(loadCompletionKey);
                    }

                    return;
                }

                if (robotModel && isMountedRef.current) {
                    finalizeLoadedRobot(robotModel);
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
            clearGroundAlignTimers();

            // NOTE: We do NOT dispose robotRef.current here.
            // We allow the old robot to persist until the new one is ready, 
            // or until the component unmounts (handled by the separate useEffect).
        };
    }, [assets, clearGroundAlignTimers, invalidate, onRobotLoaded, scheduleGroundAlignment, urdfContent]);

    return {
        robot,
        error,
        robotVersion,
        robotRef,
        linkMeshMapRef
    };
}
