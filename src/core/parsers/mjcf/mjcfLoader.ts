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
import { createMainThreadYieldController, yieldToMainThread } from '@/core/utils/yieldToMainThread';

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

export interface MJCFLoadProgress {
    phase: 'preparing-scene' | 'streaming-meshes' | 'finalizing-scene' | 'ready';
    progressPercent?: number | null;
    loadedCount?: number | null;
    totalCount?: number | null;
}

/** Load MJCF XML content and create a Three.js scene graph. */
export async function loadMJCFToThreeJS(
    xmlContent: string,
    assets: Record<string, string>,
    sourceFileDir = '',
    onProgress?: (progress: MJCFLoadProgress) => void,
): Promise<THREE.Object3D | null> {
    const emitProgress = (progress: MJCFLoadProgress) => {
        onProgress?.(progress);
    };

    try {
        const yieldIfNeeded = createMainThreadYieldController();
        emitProgress({
            phase: 'preparing-scene',
            progressPercent: 0,
        });

        await yieldToMainThread();
        const parsedModel = parseMJCFModel(xmlContent);
        if (!parsedModel) {
            return null;
        }

        const modelName = parsedModel.modelName;
        const compilerSettings = parsedModel.compilerSettings;

        emitProgress({
            phase: 'preparing-scene',
            progressPercent: 16,
        });
        await yieldIfNeeded();

        const meshCache: MJCFMeshCache = new Map();

        await resolveMJCFMeshBackedPrimitiveGeoms(parsedModel, {
            assets,
            meshCache,
            sourceFileDir,
            yieldIfNeeded,
        });

        emitProgress({
            phase: 'preparing-scene',
            progressPercent: 28,
        });
        await yieldIfNeeded();

        const meshMap = parsedModel.meshMap;
        const materialMap = parsedModel.materialMap;
        const textureMap = parsedModel.textureMap;
        const bodies: MJCFBody[] = [parsedModel.worldBody as MJCFBody];

        const rootGroup = new THREE.Group();
        rootGroup.name = modelName;
        (rootGroup as any).isURDFRobot = true;

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
            yieldIfNeeded,
            onProgress: ({ processedGeoms, totalGeoms }) => {
                const normalizedPercent = totalGeoms > 0
                    ? 28 + (processedGeoms / totalGeoms) * 60
                    : 88;

                emitProgress({
                    phase: 'streaming-meshes',
                    loadedCount: processedGeoms,
                    totalCount: totalGeoms,
                    progressPercent: normalizedPercent,
                });
            },
        });

        emitProgress({
            phase: 'finalizing-scene',
            progressPercent: 96,
        });
        await yieldIfNeeded();

        (rootGroup as any).links = linksMap;
        (rootGroup as any).joints = jointsMap;

        emitProgress({
            phase: 'ready',
            progressPercent: 100,
        });

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
