/**
 * MJCF (MuJoCo XML) Parser
 * Parses MuJoCo XML format and converts to RobotState
 */

import * as THREE from 'three';
import { RobotState, UrdfLink, UrdfJoint, DEFAULT_LINK, DEFAULT_JOINT, GeometryType, JointType, UrdfVisual } from '@/types';
import { type MJCFCompilerSettings, type MJCFMesh } from './mjcfUtils';
import { parseMJCFModel } from './mjcfModel';

interface MJCFBody {
    name: string;
    pos: { x: number, y: number, z: number };
    euler?: { r: number, p: number, y: number };
    quat?: { w: number, x: number, y: number, z: number };
    geoms: MJCFGeom[];
    joints: MJCFJointDef[];
    inertial?: MJCFInertial;
    children: MJCFBody[];
}

interface MJCFGeom {
    name?: string;
    type: string;
    size?: number[];
    mesh?: string;
    rgba?: number[];
    pos?: { x: number, y: number, z: number };
    quat?: { w: number, x: number, y: number, z: number };
    fromto?: number[];
    contype?: number;
    conaffinity?: number;
    group?: number;
}

interface MJCFJointDef {
    name: string;
    type: string;
    axis?: { x: number, y: number, z: number };
    range?: [number, number];
    pos?: { x: number, y: number, z: number };
}

interface MJCFInertial {
    mass: number;
    pos: { x: number, y: number, z: number };
    quat?: { w: number, x: number, y: number, z: number };
    diaginertia?: { ixx: number, iyy: number, izz: number };
    fullinertia?: number[]; // ixx iyy izz ixy ixz iyz
}

const tempRPYQuaternion = new THREE.Quaternion();
const tempRPYEuler = new THREE.Euler(0, 0, 0, 'ZYX');

function convertJointType(mjcfType: string): JointType {
    switch (mjcfType.toLowerCase()) {
        case 'hinge': return JointType.REVOLUTE;
        case 'slide': return JointType.PRISMATIC;
        case 'ball': return JointType.CONTINUOUS;
        case 'free': return JointType.FLOATING;
        default: return JointType.FIXED;
    }
}

function convertGeomType(mjcfType: string): GeometryType {
    switch (mjcfType.toLowerCase()) {
        case 'box': return GeometryType.BOX;
        case 'sphere': return GeometryType.SPHERE;
        case 'cylinder': return GeometryType.CYLINDER;
        case 'capsule': return GeometryType.CAPSULE;
        case 'ellipsoid': return GeometryType.SPHERE;
        case 'mesh': return GeometryType.MESH;
        case 'plane': return GeometryType.NONE;
        default: return GeometryType.BOX;
    }
}

function hasImportableGeometry(geom: MJCFGeom): boolean {
    if (geom.mesh) {
        return true;
    }

    return convertGeomType(geom.type) !== GeometryType.NONE;
}

function shouldPreserveSyntheticWorldRoot(worldBody: MJCFBody): boolean {
    if (worldBody.inertial && worldBody.inertial.mass > 0) {
        return true;
    }

    if (worldBody.joints.length > 0) {
        return true;
    }

    if (worldBody.geoms.some(hasImportableGeometry)) {
        return true;
    }

    if (worldBody.children.length !== 1) {
        return true;
    }

    const [onlyChild] = worldBody.children;
    return onlyChild.joints.some((joint) => joint.type.toLowerCase() === 'free');
}

function convertAngle(value: number, settings: MJCFCompilerSettings): number {
    return settings.angleUnit === 'degree'
        ? value * (Math.PI / 180)
        : value;
}

function toPositionObject(tuple: [number, number, number] | undefined): { x: number, y: number, z: number } {
    return {
        x: tuple?.[0] ?? 0,
        y: tuple?.[1] ?? 0,
        z: tuple?.[2] ?? 0,
    };
}

function toQuatObject(tuple: [number, number, number, number] | undefined): { w: number, x: number, y: number, z: number } | undefined {
    if (!tuple) {
        return undefined;
    }

    return {
        w: tuple[0],
        x: tuple[1],
        y: tuple[2],
        z: tuple[3],
    };
}

function toRPYObjectFromQuat(
    quat: { w: number, x: number, y: number, z: number } | undefined,
): { r: number, p: number, y: number } | undefined {
    if (!quat) {
        return undefined;
    }

    tempRPYQuaternion.set(quat.x, quat.y, quat.z, quat.w);
    tempRPYEuler.setFromQuaternion(tempRPYQuaternion, 'ZYX');

    return {
        r: tempRPYEuler.x,
        p: tempRPYEuler.y,
        y: tempRPYEuler.z,
    };
}

