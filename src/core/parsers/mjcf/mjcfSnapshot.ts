import * as THREE from 'three';
import path from 'node:path';
import type { ParsedMJCFModel } from './mjcfModel';

const NUMBER_PRECISION = 6;
const EPSILON = 1e-5;

export interface CanonicalMJCFBody {
    key: string;
    name: string | null;
    parentKey: string | null;
    path: string;
    pos: [number, number, number];
    quat: [number, number, number, number] | null;
}

export interface CanonicalMJCFJoint {
    key: string;
    name: string | null;
    parentBodyKey: string;
    type: string;
    axis: [number, number, number] | null;
    range: [number, number] | null;
    pos: [number, number, number] | null;
}

export interface CanonicalMJCFGeom {
    key: string;
    name: string | null;
    bodyKey: string;
    type: string;
    size: number[];
    mesh: string | null;
    material: string | null;
    pos: [number, number, number] | null;
    quat: [number, number, number, number] | null;
    rgba: [number, number, number, number] | null;
    group: number | null;
    contype: number | null;
    conaffinity: number | null;
}

export interface CanonicalMJCFMeshAsset {
    name: string;
    file: string | null;
    scale: number[];
}

export interface CanonicalMJCFMaterialAsset {
    name: string;
    rgba: [number, number, number, number] | null;
}

export interface CanonicalMJCFSnapshot {
    schema: 'urdf-studio.mjcf-canonical/v1';
    meta: {
        modelName: string;
        sourceFile?: string;
        effectiveFile?: string;
    };
    counts: {
        bodies: number;
        joints: number;
        geoms: number;
        meshes: number;
        materials: number;
    };
    bodies: CanonicalMJCFBody[];
    joints: CanonicalMJCFJoint[];
    geoms: CanonicalMJCFGeom[];
    assets: {
        meshes: CanonicalMJCFMeshAsset[];
        materials: CanonicalMJCFMaterialAsset[];
    };
}

export interface CanonicalSnapshotOptions {
    sourceFile?: string;
    effectiveFile?: string;
}

export interface MJCFSnapshotDiff {
    type:
        | 'SOURCE_RESOLUTION_MISMATCH'
        | 'BODY_MISSING'
        | 'BODY_PARENT_MISMATCH'
        | 'JOINT_MISSING'
        | 'JOINT_TYPE_MISMATCH'
        | 'JOINT_AXIS_MISMATCH'
        | 'JOINT_RANGE_MISMATCH'
        | 'GEOM_MISSING'
        | 'GEOM_TYPE_MISMATCH'
        | 'GEOM_BODY_MISMATCH'
        | 'GEOM_SIZE_MISMATCH'
        | 'MESH_PATH_MISMATCH'
        | 'COUNT_MISMATCH';
    key: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
}

function roundNumber(value: number): number {
    return Number(value.toFixed(NUMBER_PRECISION));
}

function normalizeVector(value: number[] | undefined | null, length: number): number[] | null {
    if (!value || value.length === 0) {
        return null;
    }

    const normalized: number[] = [];
    for (let index = 0; index < length; index += 1) {
        normalized.push(roundNumber(value[index] ?? 0));
    }
    return normalized;
}

function normalizeQuatFromEuler(euler: number[] | undefined, angleUnit: 'radian' | 'degree'): [number, number, number, number] | null {
    if (!euler || euler.length < 3) {
        return null;
    }

    const [x, y, z] = euler;
    const eulerValue = new THREE.Euler(
        angleUnit === 'degree' ? THREE.MathUtils.degToRad(x ?? 0) : (x ?? 0),
        angleUnit === 'degree' ? THREE.MathUtils.degToRad(y ?? 0) : (y ?? 0),
        angleUnit === 'degree' ? THREE.MathUtils.degToRad(z ?? 0) : (z ?? 0),
        'XYZ',
    );
    const quaternion = new THREE.Quaternion().setFromEuler(eulerValue);
    return [
        roundNumber(quaternion.w),
        roundNumber(quaternion.x),
        roundNumber(quaternion.y),
        roundNumber(quaternion.z),
    ];
}

function normalizeQuat(value: number[] | undefined | null): [number, number, number, number] | null {
    const normalized = normalizeVector(value, 4);
    return normalized ? normalized as [number, number, number, number] : null;
}

