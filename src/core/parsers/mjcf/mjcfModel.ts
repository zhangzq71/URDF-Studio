import * as THREE from 'three';
import {
    parseCompilerSettings,
    parseMaterialAssets,
    parseMeshAssets,
    parseMJCFDefaults,
    parseNumbers,
    parsePosAsTuple,
    parseQuatAsTuple,
    resolveDefaultClassQName,
    resolveElementAttributes,
    type MJCFCompilerSettings,
    type MJCFDefaultsRegistry,
    type MJCFMaterial,
    type MJCFMesh,
} from './mjcfUtils';

export interface MJCFModelGeom {
    name?: string;
    sourceName?: string;
    type: string;
    size?: number[];
    mesh?: string;
    material?: string;
    rgba?: [number, number, number, number];
    pos?: [number, number, number];
    quat?: [number, number, number, number];
    fromto?: number[];
    contype?: number;
    conaffinity?: number;
    group?: number;
}

export interface MJCFModelJoint {
    name: string;
    sourceName?: string;
    type: string;
    axis?: [number, number, number];
    range?: [number, number];
    pos?: [number, number, number];
}

export interface MJCFModelInertial {
    mass: number;
    pos: [number, number, number];
    quat?: [number, number, number, number];
    diaginertia?: [number, number, number];
    fullinertia?: [number, number, number, number, number, number];
}

export interface MJCFModelBody {
    name: string;
    sourceName?: string;
    pos: [number, number, number];
    euler?: [number, number, number];
    quat?: [number, number, number, number];
    geoms: MJCFModelGeom[];
    joints: MJCFModelJoint[];
    inertial?: MJCFModelInertial;
    children: MJCFModelBody[];
}

export interface ParsedMJCFModel {
    modelName: string;
    compilerSettings: MJCFCompilerSettings;
    defaults: MJCFDefaultsRegistry;
    meshMap: Map<string, MJCFMesh>;
    materialMap: Map<string, MJCFMaterial>;
    worldBody: MJCFModelBody;
}

function directChildren(element: Element, tagName: string): Element[] {
    const normalizedTagName = tagName.toLowerCase();
    return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === normalizedTagName);
}

function directChild(element: Element, tagName: string): Element | null {
    return directChildren(element, tagName)[0] || null;
}

function directChildrenByTagNames(element: Element, tagNames: string[]): Element[] {
    const normalized = new Set(tagNames.map((tagName) => tagName.toLowerCase()));
    return Array.from(element.children).filter((child) => normalized.has(child.tagName.toLowerCase()));
}

function parseEulerAsTuple(str: string | null): [number, number, number] | undefined {
    const nums = parseNumbers(str);
    if (nums.length === 0) {
        return undefined;
    }

    return [
        nums.length > 0 ? nums[0] : 0,
        nums.length > 1 ? nums[1] : 0,
        nums.length > 2 ? nums[2] : 0,
    ];
}

interface MJCFLocalTransform {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
}

function convertAngle(value: number, angleUnit: 'radian' | 'degree'): number {
    return angleUnit === 'degree' ? THREE.MathUtils.degToRad(value) : value;
}

function eulerToQuatTuple(
    euler: [number, number, number] | undefined,
    angleUnit: 'radian' | 'degree',
): [number, number, number, number] | undefined {
    if (!euler) {
        return undefined;
    }

    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        convertAngle(euler[0] ?? 0, angleUnit),
        convertAngle(euler[1] ?? 0, angleUnit),
        convertAngle(euler[2] ?? 0, angleUnit),
    ));
    return [quaternion.w, quaternion.x, quaternion.y, quaternion.z];
}

function mjcfQuatToThreeQuat(quat?: [number, number, number, number]): THREE.Quaternion {
    if (!quat) {
        return new THREE.Quaternion();
    }

    return new THREE.Quaternion(quat[1], quat[2], quat[3], quat[0]);
}

function threeQuatToMJCFQuat(quaternion: THREE.Quaternion): [number, number, number, number] {
    return [quaternion.w, quaternion.x, quaternion.y, quaternion.z];
}

function createLocalTransform(
    pos: [number, number, number] | undefined,
    quat: [number, number, number, number] | undefined,
): MJCFLocalTransform {
    return {
        position: new THREE.Vector3(pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0),
        quaternion: mjcfQuatToThreeQuat(quat),
    };
}

function composeTransforms(parent: MJCFLocalTransform, local: MJCFLocalTransform): MJCFLocalTransform {
    return {
        position: local.position.clone().applyQuaternion(parent.quaternion).add(parent.position),
        quaternion: parent.quaternion.clone().multiply(local.quaternion),
    };
}

