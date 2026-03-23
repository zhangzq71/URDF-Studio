import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

import { parseURDF } from '@/core/parsers';
import type { RobotData } from '@/types';

import { exportProject } from './projectExport';

const GO2_DESCRIPTION_ROOT = path.resolve('test/unitree_ros/robots/go2_description');
const GO2_URDF_PATH = path.join(GO2_DESCRIPTION_ROOT, 'urdf/go2_description.urdf');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function loadGo2RobotData(): RobotData {
  const source = fs.readFileSync(GO2_URDF_PATH, 'utf8');
  const robot = parseURDF(source);
  assert.ok(robot, 'expected go2 URDF to parse');
  return robot;
}

function buildGo2AssetMap(): Record<string, string> {
  const assets: Record<string, string> = {};

  for (const directory of ['dae', 'meshes']) {
    const absoluteDirectory = path.join(GO2_DESCRIPTION_ROOT, directory);
    for (const fileName of fs.readdirSync(absoluteDirectory)) {
      const absolutePath = path.join(absoluteDirectory, fileName);
      if (!fs.statSync(absolutePath).isFile()) continue;

      const extension = path.extname(absolutePath).toLowerCase();
      const mimeType = extension === '.dae'
        ? 'text/xml'
        : 'application/octet-stream';
      const dataUrl = `data:${mimeType};base64,${fs.readFileSync(absolutePath).toString('base64')}`;

      [
        absolutePath,
        `package://go2_description/${directory}/${fileName}`,
        `go2_description/${directory}/${fileName}`,
        `${directory}/${fileName}`,
        fileName,
      ].forEach((key) => {
        assets[key] = dataUrl;
      });
    }
  }

  return assets;
}

test('exportProject preserves go2 split visual materials in generated MJCF output', async () => {
  const robot = loadGo2RobotData();
  const assets = buildGo2AssetMap();
  const originalUrdfContent = fs.readFileSync(GO2_URDF_PATH, 'utf8');

  const projectBlob = await exportProject({
    name: 'go2_project',
    uiState: {
      appMode: 'detail',
      lang: 'en',
    },
    assetsState: {
      availableFiles: [
        {
          name: 'go2_description/urdf/go2_description.urdf',
          format: 'urdf',
          content: originalUrdfContent,
        },
      ],
      assets,
      allFileContents: {
        'go2_description/urdf/go2_description.urdf': originalUrdfContent,
      },
      motorLibrary: {},
      selectedFileName: 'go2_description/urdf/go2_description.urdf',
      originalUrdfContent,
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

  const zip = await JSZip.loadAsync(await projectBlob.arrayBuffer());
  const mjcfOutput = await zip.file('output/go2_description.xml')?.async('string');

  assert.ok(mjcfOutput, 'expected project export to include output/go2_description.xml');
  assert.match(mjcfOutput, /material="base_mat_1"/);
  assert.match(mjcfOutput, /material="base_mat_2"/);
  assert.doesNotMatch(mjcfOutput, /base_visual_0\.obj/);

  const archivePaths = Object.keys(zip.files);
  const splitBaseMeshPaths = archivePaths.filter((filePath) => (
    filePath.startsWith('output/meshes/dae/base.')
    && filePath.endsWith('.obj')
  ));

  assert.ok(
    splitBaseMeshPaths.length >= 2,
    `expected split base OBJ variants in output/meshes, received: ${splitBaseMeshPaths.join(', ')}`,
  );
});
