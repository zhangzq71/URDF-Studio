import * as THREE from 'three';
import { createMatteMaterial } from '@/shared/utils/materialFactory';
import { createGeometryMesh, type MJCFMeshCache } from './mjcfGeometry';
import { applyRgbaToMesh, createJointAxisHelper, createLinkAxesHelper } from './mjcfRenderHelpers';
import type { MJCFCompilerSettings, MJCFMesh } from './mjcfUtils';

export interface MJCFHierarchyGeom {
    name?: string;
    type: string;
    size?: number[];
    mesh?: string;
    rgba?: [number, number, number, number];
    pos?: [number, number, number];
    quat?: [number, number, number, number];
    fromto?: number[];
    contype?: number;
    conaffinity?: number;
    group?: number;
}

export interface MJCFHierarchyJoint {
    name: string;
    type: string;
    axis?: [number, number, number];
    range?: [number, number];
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
}

export interface MJCFHierarchyResult {
    linksMap: Record<string, THREE.Object3D>;
    jointsMap: Record<string, THREE.Object3D>;
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

export async function buildMJCFHierarchy(options: BuildMJCFHierarchyOptions): Promise<MJCFHierarchyResult> {
    const { bodies, rootGroup, meshMap, assets, meshCache, compilerSettings } = options;
    const linksMap: Record<string, THREE.Object3D> = {};
    const jointsMap: Record<string, THREE.Object3D> = {};

    async function addGeomsToGroup(
        geoms: MJCFHierarchyGeom[],
        targetGroup: THREE.Group
    ): Promise<void> {
        // Create separate containers for visual and collision
        const visualGroup = new THREE.Group();
        visualGroup.name = 'visual';

        const collisionGroup = new THREE.Group();
        collisionGroup.name = 'collision';
        (collisionGroup as any).isURDFCollider = true;
        collisionGroup.visible = false; // Hidden by default

        for (const geom of geoms) {
            const hasGroup1 = geom.group === 1;
            const hasContype0 = geom.contype === 0 && geom.conaffinity === 0;

            // Visual: explicit group=1 with contype=0
            const isVisualGeom = hasGroup1 && hasContype0;

            // Collision: no group attribute, OR primitives without group
            // In MJCF, geoms without group are typically collision duplicates
            const isCollisionGeom = geom.group === undefined || geom.group === 0 || geom.group === 3;

            const mesh = await createGeometryMesh(geom, meshMap, assets, meshCache);
            if (!mesh) continue;

            // Apply geom position
            if (geom.pos) {
                mesh.position.set(geom.pos[0], geom.pos[1], geom.pos[2]);
            }

            // Apply geom rotation (MuJoCo quaternion: w,x,y,z)
            if (geom.quat) {
                const q = new THREE.Quaternion(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]);
                mesh.quaternion.copy(q);
            }

            if (geom.rgba) {
                applyRgbaToMesh(mesh, geom.rgba);
            }

            mesh.name = geom.name || geom.type || 'geom';

            if (isVisualGeom) {
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
            }

            if (isCollisionGeom) {
                // Log collision geom creation for debugging
                console.debug(`[MJCFLoader] Adding collision geom: type="${geom.type}", size=[${geom.size?.join(', ') || 'none'}], pos=[${geom.pos?.join(', ') || 'none'}]`);

                // Clone if already added to visual, otherwise use directly
                const collisionMesh = isVisualGeom ? mesh.clone(true) : mesh;
                collisionMesh.userData.isCollisionMesh = true;
                collisionMesh.userData.isCollision = true;

                // Apply semi-transparent material for collision visualization
                collisionMesh.traverse((child: any) => {
                    if (child.isMesh) {
                        child.userData.isCollisionMesh = true;
                        child.userData.isCollision = true;
                        const collisionMat = createMatteMaterial({
                            color: 0xa855f7,
                            opacity: 0.35,
                            transparent: true,
                            name: 'mjcf_collision'
                        });
                        // Apply depth and rendering optimizations
                        collisionMat.depthWrite = false;
                        collisionMat.depthTest = true;
                        collisionMat.polygonOffset = true;
                        collisionMat.polygonOffsetFactor = -1.0;
                        collisionMat.polygonOffsetUnits = -4.0;
                        child.material = collisionMat;
                        child.renderOrder = 999;
                    }
                });

                collisionGroup.add(collisionMesh);
            }

            // If neither visual nor collision classification matches, default to visual
            if (!isVisualGeom && !isCollisionGeom) {
                visualGroup.add(mesh);
            }
        }

        visualGroup.userData.isVisualGroup = true;
        collisionGroup.userData.isCollisionGroup = true;

        if (visualGroup.children.length > 0) {
            targetGroup.add(visualGroup);
        }
        if (collisionGroup.children.length > 0) {
            targetGroup.add(collisionGroup);
        }
    }

