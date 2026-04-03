import test from 'node:test';
import assert from 'node:assert/strict';

import JSZip from 'jszip';

import { buildProjectArchiveBlob } from './projectArchiveZip.ts';

test('buildProjectArchiveBlob normalizes blob entries in Node environments', async () => {
  const archiveBlob = await buildProjectArchiveBlob(
    new Map<string, string | Blob>([
      ['README.md', '# archive'],
      ['meshes/base.obj', new Blob(['o base\nv 0 0 0\n'], { type: 'text/plain;charset=utf-8' })],
    ]),
  );

  const zip = await JSZip.loadAsync(await archiveBlob.arrayBuffer());

  assert.equal(await zip.file('README.md')?.async('string'), '# archive');
  assert.equal(await zip.file('meshes/base.obj')?.async('string'), 'o base\nv 0 0 0\n');
});