function toEulerObject(
    tuple: [number, number, number] | undefined,
    settings: MJCFCompilerSettings,
): { r: number, p: number, y: number } | undefined {
    if (!tuple) {
        return undefined;
    }

    return {
        r: convertAngle(tuple[0] ?? 0, settings),
        p: convertAngle(tuple[1] ?? 0, settings),
        y: convertAngle(tuple[2] ?? 0, settings),
    };
}

function toParserBody(sharedBody: any, settings: MJCFCompilerSettings): MJCFBody {
    return {
        name: sharedBody.name,
        pos: toPositionObject(sharedBody.pos),
        euler: toEulerObject(sharedBody.euler, settings),
        quat: toQuatObject(sharedBody.quat),
        geoms: (sharedBody.geoms || []).map((geom: any) => ({
            name: geom.sourceName || geom.name,
            type: geom.type,
            size: geom.size,
            mesh: geom.mesh,
            rgba: geom.rgba,
            pos: geom.pos ? toPositionObject(geom.pos) : undefined,
            quat: toQuatObject(geom.quat),
            fromto: geom.fromto,
            contype: geom.contype,
            conaffinity: geom.conaffinity,
            group: geom.group,
        })),
        joints: (sharedBody.joints || []).map((joint: any) => ({
            name: joint.name,
            type: joint.type,
            axis: joint.axis ? toPositionObject(joint.axis) : undefined,
            range: joint.range
                ? [
                    convertAngle(joint.range[0] ?? 0, settings),
                    convertAngle(joint.range[1] ?? 0, settings),
                ] as [number, number]
                : undefined,
            pos: joint.pos ? toPositionObject(joint.pos) : undefined,
        })),
        inertial: sharedBody.inertial ? {
            mass: sharedBody.inertial.mass,
            pos: toPositionObject(sharedBody.inertial.pos),
            quat: toQuatObject(sharedBody.inertial.quat),
            diaginertia: sharedBody.inertial.diaginertia ? {
                ixx: sharedBody.inertial.diaginertia[0],
                iyy: sharedBody.inertial.diaginertia[1],
                izz: sharedBody.inertial.diaginertia[2],
            } : undefined,
            fullinertia: sharedBody.inertial.fullinertia,
        } : undefined,
        children: (sharedBody.children || []).map((child: any) => toParserBody(child, settings)),
    };
}

