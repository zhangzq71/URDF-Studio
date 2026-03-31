import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';
import type { RobotFile } from '@/types';

import {
  MJCF_COMPILER_ANGLE_SCOPE_ATTR,
  MJCF_COMPILER_EULERSEQ_SCOPE_ATTR,
} from './mjcfCompilerScope.ts';
import { parseMJCFModel } from './mjcfModel.ts';
import { resolveMJCFSource } from './mjcfSourceResolver.ts';

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

function assertQuaternionClose(
  actual: [number, number, number, number] | undefined,
  expected: [number, number, number, number],
  tolerance = 1e-5,
): void {
  assert.ok(actual, 'expected quaternion to be defined');
  const direct = actual.every((value, index) => Math.abs(value - expected[index]!) <= tolerance);
  const negated = actual.every((value, index) => Math.abs(value + expected[index]!) <= tolerance);
  assert.ok(direct || negated, `expected quaternion ${expected.join(', ')}, got ${actual.join(', ')}`);
}

test('resolveMJCFSource scopes attached compiler settings to the imported subtree', () => {
  installDomGlobals();

  const files: RobotFile[] = [
    {
      name: '/tmp/mjcf-scoped/scene.xml',
      format: 'mjcf',
      content: `
        <mujoco model="scene">
          <asset>
            <model name="child_model" file="attached.xml" />
          </asset>
          <worldbody>
            <geom name="host_geom" type="box" size="0.1 0.1 0.1" euler="90 0 0" />
            <attach model="child_model" body="subtree" prefix="child/" />
          </worldbody>
        </mujoco>
      `,
    },
    {
      name: '/tmp/mjcf-scoped/attached.xml',
      format: 'mjcf',
      content: `
        <mujoco model="attached">
          <compiler angle="radian" eulerseq="xyz" />
          <worldbody>
            <body name="subtree" euler="1.5707963267948966 0 0">
              <geom name="child_geom" type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
      `,
    },
  ];

  const resolved = resolveMJCFSource(files[0]!, files);
  const resolvedDoc = new DOMParser().parseFromString(resolved.content, 'text/xml');
  const importedBody = resolvedDoc.querySelector('worldbody > body[name="child/subtree"]');

  assert.ok(importedBody);
  assert.equal(resolvedDoc.querySelectorAll('mujoco > compiler').length, 0);
  assert.equal(importedBody.getAttribute(MJCF_COMPILER_ANGLE_SCOPE_ATTR), 'radian');
  assert.equal(importedBody.getAttribute(MJCF_COMPILER_EULERSEQ_SCOPE_ATTR), 'xyz');

  const parsedModel = parseMJCFModel(resolved.content);
  assert.ok(parsedModel);

  const hostGeom = parsedModel.worldBody.geoms.find((geom) => geom.sourceName === 'host_geom');
  const childBody = parsedModel.worldBody.children.find((body) => body.sourceName === 'child/subtree');

  assert.ok(hostGeom);
  assert.ok(childBody);
  assertQuaternionClose(hostGeom.quat, [0.70710678, 0.70710678, 0, 0]);
  assertQuaternionClose(childBody.quat, [0.70710678, 0.70710678, 0, 0]);
});

test('resolveMJCFSource keeps the selected file even when a sibling scene includes it', () => {
  installDomGlobals();

  const files: RobotFile[] = [
    {
      name: '/tmp/mjcf-selected/robot.xml',
      format: 'mjcf',
      content: `
        <mujoco model="robot">
          <actuator>
            <motor name="joint_motor" joint="joint" />
          </actuator>
        </mujoco>
      `,
    },
    {
      name: '/tmp/mjcf-selected/scene.xml',
      format: 'mjcf',
      content: `
        <mujoco model="scene">
          <include file="robot.xml" />
          <worldbody>
            <geom name="floor" type="plane" size="0 0 1" />
          </worldbody>
        </mujoco>
      `,
    },
  ];

  const resolved = resolveMJCFSource(files[0]!, files);

  assert.equal(resolved.sourceFile.name, '/tmp/mjcf-selected/robot.xml');
  assert.equal(resolved.effectiveFile.name, '/tmp/mjcf-selected/robot.xml');
  assert.match(resolved.content, /joint_motor/);
  assert.doesNotMatch(resolved.content, /name="floor"/);
});

test('resolveMJCFSource does not resolve includes through ambiguous basename matches', () => {
  installDomGlobals();

  const files: RobotFile[] = [
    {
      name: '/tmp/mjcf-ambiguous/wrapper.xml',
      format: 'mjcf',
      content: `
        <mujoco model="wrapper">
          <include file="model.xml" />
          <worldbody>
            <geom name="floor" type="plane" size="0 0 1" />
          </worldbody>
        </mujoco>
      `,
    },
    {
      name: '/tmp/mjcf-ambiguous/left/model.xml',
      format: 'mjcf',
      content: `
        <mujoco model="left">
          <worldbody>
            <body name="left_root" />
          </worldbody>
        </mujoco>
      `,
    },
    {
      name: '/tmp/mjcf-ambiguous/right/model.xml',
      format: 'mjcf',
      content: `
        <mujoco model="right">
          <worldbody>
            <body name="right_root" />
          </worldbody>
        </mujoco>
      `,
    },
  ];

  const resolved = resolveMJCFSource(files[0]!, files);

  assert.equal(resolved.effectiveFile.name, '/tmp/mjcf-ambiguous/wrapper.xml');
  assert.match(resolved.content, /name="floor"/);
  assert.doesNotMatch(resolved.content, /left_root/);
  assert.doesNotMatch(resolved.content, /right_root/);
});

test('resolveMJCFSource resolves attached model assets through compiler assetdir', () => {
  installDomGlobals();

  const files: RobotFile[] = [
    {
      name: '/tmp/mjcf-assetdir/scene.xml',
      format: 'mjcf',
      content: `
        <mujoco model="scene">
          <compiler assetdir="assets" />
          <asset>
            <model name="child_model" file="attached.xml" />
          </asset>
          <worldbody>
            <attach model="child_model" body="child_root" prefix="child/" />
          </worldbody>
        </mujoco>
      `,
    },
    {
      name: '/tmp/mjcf-assetdir/assets/attached.xml',
      format: 'mjcf',
      content: `
        <mujoco model="attached">
          <worldbody>
            <body name="child_root">
              <geom name="child_geom" type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
      `,
    },
  ];

  const resolved = resolveMJCFSource(files[0]!, files);

  assert.match(resolved.content, /name="child\/child_root"/);
  assert.match(resolved.content, /name="child\/child_geom"/);
});
