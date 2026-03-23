import * as THREE from 'three';
import {
    parseCompilerSettings,
    parseMaterialAssets,
    parseMeshAssets,
    parseMJCFDefaults,
    parseOrientationAsQuat,
    parseTextureAssets,
    parseNumbers,
    parsePosAsTuple,
    resolveCompilerSettingsForElement,
    resolveDefaultClassQName,
    resolveElementAttributes,
    type MJCFCompilerSettings,
    type MJCFDefaultsRegistry,
    type MJCFMaterial,
    type MJCFMesh,
    type MJCFTexture,
} from './mjcfUtils';

export interface MJCFModelGeom {
    name?: string;
    sourceName?: string;
    className?: string;
    classQName?: string;
    type: string;
    size?: number[];
    mass?: number;
    mesh?: string;
    material?: string;
    rgba?: [number, number, number, number];
    hasExplicitRgba?: boolean;
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
    limited?: boolean;
    damping?: number;
    frictionloss?: number;
    armature?: number;
    actuatorForceRange?: [number, number];
    actuatorForceLimited?: boolean;
}

export interface MJCFModelActuator {
    name: string;
    type: string;
    joint?: string;
    ctrlrange?: [number, number];
    forcerange?: [number, number];
    gear?: number[];
}

export interface MJCFModelInertial {
    mass: number;
    pos: [number, number, number];
    quat?: [number, number, number, number];
    diaginertia?: [number, number, number];
    fullinertia?: [number, number, number, number, number, number];
}

export interface MJCFModelConnectConstraint {
    name?: string;
    body1: string;
    body2: string;
    anchor: [number, number, number];
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
    textureMap: Map<string, MJCFTexture>;
    actuatorMap: Map<string, MJCFModelActuator[]>;
    connectConstraints: MJCFModelConnectConstraint[];
    worldBody: MJCFModelBody;
}

const PARSED_MODEL_CACHE_LIMIT = 24;
const parsedModelCache = new Map<string, ParsedMJCFModel | null>();

function rememberParsedModel(xmlContent: string, parsedModel: ParsedMJCFModel | null): ParsedMJCFModel | null {
    if (!parsedModelCache.has(xmlContent) && parsedModelCache.size >= PARSED_MODEL_CACHE_LIMIT) {
        const oldestKey = parsedModelCache.keys().next().value;
        if (oldestKey !== undefined) {
            parsedModelCache.delete(oldestKey);
        }
    }

    parsedModelCache.set(xmlContent, parsedModel);
    return parsedModel;
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

function parseBooleanAttribute(value: string | undefined): boolean | undefined {
    if (value == null) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }

    return undefined;
}

function toOptionalRangeTuple(values: number[]): [number, number] | undefined {
    if (values.length < 2) {
        return undefined;
    }

    return [
        values[0] ?? 0,
        values[1] ?? 0,
    ];
}

function convertAngularValue(value: number, settings: MJCFCompilerSettings): number {
    return settings.angleUnit === 'degree' ? THREE.MathUtils.degToRad(value) : value;
}

function normalizeJointRange(
    range: [number, number] | undefined,
    jointType: string,
    settings: MJCFCompilerSettings,
): [number, number] | undefined {
    if (!range) {
        return undefined;
    }

    if (jointType.toLowerCase() === 'slide') {
        return range;
    }

    return [
        convertAngularValue(range[0] ?? 0, settings),
        convertAngularValue(range[1] ?? 0, settings),
    ];
}

