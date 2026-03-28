import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { GeometryType, type RobotData, type RobotFile } from '@/types';
import { parseURDF, injectGazeboTags } from './index';
import { createUsdPlaceholderRobotData, resolveRobotFileData } from './importRobotFile';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;

function createUsdFile(name = 'robots/demo/demo.usd'): RobotFile {
  return {
    name,
    content: '',
    format: 'usd',
  };
}

function createSdfFile(name = 'robots/demo/model.sdf'): RobotFile {
  return {
    name,
    content: `<?xml version="1.0"?>
<sdf version="1.7">
  <model name="demo_sdf">
    <link name="base_link">
      <visual name="visual">
        <geometry>
          <mesh>
            <uri>model://demo/meshes/base_link.dae</uri>
          </mesh>
        </geometry>
      </visual>
    </link>
  </model>
</sdf>`,
    format: 'sdf' as unknown as RobotFile['format'],
  };
}

function createResolvedUsdRobotData(name = 'demo'): RobotData {
  return {
    name,
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#808080',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 0,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
        },
      },
    },
    joints: {},
    rootLinkId: 'base_link',
  };
}

test('resolveRobotFileData returns cached USD robot data when provided', () => {
  const usdRobotData = createResolvedUsdRobotData('cached_usd_robot');

  const result = resolveRobotFileData(createUsdFile(), {
    usdRobotData,
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected USD import result to be ready');
  }
  assert.equal(result.robotData.name, 'cached_usd_robot');
  assert.equal(result.robotData.rootLinkId, 'base_link');
  assert.deepEqual(result.robotData.links, usdRobotData.links);
});

test('resolveRobotFileData syncs cached USD material colors back onto link visuals', () => {
  const baseRobotData = createResolvedUsdRobotData('cached_usd_robot');
  const usdRobotData: RobotData = {
    ...baseRobotData,
    links: {
      base_link: {
        ...baseRobotData.links.base_link,
        visual: {
          type: GeometryType.BOX,
          dimensions: { x: 0.2, y: 0.3, z: 0.4 },
          color: '#808080',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
      },
    },
    materials: {
      base_link: { color: '#12ab34' },
    },
  };

  const result = resolveRobotFileData(createUsdFile(), {
    usdRobotData,
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected USD import result to be ready');
  }
  assert.equal(result.robotData.links.base_link.visual.color, '#12ab34');
  assert.equal(result.robotData.materials?.base_link?.color, '#12ab34');
});

test('resolveRobotFileData returns needs_hydration for USD when runtime robot data is unavailable', () => {
  const result = resolveRobotFileData(createUsdFile());

  assert.equal(result.status, 'needs_hydration');
  assert.equal(result.format, 'usd');
});

test('resolveRobotFileData returns a ready result for mesh files', () => {
  const result = resolveRobotFileData({
    name: 'meshes/demo/link.stl',
    content: '',
    format: 'mesh',
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected mesh import result to be ready');
  }
  assert.equal(result.robotData.name, 'link');
  assert.equal(result.robotData.links.base_link?.visual.meshPath, 'meshes/demo/link.stl');
});

test('resolveRobotFileData returns a ready result for sdf files', () => {
  const result = resolveRobotFileData(createSdfFile());

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected sdf import result to be ready');
  }
  assert.equal(result.robotData.name, 'demo_sdf');
  assert.equal(result.robotData.links.base_link?.visual.type, GeometryType.MESH);
  assert.equal(result.robotData.links.base_link?.visual.meshPath, 'demo/meshes/base_link.dae');
});

test('resolveRobotFileData forwards auxiliary text files to the sdf parser', () => {
  const result = resolveRobotFileData({
    name: 'robots/demo/model.sdf',
    content: `<?xml version="1.0"?>
<sdf version="1.7">
  <model name="demo_sdf">
    <link name="base_link">
      <visual name="body">
        <geometry>
          <box>
            <size>1 2 3</size>
          </box>
        </geometry>
        <material>
          <script>
            <uri>model://demo/materials/scripts</uri>
            <uri>model://demo/materials/textures</uri>
            <name>Demo/Diffuse</name>
          </script>
        </material>
      </visual>
    </link>
  </model>
</sdf>`,
    format: 'sdf' as unknown as RobotFile['format'],
  }, {
    allFileContents: {
      'robots/demo/materials/scripts/demo.material': `material Demo/Diffuse
{
  technique
  {
    pass
    {
      texture_unit
      {
        texture demo.png
      }
    }
  }
}`,
    },
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected sdf import result to be ready');
  }
  assert.equal(result.robotData.materials?.base_link?.texture, 'demo/materials/textures/demo.png');
});

test('resolveRobotFileData expands included sdf models from bundled file contents', () => {
  const result = resolveRobotFileData({
    name: 'robots/assembly/model.sdf',
    content: `<?xml version="1.0"?>
<sdf version="1.7">
  <model name="assembly">
    <include>
      <name>arm</name>
      <uri>model://arm</uri>
    </include>
    <include>
      <name>tool</name>
      <pose>2 0 0 0 0 0</pose>
      <uri>model://tool</uri>
    </include>
    <joint name="mount" type="fixed">
      <parent>arm::tip</parent>
      <child>tool::base</child>
    </joint>
  </model>
</sdf>`,
    format: 'sdf' as unknown as RobotFile['format'],
  }, {
    allFileContents: {
      'robots/arm/model.sdf': `<?xml version="1.0"?>
<sdf version="1.7">
  <model name="arm">
    <link name="base">
      <visual name="body">
        <geometry>
          <box>
            <size>1 1 1</size>
          </box>
        </geometry>
      </visual>
    </link>
    <link name="tip">
      <pose>1 0 0 0 0 0</pose>
      <visual name="body">
        <geometry>
          <box>
            <size>0.5 0.5 0.5</size>
          </box>
        </geometry>
      </visual>
    </link>
    <joint name="arm_joint" type="fixed">
      <parent>base</parent>
      <child>tip</child>
    </joint>
  </model>
</sdf>`,
      'robots/tool/model.sdf': `<?xml version="1.0"?>
<sdf version="1.7">
  <model name="tool">
    <link name="base">
      <visual name="body">
        <geometry>
          <box>
            <size>0.25 0.25 0.25</size>
          </box>
        </geometry>
      </visual>
    </link>
  </model>
</sdf>`,
    },
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected included sdf import result to be ready');
  }
  assert.ok(result.robotData.links['arm::base']);
  assert.ok(result.robotData.links['tool::base']);
  assert.equal(result.robotData.joints.mount?.parentLinkId, 'arm::tip');
  assert.equal(result.robotData.joints.mount?.childLinkId, 'tool::base');
  assert.deepEqual(result.robotData.joints.mount?.origin.xyz, { x: 1, y: 0, z: 0 });
});

test('resolveRobotFileData returns a parse error when XML parser APIs are unavailable', () => {
  const previousDomParser = globalThis.DOMParser;

  try {
    // @ts-expect-error intentional test mutation
    delete globalThis.DOMParser;

    const result = resolveRobotFileData(createSdfFile());
    assert.equal(result.status, 'error');
    if (result.status !== 'error') {
      assert.fail('Expected missing XML parser APIs to return a parse error');
    }
    assert.equal(result.reason, 'parse_failed');
  } finally {
    globalThis.DOMParser = previousDomParser;
  }
});

test('resolveRobotFileData returns an error result for unsupported formats', () => {
  const result = resolveRobotFileData({
    name: 'robots/demo/invalid.txt',
    content: '',
    format: 'unsupported' as unknown as RobotFile['format'],
  });

  assert.equal(result.status, 'error');
  if (result.status !== 'error') {
    assert.fail('Expected unsupported import result to be an error');
  }
  assert.equal(String(result.format), 'unsupported');
  assert.equal(result.reason, 'unsupported_format');
});

test('resolveRobotFileData prefers packaged URDF truth for standalone xacro entries', () => {
  const result = resolveRobotFileData({
    name: 'robots/b2w_description/xacro/robot.xacro',
    content: '<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="broken"><link name="wrong_link" /></robot>',
    format: 'xacro',
  }, {
    availableFiles: [
      {
        name: 'robots/b2w_description/urdf/b2w_description.urdf',
        content: '<robot name="b2w_truth"><link name="truth_link" /></robot>',
        format: 'urdf',
      },
    ],
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('Expected standalone xacro import result to be ready');
  }
  assert.equal(result.robotData.name, 'b2w_truth');
  assert.ok(result.robotData.links.truth_link);
  assert.equal(result.robotData.links.wrong_link, undefined);
  assert.equal(result.resolvedUrdfContent, '<robot name="b2w_truth"><link name="truth_link" /></robot>');
  assert.equal(result.resolvedUrdfSourceFilePath, 'robots/b2w_description/urdf/b2w_description.urdf');
});

test('resolveRobotFileData classifies linkless xacro fragments as source-only previews', () => {
  const result = resolveRobotFileData({
    name: 'robots/demo/xacro/gazebo.xacro',
    content: '<gazebo reference="base_link"><material>Gazebo/Orange</material></gazebo>',
    format: 'xacro',
  });

  assert.equal(result.status, 'error');
  if (result.status !== 'error') {
    assert.fail('Expected source-only xacro fragment import result to be an error');
  }
  assert.equal(result.reason, 'source_only_fragment');
});

test('resolveRobotFileData can import xacro exports with ROS1 and ROS2 control blocks', () => {
  const sourceUrdf = `<?xml version="1.0"?>
<robot name="demo_description">
  <link name="base_link" />
  <link name="tip_link" />
  <joint name="shoulder_joint" type="revolute">
    <parent link="base_link" />
    <child link="tip_link" />
    <axis xyz="0 0 1" />
    <limit lower="-1" upper="1" effort="10" velocity="5" />
  </joint>
</robot>`;

  const robot = parseURDF(sourceUrdf);
  assert.ok(robot);

  const ros1Xacro = injectGazeboTags(sourceUrdf, robot, 'ros1', 'effort');
  const ros2Xacro = injectGazeboTags(sourceUrdf, robot, 'ros2', 'position');

  const ros1Result = resolveRobotFileData({
    name: 'robots/demo/demo_description.urdf.xacro',
    content: ros1Xacro,
    format: 'xacro',
  });
  const ros2Result = resolveRobotFileData({
    name: 'robots/demo/demo_description.urdf.xacro',
    content: ros2Xacro,
    format: 'xacro',
  });

  assert.equal(ros1Result.status, 'ready');
  if (ros1Result.status !== 'ready') {
    assert.fail('Expected ROS1 xacro import result to be ready');
  }
  assert.equal(ros1Result.robotData.name, 'demo_description');
  assert.ok(ros1Result.robotData.links.base_link);
  assert.ok(ros1Result.robotData.joints.shoulder_joint);

  assert.equal(ros2Result.status, 'ready');
  if (ros2Result.status !== 'ready') {
    assert.fail('Expected ROS2 xacro import result to be ready');
  }
  assert.equal(ros2Result.robotData.name, 'demo_description');
  assert.ok(ros2Result.robotData.links.base_link);
  assert.ok(ros2Result.robotData.joints.shoulder_joint);
});

test('createUsdPlaceholderRobotData can synthesize a USD placeholder robot', () => {
  const result = createUsdPlaceholderRobotData(createUsdFile('robots/demo/scene.usdz'));

  assert.equal(result.name, 'scene');
  assert.equal(result.rootLinkId, 'usd_scene_root');
  assert.equal(result.links.usd_scene_root?.visual.type, GeometryType.NONE);
  assert.equal(result.links.usd_scene_root?.collision.type, GeometryType.NONE);
});