    async function buildBody(body: MJCFHierarchyBody, parentGroup: THREE.Group, isRootBody: boolean = false): Promise<void> {
        // Create the link group (represents the body/link) - meshes go here
        const linkGroup = new THREE.Group();
        linkGroup.name = body.name;
        (linkGroup as any).isURDFLink = true;
        (linkGroup as any).type = 'URDFLink';
        linksMap[body.name] = linkGroup;

        // Add meshes directly to linkGroup (at geom.pos)
        await addGeomsToGroup(body.geoms, linkGroup);

        // Add link coordinate axes (hidden by default, controlled by showOrigins)
        const linkAxes = createLinkAxesHelper(0.1);
        linkAxes.visible = false;
        linkGroup.add(linkAxes);

        if (isRootBody) {
            // Root body: apply body transform directly to linkGroup
            linkGroup.position.set(body.pos[0], body.pos[1], body.pos[2]);

            if (body.quat) {
                // MuJoCo quat [W,X,Y,Z] -> Three.js Quaternion(x,y,z,w)
                linkGroup.quaternion.copy(mjcfQuatToThreeQuat(body.quat));
            } else if (body.euler) {
                linkGroup.rotation.set(body.euler[0], body.euler[1], body.euler[2]);
            }

            // Add root link directly to parent
            parentGroup.add(linkGroup);

            // Process child bodies - they will create their own jointGroups
            for (const childBody of body.children) {
                await buildBodyWithJoint(childBody, linkGroup);
            }
        } else {
            // Non-root body: this should be called via buildBodyWithJoint
            // Just add to parent (jointGroup) - position is handled by jointGroup
            parentGroup.add(linkGroup);

            // Process child bodies
            for (const childBody of body.children) {
                await buildBodyWithJoint(childBody, linkGroup);
            }
        }
    }

