/**
 * MJCF Loader entrypoint.
 * Parses MJCF XML and delegates hierarchy construction to shared builders.
 */

import * as THREE from 'three';
import {
    parseCompilerSettings,
    parseNumbers,
    parsePosAsTuple as parsePos,
    parseQuatAsTuple as parseQuat,
    type MJCFCompilerSettings,
    type MJCFMesh
} from './mjcfUtils';
import { type MJCFMeshCache } from './mjcfGeometry';
import { buildMJCFHierarchy } from './mjcfHierarchyBuilder';

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
}

interface MJCFJoint {
    name: string;
    type: string;
    axis?: [number, number, number];
    range?: [number, number];
    pos?: [number, number, number];
}

function parseMeshAssets(doc: Document, settings?: MJCFCompilerSettings): Map<string, MJCFMesh> {
    const meshMap = new Map<string, MJCFMesh>();
    const asset = doc.querySelector('asset');
    if (!asset) return meshMap;

    const meshes = asset.querySelectorAll('mesh');
    meshes.forEach((meshEl, index) => {
        let name = meshEl.getAttribute('name');
        let file = meshEl.getAttribute('file');

        if (file) {
            if (settings?.meshdir && !file.startsWith('/') && !file.includes(':')) {
                const prefix = settings.meshdir.endsWith('/') ? settings.meshdir : `${settings.meshdir}/`;
                file = `${prefix}${file}`;
            }

            if (!name) {
                const fileName = file.split('/').pop()?.split('\\').pop() || '';
                name = fileName.split('.')[0] || `mesh_${index}`;
            }

            const scaleStr = meshEl.getAttribute('scale');
            const scale = scaleStr ? parseNumbers(scaleStr) : undefined;

            console.debug(`[MJCFLoader] Parsed mesh asset: name="${name}", file="${file}"`);
            meshMap.set(name, { name, file, scale: scale && scale.length >= 3 ? scale : undefined });
        }
    });

    return meshMap;
}

function parseBody(bodyEl: Element, meshMap: Map<string, MJCFMesh>): MJCFBody {
    const name = bodyEl.getAttribute('name') || `body_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const pos = parsePos(bodyEl.getAttribute('pos'));
    const quat = parseQuat(bodyEl.getAttribute('quat'));
    const eulerStr = bodyEl.getAttribute('euler');
    const euler = eulerStr ? parseNumbers(eulerStr) as [number, number, number] : undefined;

    const geoms: MJCFGeom[] = [];
    const geomElements = bodyEl.querySelectorAll(':scope > geom');
    geomElements.forEach(geomEl => {
        const sizeArr = parseNumbers(geomEl.getAttribute('size'));
        const fromtoStr = geomEl.getAttribute('fromto');
        const fromtoArr = fromtoStr ? parseNumbers(fromtoStr) : undefined;
        const meshAttr = geomEl.getAttribute('mesh');
        
        // Infer geometry type according to MJCF specification:
        // 1. Explicit type attribute takes priority (must be non-empty and trimmed)
        // 2. If mesh attribute exists → 'mesh'
        // 3. If fromto attribute exists → 'capsule' (MJCF default for fromto)
        // 4. Based on size array length (MJCF defaults):
        //    - 1 element → sphere (radius)
        //    - 2 elements → capsule (radius, half-length) - MJCF default for 2-element size
        //    - 3 elements → ellipsoid (semi-axes) - MJCF default for 3-element size
        // 5. Default → sphere
        const explicitType = geomEl.getAttribute('type')?.trim() || null;
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
            name: geomEl.getAttribute('name') || undefined,
            type: inferredType,
            size: sizeArr,
            mesh: meshAttr || undefined,
            pos: geomEl.getAttribute('pos') ? parsePos(geomEl.getAttribute('pos')) : undefined,
            quat: parseQuat(geomEl.getAttribute('quat')),
            fromto: fromtoArr,
        };

        const rgbaStr = geomEl.getAttribute('rgba');
        if (rgbaStr) {
            const rgba = parseNumbers(rgbaStr);
            if (rgba.length >= 3) {
                geom.rgba = [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1];
            }
        }

        const contypeStr = geomEl.getAttribute('contype');
        const conaffinityStr = geomEl.getAttribute('conaffinity');
        const groupStr = geomEl.getAttribute('group');

        if (contypeStr) geom.contype = parseInt(contypeStr);
        if (conaffinityStr) geom.conaffinity = parseInt(conaffinityStr);
        if (groupStr) geom.group = parseInt(groupStr);

        geoms.push(geom);
    });

    const joints: MJCFJoint[] = [];
    const jointElements = bodyEl.querySelectorAll(':scope > joint');
    jointElements.forEach(jointEl => {
        const joint: MJCFJoint = {
            name: jointEl.getAttribute('name') || `joint_${Date.now()}`,
            type: jointEl.getAttribute('type') || 'hinge',
        };

        const axisStr = jointEl.getAttribute('axis');
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

        const rangeStr = jointEl.getAttribute('range');
        if (rangeStr) {
            const rangeNums = parseNumbers(rangeStr);
            joint.range = [
                rangeNums.length > 0 ? rangeNums[0] : -Math.PI,
                rangeNums.length > 1 ? rangeNums[1] : Math.PI
            ];
        }

        const posStr = jointEl.getAttribute('pos');
        if (posStr) {
            joint.pos = parsePos(posStr);
        }

        joints.push(joint);
    });

    const children: MJCFBody[] = [];
    const childBodyElements = bodyEl.querySelectorAll(':scope > body');
    childBodyElements.forEach(childEl => {
        children.push(parseBody(childEl, meshMap));
    });

    return { name, pos, quat, euler, geoms, joints, children };
}

/** Load MJCF XML content and create a Three.js scene graph. */
export async function loadMJCFToThreeJS(
    xmlContent: string,
    assets: Record<string, string>
): Promise<THREE.Object3D | null> {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.error('[MJCFLoader] XML parsing error:', parseError.textContent);
            return null;
        }

        const mujocoEl = doc.querySelector('mujoco');
        if (!mujocoEl) {
            console.error('[MJCFLoader] No <mujoco> root element found');
            return null;
        }

        const modelName = mujocoEl.getAttribute('model') || 'mjcf_robot';

        const compilerSettings = parseCompilerSettings(doc);
        console.log(`[MJCFLoader] Compiler settings: angle=${compilerSettings.angleUnit}, meshdir=${compilerSettings.meshdir}`);

        const meshMap = parseMeshAssets(doc, compilerSettings);

        const worldbodyEl = mujocoEl.querySelector('worldbody');
        if (!worldbodyEl) {
            console.error('[MJCFLoader] No <worldbody> element found');
            return null;
        }

        const bodies: MJCFBody[] = [];
        const bodyElements = worldbodyEl.querySelectorAll(':scope > body');
        bodyElements.forEach(bodyEl => {
            bodies.push(parseBody(bodyEl, meshMap));
        });

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
            compilerSettings
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
