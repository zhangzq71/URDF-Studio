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

function createAssemblyComponentRobot(): RobotData {
  return {
    name: 'left_arm',
    rootLinkId: 'comp_left_base_link',
    links: {
      comp_left_base_link: {
        ...DEFAULT_LINK,
        id: 'comp_left_base_link',
        name: 'left_arm',
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
      appMode: 'editor',
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

test('importProject preserves blob-backed USD library files even when their inline source is empty', async () => {
  const robot = createDemoRobot();
  const sourcePath = 'robots/demo/demo.urdf';
  const sourceContent = '<robot name="demo"><link name="base_link" /></robot>';
  const usdPath = 'unitree_model/Go2/usd/configuration/go2_description_sensor.usd';

  const exportResult = await exportProject({
    name: 'demo_project_with_usd_dependency',
    uiState: {
      appMode: 'editor',
      lang: 'en',
    },
    assetsState: {
      availableFiles: [
        {
          name: sourcePath,
          format: 'urdf',
          content: sourceContent,
        },
        {
          name: usdPath,
          format: 'usd',
          content: '',
        },
      ],
      assets: {
        [usdPath]: 'data:application/octet-stream;base64,U0VOU09S',
      },
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

  assert.equal(exportResult.partial, false);

  const imported = await importProject(
    new Uint8Array(await exportResult.blob.arrayBuffer()) as unknown as File,
    'en',
  );

  const importedUsdFile = imported.availableFiles.find((file) => file.name === usdPath);
  assert.ok(importedUsdFile, 'expected blob-backed USD dependency to roundtrip through project import');
  assert.equal(importedUsdFile.content, '');
  assert.match(importedUsdFile.blobUrl ?? '', /^blob:/);
});

test('importProject preserves assembly and component transforms from exported project history', async () => {
  const sourcePath = 'robots/left_arm.urdf';
  const sourceContent = '<robot name="left_arm"><link name="base_link" /></robot>';
  const componentRobot = createAssemblyComponentRobot();
  const assemblyState = {
    name: 'demo_workspace',
    transform: {
      position: { x: 4, y: -1, z: 2 },
      rotation: { r: 0.2, p: -0.1, y: 0.4 },
    },
    components: {
      comp_left: {
        id: 'comp_left',
        name: 'left_arm',
        sourceFile: sourcePath,
        visible: true,
        transform: {
          position: { x: -0.5, y: 0.75, z: 1.25 },
          rotation: { r: -0.3, p: 0.15, y: -0.25 },
        },
        robot: componentRobot,
      },
    },
    bridges: {},
  };

  const exportResult = await exportProject({
    name: 'demo_project_with_transforms',
    uiState: {
      appMode: 'editor',
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
      present: componentRobot,
      history: { past: [], future: [] },
      activity: [],
    },
    assemblyState: {
      present: assemblyState,
      history: { past: [], future: [] },
      activity: [],
    },
    getMergedRobotData: () => componentRobot,
  });

  const imported = await importProject(
    new Uint8Array(await exportResult.blob.arrayBuffer()) as unknown as File,
    'en',
  );

  assert.deepEqual(imported.assemblyState?.transform, assemblyState.transform);
  assert.deepEqual(
    imported.assemblyState?.components.comp_left.transform,
    assemblyState.components.comp_left.transform,
  );
});
