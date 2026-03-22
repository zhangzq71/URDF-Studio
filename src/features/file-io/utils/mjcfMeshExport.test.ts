import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { JSDOM } from 'jsdom';

import { buildColladaRootNormalizationHints, createMeshLoader } from '@/core/loaders';
import { DEFAULT_LINK, GeometryType, type RobotState } from '@/types';

import { prepareMjcfMeshExportAssets } from './mjcfMeshExport';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function getWorldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function expectBoxEquals(actual: THREE.Box3, expected: THREE.Box3, epsilon = 1e-5): void {
  const actualMin = actual.min.toArray();
  const expectedMin = expected.min.toArray();
  const actualMax = actual.max.toArray();
  const expectedMax = expected.max.toArray();

  actualMin.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedMin[index]) < epsilon);
  });
  actualMax.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedMax[index]) < epsilon);
  });
}

function countObjFaces(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => line.startsWith('f '))
    .length;
}

test('prepareMjcfMeshExportAssets converts go2 Collada meshes into baked OBJ files', async () => {
  const sourcePath = 'package://go2_description/dae/hip.dae';
  const meshFilePath = 'test/unitree_ros/robots/go2_description/dae/hip.dae';
  const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshFilePath, 'utf8')).toString('base64')}`;
  const robot: RobotState = {
    name: 'go2-convert',
    rootLinkId: 'hip_link',
    selection: { type: null, id: null },
    links: {
      hip_link: {
        ...DEFAULT_LINK,
        id: 'hip_link',
        name: 'hip_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#808080',
          meshPath: sourcePath,
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: Math.PI, p: 0, y: 0 },
          },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
        collisionBodies: [],
      },
    },
    joints: {},
    materials: {},
  };
  const assets = {
    [meshFilePath]: meshDataUrl,
    [sourcePath]: meshDataUrl,
    'hip.dae': meshDataUrl,
  };
  const referenceManager = new THREE.LoadingManager();
  const referenceLoader = createMeshLoader(
    assets,
    referenceManager,
    '',
    {
      colladaRootNormalizationHints: buildColladaRootNormalizationHints(robot.links),
    },
  );

  const referenceObject = await new Promise<THREE.Object3D>((resolve, reject) => {
    referenceLoader(sourcePath, referenceManager, (result, err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(result);
    });
  });

  const prepared = await prepareMjcfMeshExportAssets({
    robot,
    assets,
  });

  const overridePath = prepared.meshPathOverrides.get(sourcePath);
  assert.equal(overridePath, 'dae/hip.dae.obj');

  const convertedBlob = overridePath ? prepared.archiveFiles.get(overridePath) : null;
  assert.ok(convertedBlob);

  const convertedObject = new OBJLoader().parse(await convertedBlob!.text());
  assert.ok(Math.abs(convertedObject.rotation.x) < 1e-6);
  assert.ok(Math.abs(convertedObject.rotation.y) < 1e-6);
  assert.ok(Math.abs(convertedObject.rotation.z) < 1e-6);
  expectBoxEquals(getWorldBox(convertedObject), getWorldBox(referenceObject));
});

test('prepareMjcfMeshExportAssets extracts colored visual mesh variants from go2 Collada assets without duplicating full-mesh faces', async () => {
  const sourcePath = 'package://go2_description/dae/base.dae';
  const meshFilePath = 'test/unitree_ros/robots/go2_description/dae/base.dae';
  const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshFilePath, 'utf8')).toString('base64')}`;
  const robot: RobotState = {
    name: 'go2-visual-variants',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          meshPath: sourcePath,
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: Math.PI, p: 0, y: 0 },
          },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
        collisionBodies: [],
      },
    },
    joints: {},
    materials: {},
  };
  const assets = {
    [meshFilePath]: meshDataUrl,
    [sourcePath]: meshDataUrl,
    'base.dae': meshDataUrl,
  };

  const prepared = await prepareMjcfMeshExportAssets({
    robot,
    assets,
  });

  const overridePath = prepared.meshPathOverrides.get(sourcePath);
  assert.equal(overridePath, 'dae/base.dae.obj');

  const fullMeshBlob = overridePath ? prepared.archiveFiles.get(overridePath) : null;
  assert.ok(fullMeshBlob, 'expected converted base OBJ export');

  const variants = prepared.visualMeshVariants.get(sourcePath);
  assert.ok(variants, 'expected multi-material visual variants for go2 base mesh');
  assert.ok(variants.length >= 4, 'expected at least four split visual mesh variants');

  const namedVariants = new Set(variants.map((variant) => variant.sourceMaterialName).filter(Boolean));
  assert.ok(namedVariants.size >= 4, 'expected multiple named material variants from the Collada asset');

  const fullFaceCount = countObjFaces(await fullMeshBlob!.text());
  assert.ok(fullFaceCount > 0, 'expected converted base OBJ to contain faces');

  const variantFaceCounts = await Promise.all(variants.map(async (variant) => {
    assert.match(variant.meshPath, /\.obj$/);
    const blob = prepared.archiveFiles.get(variant.meshPath);
    assert.ok(blob, `expected archive blob for ${variant.meshPath}`);
    return countObjFaces(await blob!.text());
  }));

  variantFaceCounts.forEach((faceCount) => {
    assert.ok(faceCount > 0, 'expected each variant OBJ to contain faces');
  });
  assert.equal(
    variantFaceCounts.reduce((sum, faceCount) => sum + faceCount, 0),
    fullFaceCount,
    'expected extracted variants to partition the original mesh faces instead of duplicating them',
  );
});
