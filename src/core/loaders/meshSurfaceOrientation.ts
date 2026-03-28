import * as THREE from 'three';

const ORIENTATION_EPSILON = 1e-9;
const THIN_SHEET_RATIO = 0.02;
const BOUNDS_EPSILON = 1e-6;
const MAX_AUTO_REPAIR_INWARD_RATIO = 0.2;

function swapAttributeElements(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  leftIndex: number,
  rightIndex: number,
): void {
  const itemSize = attribute.itemSize;
  for (let component = 0; component < itemSize; component += 1) {
    const leftValue = attribute.getComponent(leftIndex, component);
    const rightValue = attribute.getComponent(rightIndex, component);
    attribute.setComponent(leftIndex, component, rightValue);
    attribute.setComponent(rightIndex, component, leftValue);
  }
}

function swapTriangleVerticesInNonIndexedGeometry(
  geometry: THREE.BufferGeometry,
  leftVertexIndex: number,
  rightVertexIndex: number,
): void {
  Object.values(geometry.attributes).forEach((attribute) => {
    if (!attribute) {
      return;
    }

    swapAttributeElements(attribute, leftVertexIndex, rightVertexIndex);
    attribute.needsUpdate = true;
  });
}

function swapTriangleVerticesInIndexedGeometry(
  geometry: THREE.BufferGeometry,
  triangleOffset: number,
): void {
  const index = geometry.getIndex();
  if (!index) {
    return;
  }

  const left = index.getX(triangleOffset + 1);
  const right = index.getX(triangleOffset + 2);
  index.setX(triangleOffset + 1, right);
  index.setX(triangleOffset + 2, left);
  index.needsUpdate = true;
}

function computeGeometryCentroid(geometry: THREE.BufferGeometry): THREE.Vector3 | null {
  const position = geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) && !(position instanceof THREE.InterleavedBufferAttribute)) {
    return null;
  }

  if (position.count <= 0) {
    return null;
  }

  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    centroid.add(vertex);
  }

  return centroid.multiplyScalar(1 / position.count);
}

interface GeometrySurfaceOrientationAnalysis {
  inwardTriangleCount: number;
  validTriangleCount: number;
}

function analyzeGeometrySurfaceOrientation(
  geometry: THREE.BufferGeometry,
): GeometrySurfaceOrientationAnalysis | null {
  const position = geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) && !(position instanceof THREE.InterleavedBufferAttribute)) {
    return null;
  }

  const centroid = computeGeometryCentroid(geometry);
  if (!centroid) {
    return null;
  }

  const index = geometry.getIndex();
  const triangleVertexCount = index ? index.count : position.count;
  if (!Number.isFinite(triangleVertexCount) || triangleVertexCount < 3) {
    return null;
  }

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();
  let inwardTriangleCount = 0;
  let validTriangleCount = 0;

  for (let triangleOffset = 0; triangleOffset <= triangleVertexCount - 3; triangleOffset += 3) {
    const ia = index ? index.getX(triangleOffset) : triangleOffset;
    const ib = index ? index.getX(triangleOffset + 1) : triangleOffset + 1;
    const ic = index ? index.getX(triangleOffset + 2) : triangleOffset + 2;

    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    if (normal.lengthSq() <= ORIENTATION_EPSILON) {
      continue;
    }

    faceCenter.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const outwardHint = faceCenter.sub(centroid);
    if (outwardHint.lengthSq() <= ORIENTATION_EPSILON) {
      continue;
    }

    validTriangleCount += 1;
    if (normal.dot(outwardHint) < -ORIENTATION_EPSILON) {
      inwardTriangleCount += 1;
    }
  }

  return {
    inwardTriangleCount,
    validTriangleCount,
  };
}

function fixGeometryTriangleWinding(geometry: THREE.BufferGeometry): number {
  const analysis = analyzeGeometrySurfaceOrientation(geometry);
  if (!analysis || analysis.inwardTriangleCount <= 0 || analysis.validTriangleCount <= 0) {
    return 0;
  }

  const inwardTriangleRatio = analysis.inwardTriangleCount / analysis.validTriangleCount;
  // Open shell meshes can legitimately place a large share of faces "behind" the
  // geometry centroid. In that case the centroid heuristic becomes unreliable and
  // causes false culling on single-sided materials, so only repair small pockets
  // of obviously inverted triangles.
  if (inwardTriangleRatio > MAX_AUTO_REPAIR_INWARD_RATIO) {
    return 0;
  }

  const position = geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) && !(position instanceof THREE.InterleavedBufferAttribute)) {
    return 0;
  }

  const centroid = computeGeometryCentroid(geometry);
  if (!centroid) {
    return 0;
  }

  const index = geometry.getIndex();
  const triangleVertexCount = index ? index.count : position.count;
  if (!Number.isFinite(triangleVertexCount) || triangleVertexCount < 3) {
    return 0;
  }

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();
  let flippedTriangleCount = 0;

  for (let triangleOffset = 0; triangleOffset <= triangleVertexCount - 3; triangleOffset += 3) {
    const ia = index ? index.getX(triangleOffset) : triangleOffset;
    const ib = index ? index.getX(triangleOffset + 1) : triangleOffset + 1;
    const ic = index ? index.getX(triangleOffset + 2) : triangleOffset + 2;

    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    if (normal.lengthSq() <= ORIENTATION_EPSILON) {
      continue;
    }

    faceCenter.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const outwardHint = faceCenter.sub(centroid);
    if (outwardHint.lengthSq() <= ORIENTATION_EPSILON) {
      continue;
    }

    if (normal.dot(outwardHint) >= -ORIENTATION_EPSILON) {
      continue;
    }

    if (index) {
      swapTriangleVerticesInIndexedGeometry(geometry, triangleOffset);
    } else {
      swapTriangleVerticesInNonIndexedGeometry(geometry, triangleOffset + 1, triangleOffset + 2);
    }
    flippedTriangleCount += 1;
  }

  if (flippedTriangleCount > 0) {
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  return flippedTriangleCount;
}

export function isLikelyThinSheetGeometry(geometry: THREE.BufferGeometry): boolean {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    return false;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const axes = [size.x, size.y, size.z].filter((value) => value > BOUNDS_EPSILON);
  if (axes.length < 2) {
    return false;
  }

  const minAxis = Math.min(...axes);
  const maxAxis = Math.max(...axes);
  if (maxAxis <= BOUNDS_EPSILON) {
    return false;
  }

  return (minAxis / maxAxis) <= THIN_SHEET_RATIO;
}

export interface MeshSurfacePreparationSummary {
  flippedTriangleCount: number;
  repairedMeshCount: number;
}

export function prepareMeshSurfaceForSingleSidedRendering(root: THREE.Object3D): MeshSurfacePreparationSummary {
  const summary: MeshSurfacePreparationSummary = {
    flippedTriangleCount: 0,
    repairedMeshCount: 0,
  };

  root.traverse((child: any) => {
    if (!child?.isMesh || !(child.geometry instanceof THREE.BufferGeometry)) {
      return;
    }

    const flippedTriangleCount = fixGeometryTriangleWinding(child.geometry);
    if (flippedTriangleCount > 0) {
      summary.flippedTriangleCount += flippedTriangleCount;
      summary.repairedMeshCount += 1;
    }

    child.userData = {
      ...(child.userData ?? {}),
      mjcfPreferDoubleSide: isLikelyThinSheetGeometry(child.geometry),
    };
  });

  return summary;
}
