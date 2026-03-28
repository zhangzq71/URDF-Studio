import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { resolveRobotFileData } from '@/core/parsers/importRobotFile';
import { generateURDF } from '@/core/parsers/urdf/urdfGenerator';
import { parseURDF } from '@/core/parsers/urdf/parser';
import type { RobotFile, RobotState } from '@/types';
import { exportRobotToUsd } from './usdExport';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function createExportableSdfFile(): RobotFile {
  return {
    name: 'robots/demo/model.sdf',
    format: 'sdf' as RobotFile['format'],
    content: `<?xml version="1.0"?>
<sdf version="1.7">
  <model name="demo_sdf_export">
    <link name="base_link">
      <visual name="body">
        <geometry>
          <box>
            <size>1 2 3</size>
          </box>
        </geometry>
      </visual>
      <collision name="body_collision">
        <geometry>
          <box>
            <size>1 2 3</size>
          </box>
        </geometry>
      </collision>
      <inertial>
        <mass>2.5</mass>
        <inertia>
          <ixx>1</ixx><ixy>0</ixy><ixz>0</ixz><iyy>2</iyy><iyz>0</iyz><izz>3</izz>
        </inertia>
      </inertial>
    </link>
    <link name="tip_link">
      <pose>0 0 1 0 0 0</pose>
      <visual name="tip_visual">
        <geometry>
          <cylinder>
            <radius>0.1</radius>
            <length>0.4</length>
          </cylinder>
        </geometry>
      </visual>
    </link>
    <joint name="tip_joint" type="revolute">
      <parent>base_link</parent>
      <child>tip_link</child>
      <axis>
        <xyz>0 0 1</xyz>
        <limit>
          <lower>-1.57</lower>
          <upper>1.57</upper>
          <effort>10</effort>
          <velocity>2</velocity>
        </limit>
      </axis>
    </joint>
  </model>
</sdf>`,
  };
}

function toRobotState(robotData: ReturnType<typeof resolveRobotFileData> extends infer TResult
  ? TResult extends { status: 'ready'; robotData: infer TData }
    ? TData
    : never
  : never): RobotState {
  return {
    ...robotData,
    selection: { type: null, id: null },
  };
}

test('SDF imports can export to URDF and USD archives', async () => {
  const importResult = resolveRobotFileData(createExportableSdfFile());

  assert.equal(importResult.status, 'ready');
  if (importResult.status !== 'ready') {
    assert.fail('expected SDF import result to be ready');
  }

  const robot = toRobotState(importResult.robotData);
  const urdfContent = generateURDF(robot);
  const urdfRoundtrip = parseURDF(urdfContent);

  assert.ok(urdfRoundtrip, 'expected generated URDF to parse back');
  assert.equal(urdfRoundtrip.name, 'demo_sdf_export');
  assert.match(urdfContent, /<link name="base_link">/);
  assert.match(urdfContent, /<joint name="tip_joint" type="revolute">/);

  const usdPayload = await exportRobotToUsd({
    robot,
    exportName: robot.name,
    assets: {},
  });

  assert.equal(usdPayload.downloadFileName, 'demo_sdf_export.usd');
  assert.equal(usdPayload.archiveFileName, 'demo_sdf_export_usd.zip');
  assert.deepEqual(
    [...usdPayload.archiveFiles.keys()].sort(),
    [
      'demo_sdf_export/usd/configuration/demo_sdf_export_description_base.usd',
      'demo_sdf_export/usd/configuration/demo_sdf_export_description_physics.usd',
      'demo_sdf_export/usd/configuration/demo_sdf_export_description_sensor.usd',
      'demo_sdf_export/usd/demo_sdf_export.usd',
    ],
  );
});
