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

function loadImportableRobotFilesFromDirectory(relativeDir: string): RobotFile[] {
  const rootDir = path.join(process.cwd(), relativeDir);

  const walk = (currentDir: string): string[] => fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(currentDir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });

  return walk(rootDir)
    .sort()
    .flatMap((fullPath) => {
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      const lowerPath = relativePath.toLowerCase();
      if (
        lowerPath.endsWith('.urdf')
        || lowerPath.endsWith('.xml')
        || lowerPath.endsWith('.xacro')
        || lowerPath.endsWith('.urdf.xacro')
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

  const barkourFiles = loadImportableRobotFilesFromDirectory('test/mujoco_menagerie-main/google_barkour_vb');
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
