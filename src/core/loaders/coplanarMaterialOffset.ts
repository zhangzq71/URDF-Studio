import * as THREE from 'three';

const POSITION_KEY_DECIMALS = 6;
const COPLANAR_OFFSET_FACTOR = -2;
const COPLANAR_OFFSET_UNITS = -2;
const COPLANAR_OFFSET_FLAG = '__urdfStudioCoplanarOffset';
type GeometryGroup = THREE.BufferGeometry['groups'][number];

type CoplanarMaterialAnalysis = {
    adjustedMaterialIndices: number[];
    duplicateTriangleCount: number;
};

type CoplanarMaterialOffsetResult = CoplanarMaterialAnalysis & {
    adjustedMaterialCount: number;
};

const EMPTY_ANALYSIS: CoplanarMaterialAnalysis = Object.freeze({
    adjustedMaterialIndices: Object.freeze([]) as number[],
    duplicateTriangleCount: 0,
});

const geometryAnalysisCache = new WeakMap<THREE.BufferGeometry, Map<string, CoplanarMaterialAnalysis>>();

const toFiniteGroupValue = (value: number) => {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }

    return Math.floor(value);
};

const buildGroupsSignature = (groups: GeometryGroup[]) => groups
    .map((group) => `${toFiniteGroupValue(group.start)}:${toFiniteGroupValue(group.count)}:${toFiniteGroupValue(group.materialIndex ?? 0)}`)
    .join('|');

const getTriangleVertexIndex = (
    indexArray: ArrayLike<number> | null,
    start: number,
    offset: number,
) => {
    const pointer = start + offset;
    return indexArray ? Number(indexArray[pointer] ?? 0) : pointer;
};

const buildVertexKey = (
    positionArray: ArrayLike<number>,
    vertexIndex: number,
    itemSize: number,
) => {
    const start = vertexIndex * itemSize;
    const x = Number(positionArray[start] ?? 0).toFixed(POSITION_KEY_DECIMALS);
    const y = Number(positionArray[start + 1] ?? 0).toFixed(POSITION_KEY_DECIMALS);
    const z = Number(positionArray[start + 2] ?? 0).toFixed(POSITION_KEY_DECIMALS);

    return `${x},${y},${z}`;
};

const buildTriangleKey = (
    positionArray: ArrayLike<number>,
    itemSize: number,
    indexArray: ArrayLike<number> | null,
    start: number,
    offset: number,
) => {
    const vertices = [
        buildVertexKey(positionArray, getTriangleVertexIndex(indexArray, start, offset), itemSize),
        buildVertexKey(positionArray, getTriangleVertexIndex(indexArray, start, offset + 1), itemSize),
        buildVertexKey(positionArray, getTriangleVertexIndex(indexArray, start, offset + 2), itemSize),
    ];

    vertices.sort();
    return vertices.join('|');
};