function parseJointElement(
    jointElement: Element,
    defaults: MJCFDefaultsRegistry,
    activeClassQName: string | undefined,
    compilerSettings: MJCFCompilerSettings,
    jointIndexRef: { value: number },
): MJCFModelJoint {
    const isFreeJoint = jointElement.tagName.toLowerCase() === 'freejoint';
    const jointAttrs = isFreeJoint
        ? { ...resolveElementAttributes(defaults, 'joint', jointElement, activeClassQName), type: 'free' }
        : resolveElementAttributes(defaults, 'joint', jointElement, activeClassQName);
    const sourceJointName = jointElement.getAttribute('name') || jointAttrs.name || undefined;
    const generatedJointName = buildGeneratedJointName(jointIndexRef.value++);
    const axisNums = !isFreeJoint && jointAttrs.axis ? parseNumbers(jointAttrs.axis) : [];
    const rangeNums = jointAttrs.range ? parseNumbers(jointAttrs.range) : [];
    const actuatorForceRange = jointAttrs.actuatorfrcrange ? parseNumbers(jointAttrs.actuatorfrcrange) : [];

    const joint: MJCFModelJoint = {
        // Match MuJoCo's anonymous joint fallback naming (`joint_<global-index>`).
        name: sourceJointName || generatedJointName,
        sourceName: sourceJointName,
        type: jointAttrs.type || 'hinge',
        axis: axisNums.length > 0
            ? [axisNums[0] ?? 0, axisNums[1] ?? 0, axisNums[2] ?? 1]
            : [0, 0, 1],
        limited: parseBooleanAttribute(jointAttrs.limited),
        actuatorForceLimited: parseBooleanAttribute(jointAttrs.actuatorfrclimited),
    };

    if (jointAttrs.damping != null && jointAttrs.damping !== '') {
        const parsedDamping = parseFloat(jointAttrs.damping);
        if (Number.isFinite(parsedDamping)) {
            joint.damping = parsedDamping;
        }
    }

    if (jointAttrs.frictionloss != null && jointAttrs.frictionloss !== '') {
        const parsedFriction = parseFloat(jointAttrs.frictionloss);
        if (Number.isFinite(parsedFriction)) {
            joint.frictionloss = parsedFriction;
        }
    }

    if (jointAttrs.armature != null && jointAttrs.armature !== '') {
        const parsedArmature = parseFloat(jointAttrs.armature);
        if (Number.isFinite(parsedArmature)) {
            joint.armature = parsedArmature;
        }
    }

    if (isFreeJoint) {
        joint.range = [0, 0];
    } else {
        const parsedRange = toOptionalRangeTuple(rangeNums);
        if (parsedRange) {
            joint.range = normalizeJointRange(parsedRange, joint.type, compilerSettings);
        }
    }

    const parsedActuatorForceRange = toOptionalRangeTuple(actuatorForceRange);
    if (parsedActuatorForceRange) {
        joint.actuatorForceRange = parsedActuatorForceRange;
    }

    if (jointAttrs.pos) {
        joint.pos = parsePosAsTuple(jointAttrs.pos);
    } else if (isFreeJoint || joint.type === 'free') {
        joint.pos = [0, 0, 0];
    }

    return joint;
}

function parseActuatorMap(mujocoElement: Element): Map<string, MJCFModelActuator[]> {
    const actuatorMap = new Map<string, MJCFModelActuator[]>();
    const actuatorElement = directChild(mujocoElement, 'actuator');
    if (!actuatorElement) {
        return actuatorMap;
    }

    const actuatorTags = new Set(['motor', 'position', 'velocity', 'intvelocity', 'general']);
    Array.from(actuatorElement.children).forEach((child) => {
        const actuatorType = child.tagName.toLowerCase();
        if (!actuatorTags.has(actuatorType)) {
            return;
        }

        const jointName = child.getAttribute('joint') || undefined;
        if (!jointName) {
            return;
        }

        const ctrlrange = toOptionalRangeTuple(parseNumbers(child.getAttribute('ctrlrange')));
        const forcerange = toOptionalRangeTuple(parseNumbers(child.getAttribute('forcerange')));
        const gear = parseNumbers(child.getAttribute('gear'));
        const actuator: MJCFModelActuator = {
            name: child.getAttribute('name') || jointName,
            type: actuatorType,
            joint: jointName,
            ctrlrange,
            forcerange,
            gear: gear.length > 0 ? gear : undefined,
        };

        const existing = actuatorMap.get(jointName) || [];
        existing.push(actuator);
        actuatorMap.set(jointName, existing);
    });

    return actuatorMap;
}

function parseConnectConstraints(mujocoElement: Element): MJCFModelConnectConstraint[] {
    const constraints: MJCFModelConnectConstraint[] = [];

    directChildren(mujocoElement, 'equality').forEach((equalityElement) => {
        directChildren(equalityElement, 'connect').forEach((connectElement) => {
            const body1 = connectElement.getAttribute('body1')?.trim() || '';
            const body2 = connectElement.getAttribute('body2')?.trim() || '';
            const anchor = parsePosAsTuple(connectElement.getAttribute('anchor'));

            if (!body1 || !body2 || anchor.length < 3) {
                return;
            }

            constraints.push({
                name: connectElement.getAttribute('name') || undefined,
                body1,
                body2,
                anchor: [anchor[0] ?? 0, anchor[1] ?? 0, anchor[2] ?? 0],
            });
        });
    });

    return constraints;
}

