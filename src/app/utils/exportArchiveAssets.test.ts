import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { DEFAULT_LINK, GeometryType, type RobotState } from '@/types';

import { addRobotAssetsToZip, collectRobotAssetReferences } from './exportArchiveAssets.ts';

function createDataUrl(content: string, mimeType = 'text/plain'): string {
  return `data:${mimeType};base64,${Buffer.from(content).toString('base64')}`;
}

test('collectRobotAssetReferences includes both mesh and texture dependencies', () => {
  const robot: RobotState = {
    name: 'asset_refs',
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
          meshPath: 'package://demo/meshes/base.stl',
          dimensions: { x: 1, y: 1, z: 1 },
        },
      },
    },
    joints: {},
    materials: {
      base_link: {
        texture: 'package://demo/textures/body/coat.png',
      },
    },
  };

  const references = collectRobotAssetReferences(robot);
  assert.deepEqual(Array.from(references.meshPaths), ['package://demo/meshes/base.stl']);
  assert.deepEqual(Array.from(references.texturePaths), ['package://demo/textures/body/coat.png']);
});

test('addRobotAssetsToZip packages texture assets alongside meshes for roundtrip exports', async () => {
  const robot: RobotState = {
    name: 'asset_zip',
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
          meshPath: 'package://demo/meshes/base.stl',
          dimensions: { x: 1, y: 1, z: 1 },
        },
      },
    },
    joints: {},
    materials: {
      base_link: {
        texture: 'package://demo/textures/body/coat.png',
      },
    },
  };

  const zip = new JSZip();
  await addRobotAssetsToZip({
    robot,
    zip,
    assets: {
      'package://demo/meshes/base.stl': createDataUrl('solid base\nendsolid base', 'model/stl'),
      'package://demo/textures/body/coat.png': createDataUrl('png-texture', 'image/png'),
    },
  });

  const roundtripZip = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  const meshEntry = roundtripZip.file('meshes/base.stl');
  const textureEntry = roundtripZip.file('textures/body/coat.png');

  assert.ok(meshEntry, 'expected mesh to be written into meshes/');
  assert.ok(textureEntry, 'expected texture to be written into textures/');
  assert.match(await meshEntry!.async('string'), /solid base/);
  assert.equal(await textureEntry!.async('string'), 'png-texture');
});

test('addRobotAssetsToZip skips source meshes that were replaced for MJCF export', async () => {
  const robot: RobotState = {
    name: 'asset_skip',
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
          meshPath: 'package://go2_description/dae/hip.dae',
          dimensions: { x: 1, y: 1, z: 1 },
        },
      },
    },
    joints: {},
    materials: {},
  };

  const zip = new JSZip();
  await addRobotAssetsToZip({
    robot,
    zip,
    assets: {
      'package://go2_description/dae/hip.dae': createDataUrl('<dae />', 'text/xml'),
    },
    skipMeshPaths: new Set(['package://go2_description/dae/hip.dae', 'dae/hip.dae']),
  });

  const roundtripZip = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(roundtripZip.file('meshes/dae/hip.dae'), null);
});
