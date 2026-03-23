import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUsdRoundtripArchive } from './usdRoundtripExportArchive.ts';

function createDataUrl(content: string, mimeType = 'text/plain'): string {
  return `data:${mimeType};base64,${Buffer.from(content).toString('base64')}`;
}

test('buildUsdRoundtripArchive packages the roundtrip root and in-bundle dependencies under the model folder', async () => {
  const archive = await buildUsdRoundtripArchive({
    sourceFile: {
      name: 'unitree_model/Go2/usd/go2.usd',
      content: 'ORIGINAL_ROOT',
      format: 'usd',
    },
    stageExport: {
      content: 'ROUNDTRIP_ROOT',
      downloadFileName: 'go2.viewer_roundtrip.usd',
    },
    availableFiles: [
      {
        name: 'unitree_model/Go2/usd/go2.usd',
        content: 'ORIGINAL_ROOT',
        format: 'usd',
      },
      {
        name: 'unitree_model/Go2/usd/configuration/go2_description_base.usd',
        content: 'BASE_LAYER',
        format: 'usd',
      },
      {
        name: 'unitree_model/B2/usd/b2.usd',
        content: 'OUTSIDE_BUNDLE',
        format: 'usd',
      },
    ],
    assets: {
      'unitree_model/Go2/materials/body.mdl': createDataUrl('MDL_BODY'),
      'unitree_model/B2/materials/outside.mdl': createDataUrl('OUTSIDE_MDL'),
    },
    allFileContents: {
      'unitree_model/Go2/usd/configuration/go2_description_physics.usd': 'PHYSICS_LAYER',
    },
  });

  assert.equal(archive.archiveFileName, 'go2.viewer_roundtrip.zip');
  assert.deepEqual(
    Array.from(archive.archiveFiles.keys()).sort(),
    [
      'Go2/materials/body.mdl',
      'Go2/usd/configuration/go2_description_base.usd',
      'Go2/usd/configuration/go2_description_physics.usd',
      'Go2/usd/go2.viewer_roundtrip.usd',
    ],
  );
  assert.equal(archive.archiveFiles.has('Go2/usd/go2.usd'), false);
  assert.equal(await archive.archiveFiles.get('Go2/usd/go2.viewer_roundtrip.usd')?.text(), 'ROUNDTRIP_ROOT');
  assert.equal(await archive.archiveFiles.get('Go2/usd/configuration/go2_description_base.usd')?.text(), 'BASE_LAYER');
  assert.equal(await archive.archiveFiles.get('Go2/usd/configuration/go2_description_physics.usd')?.text(), 'PHYSICS_LAYER');
  assert.equal(await archive.archiveFiles.get('Go2/materials/body.mdl')?.text(), 'MDL_BODY');
});
