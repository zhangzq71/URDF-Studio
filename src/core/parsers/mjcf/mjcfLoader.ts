/**
 * MJCF Loader entrypoint.
 * Parses MJCF XML and delegates hierarchy construction to shared builders.
 */

import * as THREE from 'three';
import {
    parseMJCFDefaults,
    parseMeshAssets,
    parseCompilerSettings,
    parseMaterialAssets,
    parseNumbers,
    parsePosAsTuple as parsePos,
    parseQuatAsTuple as parseQuat,
    resolveDefaultClassQName,
    resolveElementAttributes,
    type MJCFCompilerSettings,
    type MJCFMesh
} from './mjcfUtils';
import { type MJCFMeshCache } from './mjcfGeometry';
import { buildMJCFHierarchy } from './mjcfHierarchyBuilder';
import { parseMJCFModel } from './mjcfModel';

interface MJCFBody {
    name: string;
    pos: [number, number, number];
    quat?: [number, number, number, number]; // wxyz (MuJoCo order)
    euler?: [number, number, number];
    geoms: MJCFGeom[];
    joints: MJCFJoint[];
    children: MJCFBody[];
}

interface MJCFGeom {
    name?: string;
    type: string;
    size?: number[];
    mesh?: string;
    rgba?: [number, number, number, number];
    pos?: [number, number, number];
    quat?: [number, number, number, number]; // wxyz (MuJoCo order)
    fromto?: number[];
    contype?: number;
    conaffinity?: number;
    group?: number;
    material?: string;
}

interface MJCFJoint {
    name: string;
    type: string;
    axis?: [number, number, number];
    range?: [number, number];
    pos?: [number, number, number];
}

