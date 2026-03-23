import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

import { parseMJCF } from './mjcfParser.ts';

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
