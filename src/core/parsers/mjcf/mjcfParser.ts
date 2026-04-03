/**
 * MJCF (MuJoCo XML) Parser
 * Parses MuJoCo XML format and converts to RobotState
 */

import * as THREE from 'three';
import { RobotState, UrdfLink, UrdfJoint, DEFAULT_LINK, DEFAULT_JOINT, GeometryType, JointType, UrdfVisual } from '@/types';
import { computeLinkWorldMatrices, createRobotClosedLoopConstraint, resolveLinkKey } from '@/core/robot';
import { looksLikeMJCFDocument, type MJCFCompilerSettings, type MJCFHfield, type MJCFMaterial, type MJCFMesh, type MJCFTexture } from './mjcfUtils';
import { assignMJCFBodyGeomRoles, classifyMJCFGeom } from './mjcfGeomClassification';
import {
    clearParsedMJCFModelCache,
    normalizeMultiJointBodies,
    parseMJCFModel,
    type MJCFModelConnectConstraint,
    type ParsedMJCFModel,
} from './mjcfModel';

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
    className?: string;
    classQName?: string;
    type: string;
    size?: number[];
    mass?: number;
    mesh?: string;
    hfield?: string;
    material?: string;
    rgba?: number[];
    hasExplicitRgba?: boolean;
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
    ref?: number;
    pos?: { x: number, y: number, z: number };
    limited?: boolean;
    damping?: number;
    frictionloss?: number;
    armature?: number;
    actuatorForceRange?: [number, number];
    actuatorForceLimited?: boolean;
}

interface MJCFActuator {
    name: string;
    type: string;
    joint?: string;
    ctrlrange?: [number, number];
    forcerange?: [number, number];
    gear?: number[];
}

interface MJCFInertial {
    mass: number;
    pos: { x: number, y: number, z: number };
    quat?: { w: number, x: number, y: number, z: number };
    diaginertia?: { ixx: number, iyy: number, izz: number };
    fullinertia?: number[]; // ixx iyy izz ixy ixz iyz
}

function buildHfieldDimensions(
    hfieldAsset: MJCFHfield | undefined,
    geomSize: number[] | undefined,
): { x: number; y: number; z: number } {
    const size = hfieldAsset?.size && hfieldAsset.size.length >= 4
        ? hfieldAsset.size
        : (geomSize && geomSize.length >= 4
            ? [geomSize[0] ?? 1, geomSize[1] ?? 1, geomSize[2] ?? 0, geomSize[3] ?? 0] as [number, number, number, number]
            : undefined);

    if (!size) {
        return { x: 1, y: 1, z: 0 };
    }

    return {
        x: (size[0] ?? 1) * 2,
        y: (size[1] ?? 1) * 2,
        z: (size[2] ?? 0) + (size[3] ?? 0),
    };
}

const tempRPYQuaternion = new THREE.Quaternion();
const tempRPYEuler = new THREE.Euler(0, 0, 0, 'ZYX');

function convertJointType(mjcfType: string, range?: [number, number], limited?: boolean): JointType {
    switch (mjcfType.toLowerCase()) {
        case 'hinge': return limited === false || !range ? JointType.CONTINUOUS : JointType.REVOLUTE;
        case 'slide': return JointType.PRISMATIC;
        case 'ball': return JointType.BALL;
        case 'free': return JointType.FLOATING;
        default: return JointType.FIXED;
    }
}

function convertGeomType(mjcfType: string): GeometryType {
    switch (mjcfType.toLowerCase()) {
        case 'box': return GeometryType.BOX;
        case 'plane': return GeometryType.PLANE;
        case 'sphere': return GeometryType.SPHERE;
        case 'cylinder': return GeometryType.CYLINDER;
        case 'capsule': return GeometryType.CAPSULE;
        case 'ellipsoid': return GeometryType.ELLIPSOID;
        case 'hfield': return GeometryType.HFIELD;
        case 'sdf': return GeometryType.SDF;
        case 'mesh': return GeometryType.MESH;
        default: return GeometryType.NONE;
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
    if (onlyChild.joints.length > 0) {
        return true;
    }

    if (isNonZeroPosition(onlyChild.pos)) {
        return true;
    }

    const rootRotation = onlyChild.euler || toRPYObjectFromQuat(onlyChild.quat);
    return !!rootRotation && (
        Math.abs(rootRotation.r) > 1e-9
        || Math.abs(rootRotation.p) > 1e-9
        || Math.abs(rootRotation.y) > 1e-9
    );
}

function convertAngle(value: number, settings: MJCFCompilerSettings): number {
    return settings.angleUnit === 'degree'
        ? value * (Math.PI / 180)
        : value;
}

function convertJointRange(
    range: [number, number] | undefined,
    _mjcfType: string | undefined,
    _settings: MJCFCompilerSettings,
): [number, number] | undefined {
    return range;
}

function toEffortMagnitude(range: [number, number] | undefined): number | undefined {
    if (!range) {
        return undefined;
    }

    const lower = range[0];
    const upper = range[1];
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
        return undefined;
    }

    return Math.max(Math.abs(lower), Math.abs(upper));
}

