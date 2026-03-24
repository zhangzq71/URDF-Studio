import * as THREE from 'three';

const POSITION_KEY_DECIMALS = 6;
const COPLANAR_OFFSET_FACTOR = -2;
const COPLANAR_OFFSET_UNITS = -2;
const COPLANAR_OFFSET_FLAG = '__urdfStudioCoplanarOffset';
const NEAR_COPLANAR_NORMAL_DOT = 0.999;
const NEAR_COPLANAR_PLANE_DISTANCE = 1e-3;
const NEAR_COPLANAR_CENTROID_DISTANCE = 1e-2;
const NEAR_COPLANAR_CENTROID_DISTANCE_SQ = NEAR_COPLANAR_CENTROID_DISTANCE ** 2;
const NEAR_COPLANAR_MIN_AREA_RATIO = 0.2;
const TRIANGLE_AREA_EPSILON = 1e-9;
type GeometryGroup = THREE.BufferGeometry['groups'][number];

type CoplanarMaterialAnalysis = {
    adjustedMaterialIndices: number[];
    duplicateTriangleCount: number;
    nearCoplanarTriangleCount: number;
};

type CoplanarMaterialOffsetResult = CoplanarMaterialAnalysis & {
    adjustedMaterialCount: number;
};

type TriangleDescriptor = {
    area: number;
    centroidX: number;
    centroidY: number;
    centroidZ: number;
    materialIndex: number;
    normalX: number;
    normalY: number;
    normalZ: number;
    planeConstant: number;
    triangleKey: string;
};

const EMPTY_ANALYSIS: CoplanarMaterialAnalysis = Object.freeze({
    adjustedMaterialIndices: Object.freeze([]) as number[],
    duplicateTriangleCount: 0,
    nearCoplanarTriangleCount: 0,
});

const geometryAnalysisCache = new WeakMap<THREE.BufferGeometry, Map<string, CoplanarMaterialAnalysis>>();
const _geometryCenter = new THREE.Vector3();

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

const getPositionComponent = (
    positionArray: ArrayLike<number>,
    vertexIndex: number,
    itemSize: number,
    axisOffset: number,
) => Number(positionArray[(vertexIndex * itemSize) + axisOffset] ?? 0);

const getTriangleBucketCoordinate = (value: number) => Math.floor(value / NEAR_COPLANAR_CENTROID_DISTANCE);

const buildTriangleBucketKey = (bucketX: number, bucketY: number, bucketZ: number) => `${bucketX}:${bucketY}:${bucketZ}`;

const buildTriangleDescriptor = (
    positionArray: ArrayLike<number>,
    itemSize: number,
    indexArray: ArrayLike<number> | null,
    start: number,
    offset: number,
    materialIndex: number,
    triangleKey: string,
): TriangleDescriptor | null => {
    const vertexIndexA = getTriangleVertexIndex(indexArray, start, offset);
    const vertexIndexB = getTriangleVertexIndex(indexArray, start, offset + 1);
    const vertexIndexC = getTriangleVertexIndex(indexArray, start, offset + 2);

    const ax = getPositionComponent(positionArray, vertexIndexA, itemSize, 0);
    const ay = getPositionComponent(positionArray, vertexIndexA, itemSize, 1);
    const az = getPositionComponent(positionArray, vertexIndexA, itemSize, 2);
    const bx = getPositionComponent(positionArray, vertexIndexB, itemSize, 0);
    const by = getPositionComponent(positionArray, vertexIndexB, itemSize, 1);
    const bz = getPositionComponent(positionArray, vertexIndexB, itemSize, 2);
    const cx = getPositionComponent(positionArray, vertexIndexC, itemSize, 0);
    const cy = getPositionComponent(positionArray, vertexIndexC, itemSize, 1);
    const cz = getPositionComponent(positionArray, vertexIndexC, itemSize, 2);

    const edgeABX = bx - ax;
    const edgeABY = by - ay;
    const edgeABZ = bz - az;
    const edgeACX = cx - ax;
    const edgeACY = cy - ay;
    const edgeACZ = cz - az;

    const normalX = (edgeABY * edgeACZ) - (edgeABZ * edgeACY);
    const normalY = (edgeABZ * edgeACX) - (edgeABX * edgeACZ);
    const normalZ = (edgeABX * edgeACY) - (edgeABY * edgeACX);
    const normalLength = Math.hypot(normalX, normalY, normalZ);
    if (normalLength <= TRIANGLE_AREA_EPSILON) {
        return null;
    }

    const inverseNormalLength = 1 / normalLength;
    const normalizedNormalX = normalX * inverseNormalLength;
    const normalizedNormalY = normalY * inverseNormalLength;
    const normalizedNormalZ = normalZ * inverseNormalLength;
    const centroidX = (ax + bx + cx) / 3;
    const centroidY = (ay + by + cy) / 3;
    const centroidZ = (az + bz + cz) / 3;

    return {
        area: normalLength * 0.5,
        centroidX,
        centroidY,
        centroidZ,
        materialIndex,
        normalX: normalizedNormalX,
        normalY: normalizedNormalY,
        normalZ: normalizedNormalZ,
        planeConstant: (normalizedNormalX * centroidX) + (normalizedNormalY * centroidY) + (normalizedNormalZ * centroidZ),
        triangleKey,
    };
};

