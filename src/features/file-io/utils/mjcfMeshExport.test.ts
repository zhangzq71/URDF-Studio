import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
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

async function loadReferenceMeshObject(
  meshPath: string,
  assets: Record<string, string>,
  robot: RobotState,
): Promise<THREE.Object3D> {
  const referenceManager = new THREE.LoadingManager();
  const referenceLoader = createMeshLoader(
    assets,
    referenceManager,
    '',
    {
      colladaRootNormalizationHints: buildColladaRootNormalizationHints(robot.links),
    },
  );

  return new Promise<THREE.Object3D>((resolve, reject) => {
    referenceLoader(meshPath, referenceManager, (result, err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(result);
    });
  });
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

test('prepareMjcfMeshExportAssets skips redundant full-mesh OBJ exports for visual-only go2 Collada variants', async () => {
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
          authoredMaterials: [
            { name: 'dark_rubber', color: '#abb0c5' },
            { name: 'logo', color: '#ffffff' },
            { name: 'sticker', color: '#020202' },
            { name: 'metal', color: '#030303' },
            { name: 'plastic', color: '#050505' },
          ],
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
  const fullFaceCount = countObjFaces(new OBJExporter().parse(referenceObject));

  const prepared = await prepareMjcfMeshExportAssets({
    robot,
    assets,
  });

  const overridePath = prepared.meshPathOverrides.get(sourcePath);
  assert.equal(overridePath, undefined);
  assert.equal(prepared.archiveFiles.has('dae/base.dae.obj'), false);

  const variants = prepared.visualMeshVariants.get(sourcePath);
  assert.ok(variants, 'expected multi-material visual variants for go2 base mesh');
  assert.ok(variants.length >= 4, 'expected at least four split visual mesh variants');

  const namedVariants = new Set(variants.map((variant) => variant.sourceMaterialName).filter(Boolean));
  assert.ok(namedVariants.size >= 4, 'expected multiple named material variants from the Collada asset');

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

test('prepareMjcfMeshExportAssets splits go2w base visual mesh into authored material variants', async () => {
  const sourcePath = 'package://go2w_description/dae/base.dae';
  const meshFilePath = 'test/unitree_ros/robots/go2w_description/dae/base.dae';
  const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshFilePath, 'utf8')).toString('base64')}`;
  const robot: RobotState = {
    name: 'go2w-base-visual-variants',
    rootLinkId: 'base',
    selection: { type: null, id: null },
    links: {
      base: {
        ...DEFAULT_LINK,
        id: 'base',
        name: 'base',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          meshPath: sourcePath,
          authoredMaterials: [
            { name: '深色橡胶_001-effect', color: '#abb0c5' },
            { name: '白色logo_001-effect', color: '#ffffff' },
            { name: '黑色贴纸_007-effect', color: '#020202' },
            { name: '黑色金属_007-effect', color: '#030303' },
            { name: '黑色塑料_003-effect', color: '#050505' },
          ],
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
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

  assert.equal(prepared.meshPathOverrides.get(sourcePath), undefined);
  assert.equal(prepared.archiveFiles.has('dae/base.dae.obj'), false);

  const variants = prepared.visualMeshVariants.get(sourcePath);
  assert.ok(variants);
  assert.equal(variants.length, 5);
  assert.deepEqual(
    variants.map((variant) => variant.sourceMaterialName),
    [
      '深色橡胶.001',
      '白色logo.001',
      '黑色贴纸.007',
      '黑色金属.007',
      '黑色塑料.003',
    ],
  );
});

test('prepareMjcfMeshExportAssets keeps the full converted OBJ when a multi-material mesh is reused for collision', async () => {
  const sourcePath = 'package://go2_description/dae/base.dae';
  const meshFilePath = 'test/unitree_ros/robots/go2_description/dae/base.dae';
  const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshFilePath, 'utf8')).toString('base64')}`;
  const robot: RobotState = {
    name: 'go2-visual-and-collision',
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
          authoredMaterials: [
            { name: 'dark_rubber', color: '#abb0c5' },
            { name: 'logo', color: '#ffffff' },
            { name: 'sticker', color: '#020202' },
            { name: 'metal', color: '#030303' },
            { name: 'plastic', color: '#050505' },
          ],
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: Math.PI, p: 0, y: 0 },
          },
        },
        collision: {
          ...DEFAULT_LINK.collision,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          meshPath: sourcePath,
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

  assert.equal(prepared.meshPathOverrides.get(sourcePath), 'dae/base.dae.obj');
  assert.ok(prepared.archiveFiles.has('dae/base.dae.obj'));
  assert.ok(prepared.visualMeshVariants.get(sourcePath)?.length);
});