function pickMaxDefined(values: Array<number | undefined>): number | undefined {
    let maxValue: number | undefined;
    values.forEach((value) => {
        if (value == null || !Number.isFinite(value)) {
            return;
        }

        maxValue = maxValue == null ? value : Math.max(maxValue, value);
    });

    return maxValue;
}

function resolveJointMechanicalRange(
    joint: MJCFJointDef | undefined,
    jointType: JointType,
): [number, number] | undefined {
    if (!joint?.range) {
        return undefined;
    }

    if (jointType === JointType.CONTINUOUS || jointType === JointType.BALL || joint.limited === false) {
        return undefined;
    }

    return joint.range;
}

function resolveJointEffortLimit(
    joint: MJCFJointDef | undefined,
    actuators: MJCFActuator[] | undefined,
): number {
    if (joint?.actuatorForceLimited !== false) {
        const jointActuatorForce = toEffortMagnitude(joint?.actuatorForceRange);
        if (jointActuatorForce != null) {
            return jointActuatorForce;
        }
    }

    const actuatorForce = pickMaxDefined(
        (actuators || []).map((actuator) => toEffortMagnitude(actuator.forcerange)),
    );
    if (actuatorForce != null) {
        return actuatorForce;
    }

    const motorControlLimit = pickMaxDefined(
        (actuators || [])
            .filter((actuator) => actuator.type.toLowerCase() === 'motor')
            .map((actuator) => toEffortMagnitude(actuator.ctrlrange)),
    );
    return motorControlLimit ?? 0;
}

function buildImportedJointLimit(
    jointType: JointType,
    range: [number, number] | undefined,
    effort: number,
    velocity = 0,
): UrdfJoint['limit'] | undefined {
    if (jointType === JointType.FIXED || jointType === JointType.FLOATING || jointType === JointType.BALL) {
        return undefined;
    }

    return {
        lower: range?.[0] as UrdfJoint['limit']['lower'],
        upper: range?.[1] as UrdfJoint['limit']['upper'],
        effort,
        velocity,
    };
}

function resolveJointInitialAngle(
    joint: MJCFJointDef | undefined,
    jointType: JointType,
): number | undefined {
    if (!joint || !Number.isFinite(joint.ref)) {
        return undefined;
    }

    if (
        jointType === JointType.REVOLUTE
        || jointType === JointType.CONTINUOUS
        || jointType === JointType.PRISMATIC
    ) {
        return joint.ref;
    }

    return undefined;
}

function createEmptyLinkInertial(): UrdfLink['inertial'] {
    return {
        mass: 0,
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
    };
}

function getGeomMassCenter(geom: MJCFGeom): { x: number, y: number, z: number } {
    if (geom.pos) {
        return geom.pos;
    }

    if (geom.fromto && geom.fromto.length >= 6) {
        return {
            x: ((geom.fromto[0] ?? 0) + (geom.fromto[3] ?? 0)) / 2,
            y: ((geom.fromto[1] ?? 0) + (geom.fromto[4] ?? 0)) / 2,
            z: ((geom.fromto[2] ?? 0) + (geom.fromto[5] ?? 0)) / 2,
        };
    }

    return { x: 0, y: 0, z: 0 };
}

function rgbaToHexColor(rgba: number[]): string | null {
    if (rgba.length < 3) {
        return null;
    }

    const [r, g, b, a] = rgba;
    if (![r, g, b].every((value) => Number.isFinite(value))) {
        return null;
    }

    const toHexChannel = (value: number): string => (
        Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0')
    );

    const rgbHex = `${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
    if (!Number.isFinite(a) || a >= 0.999) {
        return `#${rgbHex}`;
    }

    return `#${rgbHex}${toHexChannel(a)}`;
}

