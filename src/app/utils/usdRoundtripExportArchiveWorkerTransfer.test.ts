import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hydrateUsdRoundtripArchiveFromWorker,
  serializeUsdRoundtripArchiveForWorker,
} from './usdRoundtripExportArchiveWorkerTransfer.ts';
import type { UsdRoundtripArchive } from './usdRoundtripExportArchive.ts';

test('usdRoundtripExportArchive transfer serialization preserves archive blobs across worker boundaries', async () => {
  const archive: UsdRoundtripArchive = {
    archiveFileName: 'go2.zip',
    archiveFiles: new Map<string, Blob>([
      ['Go2/usd/go2.usd', new Blob(['#usda 1.0\n'], { type: 'text/plain' })],
      ['Go2/materials/body.mdl', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' })],
    ]),
  };

  const serialized = await serializeUsdRoundtripArchiveForWorker(archive);

  assert.equal(serialized.payload.archiveFileName, 'go2.zip');
  assert.equal(serialized.payload.archiveFiles.length, 2);
  assert.equal(serialized.transferables.length, 2);

  const hydrated = hydrateUsdRoundtripArchiveFromWorker(serialized.payload);

  assert.equal(hydrated.archiveFileName, archive.archiveFileName);
  assert.equal(await hydrated.archiveFiles.get('Go2/usd/go2.usd')?.text(), '#usda 1.0\n');
  assert.deepEqual(
    Array.from(new Uint8Array(await hydrated.archiveFiles.get('Go2/materials/body.mdl')!.arrayBuffer())),
    [1, 2, 3, 4],
  );
});
