import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import type { RobotFile } from '@/types';
import { buildLiveUsdRoundtripArchive } from './liveUsdRoundtripExport.ts';

test('buildLiveUsdRoundtripArchive keeps the original B2 file name instead of viewer_roundtrip aliases', async () => {
  const sourceFile: RobotFile = {
    name: 'unitree_model/B2/usd/b2.usd',
    content: '#usda 1.0\n',
    format: 'usd',
  };

  let receivedOptions: Record<string, unknown> | null = null;

  const archive = await buildLiveUsdRoundtripArchive({
    sourceFile,
    availableFiles: [sourceFile],
    assets: {},
    allFileContents: {},
    targetWindow: {
      exportLoadedStageSnapshot: async (options) => {
        receivedOptions = options || null;

        if (options?.persistToServer === true) {
          return {
            ok: false,
            error: 'write-usd-export-404',
          };
        }

        return {
          ok: true,
          content: '#usda 1.0\n',
          outputFileName: 'b2.viewer_roundtrip.usd',
          outputVirtualPath: '/unitree_model/B2/usd/b2.viewer_roundtrip.usd',
        };
      },
    },
  });

  assert.equal(receivedOptions?.stageSourcePath, '/unitree_model/B2/usd/b2.usd');
  assert.equal(receivedOptions?.persistToServer, false);
  assert.equal(archive.archiveFileName, 'b2.zip');
  assert.deepEqual(
    Array.from(archive.archiveFiles.keys()).sort(),
    ['B2/usd/b2.usd'],
  );
  assert.equal(
    await archive.archiveFiles.get('B2/usd/b2.usd')?.text(),
    '#usda 1.0\n',
  );
});

test('buildLiveUsdRoundtripArchive preserves root-level bundle paths without adding a basename folder', async () => {
  const sourceFile: RobotFile = {
    name: 'b2.usd',
    content: '#usda 1.0\n',
    format: 'usd',
  };

  const archive = await buildLiveUsdRoundtripArchive({
    sourceFile,
    availableFiles: [
      sourceFile,
      {
        name: 'configuration/b2_description_base.usd',
        content: '#usda 1.0\n',
        format: 'usd',
      },
    ],
    assets: {},
    allFileContents: {},
    targetWindow: {
      exportLoadedStageSnapshot: async () => ({
        ok: true,
        content: '#usda 1.0\n',
        outputFileName: 'b2.viewer_roundtrip.usd',
        outputVirtualPath: '/b2.viewer_roundtrip.usd',
      }),
    },
  });

  assert.equal(archive.archiveFileName, 'b2.zip');
  assert.deepEqual(
    Array.from(archive.archiveFiles.keys()).sort(),
    [
      'b2.usd',
      'configuration/b2_description_base.usd',
    ],
  );
  assert.equal(await archive.archiveFiles.get('b2.usd')?.text(), '#usda 1.0\n');
});

test('buildLiveUsdRoundtripArchive packages real unitree_model USD samples under their original bundle paths', async () => {
  const samplePaths = [
    'test/unitree_model/B2/usd/b2.usd',
    'test/unitree_model/Go2/usd/go2.usd',
    'test/unitree_model/Go2W/usd/go2w.usd',
  ];

  for (const samplePath of samplePaths) {
    const content = await readFile(samplePath, 'utf8');
    const virtualPath = samplePath.replace(/^test\//, '').replace(/\\/g, '/');

    const sourceFile: RobotFile = {
      name: virtualPath,
      content,
      format: 'usd',
    };

    const archive = await buildLiveUsdRoundtripArchive({
      sourceFile,
      availableFiles: [sourceFile],
      assets: {},
      allFileContents: {},
      targetWindow: {
        exportLoadedStageSnapshot: async () => ({
          ok: true,
          content,
          outputFileName: virtualPath.split('/').pop() || 'model.usd',
          outputVirtualPath: `/${virtualPath}`,
        }),
      },
    });

    const expectedEntryPath = virtualPath.replace(/^unitree_model\//, '');
    const expectedArchiveName = `${expectedEntryPath.split('/').pop()?.replace(/\.usd$/i, '') || 'model'}.zip`;

    assert.equal(archive.archiveFileName, expectedArchiveName);
    assert.deepEqual(Array.from(archive.archiveFiles.keys()).sort(), [expectedEntryPath]);
    assert.equal(await archive.archiveFiles.get(expectedEntryPath)?.text(), content);
  }
});
