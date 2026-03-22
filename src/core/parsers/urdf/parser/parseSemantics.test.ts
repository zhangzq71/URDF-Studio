import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

import { isSyntheticWorldRoot } from '@/core/robot';
import { parseURDF } from './index.ts';
import { generateURDF } from '../urdfGenerator.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;

const FLOATING_ROOT_URDF = `<?xml version="1.0"?>
<robot name="hi_25dof">
  <link name="world"></link>
  <joint name="floating_base_joint" type="floating">
    <parent link="world" />
    <child link="base_link" />
  </joint>
  <link name="base_link">
    <inertial>
      <mass value="1" />
      <inertia ixx="1" ixy="0" ixz="0" iyy="1" iyz="0" izz="1" />
    </inertial>
  </link>
</robot>`;

test('parseURDF preserves missing inertial and floating joint optional fields', () => {
  const robot = parseURDF(FLOATING_ROOT_URDF);

  assert.ok(robot);
  assert.equal(isSyntheticWorldRoot(robot, robot.rootLinkId), true);
  assert.equal(robot.links.world?.inertial, undefined);
  assert.equal(robot.joints.floating_base_joint?.axis, undefined);
  assert.equal(robot.joints.floating_base_joint?.limit, undefined);
});

test('generateURDF does not synthesize inertial or limit tags for absent source fields', () => {
  const robot = parseURDF(FLOATING_ROOT_URDF);
  assert.ok(robot);

  const urdf = generateURDF({
    ...robot,
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<link name="world">\s*<\/link>/);
  assert.doesNotMatch(
    urdf,
    /<joint name="floating_base_joint" type="floating">[\s\S]*?<limit\b/,
  );
  assert.doesNotMatch(
    urdf,
    /<joint name="floating_base_joint" type="floating">[\s\S]*?<axis\b/,
  );
});

test('generateURDF falls back to robot materials when exporting visual colors', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="material_fallback">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1" />
      </geometry>
    </visual>
  </link>
</robot>`);

  assert.ok(robot);

  const urdf = generateURDF({
    ...robot,
    materials: {
      base_link: {
        color: '#123456',
      },
    },
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<material name="base_link_mat">[\s\S]*?<color rgba="0\.07059216 0\.20392549 0\.33725882 1\.00000000"/);
});

test('generateURDF omits inline mesh colors when the mesh export already carries baked colors', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="vertex_color_export">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="meshes/base_link_visual_0.obj" />
      </geometry>
    </visual>
  </link>
</robot>`);

  assert.ok(robot);

  const urdf = generateURDF({
    ...robot,
    materials: {
      base_link: {
        color: '#123456',
      },
    },
    selection: { type: null, id: null },
  }, {
    omitMeshMaterialPaths: ['meshes/base_link_visual_0.obj'],
  });

  assert.match(urdf, /<mesh filename="package:\/\/vertex_color_export\/meshes\/base_link_visual_0\.obj" \/>/);
  assert.doesNotMatch(urdf, /<material name="base_link_mat">/);
});

test('generateURDF preserves hex material colors across parse roundtrips', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="material_roundtrip">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1" />
      </geometry>
    </visual>
  </link>
</robot>`);

  assert.ok(robot);

  const exported = generateURDF({
    ...robot,
    materials: {
      base_link: {
        color: '#123456',
      },
    },
    selection: { type: null, id: null },
  });

  const reparsed = parseURDF(exported);
  assert.ok(reparsed);
  assert.equal(reparsed?.links.base_link.visual.color, '#123456');
  assert.equal(reparsed?.materials?.base_link?.color, '#123456');
});

test('parseURDF syncs visual colors into robot materials state', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="material_parse">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1" />
      </geometry>
      <material name="base_link_mat">
        <color rgba="0.1 0.2 0.3 1" />
      </material>
    </visual>
  </link>
</robot>`);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.color, '#19334c');
  assert.equal(robot.materials?.base_link?.color, '#19334c');
});

test('parseURDF prefers global named materials over conflicting local color definitions', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="global_material_priority">
  <material name="dark">
    <color rgba="0.2 0.2 0.2 1" />
  </material>
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="base.stl" />
      </geometry>
      <material name="dark">
        <color rgba="1 1 1 1" />
      </material>
    </visual>
  </link>
</robot>`);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.color, '#333333');
  assert.equal(robot.links.base_link.visual.materialSource, 'named');
  assert.equal(robot.materials?.base_link?.color, '#333333');
});

test('parseURDF preserves continuous joint effort and velocity without synthesizing position bounds', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="continuous_limits">
  <link name="base_link" />
  <link name="tip_link" />
  <joint name="spin_joint" type="continuous">
    <parent link="base_link" />
    <child link="tip_link" />
    <axis xyz="0 0 1" />
    <limit effort="35.278" velocity="20" />
  </joint>
</robot>`);

  assert.ok(robot);
  assert.ok(robot.joints.spin_joint?.limit);
  assert.equal(Number.isFinite(robot.joints.spin_joint.limit?.lower), false);
  assert.equal(Number.isFinite(robot.joints.spin_joint.limit?.upper), false);
  assert.equal(robot.joints.spin_joint.limit?.effort, 35.278);
  assert.equal(robot.joints.spin_joint.limit?.velocity, 20);

  const urdf = generateURDF({
    ...robot,
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<limit effort="35\.278" velocity="20" \/>/);
  assert.doesNotMatch(urdf, /<limit[^>]*lower=/);
  assert.doesNotMatch(urdf, /<limit[^>]*upper=/);
});