function isIdentityTransform(transform: MJCFLocalTransform | undefined): boolean {
    if (!transform) {
        return true;
    }

    return transform.position.lengthSq() <= 1e-12
        && Math.abs(transform.quaternion.x) <= 1e-12
        && Math.abs(transform.quaternion.y) <= 1e-12
        && Math.abs(transform.quaternion.z) <= 1e-12
        && Math.abs(transform.quaternion.w - 1) <= 1e-12;
}

function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
    return [vector.x, vector.y, vector.z];
}

function transformFromTo(fromto: number[], transform: MJCFLocalTransform): number[] {
    if (fromto.length < 6) {
        return fromto;
    }

    const start = new THREE.Vector3(fromto[0], fromto[1], fromto[2])
        .applyQuaternion(transform.quaternion)
        .add(transform.position);
    const end = new THREE.Vector3(fromto[3], fromto[4], fromto[5])
        .applyQuaternion(transform.quaternion)
        .add(transform.position);
    return [start.x, start.y, start.z, end.x, end.y, end.z];
}

function parseGeomElement(
    geomElement: Element,
    defaults: MJCFDefaultsRegistry,
    activeClassQName: string | undefined,
    compilerSettings: MJCFCompilerSettings,
    bodyPath: string,
    geomIndex: number,
    inheritedTransform?: MJCFLocalTransform,
): MJCFModelGeom {
    const geomAttrs = resolveElementAttributes(defaults, 'geom', geomElement, activeClassQName);
    const size = parseNumbers(geomAttrs.size || null);
    const sourceGeomName = geomElement.getAttribute('name') || geomAttrs.name || undefined;
    const meshName = geomAttrs.mesh || undefined;
    const geomEuler = parseEulerAsTuple(geomAttrs.euler || null);
    const geomQuat = parseQuatAsTuple(geomAttrs.quat || null) || eulerToQuatTuple(geomEuler, compilerSettings.angleUnit);
    const geomPos = geomAttrs.pos ? parsePosAsTuple(geomAttrs.pos) : undefined;
    const rawFromTo = parseNumbers(geomAttrs.fromto || null);
    const hasInheritedTransform = !isIdentityTransform(inheritedTransform);

    let resolvedPos = geomPos;
    let resolvedQuat = geomQuat;
    let resolvedFromTo = rawFromTo.length > 0 ? rawFromTo : undefined;

    if (hasInheritedTransform && inheritedTransform) {
        const composedTransform = composeTransforms(
            inheritedTransform,
            createLocalTransform(geomPos, geomQuat),
        );
        resolvedPos = vectorToTuple(composedTransform.position);
        resolvedQuat = threeQuatToMJCFQuat(composedTransform.quaternion);
        if (resolvedFromTo) {
            resolvedFromTo = transformFromTo(resolvedFromTo, inheritedTransform);
        }
    }

    const geom: MJCFModelGeom = {
        name: sourceGeomName || `${bodyPath}::geom[${geomIndex}]`,
        sourceName: sourceGeomName,
        type: inferGeomType(geomAttrs.type, meshName, resolvedFromTo, size),
        size,
        mesh: meshName,
        material: geomAttrs.material || undefined,
        rgba: toRgbaTuple(geomAttrs.rgba),
        pos: resolvedPos,
        quat: resolvedQuat,
        fromto: resolvedFromTo,
    };

    if (geomAttrs.contype != null && geomAttrs.contype !== '') {
        geom.contype = parseInt(geomAttrs.contype, 10);
    }
    if (geomAttrs.conaffinity != null && geomAttrs.conaffinity !== '') {
        geom.conaffinity = parseInt(geomAttrs.conaffinity, 10);
    }
    if (geomAttrs.group != null && geomAttrs.group !== '') {
        geom.group = parseInt(geomAttrs.group, 10);
    }

    return geom;
}

