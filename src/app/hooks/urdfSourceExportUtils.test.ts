import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

import { parseURDF, generateURDF } from '@/core/parsers';
import { resolveUrdfSourceExportContent } from './urdfSourceExportUtils';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;

function getVisualMaterialCount(urdfContent: string, linkName: string): number {
  const linkBlock = urdfContent.match(new RegExp(`<link name="${linkName}">([\\s\\S]*?)<\\/link>`))?.[1] || '';
  const visualBlock = linkBlock.match(/<visual>([\s\S]*?)<\/visual>/)?.[1] || '';
  return (visualBlock.match(/<material\b/g) || []).length;
}

test('resolveUrdfSourceExportContent prefers the original go2 URDF source when it still matches the current robot state', () => {
  const sourceFilePath = 'test/unitree_ros/robots/go2_description/urdf/go2_description.urdf';
  const originalUrdfContent = fs.readFileSync(sourceFilePath, 'utf8');
  const currentRobot = parseURDF(originalUrdfContent);

  assert.ok(currentRobot);

  const generatedContent = generateURDF({
    ...currentRobot,
    selection: { type: null, id: null },
  });

  const exportedContent = resolveUrdfSourceExportContent({
    currentRobot: {
      ...currentRobot,
      selection: { type: null, id: null },
    },
    exportRobotName: currentRobot.name,
    selectedFileName: sourceFilePath,
    selectedFileContent: generatedContent,
    originalUrdfContent,
  });

  assert.ok(exportedContent);
  assert.match(exportedContent, /<mesh filename="package:\/\/go2_description\/meshes\/dae\/base\.dae" \/>/);
  assert.equal(getVisualMaterialCount(exportedContent, 'base'), 5);
  assert.equal(getVisualMaterialCount(exportedContent, 'FR_hip'), 2);
});

test('resolveUrdfSourceExportContent falls back to the selected URDF text when the original source no longer matches the current robot state', () => {
  const originalUrdfContent = `<?xml version="1.0"?>
<robot name="demo_description">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_description/meshes/base.stl" />
      </geometry>
      <material name="base_link_mat">
        <color rgba="1 0 0 1" />
      </material>
    </visual>
  </link>
</robot>`;

  const selectedFileContent = `<?xml version="1.0"?>
<robot name="demo_description">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_description/meshes/base.stl" />
      </geometry>
      <material name="base_link_mat">
        <color rgba="0 0 1 1" />
      </material>
    </visual>
  </link>
</robot>`;

  const currentRobot = parseURDF(selectedFileContent);

  assert.ok(currentRobot);

  const exportedContent = resolveUrdfSourceExportContent({
    currentRobot: {
      ...currentRobot,
      selection: { type: null, id: null },
    },
    exportRobotName: currentRobot.name,
    selectedFileName: 'demo_description/urdf/demo_description.urdf',
    selectedFileContent,
    originalUrdfContent,
  });

  assert.ok(exportedContent);
  assert.match(exportedContent, /<color rgba="0 0 1 1" \/>/);
  assert.doesNotMatch(exportedContent, /<color rgba="1 0 0 1" \/>/);
});