function normalizePos(value: number[] | undefined | null): [number, number, number] {
    return (normalizeVector(value, 3) || [0, 0, 0]) as [number, number, number];
}

function normalizeRange(value: number[] | undefined | null, angleUnit: 'radian' | 'degree'): [number, number] | null {
    if (!value || value.length === 0) {
        return null;
    }

    const lower = value[0] ?? 0;
    const upper = value[1] ?? 0;
    const normalized = angleUnit === 'degree'
        ? [THREE.MathUtils.degToRad(lower), THREE.MathUtils.degToRad(upper)]
        : [lower, upper];
    return [roundNumber(normalized[0]), roundNumber(normalized[1])];
}

function trimTrailingZeros(values: number[] | null): number[] | null {
    if (!values) {
        return null;
    }

    const trimmed = [...values];
    while (trimmed.length > 0 && nearlyEqual(trimmed[trimmed.length - 1], 0)) {
        trimmed.pop();
    }
    return trimmed;
}

function normalizeOracleJointType(value: string | undefined | null): string {
    const normalized = (value || 'hinge').replace(/^mjt[A-Za-z]+_/, '').replace(/^mjJNT_/, '').toLowerCase();
    return normalized || 'hinge';
}

function normalizeOracleGeomType(value: string | undefined | null): string {
    const normalized = (value || 'sphere').replace(/^mjt[A-Za-z]+_/, '').replace(/^mjGEOM_/, '').toLowerCase();
    return normalized || 'sphere';
}

function normalizeMeshFile(file: string | null | undefined): string | null {
    if (!file) {
        return null;
    }

    return path.posix.basename(file.replace(/\\/g, '/'));
}

function bodyKeyFromName(name: string | null | undefined, path: string): string {
    return name?.trim() || path;
}

function jointKeyFromName(name: string | null | undefined, fallback: string): string {
    return name?.trim() || fallback;
}

function geomKeyFromName(name: string | null | undefined, fallback: string): string {
    return name?.trim() || fallback;
}