function collectGeomsInBodyOrder(
    container: Element,
    defaults: MJCFDefaultsRegistry,
    activeClassQName: string | undefined,
    compilerSettings: MJCFCompilerSettings,
    bodyPath: string,
    geomIndexRef: { value: number },
    inheritedTransform?: MJCFLocalTransform,
): MJCFModelGeom[] {
    const geoms: MJCFModelGeom[] = [];

    Array.from(container.children).forEach((child) => {
        const tagName = child.tagName.toLowerCase();
        if (tagName === 'geom') {
            geoms.push(parseGeomElement(
                child,
                defaults,
                activeClassQName,
                compilerSettings,
                bodyPath,
                geomIndexRef.value,
                inheritedTransform,
            ));
            geomIndexRef.value += 1;
            return;
        }

        if (tagName !== 'frame') {
            return;
        }

        const framePos = child.getAttribute('pos') ? parsePosAsTuple(child.getAttribute('pos')) : undefined;
        const frameQuat = parseQuatAsTuple(child.getAttribute('quat'))
            || eulerToQuatTuple(parseEulerAsTuple(child.getAttribute('euler')), compilerSettings.angleUnit);
        const frameTransform = inheritedTransform
            ? composeTransforms(inheritedTransform, createLocalTransform(framePos, frameQuat))
            : createLocalTransform(framePos, frameQuat);

        geoms.push(...collectGeomsInBodyOrder(
            child,
            defaults,
            activeClassQName,
            compilerSettings,
            bodyPath,
            geomIndexRef,
            frameTransform,
        ));
    });

    return geoms;
}

function inferGeomType(
    explicitType: string | undefined,
    meshName: string | undefined,
    fromto: number[] | undefined,
    size: number[],
): string {
    const normalizedExplicitType = explicitType?.trim();
    if (normalizedExplicitType) {
        return normalizedExplicitType;
    }

    if (meshName) {
        return 'mesh';
    }

    if (fromto && fromto.length === 6) {
        return 'capsule';
    }

    return 'sphere';
}

function toRgbaTuple(str: string | undefined): [number, number, number, number] | undefined {
    if (!str) {
        return undefined;
    }

    const rgba = parseNumbers(str);
    if (rgba.length < 3) {
        return undefined;
    }

    return [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1];
}

function buildStableBodyName(parentPath: string, siblingIndex: number): string {
    return `${parentPath}/body[${siblingIndex}]`;
}

function buildStableJointName(bodyPath: string, siblingIndex: number): string {
    return `${bodyPath}::joint[${siblingIndex}]`;
}

function parseBody(
    bodyElement: Element,
    defaults: MJCFDefaultsRegistry,
    compilerSettings: MJCFCompilerSettings,
    parentPath: string,
    siblingIndex: number,
    activeClassQName?: string,
): MJCFModelBody {
    const bodyAttrs = resolveElementAttributes(defaults, 'body', bodyElement, activeClassQName);
    const sourceName = bodyElement.getAttribute('name') || bodyAttrs.name || undefined;
    const bodyPath = sourceName || buildStableBodyName(parentPath, siblingIndex);
    const childDefaultsClassQName = resolveDefaultClassQName(defaults, bodyElement.getAttribute('childclass'), activeClassQName) || activeClassQName;

    const geoms = collectGeomsInBodyOrder(
        bodyElement,
        defaults,
        childDefaultsClassQName,
        compilerSettings,
        bodyPath,
        { value: 0 },
    );

    const joints = directChildrenByTagNames(bodyElement, ['joint', 'freejoint']).map((jointElement, jointIndex) => {
        const isFreeJoint = jointElement.tagName.toLowerCase() === 'freejoint';
        const jointAttrs = isFreeJoint
            ? { ...resolveElementAttributes(defaults, 'joint', jointElement, childDefaultsClassQName), type: 'free' }
            : resolveElementAttributes(defaults, 'joint', jointElement, childDefaultsClassQName);
        const sourceJointName = jointElement.getAttribute('name') || jointAttrs.name || undefined;
        const axisNums = !isFreeJoint && jointAttrs.axis ? parseNumbers(jointAttrs.axis) : [];
        const rangeNums = jointAttrs.range ? parseNumbers(jointAttrs.range) : [];

        const joint: MJCFModelJoint = {
            name: sourceJointName || buildStableJointName(bodyPath, jointIndex),
            sourceName: sourceJointName,
            type: jointAttrs.type || 'hinge',
            axis: axisNums.length > 0
                ? [axisNums[0] ?? 0, axisNums[1] ?? 0, axisNums[2] ?? 1]
                : [0, 0, 1],
        };

        if (isFreeJoint) {
            joint.range = [0, 0];
        } else if (rangeNums.length > 0) {
            joint.range = [
                rangeNums[0] ?? -Math.PI,
                rangeNums[1] ?? Math.PI,
            ];
        }

        if (jointAttrs.pos) {
            joint.pos = parsePosAsTuple(jointAttrs.pos);
        } else if (isFreeJoint || joint.type === 'free') {
            joint.pos = [0, 0, 0];
        }

        return joint;
    });

    let inertial: MJCFModelInertial | undefined;
    const inertialElement = directChild(bodyElement, 'inertial');
    if (inertialElement) {
        const inertialAttrs = resolveElementAttributes(defaults, 'inertial', inertialElement, childDefaultsClassQName);
        const diaginertia = parseNumbers(inertialAttrs.diaginertia || null);
        const fullinertia = parseNumbers(inertialAttrs.fullinertia || null);

        inertial = {
            mass: parseFloat(inertialAttrs.mass || '0'),
            pos: parsePosAsTuple(inertialAttrs.pos || null),
            quat: parseQuatAsTuple(inertialAttrs.quat || null),
            diaginertia: diaginertia.length >= 3
                ? [diaginertia[0], diaginertia[1], diaginertia[2]]
                : undefined,
            fullinertia: fullinertia.length >= 6
                ? [fullinertia[0], fullinertia[1], fullinertia[2], fullinertia[3], fullinertia[4], fullinertia[5]]
                : undefined,
        };
    }

    const children = directChildren(bodyElement, 'body').map((childBodyElement, childIndex) => (
        parseBody(childBodyElement, defaults, compilerSettings, bodyPath, childIndex, childDefaultsClassQName)
    ));

    return {
        name: bodyPath,
        sourceName,
        pos: parsePosAsTuple(bodyAttrs.pos || null),
        euler: parseEulerAsTuple(bodyAttrs.euler || null),
        quat: parseQuatAsTuple(bodyAttrs.quat || null),
        geoms,
        joints,
        inertial,
        children,
    };
}

