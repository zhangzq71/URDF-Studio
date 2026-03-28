import * as THREE from 'three';
import { stackCoincidentVisualRoots } from '@/core/loaders/visualMeshStacking';
import { findAssetByPath } from '@/core/loaders';
import { createMatteMaterial } from '@/core/utils/materialFactory';
import { createThreeColorFromSRGB } from '@/core/utils/color.ts';
import { COLLISION_OVERLAY_RENDER_ORDER, createCollisionOverlayMaterial } from '@/shared/utils/three/collisionOverlayMaterial';
import { URDFCollider, URDFVisual } from '../urdf/loader/URDFClasses';
import { createGeometryMesh, type MJCFMeshCache } from './mjcfGeometry';
import { assignMJCFBodyGeomRoles } from './mjcfGeomClassification';
import { applyRgbaToMesh, createJointAxisHelper, createLinkAxesHelper } from './mjcfRenderHelpers';
import type { MJCFCompilerSettings, MJCFMesh, MJCFMaterial, MJCFTexture } from './mjcfUtils';
import { createMainThreadYieldController } from '@/core/utils/yieldToMainThread';

export interface MJCFHierarchyGeom {
    name?: string;
    className?: string;
    classQName?: string;
    type: string;
    size?: number[];
    mesh?: string;
    rgba?: [number, number, number, number];
    hasExplicitRgba?: boolean;
    pos?: [number, number, number];
    quat?: [number, number, number, number];
    fromto?: number[];
    contype?: number;
    conaffinity?: number;
    group?: number;
    material?: string;
}

export interface MJCFHierarchyJoint {
    name: string;
    type: string;
    axis?: [number, number, number];
    range?: [number, number];
    ref?: number;
    pos?: [number, number, number];
}

export interface MJCFHierarchyBody {
    name: string;
    pos: [number, number, number];
    quat?: [number, number, number, number];
    euler?: [number, number, number];
    geoms: MJCFHierarchyGeom[];
    joints: MJCFHierarchyJoint[];
    children: MJCFHierarchyBody[];
}

interface BuildMJCFHierarchyOptions {
    bodies: MJCFHierarchyBody[];
    rootGroup: THREE.Group;
    meshMap: Map<string, MJCFMesh>;
    assets: Record<string, string>;
    meshCache: MJCFMeshCache;
    compilerSettings: MJCFCompilerSettings;
    materialMap: Map<string, MJCFMaterial>;
    textureMap: Map<string, MJCFTexture>;
    sourceFileDir?: string;
    onProgress?: (progress: { processedGeoms: number; totalGeoms: number }) => void;
    yieldIfNeeded?: () => Promise<void>;
}

export interface MJCFHierarchyResult {
    linksMap: Record<string, THREE.Object3D>;
    jointsMap: Record<string, THREE.Object3D>;
}

function restackLinkVisualRoots(linkTarget: THREE.Object3D): void {
    const visualRoots = linkTarget.children
        .filter((child: any) => child?.isURDFVisual)
        .map((child, index) => ({
            root: child,
            stableId: child.userData?.visualOrder ?? index,
        }));

    if (visualRoots.length < 2) {
        return;
    }

    stackCoincidentVisualRoots(visualRoots);
}

function restackRobotVisualRoots(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);

    const visualRoots: Array<{ root: THREE.Object3D; stableId: number }> = [];
    let visualIndex = 0;
    root.traverse((child: any) => {
        if (!child?.isURDFVisual) {
            return;
        }

        visualRoots.push({
            root: child,
            stableId: visualIndex++,
        });
    });

    if (visualRoots.length < 2) {
        return;
    }

    stackCoincidentVisualRoots(visualRoots, { space: 'world' });
}

function countBodyGeoms(body: MJCFHierarchyBody): number {
    return body.geoms.length + body.children.reduce((sum, child) => sum + countBodyGeoms(child), 0);
}

function mjcfQuatToThreeQuat(mjcfQuat: [number, number, number, number]): THREE.Quaternion {
    return new THREE.Quaternion(mjcfQuat[1], mjcfQuat[2], mjcfQuat[3], mjcfQuat[0]);
}

function convertAngle(value: number, settings: MJCFCompilerSettings): number {
    if (settings.angleUnit === 'degree') {
        return value * (Math.PI / 180);
    }
    return value;
}

function convertJointLimitValue(value: number, _jointType: string, _settings: MJCFCompilerSettings): number {
    return value;
}