export function createCanonicalSnapshotFromParsedModel(
    parsedModel: ParsedMJCFModel,
    options: CanonicalSnapshotOptions = {},
): CanonicalMJCFSnapshot {
    const bodies: CanonicalMJCFBody[] = [];
    const joints: CanonicalMJCFJoint[] = [];
    const geoms: CanonicalMJCFGeom[] = [];

    const visitBody = (body: ParsedMJCFModel['worldBody'], parentKey: string | null, path: string): void => {
        const bodyName = body.sourceName || (path === 'world' ? 'world' : null);
        const bodyKey = bodyKeyFromName(bodyName, path);
        const quat = normalizeQuat(body.quat) || normalizeQuatFromEuler(body.euler, parsedModel.compilerSettings.angleUnit);

        bodies.push({
            key: bodyKey,
            name: bodyName,
            parentKey,
            path,
            pos: normalizePos(body.pos),
            quat,
        });

        body.joints.forEach((joint, jointIndex) => {
            const fallback = `${path}::joint[${jointIndex}]`;
            joints.push({
                key: jointKeyFromName(joint.sourceName || joint.name, fallback),
                name: joint.sourceName || null,
                parentBodyKey: bodyKey,
                type: joint.type,
                axis: (normalizeVector(joint.axis, 3) as [number, number, number] | null),
                range: joint.range
                    ? normalizeRange(joint.range, parsedModel.compilerSettings.angleUnit)
                    : [0, 0],
                pos: (normalizeVector(joint.pos, 3) as [number, number, number] | null),
            });
        });

        body.geoms.forEach((geom, geomIndex) => {
            const fallback = `${path}::geom[${geomIndex}]`;
            geoms.push({
                key: geomKeyFromName(geom.sourceName || geom.name, fallback),
                name: geom.sourceName || null,
                bodyKey,
                type: geom.type,
                size: trimTrailingZeros(normalizeVector(geom.size, geom.size?.length || 0)) || [],
                mesh: geom.mesh || null,
                material: geom.material || null,
                pos: (normalizeVector(geom.pos, 3) as [number, number, number] | null),
                quat: normalizeQuat(geom.quat),
                rgba: (normalizeVector(geom.rgba, 4) as [number, number, number, number] | null),
                group: geom.group ?? null,
                contype: geom.contype ?? null,
                conaffinity: geom.conaffinity ?? null,
            });
        });

        body.children.forEach((child, childIndex) => {
            const childSegment = child.sourceName || `body[${childIndex}]`;
            visitBody(child, bodyKey, `${path}/${childSegment}`);
        });
    };

    visitBody(parsedModel.worldBody, null, 'world');

    const meshAssets = Array.from(parsedModel.meshMap.values())
        .map((mesh) => ({
            name: mesh.name,
            file: normalizeMeshFile(mesh.file),
            scale: normalizeVector(mesh.scale, mesh.scale?.length || 0) || [],
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

    const materialAssets = Array.from(parsedModel.materialMap.values())
        .map((material) => ({
            name: material.name,
            rgba: (normalizeVector(material.rgba, 4) as [number, number, number, number] | null),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

    return {
        schema: 'urdf-studio.mjcf-canonical/v1',
        meta: {
            modelName: parsedModel.modelName,
            sourceFile: options.sourceFile,
            effectiveFile: options.effectiveFile,
        },
        counts: {
            bodies: bodies.length,
            joints: joints.length,
            geoms: geoms.length,
            meshes: meshAssets.length,
            materials: materialAssets.length,
        },
        bodies: bodies.sort((left, right) => left.key.localeCompare(right.key)),
        joints: joints.sort((left, right) => left.key.localeCompare(right.key)),
        geoms: geoms.sort((left, right) => left.key.localeCompare(right.key)),
        assets: {
            meshes: meshAssets,
            materials: materialAssets,
        },
    };
}

export function createCanonicalSnapshotFromOracleExport(
    oracleExport: any,
    options: CanonicalSnapshotOptions = {},
): CanonicalMJCFSnapshot {
    const bodyKeyById = new Map<string, string>();
    const bodyPathById = new Map<string, string>();
    const childBodyIndexByParentId = new Map<string, number>();
    const nextLocalIndex = (counterMap: Map<string, number>, parentKey: string): number => {
        const nextIndex = counterMap.get(parentKey) ?? 0;
        counterMap.set(parentKey, nextIndex + 1);
        return nextIndex;
    };

    const bodies = (oracleExport.bodies || []).map((body: any) => {
        const parentId = body.parent?.id as string | undefined;
        const parentPath = parentId
            ? (bodyPathById.get(parentId) || body.parent?.name || 'world')
            : null;
        const path = parentId
            ? `${parentPath}/${body.name || `body[${nextLocalIndex(childBodyIndexByParentId, parentId)}]`}`
            : 'world';
        const key = bodyKeyFromName(body.name || null, path);
        const parentKey = parentId
            ? (bodyKeyById.get(parentId) || body.parent?.name || parentPath)
            : null;
        bodyKeyById.set(body.id, key);
        bodyPathById.set(body.id, path);

        return {
            key,
            name: body.name || null,
            parentKey,
            path,
            pos: normalizePos(body.attrs?.pos),
            quat: normalizeQuat(body.attrs?.quat),
        } satisfies CanonicalMJCFBody;
    }).sort((left: CanonicalMJCFBody, right: CanonicalMJCFBody) => left.key.localeCompare(right.key));

    const jointLocalIndexByBody = new Map<string, number>();
    const joints = (oracleExport.joints || []).map((joint: any) => {
        const parentBodyKey = bodyKeyById.get(joint.parent?.id) || joint.parent?.name || 'world';
        const fallback = `${parentBodyKey}::joint[${nextLocalIndex(jointLocalIndexByBody, parentBodyKey)}]`;
        return {
            key: jointKeyFromName(joint.name || null, fallback),
            name: joint.name || null,
            parentBodyKey,
            type: normalizeOracleJointType(joint.attrs?.type),
            axis: (normalizeVector(joint.attrs?.axis, 3) as [number, number, number] | null),
            range: normalizeRange(joint.attrs?.range, 'radian'),
            pos: (normalizeVector(joint.attrs?.pos, 3) as [number, number, number] | null),
        } satisfies CanonicalMJCFJoint;
    }).sort((left: CanonicalMJCFJoint, right: CanonicalMJCFJoint) => left.key.localeCompare(right.key));

    const geomLocalIndexByBody = new Map<string, number>();
    const geoms = (oracleExport.geoms || []).map((geom: any) => {
        const parentBodyKey = bodyKeyById.get(geom.parent?.id) || geom.parent?.name || 'world';
        const fallback = `${parentBodyKey}::geom[${nextLocalIndex(geomLocalIndexByBody, parentBodyKey)}]`;
        return {
            key: geomKeyFromName(geom.name || null, fallback),
            name: geom.name || null,
            bodyKey: parentBodyKey,
            type: normalizeOracleGeomType(geom.attrs?.type),
            size: trimTrailingZeros(normalizeVector(geom.attrs?.size, geom.attrs?.size?.length || 0)) || [],
            mesh: geom.attrs?.meshname || null,
            material: geom.attrs?.material || null,
            pos: (normalizeVector(geom.attrs?.pos, 3) as [number, number, number] | null),
            quat: normalizeQuat(geom.attrs?.quat),
            rgba: (normalizeVector(geom.attrs?.rgba, 4) as [number, number, number, number] | null),
            group: geom.attrs?.group ?? null,
            contype: geom.attrs?.contype ?? null,
            conaffinity: geom.attrs?.conaffinity ?? null,
        } satisfies CanonicalMJCFGeom;
    }).sort((left: CanonicalMJCFGeom, right: CanonicalMJCFGeom) => left.key.localeCompare(right.key));

    const meshAssets = (oracleExport.meshes || []).map((mesh: any) => ({
        name: mesh.name || mesh.id,
        file: normalizeMeshFile(mesh.attrs?.file),
        scale: normalizeVector(mesh.attrs?.scale, mesh.attrs?.scale?.length || 0) || [],
    })).sort((left: CanonicalMJCFMeshAsset, right: CanonicalMJCFMeshAsset) => left.name.localeCompare(right.name));

    const materialAssets = (oracleExport.materials || []).map((material: any) => ({
        name: material.name || material.id,
        rgba: (normalizeVector(material.attrs?.rgba, 4) as [number, number, number, number] | null),
    })).sort((left: CanonicalMJCFMaterialAsset, right: CanonicalMJCFMaterialAsset) => left.name.localeCompare(right.name));

    return {
        schema: 'urdf-studio.mjcf-canonical/v1',
        meta: {
            modelName: oracleExport.model_name,
            sourceFile: options.sourceFile,
            effectiveFile: options.effectiveFile,
        },
        counts: {
            bodies: oracleExport.spec_counts?.bodies ?? bodies.length,
            joints: oracleExport.spec_counts?.joints ?? joints.length,
            geoms: oracleExport.spec_counts?.geoms ?? geoms.length,
            meshes: oracleExport.spec_counts?.meshes ?? meshAssets.length,
            materials: oracleExport.spec_counts?.materials ?? materialAssets.length,
        },
        bodies,
        joints,
        geoms,
        assets: {
            meshes: meshAssets,
            materials: materialAssets,
        },
    };
}

function nearlyEqual(left: number | null | undefined, right: number | null | undefined): boolean {
    if (left == null && right == null) {
        return true;
    }
    if (left == null || right == null) {
        return false;
    }
    return Math.abs(left - right) <= EPSILON;
}

function arraysEqual(left: number[] | null | undefined, right: number[] | null | undefined): boolean {
    if (!left && !right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => nearlyEqual(value, right[index]));
}

export function diffCanonicalSnapshots(
    expected: CanonicalMJCFSnapshot,
    actual: CanonicalMJCFSnapshot,
): MJCFSnapshotDiff[] {
    const diffs: MJCFSnapshotDiff[] = [];

    if ((expected.meta.effectiveFile || null) !== (actual.meta.effectiveFile || null)) {
        diffs.push({
            type: 'SOURCE_RESOLUTION_MISMATCH',
            key: 'meta.effectiveFile',
            message: 'Effective MJCF file differs',
            expected: expected.meta.effectiveFile || null,
            actual: actual.meta.effectiveFile || null,
        });
    }

    (['bodies', 'joints', 'geoms', 'meshes', 'materials'] as const).forEach((field) => {
        if (expected.counts[field] !== actual.counts[field]) {
            diffs.push({
                type: 'COUNT_MISMATCH',
                key: `counts.${field}`,
                message: `Count mismatch for ${field}`,
                expected: expected.counts[field],
                actual: actual.counts[field],
            });
        }
    });

    const expectedBodies = new Map(expected.bodies.map((body) => [body.key, body]));
    const actualBodies = new Map(actual.bodies.map((body) => [body.key, body]));
    expectedBodies.forEach((expectedBody, key) => {
        const actualBody = actualBodies.get(key);
        if (!actualBody) {
            diffs.push({
                type: 'BODY_MISSING',
                key,
                message: 'Body missing in TS snapshot',
                expected: expectedBody,
            });
            return;
        }

        if ((expectedBody.parentKey || null) !== (actualBody.parentKey || null)) {
            diffs.push({
                type: 'BODY_PARENT_MISMATCH',
                key,
                message: 'Body parent differs',
                expected: expectedBody.parentKey || null,
                actual: actualBody.parentKey || null,
            });
        }
    });

    const expectedJoints = new Map(expected.joints.map((joint) => [joint.key, joint]));
    const actualJoints = new Map(actual.joints.map((joint) => [joint.key, joint]));
    expectedJoints.forEach((expectedJoint, key) => {
        const actualJoint = actualJoints.get(key);
        if (!actualJoint) {
            diffs.push({
                type: 'JOINT_MISSING',
                key,
                message: 'Joint missing in TS snapshot',
                expected: expectedJoint,
            });
            return;
        }

        if (expectedJoint.type !== actualJoint.type) {
            diffs.push({
                type: 'JOINT_TYPE_MISMATCH',
                key,
                message: 'Joint type differs',
                expected: expectedJoint.type,
                actual: actualJoint.type,
            });
        }

        if (!arraysEqual(expectedJoint.axis, actualJoint.axis)) {
            diffs.push({
                type: 'JOINT_AXIS_MISMATCH',
                key,
                message: 'Joint axis differs',
                expected: expectedJoint.axis,
                actual: actualJoint.axis,
            });
        }

        if (!arraysEqual(expectedJoint.range, actualJoint.range)) {
            diffs.push({
                type: 'JOINT_RANGE_MISMATCH',
                key,
                message: 'Joint range differs',
                expected: expectedJoint.range,
                actual: actualJoint.range,
            });
        }
    });

    const expectedGeoms = new Map(expected.geoms.map((geom) => [geom.key, geom]));
    const actualGeoms = new Map(actual.geoms.map((geom) => [geom.key, geom]));
    expectedGeoms.forEach((expectedGeom, key) => {
        const actualGeom = actualGeoms.get(key);
        if (!actualGeom) {
            diffs.push({
                type: 'GEOM_MISSING',
                key,
                message: 'Geom missing in TS snapshot',
                expected: expectedGeom,
            });
            return;
        }

        if (expectedGeom.type !== actualGeom.type) {
            diffs.push({
                type: 'GEOM_TYPE_MISMATCH',
                key,
                message: 'Geom type differs',
                expected: expectedGeom.type,
                actual: actualGeom.type,
            });
        }

        if (expectedGeom.bodyKey !== actualGeom.bodyKey) {
            diffs.push({
                type: 'GEOM_BODY_MISMATCH',
                key,
                message: 'Geom parent body differs',
                expected: expectedGeom.bodyKey,
                actual: actualGeom.bodyKey,
            });
        }

        if (!arraysEqual(expectedGeom.size, actualGeom.size)) {
            diffs.push({
                type: 'GEOM_SIZE_MISMATCH',
                key,
                message: 'Geom size differs',
                expected: expectedGeom.size,
                actual: actualGeom.size,
            });
        }
    });

    const expectedMeshes = new Map(expected.assets.meshes.map((mesh) => [mesh.name, mesh]));
    const actualMeshes = new Map(actual.assets.meshes.map((mesh) => [mesh.name, mesh]));
    expectedMeshes.forEach((expectedMesh, key) => {
        const actualMesh = actualMeshes.get(key);
        if (!actualMesh || (expectedMesh.file || null) !== (actualMesh.file || null)) {
            diffs.push({
                type: 'MESH_PATH_MISMATCH',
                key,
                message: 'Mesh file path differs',
                expected: expectedMesh.file || null,
                actual: actualMesh?.file || null,
            });
        }
    });

    return diffs;
}
