import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { detectImportFormat } from '@/app/utils/importPreparation';
import { buildWorkspaceViewerRobotData } from '@/app/hooks/workspaceSourceSyncUtils.ts';
import type { RobotFile } from '@/types';
import { JointType } from '@/types';
import { useAssemblyStore } from './assemblyStore.ts';

const { window } = new JSDOM();

if (!globalThis.DOMParser) {
  globalThis.DOMParser = window.DOMParser as typeof DOMParser;
}

if (!globalThis.XMLSerializer) {
  globalThis.XMLSerializer = window.XMLSerializer as typeof XMLSerializer;
}

function resetAssemblyStore() {
  const state = useAssemblyStore.getState();
  state.clearHistory();
  state.exitAssembly();
  state.setAssembly(null);
}

function createRobotFile(name: string, format: RobotFile['format'], content = ''): RobotFile {
  return {
    name,
    format,
    content,
  };
}

function pathFromMyosuiteFixture(relativePath: string): string {
  return path.join(process.cwd(), 'test', 'myosuite-main', ...relativePath.split('/'));
}

function loadImportableRobotFilesFromDirectory(relativeDir: string): RobotFile[] {
  const rootDir = path.join(process.cwd(), relativeDir);

  const walk = (currentDir: string): string[] =>
    fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(currentDir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });

  return walk(rootDir)
    .sort()
    .flatMap((fullPath) => {
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      const lowerPath = relativePath.toLowerCase();
      if (
        lowerPath.endsWith('.urdf') ||
        lowerPath.endsWith('.xml') ||
        lowerPath.endsWith('.xacro') ||
        lowerPath.endsWith('.urdf.xacro')
      ) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const format = detectImportFormat(content, relativePath);
        return format ? [createRobotFile(relativePath, format, content)] : [];
      }
      if (lowerPath.endsWith('.stl') || lowerPath.endsWith('.obj') || lowerPath.endsWith('.dae')) {
        return [createRobotFile(relativePath, 'mesh')];
      }
      return [];
    });
}

test('MJCF assembly merge re-roots the merged graph after bridge joints change the parent component', () => {
  resetAssemblyStore();

  const barkourFiles = loadImportableRobotFilesFromDirectory(
    'test/mujoco_menagerie-main/google_barkour_vb',
  );
  const go2Files = loadImportableRobotFilesFromDirectory('test/mujoco_menagerie-main/unitree_go2');
  const barkourFile = barkourFiles.find((file) => file.name.endsWith('/barkour_vb.xml'));
  const go2File = go2Files.find((file) => file.name.endsWith('/go2.xml'));

  assert.ok(barkourFile, 'expected barkour_vb.xml fixture');
  assert.ok(go2File, 'expected go2.xml fixture');

  const store = useAssemblyStore.getState();
  store.initAssembly('mjcf-root-recompute');

  const barkourComponent = store.addComponent(barkourFile, {
    availableFiles: barkourFiles,
    assets: {},
    allFileContents: {},
  });
  const go2Component = store.addComponent(go2File, {
    availableFiles: go2Files,
    assets: {},
    allFileContents: {},
  });

  assert.ok(barkourComponent, 'expected barkour component to be imported');
  assert.ok(go2Component, 'expected go2 component to be imported');

  store.addBridge({
    name: 'attach_barkour_under_go2',
    parentComponentId: go2Component.id,
    parentLinkId: go2Component.robot.rootLinkId,
    childComponentId: barkourComponent.id,
    childLinkId: barkourComponent.robot.rootLinkId,
    joint: { type: JointType.FIXED },
  });

  const merged = useAssemblyStore.getState().getMergedRobotData();
  assert.ok(merged, 'expected merged robot data after adding the bridge');

  const childLinkIds = new Set(Object.values(merged.joints).map((joint) => joint.childLinkId));
  const graphRoots = Object.keys(merged.links).filter((linkId) => !childLinkIds.has(linkId));

  assert.deepEqual(graphRoots, [go2Component.robot.rootLinkId]);
  assert.equal(merged.rootLinkId, go2Component.robot.rootLinkId);

  const workspaceViewerRobot = buildWorkspaceViewerRobotData(merged);
  assert.equal(workspaceViewerRobot.rootLinkId, go2Component.robot.rootLinkId);
  assert.ok(!workspaceViewerRobot.links.__workspace_world__);
});

test('addComponent surfaces actionable MyoSuite template placeholder errors for MJCF assembly imports', () => {
  resetAssemblyStore();

  const supportFiles = [
    'myosuite/envs/myo/assets/hand/myohand_object.xml',
    'myosuite/envs/myo/assets/hand/myohand_tabletop.xml',
    'myosuite/simhive/object_sim/common.xml',
    'myosuite/simhive/myo_sim/hand/assets/myohand_assets.xml',
    'myosuite/simhive/myo_sim/hand/assets/myohand_body.xml',
    'myosuite/simhive/furniture_sim/simpleTable/simpleTable_asset.xml',
    'myosuite/simhive/furniture_sim/simpleTable/simpleGraniteTable_body.xml',
  ].map((relativePath) =>
    createRobotFile(
      path.relative(process.cwd(), pathFromMyosuiteFixture(relativePath)).replace(/\\/g, '/'),
      'mjcf',
      fs.readFileSync(pathFromMyosuiteFixture(relativePath), 'utf8'),
    ),
  );

  const file = supportFiles[0]!;
  const store = useAssemblyStore.getState();
  store.initAssembly('myosuite-placeholder-error');

  assert.throws(
    () =>
      store.addComponent(file, {
        availableFiles: supportFiles,
        assets: {},
        allFileContents: {},
      }),
    (error) => {
      assert.ok(error instanceof Error, 'expected addComponent to throw an Error');
      assert.match(error.message, /Failed to add assembly component from/);
      assert.match(error.message, /OBJECT_NAME/);
      assert.match(error.message, /concrete object directory/);
      return true;
    },
  );

  assert.deepEqual(useAssemblyStore.getState().assemblyState?.components ?? {}, {});
});