test('prepareMjcfMeshExportAssets preserves go2w mirrored thigh geometry when splitting visual material variants', async () => {
  const leftPath = 'package://go2w_description/dae/thigh.dae';
  const rightPath = 'package://go2w_description/dae/thigh_mirror.dae';
  const leftMeshFilePath = 'test/unitree_ros/robots/go2w_description/dae/thigh.dae';
  const rightMeshFilePath = 'test/unitree_ros/robots/go2w_description/dae/thigh_mirror.dae';
  const leftMeshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(leftMeshFilePath, 'utf8')).toString('base64')}`;
  const rightMeshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(rightMeshFilePath, 'utf8')).toString('base64')}`;
  const robot: RobotState = {
    name: 'go2w-thigh-mirror-variants',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
      },
      FL_thigh: {
        ...DEFAULT_LINK,
        id: 'FL_thigh',
        name: 'FL_thigh',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          meshPath: leftPath,
          authoredMaterials: [
            { name: '深色橡胶_003-effect', color: '#abb1c5' },
            { name: 'Material_009-effect', color: '#e6f2f2' },
          ],
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
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
      FR_thigh: {
        ...DEFAULT_LINK,
        id: 'FR_thigh',
        name: 'FR_thigh',
        visual: {
          ...DEFAULT_LINK.visual,
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          meshPath: rightPath,
          authoredMaterials: [
            { name: '深色橡胶_012-effect', color: '#abb1c5' },
            { name: 'Material_011-effect', color: '#e6f2f2' },
          ],
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
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
    [leftMeshFilePath]: leftMeshDataUrl,
    [rightMeshFilePath]: rightMeshDataUrl,
    [leftPath]: leftMeshDataUrl,
    [rightPath]: rightMeshDataUrl,
    'thigh.dae': leftMeshDataUrl,
    'thigh_mirror.dae': rightMeshDataUrl,
  };

  const leftReference = await loadReferenceMeshObject(leftPath, assets, robot);
  const rightReference = await loadReferenceMeshObject(rightPath, assets, robot);
  const leftCenter = getWorldBox(leftReference).getCenter(new THREE.Vector3());
  const rightCenter = getWorldBox(rightReference).getCenter(new THREE.Vector3());

  assert.ok(leftCenter.y < 0, `expected left thigh center to stay on negative Y, got ${leftCenter.y}`);
  assert.ok(rightCenter.y > 0, `expected mirrored right thigh center to stay on positive Y, got ${rightCenter.y}`);

  const prepared = await prepareMjcfMeshExportAssets({
    robot,
    assets,
  });

  assert.equal(prepared.meshPathOverrides.get(rightPath), undefined);

  const rightVariants = prepared.visualMeshVariants.get(rightPath);
  assert.equal(rightVariants?.length, 2);

  const exportedRightGroup = new THREE.Group();
  for (const variant of rightVariants || []) {
    const blob = prepared.archiveFiles.get(variant.meshPath);
    assert.ok(blob, `expected archive blob for ${variant.meshPath}`);
    exportedRightGroup.add(new OBJLoader().parse(await blob!.text()));
  }

  const exportedRightBox = getWorldBox(exportedRightGroup);
  const rightReferenceBox = getWorldBox(rightReference);
  expectBoxEquals(exportedRightBox, rightReferenceBox);

  const exportedRightCenter = exportedRightBox.getCenter(new THREE.Vector3());
  assert.ok(exportedRightCenter.y > 0, `expected exported mirrored thigh center to stay on positive Y, got ${exportedRightCenter.y}`);
});