interface MJCFLocalTransform {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
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
    const geomCompilerSettings = resolveCompilerSettingsForElement(geomElement, compilerSettings);
    const geomClassQName = resolveDefaultClassQName(defaults, geomElement.getAttribute('class'), activeClassQName);
    const size = parseNumbers(geomAttrs.size || null);
    const sourceGeomName = geomElement.getAttribute('name') || geomAttrs.name || undefined;
    const meshName = geomAttrs.mesh || undefined;
    const geomQuat = parseOrientationAsQuat({
        quat: geomAttrs.quat,
        axisangle: geomAttrs.axisangle,
        xyaxes: geomAttrs.xyaxes,
        zaxis: geomAttrs.zaxis,
        euler: geomAttrs.euler,
    }, geomCompilerSettings);
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
        className: geomClassQName?.split('/').pop() || geomElement.getAttribute('class') || undefined,
        classQName: geomClassQName,
        type: inferGeomType(geomAttrs.type, meshName, resolvedFromTo),
        size,
        mesh: meshName,
        material: geomAttrs.material || undefined,
        rgba: toRgbaTuple(geomAttrs.rgba),
        hasExplicitRgba: geomElement.hasAttribute('rgba'),
        pos: resolvedPos,
        quat: resolvedQuat,
        fromto: resolvedFromTo,
    };

    if (geomAttrs.mass != null && geomAttrs.mass !== '') {
        const parsedMass = parseFloat(geomAttrs.mass);
        if (Number.isFinite(parsedMass)) {
            geom.mass = parsedMass;
        }
    }

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
    const children = Array.from(container.children);

    children.forEach((child) => {
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
        }
    });

    children.forEach((child) => {
        const tagName = child.tagName.toLowerCase();
        if (tagName !== 'frame') {
            return;
        }

        const framePos = child.getAttribute('pos') ? parsePosAsTuple(child.getAttribute('pos')) : undefined;
        const frameCompilerSettings = resolveCompilerSettingsForElement(child, compilerSettings);
        const frameQuat = parseOrientationAsQuat({
            quat: child.getAttribute('quat'),
            axisangle: child.getAttribute('axisangle'),
            xyaxes: child.getAttribute('xyaxes'),
            zaxis: child.getAttribute('zaxis'),
            euler: child.getAttribute('euler'),
        }, frameCompilerSettings);
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

function buildGeneratedJointName(jointIndex: number): string {
    return `joint_${jointIndex}`;
}

function createZeroPosition(): [number, number, number] {
    return [0, 0, 0];
}

function buildSyntheticJointStageName(bodyName: string, stageIndex: number): string {
    return `${bodyName}__joint_stage_${stageIndex}`;
}

export function normalizeMultiJointBodies(body: MJCFModelBody): MJCFModelBody {
    const normalizedChildren = body.children.map(normalizeMultiJointBodies);
    const normalizedBody: MJCFModelBody = {
        ...body,
        children: normalizedChildren,
    };

    if (normalizedBody.joints.length <= 1) {
        return normalizedBody;
    }

    const bodyJoints = normalizedBody.joints;
    let chainedBody: MJCFModelBody = {
        ...normalizedBody,
        pos: createZeroPosition(),
        euler: undefined,
        quat: undefined,
        joints: [bodyJoints[bodyJoints.length - 1]],
        children: normalizedChildren,
    };

    for (let jointIndex = bodyJoints.length - 2; jointIndex >= 0; jointIndex -= 1) {
        chainedBody = {
            name: buildSyntheticJointStageName(normalizedBody.name, jointIndex),
            sourceName: undefined,
            pos: jointIndex === 0 ? normalizedBody.pos : createZeroPosition(),
            euler: jointIndex === 0 ? normalizedBody.euler : undefined,
            quat: jointIndex === 0 ? normalizedBody.quat : undefined,
            geoms: [],
            joints: [bodyJoints[jointIndex]],
            inertial: undefined,
            children: [chainedBody],
        };
    }

    return chainedBody;
}

function parseBody(
    bodyElement: Element,
    defaults: MJCFDefaultsRegistry,
    compilerSettings: MJCFCompilerSettings,
    parentPath: string,
    siblingIndex: number,
    jointIndexRef: { value: number },
    activeClassQName?: string,
): MJCFModelBody {
    const bodyAttrs = resolveElementAttributes(defaults, 'body', bodyElement, activeClassQName);
    const bodyCompilerSettings = resolveCompilerSettingsForElement(bodyElement, compilerSettings);
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

    const joints = directChildrenByTagNames(bodyElement, ['joint', 'freejoint']).map((jointElement) => (
        parseJointElement(jointElement, defaults, childDefaultsClassQName, bodyCompilerSettings, jointIndexRef)
    ));

    let inertial: MJCFModelInertial | undefined;
    const inertialElement = directChild(bodyElement, 'inertial');
    if (inertialElement) {
        const inertialAttrs = resolveElementAttributes(defaults, 'inertial', inertialElement, childDefaultsClassQName);
        const diaginertia = parseNumbers(inertialAttrs.diaginertia || null);
        const fullinertia = parseNumbers(inertialAttrs.fullinertia || null);

        inertial = {
            mass: parseFloat(inertialAttrs.mass || '0'),
            pos: parsePosAsTuple(inertialAttrs.pos || null),
            quat: parseOrientationAsQuat({
                quat: inertialAttrs.quat,
                axisangle: inertialAttrs.axisangle,
                xyaxes: inertialAttrs.xyaxes,
                zaxis: inertialAttrs.zaxis,
                euler: inertialAttrs.euler,
            }, resolveCompilerSettingsForElement(inertialElement, bodyCompilerSettings)),
            diaginertia: diaginertia.length >= 3
                ? [diaginertia[0], diaginertia[1], diaginertia[2]]
                : undefined,
            fullinertia: fullinertia.length >= 6
                ? [fullinertia[0], fullinertia[1], fullinertia[2], fullinertia[3], fullinertia[4], fullinertia[5]]
                : undefined,
        };
    }

    const children = directChildren(bodyElement, 'body').map((childBodyElement, childIndex) => (
        parseBody(childBodyElement, defaults, compilerSettings, bodyPath, childIndex, jointIndexRef, childDefaultsClassQName)
    ));

    return {
        name: bodyPath,
        sourceName,
        pos: parsePosAsTuple(bodyAttrs.pos || null),
        euler: parseEulerAsTuple(bodyAttrs.euler || null),
        quat: parseOrientationAsQuat({
            quat: bodyAttrs.quat,
            axisangle: bodyAttrs.axisangle,
            xyaxes: bodyAttrs.xyaxes,
            zaxis: bodyAttrs.zaxis,
            euler: bodyAttrs.euler,
        }, bodyCompilerSettings),
        geoms,
        joints,
        inertial,
        children,
    };
}

export function parseMJCFModel(xmlContent: string): ParsedMJCFModel | null {
    if (parsedModelCache.has(xmlContent)) {
        return parsedModelCache.get(xmlContent) ?? null;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.error('[MJCF] XML parsing error:', parseError.textContent);
            return rememberParsedModel(xmlContent, null);
        }

        const mujocoElement = doc.querySelector('mujoco');
        if (!mujocoElement) {
            console.error('[MJCF] No <mujoco> root element found');
            return rememberParsedModel(xmlContent, null);
        }

        const compilerSettings = parseCompilerSettings(doc);
        const defaults = parseMJCFDefaults(doc);
        const meshMap = parseMeshAssets(doc, compilerSettings, defaults);
        const materialMap = parseMaterialAssets(doc, defaults);
        const textureMap = parseTextureAssets(doc, compilerSettings, defaults);
        const connectConstraints = parseConnectConstraints(mujocoElement);
        const worldbodyElements = directChildren(mujocoElement, 'worldbody');
        if (worldbodyElements.length === 0) {
            console.error('[MJCF] No <worldbody> element found');
            return null;
        }
        const jointIndexRef = { value: 0 };

        const worldBody: MJCFModelBody = {
            name: 'world',
            sourceName: 'world',
            pos: [0, 0, 0],
            geoms: [],
            joints: [],
            children: [],
        };
        const actuatorMap = parseActuatorMap(mujocoElement);

        worldbodyElements.forEach((worldbodyElement) => {
            worldBody.geoms.push(...collectGeomsInBodyOrder(
                worldbodyElement,
                defaults,
                undefined,
                compilerSettings,
                'world',
                { value: worldBody.geoms.length },
            ));

            worldBody.joints.push(...directChildrenByTagNames(worldbodyElement, ['joint', 'freejoint']).map((jointElement) => (
                parseJointElement(
                    jointElement,
                    defaults,
                    undefined,
                    resolveCompilerSettingsForElement(jointElement, compilerSettings),
                    jointIndexRef,
                )
            )));

            worldBody.children.push(...directChildren(worldbodyElement, 'body').map((bodyElement, bodyIndex) => (
                parseBody(bodyElement, defaults, compilerSettings, 'world', bodyIndex, jointIndexRef)
            )));
        });

        return rememberParsedModel(xmlContent, {
            modelName: mujocoElement.getAttribute('model') || 'mjcf_robot',
            compilerSettings,
            defaults,
            meshMap,
            materialMap,
            textureMap,
            actuatorMap,
            connectConstraints,
            worldBody,
        });
    } catch (error) {
        console.error('[MJCF] Failed to parse MJCF model:', error);
        return rememberParsedModel(xmlContent, null);
    }
}