// Convert parsed MJCF to RobotState
function mjcfToRobotState(
    robotName: string,
    bodies: MJCFBody[],
    meshMap: Map<string, MJCFMesh>
): RobotState {
    const links: Record<string, UrdfLink> = {};
    const joints: Record<string, UrdfJoint> = {};
    let rootLinkId = '';
    let linkCounter = 0;
    let jointCounter = 0;

    function processGeometry(geom: MJCFGeom): UrdfVisual {
        const result: UrdfVisual = { ...DEFAULT_LINK.visual };
        result.type = geom.mesh ? GeometryType.MESH : convertGeomType(geom.type);

        if (geom.mesh && meshMap.has(geom.mesh)) {
            result.meshPath = meshMap.get(geom.mesh)!.file;
            const scale = meshMap.get(geom.mesh)!.scale;
            if (scale && scale.length >= 3) {
                result.dimensions = { x: scale[0], y: scale[1], z: scale[2] };
            } else {
                result.dimensions = { x: 1, y: 1, z: 1 };
            }
        } else if (geom.mesh) {
            result.meshPath = geom.mesh;
            result.dimensions = { x: 1, y: 1, z: 1 };
        }

        if (geom.size && geom.size.length > 0) {
            const geomType = geom.type?.toLowerCase() || 'sphere';
            switch (geomType) {
                case 'box':
                    result.dimensions = {
                        x: (geom.size[0] || 0.1) * 2,
                        y: ((geom.size[1] ?? geom.size[0]) || 0.1) * 2,
                        z: ((geom.size[2] ?? geom.size[0]) || 0.1) * 2
                    };
                    break;
                case 'sphere':
                    result.dimensions = { x: geom.size[0] || 0.1, y: 0, z: 0 };
                    break;
                case 'ellipsoid':
                    result.dimensions = {
                        x: geom.size[0] || 0.1,
                        y: (geom.size[1] ?? geom.size[0]) || 0.1,
                        z: (geom.size[2] ?? geom.size[0]) || 0.1
                    };
                    break;
                case 'cylinder':
                case 'capsule':
                    result.dimensions = {
                        x: geom.size[0] || 0.1,
                        y: (geom.size[1] || 0.1) * 2,
                        z: 0
                    };
                    break;
                case 'plane':
                    result.dimensions = { x: 0, y: 0, z: 0 };
                    break;
                default:
                    result.dimensions = { x: geom.size[0] || 0.1, y: 0, z: 0 };
                    break;
            }
        } else if (!geom.mesh) {
            result.dimensions = { x: 0.05, y: 0, z: 0 };
        }

        if (geom.rgba && geom.rgba.length >= 3) {
            const r = Math.round(geom.rgba[0] * 255);
            const g = Math.round(geom.rgba[1] * 255);
            const b = Math.round(geom.rgba[2] * 255);
            result.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }

        const geomRotation = toRPYObjectFromQuat(geom.quat);
        const hasMeaningfulRotation = !!geomRotation && (
            Math.abs(geomRotation.r) > 1e-9
            || Math.abs(geomRotation.p) > 1e-9
            || Math.abs(geomRotation.y) > 1e-9
        );

        if (geom.pos || hasMeaningfulRotation) {
            result.origin = {
                xyz: {
                    x: geom.pos?.x ?? 0,
                    y: geom.pos?.y ?? 0,
                    z: geom.pos?.z ?? 0,
                },
                rpy: geomRotation || { r: 0, p: 0, y: 0 }
            };
        }
        
        return result;
    }

    function processBody(body: MJCFBody, parentLinkId: string | null): string {
        const mainLinkId = body.name || `link_${linkCounter++}`;

        // 1. Classify Geoms
        const visuals: MJCFGeom[] = [];
        const collisions: MJCFGeom[] = [];

        body.geoms.forEach(geom => {
            const hasVisualGroup = geom.group === 1 || geom.group === 2;
            const hasContype0 = geom.contype === 0 && geom.conaffinity === 0;
            if (hasContype0 || hasVisualGroup) {
                visuals.push(geom);
            } else {
                collisions.push(geom);
            }
        });

        // 2. Pair Visuals and Collisions
        interface LinkPair { visual: MJCFGeom | null, collision: MJCFGeom | null }
        const pairs: LinkPair[] = [];
        const usedCollisions = new Set<MJCFGeom>();

        // Pass 1: Match visuals to collisions (by mesh name match)
        for (const vis of visuals) {
            let matchIndex = -1;
            if (vis.mesh) {
                matchIndex = collisions.findIndex(c => c.mesh === vis.mesh && !usedCollisions.has(c));
            } else if (vis.name) {
                matchIndex = collisions.findIndex(c => c.name === vis.name && !usedCollisions.has(c));
            }

            // Fallback for Main Link (index 0): if no strict match, grab first available collision
            // Only if this is the very first visual we are processing for the body
            if (matchIndex === -1 && pairs.length === 0 && collisions.length > 0 && !usedCollisions.has(collisions[0])) {
                // Check if collision[0] is also nameless/meshless or generically compatible?
                // For G1: torso (mesh) matches torso (mesh). 
                // For simple models, often 1 vis 1 col.
                matchIndex = 0; 
            }

            let col: MJCFGeom | null = null;
            if (matchIndex !== -1) {
                col = collisions[matchIndex];
                usedCollisions.add(col);
            }
            pairs.push({ visual: vis, collision: col });
        }

        // Pass 2: Remaining collisions (create collision-only links)
        for (const col of collisions) {
            if (!usedCollisions.has(col)) {
                pairs.push({ visual: null, collision: col });
            }
        }

        // 3. Create Links
        // If no pairs (empty body), create a dummy pair to generate the link
        if (pairs.length === 0) {
            pairs.push({ visual: null, collision: null });
        }

        // Process Main Link (Index 0)
        const mainPair = pairs[0];
        
        let visual = { ...DEFAULT_LINK.visual };
        if (mainPair.visual) {
            visual = processGeometry(mainPair.visual);
        } else {
            visual.type = GeometryType.NONE;
        }

        let collision = { ...DEFAULT_LINK.collision };
        if (mainPair.collision) {
            const colGeo = processGeometry(mainPair.collision);
            collision = {
                ...collision,
                type: colGeo.type,
                dimensions: colGeo.dimensions,
                origin: colGeo.origin,
                meshPath: colGeo.meshPath
            };
            if (mainPair.collision.rgba) {
                collision.color = colGeo.color;
            }
        } else {
            collision.type = GeometryType.NONE;
        }

        let linkInertial = {
            mass: 0,
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 }
        };

        if (body.inertial) {
            const { mass, pos: inertialPos, quat: inertialQuat, diaginertia, fullinertia } = body.inertial;
            linkInertial.mass = mass;
            linkInertial.origin = {
                xyz: { x: inertialPos.x, y: inertialPos.y, z: inertialPos.z },
                rpy: toRPYObjectFromQuat(inertialQuat) || { r: 0, p: 0, y: 0 }
            };
            if (fullinertia && fullinertia.length >= 6) {
                linkInertial.inertia = {
                    ixx: fullinertia[0], iyy: fullinertia[1], izz: fullinertia[2],
                    ixy: fullinertia[3], ixz: fullinertia[4], iyz: fullinertia[5]
                };
            } else if (diaginertia) {
                linkInertial.inertia = {
                    ixx: diaginertia.ixx,
                    ixy: 0,
                    ixz: 0,
                    iyy: diaginertia.iyy,
                    iyz: 0,
                    izz: diaginertia.izz,
                };
            }
        }

        const mainLink: UrdfLink = {
            ...DEFAULT_LINK,
            id: mainLinkId,
            name: body.name,
            visual,
            collision,
            inertial: linkInertial
        };
        links[mainLinkId] = mainLink;

        // Create Main Joint
        if (parentLinkId) {
            const mjcfJoint = body.joints[0];
            const jointId = mjcfJoint?.name || `joint_${jointCounter++}`;
            const joint: UrdfJoint = {
                ...DEFAULT_JOINT,
                id: jointId,
                name: jointId,
                type: mjcfJoint ? convertJointType(mjcfJoint.type) : JointType.FIXED,
                parentLinkId: parentLinkId,
                childLinkId: mainLinkId,
                origin: {
                    xyz: { x: body.pos.x, y: body.pos.y, z: body.pos.z },
                    rpy: body.euler || { r: 0, p: 0, y: 0 }
                },
                axis: mjcfJoint?.axis || { x: 0, y: 0, z: 1 }
            };
            if (mjcfJoint?.range) {
                joint.limit = {
                    lower: mjcfJoint.range[0],
                    upper: mjcfJoint.range[1],
                    effort: 100,
                    velocity: 1
                };
            }
            joints[jointId] = joint;
        } else {
            rootLinkId = mainLinkId;
        }

        // Process Virtual Links (Pairs 1..N)
        for (let i = 1; i < pairs.length; i++) {
            const pair = pairs[i];
            const subLinkId = `${mainLinkId}_geom_${i}`;
            const subJointId = `fixed_${subLinkId}`;

            // Virtual Link Visual
            let subVisual = { ...DEFAULT_LINK.visual };
            if (pair.visual) {
                subVisual = processGeometry(pair.visual);
            } else {
                subVisual.type = GeometryType.NONE;
            }

            // Virtual Link Collision
            let subCollision = { ...DEFAULT_LINK.collision };
            if (pair.collision) {
                const colGeo = processGeometry(pair.collision);
                subCollision = {
                    ...subCollision,
                    type: colGeo.type,
                    dimensions: colGeo.dimensions,
                    origin: colGeo.origin,
                    meshPath: colGeo.meshPath
                };
                if (pair.collision.rgba) {
                    subCollision.color = colGeo.color;
                }
            } else {
                subCollision.type = GeometryType.NONE;
            }

            const subLink: UrdfLink = {
                ...DEFAULT_LINK,
                id: subLinkId,
                name: subLinkId,
                visual: subVisual,
                collision: subCollision,
                inertial: { ...DEFAULT_LINK.inertial, mass: 0 } // Massless virtual link
            };
            links[subLinkId] = subLink;

            // Fixed Joint connecting Main -> Sub
            const subJoint: UrdfJoint = {
                ...DEFAULT_JOINT,
                id: subJointId,
                name: subJointId,
                type: JointType.FIXED,
                parentLinkId: mainLinkId,
                childLinkId: subLinkId,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                axis: { x: 0, y: 0, z: 1 }
            };
            joints[subJointId] = subJoint;
        }

        body.children.forEach(child => processBody(child, mainLinkId));
        return mainLinkId;
    }

    bodies.forEach((body, index) => {
        const linkId = processBody(body, index === 0 ? null : rootLinkId);
        if (index === 0) rootLinkId = linkId;
    });

    if (!rootLinkId) {
        rootLinkId = 'base_link';
        links[rootLinkId] = { ...DEFAULT_LINK, id: rootLinkId, name: 'base_link' };
    }

    return {
        name: robotName,
        links,
        joints,
        rootLinkId,
        selection: { type: 'link', id: rootLinkId }
    };
}

export function parseMJCF(xmlContent: string): RobotState | null {
    const parsedModel = parseMJCFModel(xmlContent);
    if (!parsedModel) {
        return null;
    }

    const worldBody = toParserBody(parsedModel.worldBody, parsedModel.compilerSettings);
    const rootBodies = shouldPreserveSyntheticWorldRoot(worldBody)
        ? [worldBody]
        : worldBody.children;

    return mjcfToRobotState(
        parsedModel.modelName,
        rootBodies,
        parsedModel.meshMap,
    );
}

export function isMJCF(xmlContent: string): boolean {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');
        return doc.querySelector('mujoco') !== null;
    } catch {
        return false;
    }
}
