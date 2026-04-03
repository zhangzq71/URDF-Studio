import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { GeometryType } from '@/types';
import { loadMJCFToThreeJS } from './mjcfLoader.ts';
import { disposeTransientObject3D } from './mjcfLoadLifecycle.ts';
import {
  clearParsedMJCFModelCache,
  getParsedMJCFModelCacheSize,
  parseMJCFModel,
} from './mjcfModel.ts';
import { parseMJCF } from './mjcfParser.ts';
import { computeLinkWorldMatrices } from '@/core/robot';

function installDomGlobals(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { contentType: 'text/html' });
  globalThis.window = dom.window as any;
  globalThis.document = dom.window.document as any;
  globalThis.DOMParser = dom.window.DOMParser as any;
  globalThis.XMLSerializer = dom.window.XMLSerializer as any;
  globalThis.Node = dom.window.Node as any;
  globalThis.Element = dom.window.Element as any;
  globalThis.Document = dom.window.Document as any;
}

test('parseMJCFModel cache can be cleared explicitly', () => {
  installDomGlobals();
  clearParsedMJCFModelCache();

  const xml = `
        <mujoco model="cache-clear-model">
          <worldbody>
            <body name="base_link">
              <geom type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
    `;

  const parsed = parseMJCFModel(xml);
  assert.ok(parsed);
  assert.equal(getParsedMJCFModelCacheSize(), 1);

  clearParsedMJCFModelCache(xml);
  assert.equal(getParsedMJCFModelCacheSize(), 0);
});