const analyzeCoplanarMaterialGroups = (geometry: THREE.BufferGeometry): CoplanarMaterialAnalysis => {
    const groups = geometry.groups;
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize < 3 || groups.length < 2) {
        return EMPTY_ANALYSIS;
    }

    const signature = buildGroupsSignature(groups);
    const cachedBySignature = geometryAnalysisCache.get(geometry);
    const cached = cachedBySignature?.get(signature);
    if (cached) {
        return cached;
    }

    const positionArray = position.array;
    const indexArray = geometry.index?.array ?? null;
    const triangleOwners = new Map<string, Set<number>>();
    const trianglesPerMaterial = new Map<number, number>();

    for (const group of groups) {
        const materialIndex = toFiniteGroupValue(group.materialIndex ?? 0);
        const start = toFiniteGroupValue(group.start);
        const count = toFiniteGroupValue(group.count);
        const triangleCount = Math.floor(count / 3);
        if (triangleCount <= 0) {
            continue;
        }

        trianglesPerMaterial.set(materialIndex, (trianglesPerMaterial.get(materialIndex) ?? 0) + triangleCount);

        for (let offset = 0; offset + 2 < count; offset += 3) {
            const triangleKey = buildTriangleKey(positionArray, position.itemSize, indexArray, start, offset);
            const owners = triangleOwners.get(triangleKey);
            if (owners) {
                owners.add(materialIndex);
                continue;
            }

            triangleOwners.set(triangleKey, new Set([materialIndex]));
        }
    }

    const materialsToOffset = new Set<number>();
    let duplicateTriangleCount = 0;

    for (const owners of triangleOwners.values()) {
        if (owners.size < 2) {
            continue;
        }

        duplicateTriangleCount += 1;
        const materialIndices = [...owners].sort((left, right) => left - right);
        let anchorMaterialIndex = materialIndices[0];
        let anchorTriangleCount = trianglesPerMaterial.get(anchorMaterialIndex) ?? 0;

        for (let index = 1; index < materialIndices.length; index += 1) {
            const materialIndex = materialIndices[index];
            const triangleCount = trianglesPerMaterial.get(materialIndex) ?? 0;
            if (triangleCount > anchorTriangleCount) {
                anchorMaterialIndex = materialIndex;
                anchorTriangleCount = triangleCount;
            }
        }

        for (const materialIndex of materialIndices) {
            if (materialIndex !== anchorMaterialIndex) {
                materialsToOffset.add(materialIndex);
            }
        }
    }

    const analysis: CoplanarMaterialAnalysis = {
        adjustedMaterialIndices: [...materialsToOffset].sort((left, right) => left - right),
        duplicateTriangleCount,
    };

    const nextCache = cachedBySignature ?? new Map<string, CoplanarMaterialAnalysis>();
    nextCache.set(signature, analysis);
    geometryAnalysisCache.set(geometry, nextCache);

    return analysis;
};

const ensureOffsetMaterial = (material: THREE.Material) => {
    const alreadyAdjusted = material.userData?.[COPLANAR_OFFSET_FLAG] === true;
    const target = alreadyAdjusted ? material : material.clone();
    const nextUserData = { ...(target.userData ?? {}) };
    nextUserData[COPLANAR_OFFSET_FLAG] = true;
    target.userData = nextUserData;
    target.polygonOffset = true;
    target.polygonOffsetFactor = Math.min(Number(target.polygonOffsetFactor) || 0, COPLANAR_OFFSET_FACTOR);
    target.polygonOffsetUnits = Math.min(Number(target.polygonOffsetUnits) || 0, COPLANAR_OFFSET_UNITS);
    target.needsUpdate = true;

    return target;
};

export const mitigateCoplanarMaterialZFighting = (mesh: THREE.Mesh): CoplanarMaterialOffsetResult => {
    const geometry = mesh.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) {
        return {
            ...EMPTY_ANALYSIS,
            adjustedMaterialCount: 0,
        };
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length < 2 || geometry.groups.length < 2) {
        return {
            ...EMPTY_ANALYSIS,
            adjustedMaterialCount: 0,
        };
    }

    const analysis = analyzeCoplanarMaterialGroups(geometry);
    if (analysis.adjustedMaterialIndices.length === 0) {
        return {
            ...analysis,
            adjustedMaterialCount: 0,
        };
    }

    const nextMaterials = Array.isArray(mesh.material) ? mesh.material.slice() : materials.slice();
    let adjustedMaterialCount = 0;

    for (const materialIndex of analysis.adjustedMaterialIndices) {
        const material = nextMaterials[materialIndex];
        if (!material) {
            continue;
        }

        const nextMaterial = ensureOffsetMaterial(material);
        if (nextMaterial !== material) {
            nextMaterials[materialIndex] = nextMaterial;
        }
        adjustedMaterialCount += 1;
    }

    if (adjustedMaterialCount > 0) {
        mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
    }

    return {
        ...analysis,
        adjustedMaterialCount,
    };
};

export const isCoplanarOffsetMaterial = (material: THREE.Material | null | undefined) =>
    material?.userData?.[COPLANAR_OFFSET_FLAG] === true;