const isNearCoplanarTrianglePair = (triangle: TriangleDescriptor, candidate: TriangleDescriptor) => {
    const normalDot = (triangle.normalX * candidate.normalX)
        + (triangle.normalY * candidate.normalY)
        + (triangle.normalZ * candidate.normalZ);
    if (Math.abs(normalDot) < NEAR_COPLANAR_NORMAL_DOT) {
        return false;
    }

    const alignedCandidatePlaneConstant = normalDot >= 0
        ? candidate.planeConstant
        : -candidate.planeConstant;
    if (Math.abs(triangle.planeConstant - alignedCandidatePlaneConstant) > NEAR_COPLANAR_PLANE_DISTANCE) {
        return false;
    }

    const centroidDeltaX = triangle.centroidX - candidate.centroidX;
    const centroidDeltaY = triangle.centroidY - candidate.centroidY;
    const centroidDeltaZ = triangle.centroidZ - candidate.centroidZ;
    const centroidDistanceSq = (centroidDeltaX ** 2) + (centroidDeltaY ** 2) + (centroidDeltaZ ** 2);
    if (centroidDistanceSq > NEAR_COPLANAR_CENTROID_DISTANCE_SQ) {
        return false;
    }

    const largerArea = Math.max(triangle.area, candidate.area);
    const smallerArea = Math.min(triangle.area, candidate.area);
    return largerArea > 0 && (smallerArea / largerArea) >= NEAR_COPLANAR_MIN_AREA_RATIO;
};