function resolveRuntimeJointType(joint: MJCFHierarchyJoint): 'revolute' | 'continuous' | 'prismatic' | 'ball' | 'floating' {
    if (joint.type === 'hinge') {
        return joint.range ? 'revolute' : 'continuous';
    }

    if (joint.type === 'slide') {
        return 'prismatic';
    }

    if (joint.type === 'ball') {
        return 'ball';
    }

    if (joint.type === 'free') {
        return 'floating';
    }

    return 'continuous';
}

function resolveInitialRuntimeJointValue(joint: MJCFHierarchyJoint): number | null {
    if (!Number.isFinite(joint.ref)) {
        return null;
    }

    if (joint.type === 'hinge' || joint.type === 'slide') {
        return joint.ref ?? null;
    }

    return null;
}

const textureLoader = new THREE.TextureLoader();
const texturePromiseCache = new Map<string, Promise<THREE.Texture | null>>();

function getTexturePromise(assetUrl: string): Promise<THREE.Texture | null> {
    const cached = texturePromiseCache.get(assetUrl);
    if (cached) {
        return cached;
    }

    const promise = textureLoader.loadAsync(assetUrl)
        .then((texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            return texture;
        })
        .catch((error) => {
            console.error(`[MJCFLoader] Failed to load texture asset: ${assetUrl}`, error);
            return null;
        });

    texturePromiseCache.set(assetUrl, promise);
    return promise;
}

function cloneTextureWithMaterialSettings(
    baseTexture: THREE.Texture,
    materialDef: MJCFMaterial,
): THREE.Texture {
    const texture = baseTexture.clone();
    texture.source = baseTexture.source;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    if (materialDef.texrepeat && materialDef.texrepeat.length >= 2) {
        texture.repeat.set(materialDef.texrepeat[0] ?? 1, materialDef.texrepeat[1] ?? 1);
    } else {
        texture.repeat.set(1, 1);
    }

    texture.needsUpdate = true;
    return texture;
}

async function loadMaterialTexture(
    materialDef: MJCFMaterial,
    textureMap: Map<string, MJCFTexture>,
    assets: Record<string, string>,
    sourceFileDir: string,
): Promise<THREE.Texture | null> {
    if (!materialDef.texture) {
        return null;
    }

    const textureDef = textureMap.get(materialDef.texture);
    if (!textureDef?.file) {
        return null;
    }

    const assetUrl = findAssetByPath(textureDef.file, assets, sourceFileDir);
    if (!assetUrl) {
        console.error(`[MJCFLoader] Texture asset not found: ${textureDef.file}`);
        return null;
    }

    const texture = await getTexturePromise(assetUrl);
    if (!texture) {
        return null;
    }

    return cloneTextureWithMaterialSettings(texture, materialDef);
}

async function applyMaterialAssetToMesh(
    mesh: THREE.Object3D,
    materialDef: MJCFMaterial,
    textureMap: Map<string, MJCFTexture>,
    assets: Record<string, string>,
    sourceFileDir: string,
    materialName?: string,
    inheritedGeomRgba?: [number, number, number, number],
    hasExplicitGeomRgba: boolean = false,
): Promise<void> {
    const hasAuthoredRgba = Array.isArray(materialDef.rgba) && materialDef.rgba.length >= 3;
    const rgba = materialDef.rgba || (materialDef.texture ? [1, 1, 1, 1] : [0.8, 0.8, 0.8, 1]);
    const r = Math.max(0, Math.min(1, rgba[0] ?? 0.8));
    const g = Math.max(0, Math.min(1, rgba[1] ?? 0.8));
    const b = Math.max(0, Math.min(1, rgba[2] ?? 0.8));
    const inheritedAlphaOverride = !hasExplicitGeomRgba
        && Array.isArray(inheritedGeomRgba)
        && inheritedGeomRgba.length >= 4
        && Number.isFinite(inheritedGeomRgba[3])
        && (inheritedGeomRgba[3] ?? 1) < 0.999
        ? inheritedGeomRgba[3]
        : null;
    const alpha = Math.max(0, Math.min(1, inheritedAlphaOverride ?? (rgba[3] ?? 1)));
    const texture = await loadMaterialTexture(materialDef, textureMap, assets, sourceFileDir);
    const roughness = materialDef.shininess != null
        ? Math.max(0, Math.min(1, 1 - materialDef.shininess))
        : undefined;
    const metalness = materialDef.reflectance != null
        ? Math.max(0, Math.min(1, materialDef.reflectance))
        : undefined;
    const emission = materialDef.emission != null
        ? Math.max(0, Math.min(1, materialDef.emission))
        : undefined;

    mesh.traverse((child: any) => {
        if (!child.isMesh) return;
        const preferDoubleSide = alpha < 1 || Boolean(child.userData?.mjcfPreferDoubleSide);
        child.material = createMatteMaterial({
            color: createThreeColorFromSRGB(r, g, b),
            opacity: alpha,
            transparent: alpha < 1,
            side: preferDoubleSide ? THREE.DoubleSide : THREE.FrontSide,
            map: texture,
            name: materialName || materialDef.name || 'mjcf_material_asset',
            preserveExactColor: hasAuthoredRgba || Boolean(texture),
        });
        if (roughness != null) {
            child.material.roughness = roughness;
        }
        if (metalness != null) {
            child.material.metalness = metalness;
        }
        if (emission != null) {
            child.material.emissive = new THREE.Color(r, g, b);
            child.material.emissiveIntensity = emission;
        }
        child.material.needsUpdate = true;
        child.castShadow = true;
        child.receiveShadow = true;
    });
}

