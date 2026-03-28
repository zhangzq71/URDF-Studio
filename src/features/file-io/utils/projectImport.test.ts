import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

import { DEFAULT_LINK, type RobotData } from '@/types';

import { buildLibraryArchivePath, PROJECT_ROBOT_HISTORY_FILE } from './projectArchive';
import { exportProject } from './projectExport';
import { importProject } from './projectImport';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;

function createDemoRobot(): RobotData {
  return {
    name: 'demo',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        ...DEFAULT_LINK,
        id: 'base_link',
        name: 'base_link',
        visible: true,
      },
    },
    joints: {},
  };
}

async function buildProjectZip(): Promise<JSZip> {
  const robot = createDemoRobot();
  const sourcePath = 'robots/demo/demo.urdf';
  const sourceContent = '<robot name="demo"><link name="base_link" /></robot>';

  const exportResult = await exportProject({
    name: 'demo_project',
    uiState: {
      appMode: 'detail',
      lang: 'en',
    },
    assetsState: {
      availableFiles: [
        {
          name: sourcePath,
          format: 'urdf',
          content: sourceContent,
        },
      ],
      assets: {},
      allFileContents: {
        [sourcePath]: sourceContent,
      },
      motorLibrary: {},
      selectedFileName: sourcePath,
      originalUrdfContent: sourceContent,
      originalFileFormat: 'urdf',
      usdPreparedExportCaches: {},
    },
    robotState: {
      present: robot,
      history: { past: [], future: [] },
      activity: [],
    },
    assemblyState: {
      present: null,
      history: { past: [], future: [] },
      activity: [],
    },
    getMergedRobotData: () => robot,
  });

  return await JSZip.loadAsync(await exportResult.blob.arrayBuffer());
}

async function toProjectFile(zip: JSZip): Promise<File> {
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return bytes as unknown as File;
}

test('importProject fails fast when a referenced library source file is missing', async () => {
  const zip = await buildProjectZip();
  zip.remove(buildLibraryArchivePath('robots/demo/demo.urdf'));

  await assert.rejects(
    importProject(await toProjectFile(zip), 'en'),
    /missing required library source file "robots\/demo\/demo\.urdf"/i,
  );
});

test('importProject fails fast when robot history is missing', async () => {
  const zip = await buildProjectZip();
  zip.remove(PROJECT_ROBOT_HISTORY_FILE);

  await assert.rejects(
    importProject(await toProjectFile(zip), 'en'),
    /missing required history snapshot/i,
  );
});