test('parseURDF preserves named material textures in robot materials state and export output', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="material_texture_parse">
  <material name="painted">
    <texture filename="textures/paint.png" />
  </material>
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="base.stl" />
      </geometry>
      <material name="painted" />
    </visual>
  </link>
</robot>`);

  assert.ok(robot);
  assert.equal(robot.materials?.base_link?.texture, 'textures/paint.png');

  const urdf = generateURDF({
    ...robot,
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<texture filename="package:\/\/material_texture_parse\/textures\/paint\.png" \/>/);
});

test('generateURDF does not fall back to the default visual blue when a texture-only material is present', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="material_texture_only_export">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="base.stl" />
      </geometry>
    </visual>
  </link>
</robot>`);

  assert.ok(robot);

  const urdf = generateURDF({
    ...robot,
    materials: {
      base_link: {
        texture: 'textures/paint.png',
      },
    },
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<texture filename="package:\/\/material_texture_only_export\/textures\/paint\.png" \/>/);
  assert.doesNotMatch(
    urdf,
    /<color rgba="0\.23137647 0\.50980784 0\.96470980 1\.00000000"\/>/,
  );
});

test('generateURDF keeps go2 Collada exports package-relative without collapsing embedded mesh materials', () => {
  const source = fs.readFileSync('test/unitree_ros/robots/go2_description/urdf/go2_description.urdf', 'utf8');
  const robot = parseURDF(source);

  assert.ok(robot);
  assert.equal(robot.materials?.base, undefined);

  const urdf = generateURDF({
    ...robot,
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<mesh filename="package:\/\/go2_description\/meshes\/dae\/base\.dae" \/>/);
  assert.doesNotMatch(urdf, /package:\/\/go2_description\/meshes\/go2_description\/dae\/base\.dae/);

  const baseVisual = urdf.match(/<link name="base">[\s\S]*?<visual>([\s\S]*?)<\/visual>/);
  assert.ok(baseVisual);
  assert.doesNotMatch(baseVisual[1], /<material\b/);
});

test('parseURDF preserves mimic joint metadata through export', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="mimic_parse">
  <link name="base_link" />
  <link name="master_link" />
  <link name="slave_link" />
  <joint name="master_joint" type="revolute">
    <parent link="base_link" />
    <child link="master_link" />
    <limit lower="-1" upper="1" effort="5" velocity="2" />
  </joint>
  <joint name="slave_joint" type="revolute">
    <parent link="master_link" />
    <child link="slave_link" />
    <mimic joint="master_joint" multiplier="1.5" offset="0.25" />
    <limit lower="-1" upper="1" effort="5" velocity="2" />
  </joint>
</robot>`);

  assert.ok(robot);
  assert.deepEqual(robot.joints.slave_joint.mimic, {
    joint: 'master_joint',
    multiplier: 1.5,
    offset: 0.25,
  });

  const urdf = generateURDF({
    ...robot,
    selection: { type: null, id: null },
  });

  assert.match(urdf, /<mimic joint="master_joint" multiplier="1\.5" offset="0\.25" \/>/);
});

test('parseURDF rejects robot documents without any links', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="empty_robot">
  <joint name="orphan" type="fixed">
    <parent link="world" />
    <child link="ghost" />
  </joint>
</robot>`);

  assert.equal(robot, null);
});

test('parseURDF keeps named URDF material colors ahead of gazebo overrides', () => {
  const robot = parseURDF(`<?xml version="1.0"?>
<robot name="gazebo_material_priority">
  <material name="base_paint">
    <color rgba="0.2 0.4 0.6 1" />
  </material>
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1" />
      </geometry>
      <material name="base_paint" />
    </visual>
  </link>
  <gazebo reference="base_link">
    <material>Gazebo/Red</material>
  </gazebo>
</robot>`);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.color, '#336699');
  assert.equal(robot.links.base_link.visual.materialSource, 'named');
  assert.equal(robot.materials?.base_link?.color, '#336699');
});
