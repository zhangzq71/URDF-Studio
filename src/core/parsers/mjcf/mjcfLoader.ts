/**
 * MJCF Loader entrypoint.
 * Parses MJCF XML and delegates hierarchy construction to shared builders.
 */

import * as THREE from 'three';
import { type MJCFMeshCache } from './mjcfGeometry';
import { buildMJCFHierarchy } from './mjcfHierarchyBuilder';
import { resolveMJCFMeshBackedPrimitiveGeoms } from './mjcfMeshBackedPrimitiveResolver';
import { parseMJCFModel } from './mjcfModel';
import { looksLikeMJCFDocument } from './mjcfUtils';

interface MJCFBody {
    name: string;
    pos: [number, number, number];
    quat?: [number, number, number, number];
    euler?: [number, number, number];
    geoms: MJCFGeom[];
    joints: MJCFJoint[];
    children: MJCFBody[];
}

interface MJCFGeom {
    name?: string;
    className?: string;
    classQName?: string;
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
    material?: string;
}

interface MJCFJoint {
    name: string;
    type: string;
    axis?: [number, number, number];
    range?: [number, number];
    pos?: [number, number, number];
}

/** Load MJCF XML content and create a Three.js scene graph. */
export async function loadMJCFToThreeJS(
    xmlContent: string,
    assets: Record<string, string>,
    sourceFileDir = '',
): Promise<THREE.Object3D | null> {
    try {
        const parsedModel = parseMJCFModel(xmlContent);
        if (!parsedModel) {
            return null;
        }

        const modelName = parsedModel.modelName;
        const compilerSettings = parsedModel.compilerSettings;
        console.log(`[MJCFLoader] Compiler settings: angle=${compilerSettings.angleUnit}, meshdir=${compilerSettings.meshdir}`);

        await resolveMJCFMeshBackedPrimitiveGeoms(parsedModel, {
            assets,
            sourceFileDir,
        });

        const meshMap = parsedModel.meshMap;
        const materialMap = parsedModel.materialMap;
        const textureMap = parsedModel.textureMap;
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
            materialMap,
            textureMap,
            sourceFileDir,
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
    return looksLikeMJCFDocument(content);
}
