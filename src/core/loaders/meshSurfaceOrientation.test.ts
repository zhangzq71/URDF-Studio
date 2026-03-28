import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  isLikelyThinSheetGeometry,
  prepareMeshSurfaceForSingleSidedRendering,
} from './meshSurfaceOrientation.ts';

function outwardFacingTriangleRatio(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  assert.ok(position);

  const index = geometry.getIndex();
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    vertex.fromBufferAttribute(position, vertexIndex);
    centroid.add(vertex);
  }
  centroid.multiplyScalar(1 / position.count);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();

  let outwardCount = 0;
  let triangleCount = 0;
  const triangleVertexCount = index ? index.count : position.count;
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
    if (normal.lengthSq() <= 1e-9) {
      continue;
    }

    faceCenter.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(centroid);
    if (normal.dot(faceCenter) >= 0) {
      outwardCount += 1;
    }
    triangleCount += 1;
  }

  return triangleCount > 0 ? outwardCount / triangleCount : 1;
}

function swapIndexedTriangleWinding(geometry: THREE.BufferGeometry, triangleOffset: number): void {
  const index = geometry.getIndex();
  assert.ok(index);
  const left = index.getX(triangleOffset + 1);
  const right = index.getX(triangleOffset + 2);
  index.setX(triangleOffset + 1, right);
  index.setX(triangleOffset + 2, left);
  index.needsUpdate = true;
}

function swapNonIndexedTriangleWinding(geometry: THREE.BufferGeometry, triangleOffset: number): void {
  const attributes = Object.values(geometry.attributes);
  for (const attribute of attributes) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      const left = attribute.getComponent(triangleOffset + 1, component);
      const right = attribute.getComponent(triangleOffset + 2, component);
      attribute.setComponent(triangleOffset + 1, component, right);
      attribute.setComponent(triangleOffset + 2, component, left);
    }
    attribute.needsUpdate = true;
  }
}

function createParallelOpenShellGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -1, -1, -1,
    -1, 1, -1,
    -1, 1, 1,
    -1, -1, -1,
    -1, 1, 1,
    -1, -1, 1,
    1, -1, -1,
    1, 1, -1,
    1, 1, 1,
    1, -1, -1,
    1, 1, 1,
    1, -1, 1,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

test('prepareMeshSurfaceForSingleSidedRendering repairs mixed winding in indexed geometry', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  swapIndexedTriangleWinding(geometry, 0);

  const beforeRatio = outwardFacingTriangleRatio(geometry);
  assert.ok(beforeRatio < 1, `expected mixed winding before repair, got ${beforeRatio}`);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(mesh);

  const summary = prepareMeshSurfaceForSingleSidedRendering(root);

  assert.ok(summary.flippedTriangleCount > 0);
  assert.equal(summary.repairedMeshCount, 1);
  assert.equal(outwardFacingTriangleRatio(geometry), 1);
  assert.equal(mesh.userData.mjcfPreferDoubleSide, false);
});

test('prepareMeshSurfaceForSingleSidedRendering repairs mixed winding in non-indexed geometry', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  swapNonIndexedTriangleWinding(geometry, 0);

  const beforeRatio = outwardFacingTriangleRatio(geometry);
  assert.ok(beforeRatio < 1, `expected mixed winding before repair, got ${beforeRatio}`);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(mesh);

  const summary = prepareMeshSurfaceForSingleSidedRendering(root);

  assert.ok(summary.flippedTriangleCount > 0);
  assert.equal(summary.repairedMeshCount, 1);
  assert.equal(outwardFacingTriangleRatio(geometry), 1);
});

test('isLikelyThinSheetGeometry keeps thin plates double-sided', () => {
  const thinPlate = new THREE.BoxGeometry(2, 1, 0.01);
  const thickShell = new THREE.BoxGeometry(2, 1, 0.2);

  assert.equal(isLikelyThinSheetGeometry(thinPlate), true);
  assert.equal(isLikelyThinSheetGeometry(thickShell), false);

  const mesh = new THREE.Mesh(thinPlate, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(mesh);
  prepareMeshSurfaceForSingleSidedRendering(root);

  assert.equal(mesh.userData.mjcfPreferDoubleSide, true);
});

test('prepareMeshSurfaceForSingleSidedRendering skips ambiguous open shells', () => {
  const geometry = createParallelOpenShellGeometry();
  const beforeRatio = outwardFacingTriangleRatio(geometry);
  assert.equal(beforeRatio, 0.5);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(mesh);

  const summary = prepareMeshSurfaceForSingleSidedRendering(root);

  assert.equal(summary.flippedTriangleCount, 0);
  assert.equal(summary.repairedMeshCount, 0);
  assert.equal(outwardFacingTriangleRatio(geometry), 0.5);
});