test('parseMJCF releases parsed model cache after import completes', () => {
  installDomGlobals();
  clearParsedMJCFModelCache();

  const robot = parseMJCF(`
        <mujoco model="parse-cache-release">
          <worldbody>
            <body name="base_link">
              <geom type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(getParsedMJCFModelCacheSize(), 0);
});

test('loadMJCFToThreeJS releases parsed model cache after scene construction', async () => {
  installDomGlobals();
  clearParsedMJCFModelCache();

  const root = await loadMJCFToThreeJS(
    `
        <mujoco model="loader-cache-release">
          <worldbody>
            <body name="base_link">
              <geom type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
    `,
    {},
  );

  assert.ok(root);
  assert.equal(getParsedMJCFModelCacheSize(), 0);

  disposeTransientObject3D(root);
});

test('loadMJCFToThreeJS rejects missing mesh assets instead of creating placeholders', async () => {
  installDomGlobals();
  clearParsedMJCFModelCache();

  await assert.rejects(
    loadMJCFToThreeJS(
      `
            <mujoco model="missing-mesh">
              <asset>
                <mesh name="base_mesh" file="meshes/missing.stl" />
              </asset>
              <worldbody>
                <body name="base_link">
                  <geom type="mesh" mesh="base_mesh" />
                </body>
              </worldbody>
            </mujoco>
        `,
      {},
    ),
    /Mesh file could not be resolved: meshes\/missing\.stl/,
  );

  assert.equal(getParsedMJCFModelCacheSize(), 0);
});

test('parseMJCF preserves equality connect constraints as closed-loop metadata', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="connect-test">
          <worldbody>
            <body name="base">
              <body name="link_a" pos="1 0 0">
                <joint name="joint_a" type="hinge" />
              </body>
              <body name="link_b" pos="1.2 0 0">
                <joint name="joint_b" type="hinge" />
              </body>
            </body>
          </worldbody>
          <equality>
            <connect body1="link_a" body2="link_b" anchor="0.2 0 0" />
          </equality>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.closedLoopConstraints?.length, 1);

  const [constraint] = robot.closedLoopConstraints ?? [];
  assert.ok(constraint);
  assert.equal(constraint.type, 'connect');
  assert.equal(constraint.linkAId, 'link_a');
  assert.equal(constraint.linkBId, 'link_b');
  assert.deepEqual(constraint.anchorLocalA, { x: 0.2, y: 0, z: 0 });
  assert.deepEqual(constraint.anchorLocalB, { x: 0, y: 0, z: 0 });
  assert.deepEqual(constraint.anchorWorld, { x: 1.2, y: 0, z: 0 });
  assert.deepEqual(constraint.source, {
    format: 'mjcf',
    body1Name: 'link_a',
    body2Name: 'link_b',
  });
});

test('parseMJCF keeps base-link collision boxes out of duplicated visuals', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="base-collision-pairing">
          <asset>
            <mesh name="base_mesh" file="base.stl" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom type="mesh" mesh="base_mesh" group="1" contype="0" conaffinity="0" />
              <geom type="box" size="0.1 0.2 0.3" pos="0 0 0.4" />
              <geom type="box" size="0.05 0.06 0.07" pos="0.2 0 0" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.ok(robot.links.base_link);
  assert.equal(robot.links.base_link.visual.type, 'mesh');
  assert.equal(robot.links.base_link.collision.type, 'box');
  assert.deepEqual(robot.links.base_link.collision.origin?.xyz, { x: 0, y: 0, z: 0.4 });
  assert.equal(robot.links.base_link.collisionBodies?.length, 1);
  assert.equal(robot.links.base_link.collisionBodies?.[0]?.type, 'box');
  assert.deepEqual(robot.links.base_link.collisionBodies?.[0]?.origin?.xyz, { x: 0.2, y: 0, z: 0 });
  assert.equal(robot.links.base_link_geom_1, undefined);
});

test('parseMJCF preserves mesh-backed primitive collision geoms as mesh geometry when primitive parameters are unresolved', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="mesh-backed-collision-fallback">
          <default>
            <default class="collision">
              <geom type="capsule" />
            </default>
          </default>
          <asset>
            <mesh name="link_mesh" file="link.obj" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom mesh="link_mesh" class="collision" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.links.base_link.collision.type, GeometryType.MESH);
  assert.equal(robot.links.base_link.collision.meshPath, 'link.obj');
  assert.deepEqual(robot.links.base_link.collision.dimensions, { x: 1, y: 1, z: 1 });
});

test('parseMJCF preserves root free joint transforms as floating joint origins', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="free-root">
          <worldbody>
            <body name="base_link" pos="0 0 0.5">
              <joint name="floating_base_joint" type="free" limited="false" />
              <body name="child_link" pos="0 0.1 0.2">
                <joint name="child_joint" type="hinge" axis="0 1 0" />
              </body>
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.rootLinkId, 'world');
  assert.deepEqual(robot.joints.floating_base_joint?.origin?.xyz, { x: 0, y: 0, z: 0.5 });
  assert.deepEqual(robot.joints.floating_base_joint?.origin?.rpy, { r: 0, p: 0, y: 0 });
  assert.deepEqual(robot.joints.child_joint?.origin?.xyz, { x: 0, y: 0.1, z: 0.2 });
});

test('parseMJCF applies joint ref as the imported initial joint value', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="joint-ref-defaults">
          <worldbody>
            <body name="base_link">
              <body name="knee_link">
                <joint name="knee_joint" type="hinge" ref="-45" range="-90 90" />
              </body>
              <body name="slider_link" pos="0 0 0.1">
                <joint name="slider_joint" type="slide" ref="0.12" range="-1 1" />
              </body>
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.ok(Math.abs((robot.joints.knee_joint?.angle ?? 0) + Math.PI / 4) < 1e-9);
  assert.ok(Math.abs((robot.joints.knee_joint?.referencePosition ?? 0) + Math.PI / 4) < 1e-9);
  assert.equal(robot.joints.slider_joint?.angle, 0.12);
  assert.equal(robot.joints.slider_joint?.referencePosition, 0.12);

  const linkWorldMatrices = computeLinkWorldMatrices(robot);
  const kneeWorldQuaternion = new THREE.Quaternion();
  const kneeWorldPosition = new THREE.Vector3();
  linkWorldMatrices.knee_link?.decompose(
    kneeWorldPosition,
    kneeWorldQuaternion,
    new THREE.Vector3(),
  );
  assert.ok(kneeWorldQuaternion.angleTo(new THREE.Quaternion()) <= 1e-9);

  const sliderWorldQuaternion = new THREE.Quaternion();
  const sliderWorldPosition = new THREE.Vector3();
  linkWorldMatrices.slider_link?.decompose(
    sliderWorldPosition,
    sliderWorldQuaternion,
    new THREE.Vector3(),
  );
  assert.ok(sliderWorldQuaternion.angleTo(new THREE.Quaternion()) <= 1e-9);
  assert.ok(sliderWorldPosition.distanceTo(new THREE.Vector3(0, 0, 0.1)) <= 1e-9);
});

test('parseMJCF folds non-zero joint anchors into the imported joint origin instead of scattering the child link frame', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="joint-anchor-offset">
          <worldbody>
            <body name="base_link" pos="1 0 0" quat="0.70710678 0 0 0.70710678">
              <joint name="base_joint" type="hinge" pos="1 0 0" axis="0 0 1" />
              <geom type="box" size="0.1 0.1 0.1" pos="1 0 0" />
              <inertial mass="1" pos="1 0 0" diaginertia="1 1 1" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);

  const jointOrigin = robot.joints.base_joint?.origin?.xyz;
  assert.ok(jointOrigin);
  assert.ok(Math.abs(jointOrigin.x - 1) < 1e-6);
  assert.ok(Math.abs(jointOrigin.y - 1) < 1e-6);
  assert.ok(Math.abs(jointOrigin.z - 0) < 1e-6);

  assert.deepEqual(robot.links.base_link.visual.origin?.xyz, { x: 0, y: 0, z: 0 });
  assert.deepEqual(robot.links.base_link.inertial?.origin?.xyz, { x: 0, y: 0, z: 0 });
});

test('parseMJCF syncs visual colors into robot materials state', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="material-sync">
          <asset>
            <material name="gray_mat" rgba="0.59 0.59 0.59 1" />
            <mesh name="base_mesh" file="base.stl" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom type="mesh" mesh="base_mesh" material="gray_mat" group="1" contype="0" conaffinity="0" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.color, '#969696');
  assert.equal(robot.materials?.base_link?.color, '#969696');
});

test('parseMJCF inherits actuator effort limits from default-backed position actuators', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="default-backed-actuator">
          <default class="main">
            <position ctrlrange="-1 1" />
            <default class="servo">
              <position forcerange="-12 12" kp="40" />
            </default>
          </default>
          <worldbody>
            <body name="base_link">
              <body name="arm_link">
                <joint name="arm_joint" type="hinge" axis="0 0 1" />
              </body>
            </body>
          </worldbody>
          <actuator>
            <position name="arm_joint_servo" joint="arm_joint" class="servo" />
          </actuator>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.joints.arm_joint?.limit?.effort, 12);
});

test('parseMJCFModel exposes site and tendon metadata without changing joint actuator resolution', () => {
  installDomGlobals();

  const parsed = parseMJCFModel(`
        <mujoco model="site-tendon-metadata">
          <compiler autolimits="true" />
          <default class="main">
            <site type="sphere" size="0.02" rgba="1 0 0 1" />
            <tendon width="0.03" rgba="0 1 0 1" />
            <position ctrlrange="-1 1" />
            <default class="servo">
              <position forcerange="-5 5" />
            </default>
          </default>
          <worldbody>
            <body name="base_link" childclass="main">
              <site name="tip_site" pos="0 0 0.1" />
              <frame pos="0 0 0.2">
                <site name="frame_site" pos="0 0 0.1" />
              </frame>
              <body name="arm_link">
                <joint name="arm_joint" type="hinge" axis="0 0 1" range="-1 1" />
              </body>
            </body>
          </worldbody>
          <tendon>
            <spatial name="finger_tendon" range="0 1">
              <site site="tip_site" />
              <site site="frame_site" />
            </spatial>
          </tendon>
          <actuator>
            <position name="arm_servo" joint="arm_joint" class="servo" />
            <motor name="finger_motor" tendon="finger_tendon" gear="2" />
          </actuator>
        </mujoco>
    `);

  assert.ok(parsed);

  const baseLink = parsed.worldBody.children.find((body) => body.name === 'base_link');
  assert.ok(baseLink);
  assert.equal(baseLink.sites.length, 2);
  assert.deepEqual(
    baseLink.sites.map((site) => site.name),
    ['tip_site', 'frame_site'],
  );
  assert.deepEqual(baseLink.sites[0]?.size, [0.02]);
  assert.deepEqual(baseLink.sites[0]?.pos, [0, 0, 0.1]);
  assert.ok(baseLink.sites[1]?.pos);
  assert.ok(Math.abs((baseLink.sites[1]?.pos?.[0] ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((baseLink.sites[1]?.pos?.[1] ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((baseLink.sites[1]?.pos?.[2] ?? 0) - 0.3) <= 1e-9);

  const tendon = parsed.tendonMap.get('finger_tendon');
  assert.ok(tendon);
  assert.equal(tendon.type, 'spatial');
  assert.equal(tendon.limited, true);
  assert.equal(tendon.width, 0.03);
  assert.deepEqual(tendon.attachments, [
    { type: 'site', ref: 'tip_site' },
    { type: 'site', ref: 'frame_site' },
  ]);

  assert.equal(parsed.tendonActuators.length, 1);
  assert.equal(parsed.tendonActuators[0]?.name, 'finger_motor');
  assert.equal(parsed.tendonActuators[0]?.tendon, 'finger_tendon');
  assert.deepEqual(parsed.tendonActuators[0]?.gear, [2]);

  const jointActuators = parsed.actuatorMap.get('arm_joint');
  assert.ok(jointActuators);
  assert.equal(jointActuators.length, 1);
  assert.deepEqual(jointActuators[0]?.ctrlrange, [-1, 1]);
  assert.deepEqual(jointActuators[0]?.forcerange, [-5, 5]);
  assert.equal(jointActuators[0]?.ctrllimited, true);
  assert.equal(jointActuators[0]?.forcelimited, true);
});

test('parseMJCFModel expands frame-wrapped bodies and frame childclass-scoped joints', () => {
  installDomGlobals();

  const parsed = parseMJCFModel(`
        <mujoco model="frame-body-joint-semantics">
          <default class="main">
            <joint damping="1" axis="1 0 0" />
            <default class="alt">
              <joint axis="0 1 0" />
            </default>
          </default>
          <worldbody>
            <frame pos="1 2 0" euler="0 0 90" childclass="main">
              <body name="framed_body" pos="0 1 0">
                <frame pos="0 0 1" childclass="alt">
                  <joint name="framed_joint" type="hinge" pos="0 0 0.5" />
                </frame>
                <frame pos="0 0 2">
                  <body name="nested_body" pos="0 0 1" />
                </frame>
              </body>
            </frame>
          </worldbody>
        </mujoco>
    `);

  assert.ok(parsed);

  const framedBody = parsed.worldBody.children.find((body) => body.name === 'framed_body');
  assert.ok(framedBody);
  assert.ok(Math.abs((framedBody.pos?.[0] ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((framedBody.pos?.[1] ?? 0) - 2) <= 1e-9);
  assert.ok(Math.abs((framedBody.pos?.[2] ?? 0) - 0) <= 1e-9);
  assert.equal(framedBody.euler, undefined);
  assert.ok(framedBody.quat);

  const framedJoint = framedBody.joints.find((joint) => joint.name === 'framed_joint');
  assert.ok(framedJoint);
  assert.deepEqual(framedJoint.pos, [0, 0, 1.5]);
  assert.ok(Math.abs((framedJoint.axis?.[0] ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((framedJoint.axis?.[1] ?? 0) - 1) <= 1e-9);
  assert.ok(Math.abs((framedJoint.axis?.[2] ?? 0) - 0) <= 1e-9);
  assert.equal(framedJoint.damping, 1);

  const nestedBody = framedBody.children.find((body) => body.name === 'nested_body');
  assert.ok(nestedBody);
  assert.deepEqual(nestedBody.pos, [0, 0, 3]);
});

test('parseMJCF rotates frame-wrapped joint anchors and axes into the parent body frame', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="frame-joint-robot-state">
          <worldbody>
            <body name="base_link">
              <body name="child_link">
                <frame pos="0 1 0" euler="0 0 90">
                  <joint name="hinge_joint" type="hinge" axis="1 0 0" range="-1 1" />
                </frame>
                <geom type="box" size="0.1 0.1 0.1" />
              </body>
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.joints.hinge_joint?.parentLinkId, 'base_link');
  assert.equal(robot.joints.hinge_joint?.childLinkId, 'child_link');
  assert.ok(Math.abs((robot.joints.hinge_joint?.origin?.xyz?.x ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((robot.joints.hinge_joint?.origin?.xyz?.y ?? 0) - 1) <= 1e-9);
  assert.ok(Math.abs((robot.joints.hinge_joint?.origin?.xyz?.z ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((robot.joints.hinge_joint?.axis?.x ?? 0) - 0) <= 1e-9);
  assert.ok(Math.abs((robot.joints.hinge_joint?.axis?.y ?? 0) - 1) <= 1e-9);
  assert.ok(Math.abs((robot.joints.hinge_joint?.axis?.z ?? 0) - 0) <= 1e-9);
});

test('parseMJCF preserves ellipsoid geoms as ellipsoid geometry types', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="ellipsoid-geom">
          <worldbody>
            <body name="base_link">
              <geom type="ellipsoid" size="0.03 0.04 0.02" rgba="0.5 0.7 0.5 1" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.type, GeometryType.ELLIPSOID);
  assert.deepEqual(robot.links.base_link.visual.dimensions, {
    x: 0.03,
    y: 0.04,
    z: 0.02,
  });
});

test('parseMJCF preserves plane geoms as plane geometry types', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="plane-geom">
          <worldbody>
            <body name="base_link">
              <geom type="plane" size="3 2 0.1" rgba="0.2 0.2 0.2 1" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.type, GeometryType.PLANE);
  assert.deepEqual(robot.links.base_link.visual.dimensions, {
    x: 6,
    y: 4,
    z: 0,
  });
});

test('parseMJCF preserves mjcf-specific hfield and sdf geom types without folding them into mesh/none', () => {
  installDomGlobals();

  const hfieldRobot = parseMJCF(`
        <mujoco model="hfield-geom">
          <asset>
            <hfield name="terrain_patch" file="terrain.png" size="2 3 0.4 0.1" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom type="hfield" hfield="terrain_patch" rgba="0.3 0.5 0.3 1" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(hfieldRobot);
  assert.equal(hfieldRobot.links.base_link.visual.type, GeometryType.HFIELD);
  assert.equal(hfieldRobot.links.base_link.visual.assetRef, 'terrain_patch');
  assert.deepEqual(hfieldRobot.links.base_link.visual.dimensions, {
    x: 4,
    y: 6,
    z: 0.5,
  });
  assert.deepEqual(hfieldRobot.links.base_link.visual.mjcfHfield, {
    name: 'terrain_patch',
    file: 'terrain.png',
    contentType: undefined,
    nrow: undefined,
    ncol: undefined,
    size: {
      radiusX: 2,
      radiusY: 3,
      elevationZ: 0.4,
      baseZ: 0.1,
    },
    elevation: undefined,
  });

  const sdfRobot = parseMJCF(`
        <mujoco model="sdf-geom">
          <asset>
            <mesh name="distance_field_mesh" file="distance_field.obj" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom type="sdf" mesh="distance_field_mesh" rgba="0.5 0.5 0.7 1" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(sdfRobot);
  assert.equal(sdfRobot.links.base_link.visual.type, GeometryType.SDF);
  assert.equal(sdfRobot.links.base_link.visual.assetRef, 'distance_field_mesh');
  assert.equal(sdfRobot.links.base_link.visual.meshPath, 'distance_field.obj');
});

test('parseMJCF prefers material colors over inherited default geom rgba', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="material-default-precedence">
          <default>
            <geom rgba="0.8 0.6 0.4 1" />
          </default>
          <asset>
            <material name="steel_mat" rgba="0.1 0.2 0.3 1" />
            <mesh name="base_mesh" file="base.stl" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom type="mesh" mesh="base_mesh" material="steel_mat" group="1" contype="0" conaffinity="0" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.color, '#1a334d');
  assert.equal(robot.materials?.base_link?.color, '#1a334d');
});

test('parseMJCF preserves texture-backed material assets with a neutral white multiplier', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="textured-material-sync">
          <compiler texturedir="textures" />
          <asset>
            <texture name="robot_texture" type="2d" file="robot_texture.png" />
            <material name="robot_mtl" texture="robot_texture" />
            <mesh name="base_mesh" file="base.stl" />
          </asset>
          <worldbody>
            <body name="base_link">
              <geom type="mesh" mesh="base_mesh" material="robot_mtl" group="1" contype="0" conaffinity="0" />
            </body>
          </worldbody>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.links.base_link.visual.color, '#ffffff');
  assert.deepEqual(robot.materials?.base_link, {
    color: '#ffffff',
    texture: 'textures/robot_texture.png',
  });
});

test('parseMJCF attaches MJCF-specific inspection context for AI review', () => {
  installDomGlobals();

  const robot = parseMJCF(`
        <mujoco model="inspection-context">
          <default>
            <site type="sphere" size="0.01" />
          </default>
          <worldbody>
            <body name="base_link">
              <site name="tool_center" pos="0 0 0.1" />
              <body name="finger_link">
                <joint name="finger_joint" type="hinge" axis="0 1 0" range="-0.5 0.5" />
              </body>
            </body>
          </worldbody>
          <tendon>
            <spatial name="finger_tendon">
              <site site="tool_center" />
            </spatial>
          </tendon>
          <actuator>
            <motor name="finger_tendon_motor" tendon="finger_tendon" />
          </actuator>
        </mujoco>
    `);

  assert.ok(robot);
  assert.equal(robot.inspectionContext?.sourceFormat, 'mjcf');
  assert.equal(robot.inspectionContext?.mjcf?.siteCount, 1);
  assert.equal(robot.inspectionContext?.mjcf?.tendonCount, 1);
  assert.equal(robot.inspectionContext?.mjcf?.tendonActuatorCount, 1);
  assert.deepEqual(robot.inspectionContext?.mjcf?.bodiesWithSites, [
    { bodyId: 'base_link', siteCount: 1, siteNames: ['tool_center'] },
  ]);
  assert.deepEqual(robot.inspectionContext?.mjcf?.tendons, [
    {
      name: 'finger_tendon',
      type: 'spatial',
      limited: undefined,
      range: undefined,
      attachmentRefs: ['tool_center'],
      actuatorNames: ['finger_tendon_motor'],
    },
  ]);
});