    async function buildBodyWithJoint(childBody: MJCFHierarchyBody, parentLinkGroup: THREE.Group): Promise<void> {
        const joint = childBody.joints[0];
        const jointPos: [number, number, number] = joint?.pos || [0, 0, 0];
        const hasActiveJoint = joint && joint.type !== 'fixed';

        if (!hasActiveJoint) {
            // No active joint - create a fixed connection group (BodyOffsetGroup only)
            const bodyOffsetGroup = new THREE.Group();
            bodyOffsetGroup.name = `body_offset_${childBody.name}`;
            bodyOffsetGroup.position.set(childBody.pos[0], childBody.pos[1], childBody.pos[2]);

            if (childBody.quat) {
                // MuJoCo quat [W,X,Y,Z] -> Three.js Quaternion(x,y,z,w)
                bodyOffsetGroup.quaternion.copy(mjcfQuatToThreeQuat(childBody.quat));
            } else if (childBody.euler) {
                // Convert euler angles if in degrees
                const ex = convertAngle(childBody.euler[0], compilerSettings);
                const ey = convertAngle(childBody.euler[1], compilerSettings);
                const ez = convertAngle(childBody.euler[2], compilerSettings);
                bodyOffsetGroup.rotation.set(ex, ey, ez);
            }

            // Create link group for meshes (no joint offset needed for fixed)
            const linkGroup = new THREE.Group();
            linkGroup.name = childBody.name;
            (linkGroup as any).isURDFLink = true;
            (linkGroup as any).type = 'URDFLink';
            linksMap[childBody.name] = linkGroup;

            // Add geoms directly to link group
            await addGeomsToGroup(childBody.geoms, linkGroup);

            // Add link coordinate axes (hidden by default)
            const linkAxes = createLinkAxesHelper(0.1);
            linkAxes.visible = false;
            linkGroup.add(linkAxes);

            bodyOffsetGroup.add(linkGroup);
            parentLinkGroup.add(bodyOffsetGroup);

            // Process child bodies recursively
            for (const grandChild of childBody.children) {
                await buildBodyWithJoint(grandChild, linkGroup);
            }
            return;
        }

        // === LAYER 1: BodyOffsetGroup (BodyContainer) ===
        // Position and rotate according to childBody's transform
        const bodyOffsetGroup = new THREE.Group();
        bodyOffsetGroup.name = `body_offset_${childBody.name}`;
        bodyOffsetGroup.position.set(childBody.pos[0], childBody.pos[1], childBody.pos[2]);

        if (childBody.quat) {
            // MuJoCo quat [W,X,Y,Z] -> Three.js Quaternion(x,y,z,w)
            bodyOffsetGroup.quaternion.copy(mjcfQuatToThreeQuat(childBody.quat));
        } else if (childBody.euler) {
            // Convert euler angles if in degrees
            const ex = convertAngle(childBody.euler[0], compilerSettings);
            const ey = convertAngle(childBody.euler[1], compilerSettings);
            const ez = convertAngle(childBody.euler[2], compilerSettings);
            bodyOffsetGroup.rotation.set(ex, ey, ez);
        }

        // === LAYER 2: JointNode ===
        // This is the pivot point - all rotations happen here
        const jointNode = new THREE.Group();
        jointNode.name = joint.name || `joint_${childBody.name}`;
        (jointNode as any).isURDFJoint = true;
        (jointNode as any).type = 'URDFJoint';
        (jointNode as any).jointType = joint.type === 'hinge' ? 'revolute' :
            joint.type === 'slide' ? 'prismatic' :
            joint.type === 'ball' ? 'ball' :
            joint.type === 'free' ? 'floating' : 'continuous';

        // Position joint at joint.pos (relative to body origin)
        jointNode.position.set(jointPos[0], jointPos[1], jointPos[2]);

        // Store reference to parent BodyOffsetGroup for axis calculation
        (jointNode as any).bodyOffsetGroup = bodyOffsetGroup;

        // Joint axis: defined in Body local space (MJCF convention)
        // Default axis is Z (0, 0, 1) in MJCF
        const axisVec = joint.axis
            ? new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize()
            : new THREE.Vector3(0, 0, 1);
        (jointNode as any).axis = axisVec;

        // Joint limits (convert if in degrees)
        if (joint.range) {
            const lowerLimit = convertAngle(joint.range[0], compilerSettings);
            const upperLimit = convertAngle(joint.range[1], compilerSettings);
            (jointNode as any).limit = { lower: lowerLimit, upper: upperLimit };
        }

        // Joint angle tracking and setJointValue
        // Rotation is applied directly to JointNode's quaternion
        (jointNode as any).angle = 0;
        (jointNode as any).setJointValue = function(value: number) {
            this.angle = value;
            const axis = this.axis ? this.axis.clone().normalize() : new THREE.Vector3(0, 0, 1);

            if (this.jointType === 'revolute' || this.jointType === 'continuous') {
                // Store initial quaternion (should be identity for JointNode)
                if (!this.userData) this.userData = {};
                if (!this.userData.initialQuaternion) {
                    this.userData.initialQuaternion = this.quaternion.clone();
                }

                // Apply rotation around axis
                const rotationQuat = new THREE.Quaternion();
                rotationQuat.setFromAxisAngle(axis, value);

                this.quaternion.copy(this.userData.initialQuaternion);
                this.quaternion.multiply(rotationQuat);
                this.updateMatrixWorld(true);
            } else if (this.jointType === 'prismatic') {
                if (!this.userData) this.userData = {};
                if (!this.userData.initialPosition) {
                    this.userData.initialPosition = this.position.clone();
                }
                this.position.copy(this.userData.initialPosition);
                this.position.addScaledVector(axis, value);
                this.updateMatrixWorld(true);
            }
        };

        // Add joint axis visualization helper (hidden by default, toggled via showJointAxes)
        const axisHelper = createJointAxisHelper(axisVec);
        axisHelper.visible = false;
        jointNode.add(axisHelper);

        // Add debug AxesHelper for joint pivot (hidden by default)
        const debugAxes = new THREE.AxesHelper(0.1);
        debugAxes.name = '__debug_joint_axes__';
        debugAxes.visible = false;
        (debugAxes as any).userData = { isGizmo: true, isDebugAxes: true };
        jointNode.add(debugAxes);

        jointsMap[jointNode.name] = jointNode;

        // === LAYER 3: GeomCompensationGroup ===
        // Position = -joint.pos to pull coordinates back to Body origin
        // This ensures geoms are placed at their correct geom.pos relative to body
        const geomCompensationGroup = new THREE.Group();
        geomCompensationGroup.name = `geom_compensation_${childBody.name}`;
        geomCompensationGroup.position.set(-jointPos[0], -jointPos[1], -jointPos[2]);

        // === LAYER 4: LinkGroup (contains meshes) ===
        const linkGroup = new THREE.Group();
        linkGroup.name = childBody.name;
        (linkGroup as any).isURDFLink = true;
        (linkGroup as any).type = 'URDFLink';
        linksMap[childBody.name] = linkGroup;

        // Add geoms to link group (they will be positioned at geom.pos)
        await addGeomsToGroup(childBody.geoms, linkGroup);

        // Add link coordinate axes (hidden by default)
        const linkAxes = createLinkAxesHelper(0.1);
        linkAxes.visible = false;
        linkGroup.add(linkAxes);

        // === Assemble the hierarchy ===
        geomCompensationGroup.add(linkGroup);
        jointNode.add(geomCompensationGroup);
        bodyOffsetGroup.add(jointNode);
        parentLinkGroup.add(bodyOffsetGroup);

        // Process child bodies - they attach to the linkGroup
        for (const grandChild of childBody.children) {
            await buildBodyWithJoint(grandChild, linkGroup);
        }
    }

    // Build all top-level bodies
    for (const body of bodies) {
        await buildBody(body, rootGroup, true);
    }

    return { linksMap, jointsMap };
}