function deriveGeomMassInertial(geoms: MJCFGeom[]): UrdfLink['inertial'] | null {
    const massGeoms = geoms.filter((geom) => typeof geom.mass === 'number'
        && Number.isFinite(geom.mass)
        && (geom.mass ?? 0) > 0);

    if (massGeoms.length === 0) {
        return null;
    }

    const totalMass = massGeoms.reduce((sum, geom) => sum + (geom.mass ?? 0), 0);
    if (!Number.isFinite(totalMass) || totalMass <= 0) {
        return null;
    }

    const weightedCenter = massGeoms.reduce((sum, geom) => {
        const mass = geom.mass ?? 0;
        const center = getGeomMassCenter(geom);
        return {
            x: sum.x + center.x * mass,
            y: sum.y + center.y * mass,
            z: sum.z + center.z * mass,
        };
    }, { x: 0, y: 0, z: 0 });

    const centerOfMass = {
        x: weightedCenter.x / totalMass,
        y: weightedCenter.y / totalMass,
        z: weightedCenter.z / totalMass,
    };

    const inertia = massGeoms.reduce((sum, geom) => {
        const mass = geom.mass ?? 0;
        const center = getGeomMassCenter(geom);
        const dx = center.x - centerOfMass.x;
        const dy = center.y - centerOfMass.y;
        const dz = center.z - centerOfMass.z;

        return {
            ixx: sum.ixx + mass * (dy * dy + dz * dz),
            ixy: sum.ixy - mass * dx * dy,
            ixz: sum.ixz - mass * dx * dz,
            iyy: sum.iyy + mass * (dx * dx + dz * dz),
            iyz: sum.iyz - mass * dy * dz,
            izz: sum.izz + mass * (dx * dx + dy * dy),
        };
    }, { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 });

    return {
        mass: totalMass,
        origin: {
            xyz: centerOfMass,
            rpy: { r: 0, p: 0, y: 0 },
        },
        inertia,
    };
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

    tempRPYQuaternion.set(quat.x, quat.y, quat.z, quat.w).normalize();
    tempRPYEuler.setFromQuaternion(tempRPYQuaternion, 'ZYX');

    return {
        r: tempRPYEuler.x,
        p: tempRPYEuler.y,
        y: tempRPYEuler.z,
    };
}

function toRPYObjectFromEulerTuple(
    tuple: [number, number, number] | undefined,
    settings: MJCFCompilerSettings,
): { r: number, p: number, y: number } | undefined {
    if (!tuple) {
        return undefined;
    }

    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        convertAngle(tuple[0] ?? 0, settings),
        convertAngle(tuple[1] ?? 0, settings),
        convertAngle(tuple[2] ?? 0, settings),
    ));

    return toRPYObjectFromQuat({
        w: quaternion.w,
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
    });
}

function isNonZeroPosition(position: { x: number, y: number, z: number } | undefined): boolean {
    if (!position) {
        return false;
    }

    return Math.abs(position.x) > 1e-9
        || Math.abs(position.y) > 1e-9
        || Math.abs(position.z) > 1e-9;
}

function subtractLocalOffset(
    position: { x: number, y: number, z: number } | undefined,
    localOffset: { x: number, y: number, z: number } | null,
): { x: number, y: number, z: number } | undefined {
    if (!position) {
        return undefined;
    }

    if (!localOffset) {
        return position;
    }

    return {
        x: position.x - localOffset.x,
        y: position.y - localOffset.y,
        z: position.z - localOffset.z,
    };
}

function rotateLocalOffsetToParentFrame(
    localOffset: { x: number, y: number, z: number } | null,
    rotation: { r: number, p: number, y: number } | undefined,
): { x: number, y: number, z: number } | null {
    if (!localOffset) {
        return null;
    }

    if (!rotation) {
        return localOffset;
    }

    const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rotation.r, rotation.p, rotation.y, 'ZYX'),
    );
    const rotated = new THREE.Vector3(localOffset.x, localOffset.y, localOffset.z)
        .applyQuaternion(quaternion);

    return {
        x: rotated.x,
        y: rotated.y,
        z: rotated.z,
    };
}

