import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

import { parseURDF } from '@/core/parsers';
import { DEFAULT_JOINT, JointType, type RobotData } from '@/types';

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

function loadSimpleRobotData(): RobotData {
  const source = `<?xml version="1.0"?>
<robot name="simple_export">
  <link name="base_link" />
</robot>`;
  const robot = parseURDF(source);
  assert.ok(robot, 'expected simple URDF to parse');
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

  const exportResult = await exportProject({
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
  assert.equal(exportResult.partial, false);
  assert.equal(exportResult.warnings.length, 0);

  const zip = await JSZip.loadAsync(await exportResult.blob.arrayBuffer());
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

test('exportProject fails fast when a packed workspace asset cannot be fetched', async () => {
  const robot = loadSimpleRobotData();
  const originalUrdfContent = `<?xml version="1.0"?>
<robot name="simple_export">
  <link name="base_link" />
</robot>`;

  await assert.rejects(
    exportProject({
      name: 'broken_asset_project',
      uiState: {
        appMode: 'detail',
        lang: 'en',
      },
      assetsState: {
        availableFiles: [
          {
            name: 'robots/simple_export.urdf',
            format: 'urdf',
            content: originalUrdfContent,
          },
        ],
        assets: {
          'textures/missing.png': 'blob:missing-project-asset',
        },
        allFileContents: {
          'robots/simple_export.urdf': originalUrdfContent,
        },
        motorLibrary: {},
        selectedFileName: 'robots/simple_export.urdf',
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
    }),
    /Failed to pack asset "textures\/missing\.png"/,
  );
});

test('exportProject does not persist legacy appMode state in project.json', async () => {
  const robot = loadSimpleRobotData();
  const originalUrdfContent = `<?xml version="1.0"?>
<robot name="simple_export">
  <link name="base_link" />
</robot>`;

  const exportResult = await exportProject({
    name: 'mode_free_project',
    uiState: {
      appMode: 'hardware',
      lang: 'en',
    },
    assetsState: {
      availableFiles: [
        {
          name: 'robots/simple_export.urdf',
          format: 'urdf',
          content: originalUrdfContent,
        },
      ],
      assets: {},
      allFileContents: {
        'robots/simple_export.urdf': originalUrdfContent,
      },
      motorLibrary: {},
      selectedFileName: 'robots/simple_export.urdf',
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

  const zip = await JSZip.loadAsync(await exportResult.blob.arrayBuffer());
  const manifestText = await zip.file('project.json')?.async('string');

  assert.ok(manifestText, 'expected project export to include project.json');

  const manifest = JSON.parse(manifestText);
  assert.equal('appMode' in (manifest.ui ?? {}), false);
});

test('exportProject fails fast when a non-mesh library source file has no content', async () => {
  const robot = loadSimpleRobotData();

  await assert.rejects(
    exportProject({
      name: 'missing_library_source_project',
      uiState: {
        appMode: 'detail',
        lang: 'en',
      },
      assetsState: {
        availableFiles: [
          {
            name: 'robots/simple_export.urdf',
            format: 'urdf',
            content: '',
          },
        ],
        assets: {},
        allFileContents: {},
        motorLibrary: {},
        selectedFileName: 'robots/simple_export.urdf',
        originalUrdfContent: '',
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
    }),
    /Missing library source content for project export: robots\/simple_export\.urdf/,
  );
});

test('exportProject reports phased progress while building a .usp archive', async () => {
  const robot = loadSimpleRobotData();
  const originalUrdfContent = `<?xml version="1.0"?>
<robot name="simple_export">
  <link name="base_link" />
</robot>`;
  const progressUpdates: Array<{
    phase: string;
    completed: number;
    total: number;
    label?: string;
  }> = [];

  const exportResult = await exportProject({
    name: 'progress_project',
    uiState: {
      appMode: 'detail',
      lang: 'en',
    },
    assetsState: {
      availableFiles: [
        {
          name: 'robots/simple_export.urdf',
          format: 'urdf',
          content: originalUrdfContent,
        },
      ],
      assets: {
        'textures/progress.png': 'data:text/plain;base64,cHJvZ3Jlc3M=',
      },
      allFileContents: {
        'robots/simple_export.urdf': originalUrdfContent,
      },
      motorLibrary: {},
      selectedFileName: 'robots/simple_export.urdf',
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
    onProgress: (progress) => {
      progressUpdates.push({ ...progress });
    },
  });

  assert.equal(exportResult.partial, false);
  assert.ok(progressUpdates.length > 0, 'expected project export to emit progress updates');

  const firstIndexByPhase = (phase: string) => progressUpdates.findIndex((progress) => progress.phase === phase);
  const phaseOrder = ['assets', 'metadata', 'components', 'output', 'archive'];

  phaseOrder.forEach((phase) => {
    assert.ok(firstIndexByPhase(phase) >= 0, `expected progress updates for phase ${phase}`);
  });

  for (let index = 1; index < phaseOrder.length; index += 1) {
    const previousPhase = phaseOrder[index - 1];
    const currentPhase = phaseOrder[index];
    assert.ok(
      firstIndexByPhase(previousPhase) < firstIndexByPhase(currentPhase),
      `expected phase ${previousPhase} to occur before ${currentPhase}`,
    );
  }

  const finalArchiveProgress = [...progressUpdates]
    .reverse()
    .find((progress) => progress.phase === 'archive');

  assert.ok(finalArchiveProgress, 'expected final archive progress update');
  assert.equal(finalArchiveProgress.completed, 100);
  assert.equal(finalArchiveProgress.total, 100);
});

test('exportProject preserves bridge joint quat_xyzw metadata in bridge.xml', async () => {
  const robot = loadSimpleRobotData();
  const originalUrdfContent = `<?xml version="1.0"?>
<robot name="simple_export">
  <link name="base_link" />
</robot>`;

  const exportResult = await exportProject({
    name: 'bridge_quat_project',
    uiState: {
      appMode: 'detail',
      lang: 'en',
    },
    assetsState: {
      availableFiles: [
        {
          name: 'robots/component_a.urdf',
          format: 'urdf',
          content: originalUrdfContent,
        },
        {
          name: 'robots/component_b.urdf',
          format: 'urdf',
          content: originalUrdfContent,
        },
      ],
      assets: {},
      allFileContents: {
        'robots/component_a.urdf': originalUrdfContent,
        'robots/component_b.urdf': originalUrdfContent,
      },
      motorLibrary: {},
      selectedFileName: 'robots/component_a.urdf',
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
      present: {
        name: 'bridge_quat_assembly',
        components: {
          component_a: {
            id: 'component_a',
            name: 'component_a',
            sourceFile: 'robots/component_a.urdf',
            robot,
          },
          component_b: {
            id: 'component_b',
            name: 'component_b',
            sourceFile: 'robots/component_b.urdf',
            robot,
          },
        },
        bridges: {
          bridge_joint: {
            id: 'bridge_joint',
            name: 'bridge_joint',
            parentComponentId: 'component_a',
            parentLinkId: 'base_link',
            childComponentId: 'component_b',
            childLinkId: 'base_link',
            joint: {
              ...DEFAULT_JOINT,
              id: 'bridge_joint',
              name: 'bridge_joint',
              type: JointType.FIXED,
              parentLinkId: 'base_link',
              childLinkId: 'base_link',
              origin: {
                xyz: { x: 0, y: 0, z: 0 },
                rpy: { r: 0, p: 0, y: Math.PI / 2 },
                quatXyzw: { x: 0, y: 0, z: 0.70710678, w: 0.70710678 },
              },
            },
          },
        },
      },
      history: { past: [], future: [] },
      activity: [],
    },
    getMergedRobotData: () => robot,
  });

  assert.equal(exportResult.partial, false);

  const zip = await JSZip.loadAsync(await exportResult.blob.arrayBuffer());
  const bridgeXml = await zip.file('bridges/bridge.xml')?.async('string');

  assert.ok(bridgeXml, 'expected project export to include bridges/bridge.xml');
  assert.match(
    bridgeXml,
    /<origin xyz="0 0 0" rpy="0 0 1\.5707963267948966" quat_xyzw="0 0 0\.70710678 0\.70710678" \/>/,
  );
});