function parseBody(
    bodyEl: Element,
    meshMap: Map<string, MJCFMesh>,
    defaults: ReturnType<typeof parseMJCFDefaults>,
    activeClassQName?: string,
): MJCFBody {
    const bodyAttrs = resolveElementAttributes(defaults, 'body', bodyEl, activeClassQName);
    const name = bodyEl.getAttribute('name') || bodyAttrs.name || `body_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const pos = parsePos(bodyAttrs.pos || null);
    const quat = parseQuat(bodyAttrs.quat || null);
    const euler = bodyAttrs.euler ? parseNumbers(bodyAttrs.euler) as [number, number, number] : undefined;
    const nextActiveClassQName = resolveDefaultClassQName(defaults, bodyEl.getAttribute('childclass'), activeClassQName) || activeClassQName;

    const geoms: MJCFGeom[] = [];
    const geomElements = bodyEl.querySelectorAll(':scope > geom');
    geomElements.forEach(geomEl => {
        const geomAttrs = resolveElementAttributes(defaults, 'geom', geomEl, activeClassQName);
        const sizeArr = parseNumbers(geomAttrs.size || null);
        const fromtoStr = geomAttrs.fromto;
        const fromtoArr = fromtoStr ? parseNumbers(fromtoStr) : undefined;
        const meshAttr = geomAttrs.mesh;
        
        // Infer geometry type according to MJCF specification:
        // 1. Explicit type attribute takes priority (must be non-empty and trimmed)
        // 2. If mesh attribute exists 鈫?'mesh'
        // 3. If fromto attribute exists 鈫?'capsule' (MJCF default for fromto)
        // 4. Based on size array length (MJCF defaults):
        //    - 1 element 鈫?sphere (radius)
        //    - 2 elements 鈫?capsule (radius, half-length) - MJCF default for 2-element size
        //    - 3 elements 鈫?ellipsoid (semi-axes) - MJCF default for 3-element size
        // 5. Default 鈫?sphere
        const explicitType = geomAttrs.type?.trim() || null;
        let inferredType: string;
        
        if (explicitType) {
            inferredType = explicitType;
        } else if (meshAttr) {
            inferredType = 'mesh';
        } else if (fromtoArr && fromtoArr.length === 6) {
            inferredType = 'capsule'; // MJCF default for fromto is capsule
        } else if (sizeArr.length === 1) {
            inferredType = 'sphere';
        } else if (sizeArr.length === 2) {
            inferredType = 'capsule'; // MJCF default for 2-element size is capsule, not cylinder
        } else if (sizeArr.length >= 3) {
            inferredType = 'ellipsoid'; // MJCF default for 3-element size is ellipsoid
        } else {
            inferredType = 'sphere'; // Final fallback - MuJoCo default
        }
        
        const geom: MJCFGeom = {
            name: geomEl.getAttribute('name') || geomAttrs.name || undefined,
            type: inferredType,
            size: sizeArr,
            mesh: meshAttr || undefined,
            material: geomAttrs.material || undefined,
            pos: geomAttrs.pos ? parsePos(geomAttrs.pos) : undefined,
            quat: parseQuat(geomAttrs.quat || null),
            fromto: fromtoArr,
        };

        const rgbaStr = geomAttrs.rgba;
        if (rgbaStr) {
            const rgba = parseNumbers(rgbaStr);
            if (rgba.length >= 3) {
                geom.rgba = [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1];
            }
        }

        const contypeStr = geomAttrs.contype;
        const conaffinityStr = geomAttrs.conaffinity;
        const groupStr = geomAttrs.group;

        if (contypeStr) geom.contype = parseInt(contypeStr);
        if (conaffinityStr) geom.conaffinity = parseInt(conaffinityStr);
        if (groupStr) geom.group = parseInt(groupStr);

        geoms.push(geom);
    });

    const joints: MJCFJoint[] = [];
    const jointElements = bodyEl.querySelectorAll(':scope > joint');
    jointElements.forEach(jointEl => {
        const jointAttrs = resolveElementAttributes(defaults, 'joint', jointEl, activeClassQName);
        const joint: MJCFJoint = {
            name: jointEl.getAttribute('name') || jointAttrs.name || `joint_${Date.now()}`,
            type: jointAttrs.type || 'hinge',
        };

        const axisStr = jointAttrs.axis;
        if (axisStr) {
            const axisNums = parseNumbers(axisStr);
            joint.axis = [
                axisNums.length > 0 ? axisNums[0] : 0,
                axisNums.length > 1 ? axisNums[1] : 0,
                axisNums.length > 2 ? axisNums[2] : 1  // Default Z component to 1 if not specified
            ];
        } else {
            joint.axis = [0, 0, 1];
        }

        const rangeStr = jointAttrs.range;
        if (rangeStr) {
            const rangeNums = parseNumbers(rangeStr);
            joint.range = [
                rangeNums.length > 0 ? rangeNums[0] : -Math.PI,
                rangeNums.length > 1 ? rangeNums[1] : Math.PI
            ];
        }

        const posStr = jointAttrs.pos;
        if (posStr) {
            joint.pos = parsePos(posStr);
        }

        joints.push(joint);
    });

    const children: MJCFBody[] = [];
    const childBodyElements = bodyEl.querySelectorAll(':scope > body');
    childBodyElements.forEach(childEl => {
        children.push(parseBody(childEl, meshMap, defaults, nextActiveClassQName));
    });

    return { name, pos, quat, euler, geoms, joints, children };
}

/** Load MJCF XML content and create a Three.js scene graph. */
export async function loadMJCFToThreeJS(
    xmlContent: string,
    assets: Record<string, string>
): Promise<THREE.Object3D | null> {
    try {
        const parsedModel = parseMJCFModel(xmlContent);
        if (!parsedModel) {
            return null;
        }

        const modelName = parsedModel.modelName;
        const compilerSettings = parsedModel.compilerSettings;
        console.log(`[MJCFLoader] Compiler settings: angle=${compilerSettings.angleUnit}, meshdir=${compilerSettings.meshdir}`);

        const meshMap = parsedModel.meshMap;
        const materialMap = parsedModel.materialMap;
        const bodies: MJCFBody[] = [parsedModel.worldBody as MJCFBody];

        const rootGroup = new THREE.Group();
        rootGroup.name = modelName;
        (rootGroup as any).isURDFRobot = true;

        const meshCache: MJCFMeshCache = new Map<string, THREE.Object3D | THREE.BufferGeometry>();

        const { linksMap, jointsMap } = await buildMJCFHierarchy({
            bodies,
            rootGroup,
            meshMap,
            assets,
            meshCache,
            compilerSettings,
            materialMap
        });

        (rootGroup as any).links = linksMap;
        (rootGroup as any).joints = jointsMap;

        console.log(`[MJCFLoader] Loaded model "${modelName}" with ${Object.keys(linksMap).length} links and ${Object.keys(jointsMap).length} joints`);

        return rootGroup;

    } catch (error) {
        console.error('[MJCFLoader] Failed to load MJCF:', error);
        return null;
    }
}

/** Check whether XML root element is MJCF `<mujoco>`. */
export function isMJCFContent(content: string): boolean {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        const rootElement = doc.documentElement;
        return rootElement && rootElement.tagName.toLowerCase() === 'mujoco';
    } catch {
        return false;
    }
}