function objectHasVisibleMaterial(mesh: THREE.Object3D): boolean {
    let hasVisibleMaterial = false;

    mesh.traverse((child: any) => {
        if (hasVisibleMaterial || !child?.isMesh) {
            return;
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        hasVisibleMaterial = materials.some((material: THREE.Material | undefined) => (
            !material || (material.opacity ?? 1) > 1e-6
        ));
    });

    return hasVisibleMaterial;
}

export async function buildMJCFHierarchy(options: BuildMJCFHierarchyOptions): Promise<MJCFHierarchyResult> {
    const {
        bodies,
        rootGroup,
        meshMap,
        assets,
        meshCache,
        compilerSettings,
        materialMap,
        textureMap,
        sourceFileDir = '',
        onProgress,
        yieldIfNeeded = createMainThreadYieldController(),
    } = options;
    const linksMap: Record<string, THREE.Object3D> = {};
    const jointsMap: Record<string, THREE.Object3D> = {};
    const totalGeoms = bodies.reduce((sum, body) => sum + countBodyGeoms(body), 0);
    let processedGeoms = 0;

    if (totalGeoms > 0) {
        onProgress?.({ processedGeoms, totalGeoms });
    }

    async function addGeomsToGroup(
        geoms: MJCFHierarchyGeom[],
        targetGroup: THREE.Group
    ): Promise<void> {
        const geomRoles = assignMJCFBodyGeomRoles(geoms);

        for (const [geomIndex, { geom, renderVisual: isVisualGeom, renderCollision: isCollisionGeom }] of geomRoles.entries()) {
            try {
                const mesh = await createGeometryMesh(geom, meshMap, assets, meshCache, sourceFileDir);
                if (!mesh) continue;

                const materialDef = geom.material
                    ? materialMap.get(geom.material)
                    : undefined;
                if (materialDef) {
                    await applyMaterialAssetToMesh(
                        mesh,
                        materialDef,
                        textureMap,
                        assets,
                        sourceFileDir,
                        geom.material,
                        geom.rgba,
                        Boolean(geom.hasExplicitRgba),
                    );
                }

                const shouldApplyGeomRgba = Boolean(
                    geom.rgba
                    && (geom.hasExplicitRgba || !materialDef),
                );
                if (shouldApplyGeomRgba) {
                    applyRgbaToMesh(mesh, geom.rgba);
                }

                mesh.name = geom.name || geom.type || 'geom';
                const shouldRenderVisualMesh = objectHasVisibleMaterial(mesh);

                const applyGeomTransformToContainer = (container: THREE.Object3D) => {
                    if (geom.pos) {
                        container.position.set(geom.pos[0], geom.pos[1], geom.pos[2]);
                    }

                    if (geom.quat) {
                        container.quaternion.copy(mjcfQuatToThreeQuat(geom.quat));
                    }
                };

                if (isVisualGeom && shouldRenderVisualMesh) {
                    const visualGroup = new URDFVisual();
                    visualGroup.name = geom.name || `visual_${geom.type || 'geom'}`;
                    visualGroup.urdfName = visualGroup.name;
                    visualGroup.userData.isVisualGroup = true;
                    visualGroup.userData.visualOrder = geomIndex;
                    applyGeomTransformToContainer(visualGroup);

                    // Mark all meshes in this object as visual
                    mesh.userData.isVisual = true;
                    mesh.userData.isVisualMesh = true;
                    mesh.traverse((child: any) => {
                        if (child.isMesh) {
                            child.userData.isVisual = true;
                            child.userData.isVisualMesh = true;
                        }
                    });
                    visualGroup.add(mesh);
                    targetGroup.add(visualGroup);
                }

                if (isCollisionGeom) {
                    // Clone if already added to visual, otherwise use directly
                    const collisionMesh = isVisualGeom ? mesh.clone(true) : mesh;
                    const collisionGroup = new URDFCollider();
                    collisionGroup.name = geom.name || `collision_${geom.type || 'geom'}`;
                    collisionGroup.urdfName = collisionGroup.name;
                    collisionGroup.userData.isCollisionGroup = true;
                    collisionGroup.visible = false;
                    applyGeomTransformToContainer(collisionGroup);

                    collisionMesh.userData.isCollisionMesh = true;
                    collisionMesh.userData.isCollision = true;
                    collisionMesh.userData.isVisual = false;
                    collisionMesh.userData.isVisualMesh = false;

                    // Apply semi-transparent material for collision visualization
                    collisionMesh.traverse((child: any) => {
                        if (child.isMesh) {
                            child.userData.isCollisionMesh = true;
                            child.userData.isCollision = true;
                            child.userData.isVisual = false;
                            child.userData.isVisualMesh = false;
                            child.material = createCollisionOverlayMaterial('mjcf_collision');
                            child.renderOrder = COLLISION_OVERLAY_RENDER_ORDER;
                        }
                    });

                    collisionGroup.add(collisionMesh);
                    targetGroup.add(collisionGroup);
                }

                // If neither visual nor collision classification matches, default to visual
                if (!isVisualGeom && !isCollisionGeom) {
                    const visualGroup = new URDFVisual();
                    visualGroup.name = geom.name || `visual_${geom.type || 'geom'}`;
                    visualGroup.urdfName = visualGroup.name;
                    visualGroup.userData.isVisualGroup = true;
                    visualGroup.userData.visualOrder = geomIndex;
                    applyGeomTransformToContainer(visualGroup);
                    visualGroup.add(mesh);
                    targetGroup.add(visualGroup);
                }
            } finally {
                processedGeoms += 1;
                onProgress?.({ processedGeoms, totalGeoms });
                await yieldIfNeeded();
            }
        }
    }

    function applyBodyTransform(target: THREE.Group, body: MJCFHierarchyBody): void {
        target.position.set(body.pos[0], body.pos[1], body.pos[2]);

        if (body.quat) {
            target.quaternion.copy(mjcfQuatToThreeQuat(body.quat));
            return;
        }

        if (body.euler) {
            const ex = convertAngle(body.euler[0], compilerSettings);
            const ey = convertAngle(body.euler[1], compilerSettings);
            const ez = convertAngle(body.euler[2], compilerSettings);
            target.rotation.set(ex, ey, ez);
        }
    }

    function createLinkGroup(bodyName: string): THREE.Group {
        const linkGroup = new THREE.Group();
        linkGroup.name = bodyName;
        (linkGroup as any).isURDFLink = true;
        (linkGroup as any).type = 'URDFLink';
        linksMap[bodyName] = linkGroup;

        const linkAxes = createLinkAxesHelper(0.1);
        linkAxes.visible = false;
        linkGroup.add(linkAxes);

        return linkGroup;
    }

    function createJointNode(
        joint: MJCFHierarchyJoint,
        bodyName: string,
        bodyOffsetGroup: THREE.Group,
        jointIndex: number,
    ): { jointNode: THREE.Group; attachmentGroup: THREE.Group } {
        const jointPos: [number, number, number] = joint.pos || [0, 0, 0];
        const jointNode = new THREE.Group();
        jointNode.name = joint.name || `joint_${bodyName}_${jointIndex}`;
        (jointNode as any).isURDFJoint = true;
        (jointNode as any).type = 'URDFJoint';
        (jointNode as any).jointType = resolveRuntimeJointType(joint);
        (jointNode as any).referencePosition = Number.isFinite(joint.ref) ? joint.ref : 0;
        jointNode.position.set(jointPos[0], jointPos[1], jointPos[2]);
        (jointNode as any).bodyOffsetGroup = bodyOffsetGroup;

        const axisVec = joint.axis
            ? new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize()
            : new THREE.Vector3(0, 0, 1);
        (jointNode as any).axis = axisVec;

        if (joint.range && joint.type !== 'free') {
            const lowerLimit = convertJointLimitValue(joint.range[0], joint.type, compilerSettings);
            const upperLimit = convertJointLimitValue(joint.range[1], joint.type, compilerSettings);
            (jointNode as any).limit = { lower: lowerLimit, upper: upperLimit };
        }

        (jointNode as any).angle = 0;
        (jointNode as any).jointQuaternion = new THREE.Quaternion();
        (jointNode as any).setJointValue = function(value: number) {
            this.angle = value;
            this.jointValue = value;
            const referencePosition = Number.isFinite(this.referencePosition) ? this.referencePosition : 0;
            const motionValue = value - referencePosition;
            const axis = this.axis ? this.axis.clone().normalize() : new THREE.Vector3(0, 0, 1);

            if (this.jointType === 'revolute' || this.jointType === 'continuous') {
                if (!this.userData) this.userData = {};
                if (!this.userData.initialQuaternion) {
                    this.userData.initialQuaternion = this.quaternion.clone();
                }

                const rotationQuat = new THREE.Quaternion();
                rotationQuat.setFromAxisAngle(axis, motionValue);

                this.quaternion.copy(this.userData.initialQuaternion);
                this.quaternion.multiply(rotationQuat);
                this.updateMatrixWorld(true);
            } else if (this.jointType === 'prismatic') {
                if (!this.userData) this.userData = {};
                if (!this.userData.initialPosition) {
                    this.userData.initialPosition = this.position.clone();
                }
                this.position.copy(this.userData.initialPosition);
                this.position.addScaledVector(axis, motionValue);
                this.updateMatrixWorld(true);
            }
        };
        (jointNode as any).setJointQuaternion = function(value: { x: number; y: number; z: number; w: number }) {
            if (!this.userData) this.userData = {};
            if (!this.userData.initialQuaternion) {
                this.userData.initialQuaternion = this.quaternion.clone();
            }

            const rotationQuat = new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize();
            this.jointQuaternion.copy(rotationQuat);
            this.jointValue = rotationQuat;
            this.quaternion.copy(this.userData.initialQuaternion);
            this.quaternion.multiply(rotationQuat);
            this.updateMatrixWorld(true);
        };

        const axisHelper = createJointAxisHelper(axisVec);
        axisHelper.visible = false;
        jointNode.add(axisHelper);

        const debugAxes = new THREE.AxesHelper(0.1);
        debugAxes.name = '__debug_joint_axes__';
        debugAxes.visible = false;
        (debugAxes as any).userData = { isGizmo: true, isDebugAxes: true };
        jointNode.add(debugAxes);

        jointsMap[jointNode.name] = jointNode;

        const attachmentGroup = new THREE.Group();
        attachmentGroup.name = `geom_compensation_${bodyName}_${jointIndex}`;
        attachmentGroup.position.set(-jointPos[0], -jointPos[1], -jointPos[2]);
        jointNode.add(attachmentGroup);

        const initialJointValue = resolveInitialRuntimeJointValue(joint);
        if (initialJointValue != null) {
            (jointNode as any).setJointValue(initialJointValue);
        }

        return { jointNode, attachmentGroup };
    }

    async function buildBody(body: MJCFHierarchyBody, parentGroup: THREE.Group): Promise<void> {
        const bodyOffsetGroup = new THREE.Group();
        bodyOffsetGroup.name = `body_offset_${body.name}`;
        applyBodyTransform(bodyOffsetGroup, body);
        parentGroup.add(bodyOffsetGroup);

        let attachmentGroup: THREE.Group = bodyOffsetGroup;
        body.joints
            .filter((joint) => joint.type !== 'fixed')
            .forEach((joint, jointIndex) => {
                const jointLayer = createJointNode(joint, body.name, bodyOffsetGroup, jointIndex);
                attachmentGroup.add(jointLayer.jointNode);
                attachmentGroup = jointLayer.attachmentGroup;
            });

        const linkGroup = createLinkGroup(body.name);
        await addGeomsToGroup(body.geoms, linkGroup);
        restackLinkVisualRoots(linkGroup);
        attachmentGroup.add(linkGroup);

        for (const childBody of body.children) {
            await buildBody(childBody, linkGroup);
            await yieldIfNeeded();
        }
    }

    // Build all top-level bodies
    for (const body of bodies) {
        await buildBody(body, rootGroup);
        await yieldIfNeeded();
    }

    restackRobotVisualRoots(rootGroup);

    return { linksMap, jointsMap };
}
