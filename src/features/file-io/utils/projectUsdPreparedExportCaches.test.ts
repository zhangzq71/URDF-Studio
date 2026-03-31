import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { GeometryType, type UsdPreparedExportCache } from '@/types';
import { PROJECT_USD_PREPARED_EXPORT_CACHES_FILE } from './projectArchive';
import {
  buildUsdPreparedExportCacheEntries,
  readUsdPreparedExportCaches,
  writeUsdPreparedExportCaches,
} from './projectUsdPreparedExportCaches';

function createPreparedCache(stageSourcePath: string): UsdPreparedExportCache {
  return {
    stageSourcePath,
    robotData: {
      name: 'usd_robot',
      rootLinkId: 'base_link',
      links: {
        base_link: {
          id: 'base_link',
          name: 'base_link',
          visible: true,
          visual: {
            type: GeometryType.MESH,
            dimensions: { x: 1, y: 1, z: 1 },
            color: '#ffffff',
            meshPath: 'base_link_visual_0.obj',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          collision: {
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
            color: '#cccccc',
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          },
          inertial: {
            mass: 1,
            origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
          },
        },
      },
      joints: {},
      materials: {
        blue: { color: '#0088ff' },
      },
      closedLoopConstraints: [],
    },
    meshFiles: {
      'base_link_visual_0.obj': new Blob(
        ['o mesh\nv 0 0 0\nf 1 1 1\n'],
        { type: 'text/plain;charset=utf-8' },
      ),
    },
  };
}

test('write/read USD prepared export caches roundtrip through project zip', async () => {
  const zip = new JSZip();
  const caches = {
    'robots/demo/demo.usd': createPreparedCache('/robots/demo/demo.usd'),
    'robots/alt/alt.usd': createPreparedCache('/robots/alt/alt.usd'),
  };

  await writeUsdPreparedExportCaches(zip, caches);

  const manifestContent = await zip.file(PROJECT_USD_PREPARED_EXPORT_CACHES_FILE)?.async('string');
  assert.ok(manifestContent);

  const roundtripZip = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  const restored = await readUsdPreparedExportCaches(roundtripZip);

  assert.deepEqual(Object.keys(restored).sort(), ['robots/alt/alt.usd', 'robots/demo/demo.usd']);
  assert.deepEqual(restored['robots/demo/demo.usd'].robotData.materials, caches['robots/demo/demo.usd'].robotData.materials);
  assert.deepEqual(
    restored['robots/demo/demo.usd'].robotData.closedLoopConstraints,
    caches['robots/demo/demo.usd'].robotData.closedLoopConstraints,
  );

  const restoredMesh = restored['robots/demo/demo.usd'].meshFiles['base_link_visual_0.obj'];
  assert.ok(restoredMesh);
  assert.equal(
    await restoredMesh.text(),
    await caches['robots/demo/demo.usd'].meshFiles['base_link_visual_0.obj'].text(),
  );
});

test('writeUsdPreparedExportCaches skips manifest creation when no caches exist', async () => {
  const zip = new JSZip();
  await writeUsdPreparedExportCaches(zip, {});

  assert.equal(zip.file(PROJECT_USD_PREPARED_EXPORT_CACHES_FILE), null);
  assert.deepEqual(await readUsdPreparedExportCaches(zip), {});
});

test('buildUsdPreparedExportCacheEntries preserves mesh blobs for deferred archive compression', async () => {
  const caches = {
    'robots/demo/demo.usd': createPreparedCache('/robots/demo/demo.usd'),
  };

  const archiveEntries = await buildUsdPreparedExportCacheEntries(caches);
  const meshEntry = archiveEntries.get(
    'workspace/usd-prepared-export-caches/cache-1/meshes/base_link_visual_0.obj',
  );

  assert.ok(meshEntry instanceof Blob, 'expected prepared export mesh entry to remain a Blob');
  assert.equal(
    await meshEntry.text(),
    await caches['robots/demo/demo.usd'].meshFiles['base_link_visual_0.obj'].text(),
  );
});