function toParserBody(sharedBody: any, settings: MJCFCompilerSettings): MJCFBody {
    return {
        name: sharedBody.name,
        pos: toPositionObject(sharedBody.pos),
        euler: toRPYObjectFromEulerTuple(sharedBody.euler, settings),
        quat: toQuatObject(sharedBody.quat),
        geoms: (sharedBody.geoms || []).map((geom: any) => ({
            name: geom.sourceName || geom.name,
            className: geom.className,
            classQName: geom.classQName,
            type: geom.type,
            size: geom.size,
            mass: typeof geom.mass === 'number' ? geom.mass : undefined,
            mesh: geom.mesh,
            hfield: geom.hfield,
            material: geom.material,
            rgba: geom.rgba,
            hasExplicitRgba: geom.hasExplicitRgba,
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
            range: convertJointRange(joint.range, joint.type, settings),
            ref: typeof joint.ref === 'number' ? joint.ref : undefined,
            pos: joint.pos ? toPositionObject(joint.pos) : undefined,
            limited: typeof joint.limited === 'boolean' ? joint.limited : undefined,
            damping: typeof joint.damping === 'number' ? joint.damping : undefined,
            frictionloss: typeof joint.frictionloss === 'number' ? joint.frictionloss : undefined,
            armature: typeof joint.armature === 'number' ? joint.armature : undefined,
            actuatorForceRange: joint.actuatorForceRange,
            actuatorForceLimited: typeof joint.actuatorForceLimited === 'boolean' ? joint.actuatorForceLimited : undefined,
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

function toParserActuatorMap(sharedActuatorMap: Map<string, any[]> | undefined): Map<string, MJCFActuator[]> {
    const actuatorMap = new Map<string, MJCFActuator[]>();
    if (!sharedActuatorMap) {
        return actuatorMap;
    }

    sharedActuatorMap.forEach((actuators, jointName) => {
        actuatorMap.set(jointName, (actuators || []).map((actuator) => ({
            name: actuator.name,
            type: actuator.type,
            joint: actuator.joint,
            ctrlrange: actuator.ctrlrange,
            forcerange: actuator.forcerange,
            gear: actuator.gear,
        })));
    });

    return actuatorMap;
}

function buildClosedLoopConstraints(
    robot: Pick<RobotState, 'links' | 'joints' | 'rootLinkId'>,
    connectConstraints: MJCFModelConnectConstraint[],
): RobotState['closedLoopConstraints'] {
    if (connectConstraints.length === 0) {
        return undefined;
    }

    const linkWorldMatrices = computeLinkWorldMatrices(robot);
    const closedLoopConstraints = connectConstraints.flatMap((constraint) => {
        const linkAId = resolveLinkKey(robot.links, constraint.body1);
        const linkBId = resolveLinkKey(robot.links, constraint.body2);

        if (!linkAId || !linkBId) {
            return [];
        }

        const linkAMatrix = linkWorldMatrices[linkAId];
        const linkBMatrix = linkWorldMatrices[linkBId];
        if (!linkAMatrix || !linkBMatrix) {
            return [];
        }

        const anchorLocalA = {
            x: constraint.anchor[0] ?? 0,
            y: constraint.anchor[1] ?? 0,
            z: constraint.anchor[2] ?? 0,
        };
        const anchorWorldVector = new THREE.Vector3(anchorLocalA.x, anchorLocalA.y, anchorLocalA.z)
            .applyMatrix4(linkAMatrix);
        const anchorLocalBVector = anchorWorldVector.clone().applyMatrix4(linkBMatrix.clone().invert());

        return [
            createRobotClosedLoopConstraint(
                constraint.name || `mjcf-connect-${constraint.body1}-${constraint.body2}`,
                linkAId,
                linkBId,
                anchorLocalA,
                {
                    x: anchorLocalBVector.x,
                    y: anchorLocalBVector.y,
                    z: anchorLocalBVector.z,
                },
                {
                    x: anchorWorldVector.x,
                    y: anchorWorldVector.y,
                    z: anchorWorldVector.z,
                },
                {
                    format: 'mjcf',
                    body1Name: constraint.body1,
                    body2Name: constraint.body2,
                },
            ),
        ];
    });

    return closedLoopConstraints.length > 0 ? closedLoopConstraints : undefined;
}

function buildMjcfInspectionContext(parsedModel: ParsedMJCFModel): NonNullable<RobotState['inspectionContext']> {
    const bodiesWithSites: NonNullable<RobotState['inspectionContext']>['mjcf']['bodiesWithSites'] = [];
    let siteCount = 0;

    const visitBody = (body: ParsedMJCFModel['worldBody']): void => {
        const bodySites = body.sites || [];
        if (bodySites.length > 0) {
            bodiesWithSites.push({
                bodyId: body.name,
                siteCount: bodySites.length,
                siteNames: bodySites.map((site) => site.name),
            });
            siteCount += bodySites.length;
        }

        (body.children || []).forEach(visitBody);
    };

    visitBody(parsedModel.worldBody);

    const tendonActuatorNamesByTendon = new Map<string, string[]>();
    parsedModel.tendonActuators.forEach((actuator) => {
        if (!actuator.tendon) {
            return;
        }

        const names = tendonActuatorNamesByTendon.get(actuator.tendon) || [];
        names.push(actuator.name);
        tendonActuatorNamesByTendon.set(actuator.tendon, names);
    });

    return {
        sourceFormat: 'mjcf',
        mjcf: {
            siteCount,
            tendonCount: parsedModel.tendonMap.size,
            tendonActuatorCount: parsedModel.tendonActuators.length,
            bodiesWithSites,
            tendons: Array.from(parsedModel.tendonMap.values()).map((tendon) => ({
                name: tendon.name,
                type: tendon.type,
                limited: tendon.limited,
                range: tendon.range,
                attachmentRefs: tendon.attachments
                    .map((attachment) => attachment.ref || attachment.sidesite)
                    .filter((value): value is string => typeof value === 'string' && value.length > 0),
                actuatorNames: tendonActuatorNamesByTendon.get(tendon.name) || [],
            })),
        },
    };
}

// Convert parsed MJCF to RobotState
function mjcfToRobotState(
    robotName: string,
    bodies: MJCFBody[],
    meshMap: Map<string, MJCFMesh>,
    hfieldMap: Map<string, MJCFHfield>,
    materialMap: Map<string, MJCFMaterial>,
    textureMap: Map<string, MJCFTexture>,
    actuatorMap: Map<string, MJCFActuator[]>,
): RobotState {
    const links: Record<string, UrdfLink> = {};
    const joints: Record<string, UrdfJoint> = {};
    const materials: NonNullable<RobotState['materials']> = {};
    let rootLinkId = '';
    let linkCounter = 0;

    function resolveGeomMaterialState(geom: MJCFGeom): { color?: string; texture?: string } | null {
        const materialDef = geom.material
            ? materialMap.get(geom.material)
            : undefined;
        const texturePath = materialDef?.texture
            ? textureMap.get(materialDef.texture)?.file
            : undefined;

        const explicitGeomRgba = geom.hasExplicitRgba && geom.rgba && geom.rgba.length >= 3
            ? geom.rgba
            : undefined;
        const materialRgba = materialDef?.rgba && materialDef.rgba.length >= 3
            ? materialDef.rgba
            : undefined;
        const inheritedGeomRgba = geom.rgba && geom.rgba.length >= 3
            ? geom.rgba
            : undefined;
        const resolvedRgba = explicitGeomRgba
            ?? materialRgba
            ?? inheritedGeomRgba;
        const resolvedColor = resolvedRgba
            ? rgbaToHexColor(resolvedRgba) || undefined
            : undefined;

        // MJCF textures use white as the neutral color multiplier when rgba is absent.
        const neutralTextureColor = texturePath ? '#ffffff' : undefined;
        const color = resolvedColor ?? neutralTextureColor;

        if (!color && !texturePath) {
            return null;
        }

        return {
            ...(color ? { color } : {}),
            ...(texturePath ? { texture: texturePath } : {}),
        };
    }

    function assignLinkMaterial(linkId: string, geom: MJCFGeom | null | undefined): void {
        if (!geom) {
            return;
        }

        const materialState = resolveGeomMaterialState(geom);
        if (!materialState) {
            return;
        }

        materials[linkId] = materialState;
    }

    function buildImplicitFixedJointId(parentLinkId: string, childLinkId: string): string {
        const baseId = `${parentLinkId}_to_${childLinkId}`;
        let candidate = baseId;
        let suffix = 2;

        while (joints[candidate]) {
            candidate = `${baseId}_${suffix++}`;
        }

        return candidate;
    }

    function processGeometry(
        geom: MJCFGeom,
        linkFrameOffsetLocal: { x: number, y: number, z: number } | null = null,
    ): UrdfVisual {
        const result: UrdfVisual = { ...DEFAULT_LINK.visual };
        const convertedType = convertGeomType(geom.type);
        const hasExplicitPrimitiveParams = Boolean(
            (geom.size && geom.size.length > 0)
            || (geom.fromto && geom.fromto.length >= 6),
        );
        const isMeshBackedPrimitiveWithoutResolvedFit = Boolean(
            geom.mesh
            && !hasExplicitPrimitiveParams
            && (
                convertedType === GeometryType.BOX
                || convertedType === GeometryType.SPHERE
                || convertedType === GeometryType.PLANE
                || convertedType === GeometryType.ELLIPSOID
                || convertedType === GeometryType.CYLINDER
                || convertedType === GeometryType.CAPSULE
            ),
        );
        result.type = convertedType === GeometryType.NONE && geom.mesh
            ? GeometryType.MESH
            : isMeshBackedPrimitiveWithoutResolvedFit
                ? GeometryType.MESH
                : convertedType;

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

        if (result.type === GeometryType.HFIELD) {
            result.assetRef = geom.hfield;
            const hfieldAsset = geom.hfield ? hfieldMap.get(geom.hfield) : undefined;
            if (hfieldAsset) {
                result.mjcfHfield = {
                    name: hfieldAsset.name,
                    file: hfieldAsset.file,
                    contentType: hfieldAsset.contentType,
                    nrow: hfieldAsset.nrow,
                    ncol: hfieldAsset.ncol,
                    size: hfieldAsset.size
                        ? {
                            radiusX: hfieldAsset.size[0] ?? 0,
                            radiusY: hfieldAsset.size[1] ?? 0,
                            elevationZ: hfieldAsset.size[2] ?? 0,
                            baseZ: hfieldAsset.size[3] ?? 0,
                        }
                        : undefined,
                    elevation: hfieldAsset.elevation ? [...hfieldAsset.elevation] : undefined,
                };
            }
        } else if (result.type === GeometryType.SDF) {
            result.assetRef = geom.mesh;
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
                case 'plane':
                    result.dimensions = {
                        x: ((geom.size[0] ?? 1) || 1) * 2,
                        y: ((geom.size[1] ?? geom.size[0] ?? 1) || 1) * 2,
                        z: 0,
                    };
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
                case 'hfield':
                    result.dimensions = buildHfieldDimensions(
                        geom.hfield ? hfieldMap.get(geom.hfield) : undefined,
                        geom.size,
                    );
                    break;
                case 'sdf':
                    result.dimensions = {
                        x: geom.size[0] || 1,
                        y: (geom.size[1] ?? geom.size[0]) || 1,
                        z: (geom.size[2] ?? 0) || 0,
                    };
                    break;
                default:
                    result.dimensions = { x: geom.size[0] || 0.1, y: 0, z: 0 };
                    break;
            }
        } else if (!geom.mesh) {
            switch (result.type) {
                case GeometryType.PLANE:
                    result.dimensions = { x: 2, y: 2, z: 0 };
                    break;
                case GeometryType.HFIELD:
                    result.dimensions = buildHfieldDimensions(
                        geom.hfield ? hfieldMap.get(geom.hfield) : undefined,
                        geom.size,
                    );
                    break;
                case GeometryType.SDF:
                    result.dimensions = { x: 1, y: 1, z: 0 };
                    break;
                default:
                    result.dimensions = { x: 0.05, y: 0, z: 0 };
                    break;
            }
        }

        const materialState = resolveGeomMaterialState(geom);
        if (materialState?.color) {
            result.color = materialState.color;
        }

        const geomRotation = toRPYObjectFromQuat(geom.quat);
        const hasMeaningfulRotation = !!geomRotation && (
            Math.abs(geomRotation.r) > 1e-9
            || Math.abs(geomRotation.p) > 1e-9
            || Math.abs(geomRotation.y) > 1e-9
        );
        const geomPosition = subtractLocalOffset(geom.pos, linkFrameOffsetLocal);

        if (geomPosition || hasMeaningfulRotation) {
            result.origin = {
                xyz: {
                    x: geomPosition?.x ?? 0,
                    y: geomPosition?.y ?? 0,
                    z: geomPosition?.z ?? 0,
                },
                rpy: geomRotation || { r: 0, p: 0, y: 0 }
            };
        }
        
        return result;
    }

    function processBody(body: MJCFBody, parentLinkId: string | null): string {
        const mainLinkId = body.name || `link_${linkCounter++}`;
        const bodyRotation = body.euler || toRPYObjectFromQuat(body.quat) || { r: 0, p: 0, y: 0 };
        const mjcfJoint = body.joints[0];
        const linkFrameOffsetLocal = isNonZeroPosition(mjcfJoint?.pos)
            ? {
                x: mjcfJoint!.pos!.x,
                y: mjcfJoint!.pos!.y,
                z: mjcfJoint!.pos!.z,
            }
            : null;
        const jointFrameOffsetInParent = rotateLocalOffsetToParentFrame(linkFrameOffsetLocal, bodyRotation);

        // 1. Classify Geoms
        const visuals: MJCFGeom[] = [];
        const collisions: MJCFGeom[] = [];
        const geomRoles = assignMJCFBodyGeomRoles(body.geoms);

        geomRoles.forEach(({ geom, renderVisual, renderCollision }) => {
            if (renderVisual) {
                visuals.push(geom);
            }
            if (renderCollision) {
                collisions.push(geom);
            }
        });

        // 2. Pair Visuals and Collisions
        interface LinkPair { visual: MJCFGeom | null, collision: MJCFGeom | null }
        const pairs: LinkPair[] = [];
        const usedCollisions = new Set<MJCFGeom>();

        // Pass 1: Match visuals to collisions (by mesh name match)
        for (const vis of visuals) {
            // Plain MuJoCo geoms often act as both visual and collision. Once such a geom has
            // already been consumed as the collision partner for an earlier visual geom, emitting
            // it again as a standalone visual creates the exact regression seen on HighTorque:
            // a base-link collision box gets duplicated into the visual tree.
            const visClassification = classifyMJCFGeom(vis);
            if (visClassification.isCollision && usedCollisions.has(vis)) {
                continue;
            }

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
            visual = processGeometry(mainPair.visual, linkFrameOffsetLocal);
            assignLinkMaterial(mainLinkId, mainPair.visual);
        } else {
            visual.type = GeometryType.NONE;
        }

        let collision = { ...DEFAULT_LINK.collision };
        if (mainPair.collision) {
            const colGeo = processGeometry(mainPair.collision, linkFrameOffsetLocal);
            collision = {
                ...collision,
                type: colGeo.type,
                dimensions: colGeo.dimensions,
                origin: colGeo.origin,
                meshPath: colGeo.meshPath,
                assetRef: colGeo.assetRef,
            };
            if (colGeo.color) {
                collision.color = colGeo.color;
            }
        } else {
            collision.type = GeometryType.NONE;
        }

        let linkInertial = createEmptyLinkInertial();

        if (body.inertial) {
            const { mass, pos: inertialPos, quat: inertialQuat, diaginertia, fullinertia } = body.inertial;
            const linkInertialPos = subtractLocalOffset(inertialPos, linkFrameOffsetLocal) || { x: 0, y: 0, z: 0 };
            linkInertial.mass = mass;
            linkInertial.origin = {
                xyz: { x: linkInertialPos.x, y: linkInertialPos.y, z: linkInertialPos.z },
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
        } else {
            const derivedGeomMassInertial = deriveGeomMassInertial(body.geoms);
            if (derivedGeomMassInertial) {
                if (linkFrameOffsetLocal) {
                    derivedGeomMassInertial.origin.xyz = subtractLocalOffset(
                        derivedGeomMassInertial.origin.xyz,
                        linkFrameOffsetLocal,
                    ) || { x: 0, y: 0, z: 0 };
                }
                linkInertial = derivedGeomMassInertial;
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
            const jointId = mjcfJoint?.name || buildImplicitFixedJointId(parentLinkId, mainLinkId);
            const jointType = mjcfJoint
                ? convertJointType(mjcfJoint.type, mjcfJoint.range, mjcfJoint.limited)
                : JointType.FIXED;
            const jointMechanicalRange = resolveJointMechanicalRange(mjcfJoint, jointType);
            const jointEffort = resolveJointEffortLimit(mjcfJoint, actuatorMap.get(jointId));
            const jointLimit = buildImportedJointLimit(jointType, jointMechanicalRange, jointEffort, 0);
            const jointInitialAngle = resolveJointInitialAngle(mjcfJoint, jointType);
            const jointOrigin = {
                xyz: {
                    x: body.pos.x + (jointFrameOffsetInParent?.x ?? 0),
                    y: body.pos.y + (jointFrameOffsetInParent?.y ?? 0),
                    z: body.pos.z + (jointFrameOffsetInParent?.z ?? 0),
                },
                rpy: bodyRotation,
            };
            const joint: UrdfJoint = {
                ...DEFAULT_JOINT,
                id: jointId,
                name: jointId,
                type: jointType,
                parentLinkId: parentLinkId,
                childLinkId: mainLinkId,
                origin: jointOrigin,
                axis: mjcfJoint?.axis || { x: 0, y: 0, z: 1 },
                limit: jointLimit as UrdfJoint['limit'],
                dynamics: {
                    ...DEFAULT_JOINT.dynamics,
                    damping: mjcfJoint?.damping ?? DEFAULT_JOINT.dynamics.damping,
                    friction: mjcfJoint?.frictionloss ?? DEFAULT_JOINT.dynamics.friction,
                },
                ...(jointInitialAngle != null ? { referencePosition: jointInitialAngle } : {}),
                ...(jointInitialAngle != null ? { angle: jointInitialAngle } : {}),
                hardware: {
                    ...DEFAULT_JOINT.hardware,
                    armature: mjcfJoint?.armature ?? DEFAULT_JOINT.hardware.armature,
                },
            };
            joints[jointId] = joint;
        } else {
            rootLinkId = mainLinkId;
        }

        let virtualLinkIndex = 1;

        // Process remaining pairs (Pairs 1..N)
        for (let i = 1; i < pairs.length; i++) {
            const pair = pairs[i];

            // Preserve additional collision-only geoms on the same link. The rest of the stack
            // already understands `collisionBodies`, so emitting synthetic links here only makes
            // URDF exports drift away from the source MJCF topology.
            if (!pair.visual && pair.collision) {
                const colGeo = processGeometry(pair.collision, linkFrameOffsetLocal);
                const extraCollision: UrdfLink['collision'] = {
                    ...DEFAULT_LINK.collision,
                    type: colGeo.type,
                    dimensions: colGeo.dimensions,
                    origin: colGeo.origin,
                    meshPath: colGeo.meshPath,
                    assetRef: colGeo.assetRef,
                };

                if (colGeo.color) {
                    extraCollision.color = colGeo.color;
                }

                mainLink.collisionBodies = [
                    ...(mainLink.collisionBodies || []),
                    extraCollision,
                ];
                continue;
            }

            const subLinkId = `${mainLinkId}_geom_${virtualLinkIndex++}`;
            const subJointId = buildImplicitFixedJointId(mainLinkId, subLinkId);

            // Virtual Link Visual
            let subVisual = { ...DEFAULT_LINK.visual };
            if (pair.visual) {
                subVisual = processGeometry(pair.visual, linkFrameOffsetLocal);
                assignLinkMaterial(subLinkId, pair.visual);
            } else {
                subVisual.type = GeometryType.NONE;
            }

            // Virtual Link Collision
            let subCollision = { ...DEFAULT_LINK.collision };
            if (pair.collision) {
                const colGeo = processGeometry(pair.collision, linkFrameOffsetLocal);
                subCollision = {
                    ...subCollision,
                    type: colGeo.type,
                    dimensions: colGeo.dimensions,
                    origin: colGeo.origin,
                    meshPath: colGeo.meshPath,
                    assetRef: colGeo.assetRef,
                };
                if (colGeo.color) {
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
                axis: { x: 0, y: 0, z: 1 },
                limit: undefined as UrdfJoint['limit'],
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
        ...(Object.keys(materials).length > 0 ? { materials } : {}),
        selection: { type: 'link', id: rootLinkId }
    };
}

export function parseMJCF(xmlContent: string): RobotState | null {
    try {
        const parsedModel = parseMJCFModel(xmlContent);
        if (!parsedModel) {
            return null;
        }

        const parserModelWorldBody = normalizeMultiJointBodies(parsedModel.worldBody);
        const worldBody = toParserBody(parserModelWorldBody, parsedModel.compilerSettings);
        const rootBodies = shouldPreserveSyntheticWorldRoot(worldBody)
            ? [worldBody]
            : worldBody.children;

        const robot = mjcfToRobotState(
            parsedModel.modelName,
            rootBodies,
            parsedModel.meshMap,
            parsedModel.hfieldMap,
            parsedModel.materialMap,
            parsedModel.textureMap,
            toParserActuatorMap(parsedModel.actuatorMap),
        );

        robot.closedLoopConstraints = buildClosedLoopConstraints(robot, parsedModel.connectConstraints);
        robot.inspectionContext = buildMjcfInspectionContext(parsedModel);
        return robot;
    } finally {
        // The parsed model cache is only needed within a single top-level parse
        // call; retaining entire MJCF model trees across file switches keeps
        // old robots alive in memory for no runtime benefit.
        clearParsedMJCFModelCache(xmlContent);
    }
}

export function isMJCF(xmlContent: string): boolean {
    return looksLikeMJCFDocument(xmlContent);
}