export function parseMJCFModel(xmlContent: string): ParsedMJCFModel | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.error('[MJCF] XML parsing error:', parseError.textContent);
            return null;
        }

        const mujocoElement = doc.querySelector('mujoco');
        if (!mujocoElement) {
            console.error('[MJCF] No <mujoco> root element found');
            return null;
        }

        const compilerSettings = parseCompilerSettings(doc);
        const defaults = parseMJCFDefaults(doc);
        const meshMap = parseMeshAssets(doc, compilerSettings, defaults);
        const materialMap = parseMaterialAssets(doc);
        const worldbodyElements = directChildren(mujocoElement, 'worldbody');
        if (worldbodyElements.length === 0) {
            console.error('[MJCF] No <worldbody> element found');
            return null;
        }

        const worldBody: MJCFModelBody = {
            name: 'world',
            sourceName: 'world',
            pos: [0, 0, 0],
            geoms: [],
            joints: [],
            children: [],
        };

        worldbodyElements.forEach((worldbodyElement) => {
            worldBody.geoms.push(...collectGeomsInBodyOrder(
                worldbodyElement,
                defaults,
                undefined,
                compilerSettings,
                'world',
                { value: worldBody.geoms.length },
            ));

            worldBody.joints.push(...directChildren(worldbodyElement, 'joint').map((jointElement, jointIndex) => {
                const jointAttrs = resolveElementAttributes(defaults, 'joint', jointElement);
                const sourceJointName = jointElement.getAttribute('name') || jointAttrs.name || undefined;
                const axisNums = jointAttrs.axis ? parseNumbers(jointAttrs.axis) : [];
                const rangeNums = jointAttrs.range ? parseNumbers(jointAttrs.range) : [];

                const joint: MJCFModelJoint = {
                    name: sourceJointName || buildStableJointName('world', jointIndex),
                    sourceName: sourceJointName,
                    type: jointAttrs.type || 'hinge',
                    axis: axisNums.length > 0
                        ? [axisNums[0] ?? 0, axisNums[1] ?? 0, axisNums[2] ?? 1]
                        : [0, 0, 1],
                };

                if (rangeNums.length > 0) {
                    joint.range = [
                        rangeNums[0] ?? -Math.PI,
                        rangeNums[1] ?? Math.PI,
                    ];
                }

                if (jointAttrs.pos) {
                    joint.pos = parsePosAsTuple(jointAttrs.pos);
                }

                return joint;
            }));

            worldBody.children.push(...directChildren(worldbodyElement, 'body').map((bodyElement, bodyIndex) => (
                parseBody(bodyElement, defaults, compilerSettings, 'world', bodyIndex)
            )));
        });

        return {
            modelName: mujocoElement.getAttribute('model') || 'mjcf_robot',
            compilerSettings,
            defaults,
            meshMap,
            materialMap,
            worldBody,
        };
    } catch (error) {
        console.error('[MJCF] Failed to parse MJCF model:', error);
        return null;
    }
}