const analyzeCoplanarMaterialGroups = (geometry: THREE.BufferGeometry): CoplanarMaterialAnalysis => {
    const groups = geometry.groups;
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize < 3 || groups.length < 2) {
        return EMPTY_ANALYSIS;
    }

    geometry.computeBoundingBox();
    const geometryBoundingBox = geometry.boundingBox;
    if (!geometryBoundingBox) {
        return EMPTY_ANALYSIS;
    }
    geometryBoundingBox.getCenter(_geometryCenter);

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
    const centroidDistanceSumPerMaterial = new Map<number, number>();
    const measuredTrianglesPerMaterial = new Map<number, number>();
    const overlappingMaterials = new Map<number, Set<number>>();
    const nearCoplanarTriangleBuckets = new Map<string, TriangleDescriptor[]>();
    const materialsToOffset = new Set<number>();
    let duplicateTriangleCount = 0;
    let nearCoplanarTriangleCount = 0;

    const connectOverlappingMaterials = (materialIndices: number[]) => {
        if (materialIndices.length < 2) {
            return;
        }

        for (const materialIndex of materialIndices) {
            if (!overlappingMaterials.has(materialIndex)) {
                overlappingMaterials.set(materialIndex, new Set());
            }
        }

        const firstMaterialIndex = materialIndices[0];
        const firstNeighbors = overlappingMaterials.get(firstMaterialIndex)!;
        for (let index = 1; index < materialIndices.length; index += 1) {
            const materialIndex = materialIndices[index];
            firstNeighbors.add(materialIndex);
            overlappingMaterials.get(materialIndex)!.add(firstMaterialIndex);
        }
    };

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
            } else {
                triangleOwners.set(triangleKey, new Set([materialIndex]));
            }

            const triangle = buildTriangleDescriptor(
                positionArray,
                position.itemSize,
                indexArray,
                start,
                offset,
                materialIndex,
                triangleKey,
            );
            if (!triangle) {
                continue;
            }

            const centroidDistance = Math.hypot(
                triangle.centroidX - _geometryCenter.x,
                triangle.centroidY - _geometryCenter.y,
                triangle.centroidZ - _geometryCenter.z,
            );
            centroidDistanceSumPerMaterial.set(
                materialIndex,
                (centroidDistanceSumPerMaterial.get(materialIndex) ?? 0) + centroidDistance,
            );
            measuredTrianglesPerMaterial.set(
                materialIndex,
                (measuredTrianglesPerMaterial.get(materialIndex) ?? 0) + 1,
            );

            const bucketX = getTriangleBucketCoordinate(triangle.centroidX);
            const bucketY = getTriangleBucketCoordinate(triangle.centroidY);
            const bucketZ = getTriangleBucketCoordinate(triangle.centroidZ);

            for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
                for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
                    for (let deltaZ = -1; deltaZ <= 1; deltaZ += 1) {
                        const bucketKey = buildTriangleBucketKey(bucketX + deltaX, bucketY + deltaY, bucketZ + deltaZ);
                        const candidates = nearCoplanarTriangleBuckets.get(bucketKey);
                        if (!candidates) {
                            continue;
                        }

                        for (const candidate of candidates) {
                            if (candidate.materialIndex === materialIndex || candidate.triangleKey === triangleKey) {
                                continue;
                            }

                            if (!isNearCoplanarTrianglePair(triangle, candidate)) {
                                continue;
                            }

                            nearCoplanarTriangleCount += 1;
                            connectOverlappingMaterials([candidate.materialIndex, materialIndex]);
                        }
                    }
                }
            }

            const ownBucketKey = buildTriangleBucketKey(bucketX, bucketY, bucketZ);
            const bucketEntries = nearCoplanarTriangleBuckets.get(ownBucketKey);
            if (bucketEntries) {
                bucketEntries.push(triangle);
            } else {
                nearCoplanarTriangleBuckets.set(ownBucketKey, [triangle]);
            }
        }
    }

    for (const owners of triangleOwners.values()) {
        if (owners.size < 2) {
            continue;
        }

        duplicateTriangleCount += 1;
        const materialIndices = [...owners].sort((left, right) => left - right);
        connectOverlappingMaterials(materialIndices);
    }

    const visitedMaterials = new Set<number>();
    const getAverageCentroidDistance = (materialIndex: number) => {
        const triangleCount = measuredTrianglesPerMaterial.get(materialIndex) ?? 0;
        if (triangleCount <= 0) {
            return Number.POSITIVE_INFINITY;
        }

        return (centroidDistanceSumPerMaterial.get(materialIndex) ?? 0) / triangleCount;
    };
    const pickAnchorMaterialIndex = (componentMaterialIndices: number[]) => componentMaterialIndices.reduce((bestMaterialIndex, materialIndex) => {
        const bestAverageCentroidDistance = getAverageCentroidDistance(bestMaterialIndex);
        const averageCentroidDistance = getAverageCentroidDistance(materialIndex);
        if (averageCentroidDistance < (bestAverageCentroidDistance - 1e-6)) {
            return materialIndex;
        }

        if (Math.abs(averageCentroidDistance - bestAverageCentroidDistance) > 1e-6) {
            return bestMaterialIndex;
        }

        const bestTriangleCount = trianglesPerMaterial.get(bestMaterialIndex) ?? 0;
        const triangleCount = trianglesPerMaterial.get(materialIndex) ?? 0;
        if (triangleCount > bestTriangleCount) {
            return materialIndex;
        }

        if (triangleCount === bestTriangleCount && materialIndex < bestMaterialIndex) {
            return materialIndex;
        }

        return bestMaterialIndex;
    }, componentMaterialIndices[0]);

    for (const materialIndex of overlappingMaterials.keys()) {
        if (visitedMaterials.has(materialIndex)) {
            continue;
        }

        const componentMaterialIndices: number[] = [];
        const stack = [materialIndex];
        visitedMaterials.add(materialIndex);

        while (stack.length > 0) {
            const currentMaterialIndex = stack.pop()!;
            componentMaterialIndices.push(currentMaterialIndex);

            for (const neighborMaterialIndex of overlappingMaterials.get(currentMaterialIndex) ?? []) {
                if (visitedMaterials.has(neighborMaterialIndex)) {
                    continue;
                }

                visitedMaterials.add(neighborMaterialIndex);
                stack.push(neighborMaterialIndex);
            }
        }

        if (componentMaterialIndices.length < 2) {
            continue;
        }

        const anchorMaterialIndex = pickAnchorMaterialIndex(componentMaterialIndices);

        for (const candidateMaterialIndex of componentMaterialIndices) {
            if (candidateMaterialIndex !== anchorMaterialIndex) {
                materialsToOffset.add(candidateMaterialIndex);
            }
        }
    }

    const analysis: CoplanarMaterialAnalysis = {
        adjustedMaterialIndices: [...materialsToOffset].sort((left, right) => left - right),
        duplicateTriangleCount,
        nearCoplanarTriangleCount,
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

export const markMaterialAsCoplanarOffset = <T extends THREE.Material>(material: T): T =>
    ensureOffsetMaterial(material) as T;
