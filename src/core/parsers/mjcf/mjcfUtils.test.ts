import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

import {
    parseCompilerSettings,
    parseMJCFDefaults,
    parseMaterialAssets,
    parseMeshAssets,
    parseOrientationAsQuat,
    parseTextureAssets,
    resolveDefaultClassQName,
    resolveElementAttributes,
} from './mjcfUtils.ts';

function parseXmlDocument(xml: string): Document {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { contentType: 'text/html' });
    const parser = new dom.window.DOMParser();
    return parser.parseFromString(xml, 'text/xml');
}

function assertCloseArray(actual: number[] | undefined, expected: number[], tolerance: number = 1e-6): void {
    assert.ok(actual, 'expected array to be defined');
    assert.equal(actual.length, expected.length);
    actual.forEach((value, index) => {
        assert.ok(Math.abs(value - expected[index]!) <= tolerance, `index ${index}: expected ${expected[index]}, got ${value}`);
    });
}

test('treats top-level main defaults as active root defaults', () => {
    const doc = parseXmlDocument(`
        <mujoco model="main-defaults">
          <default class="main">
            <geom group="1" contype="0" conaffinity="1" mass="0" />
          </default>
          <worldbody>
            <body name="base">
              <geom type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
    `);

    const defaults = parseMJCFDefaults(doc);
    const geomElement = doc.querySelector('worldbody body geom');

    assert.ok(geomElement);
    const resolved = resolveElementAttributes(defaults, 'geom', geomElement);

    assert.equal(resolved.group, '1');
    assert.equal(resolved.contype, '0');
    assert.equal(resolved.conaffinity, '1');
    assert.equal(resolved.mass, '0');
});

test('does not leak sibling class defaults through active childclass scope', () => {
    const doc = parseXmlDocument(`
        <mujoco model="sibling-defaults">
          <default class="cassie">
            <geom material="cassie" group="1" contype="0" conaffinity="1" />
          </default>
          <default class="collision">
            <geom group="3" contype="1" conaffinity="0" />
          </default>
          <worldbody>
            <body name="pelvis" childclass="cassie">
              <geom class="collision" type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
    `);

    const defaults = parseMJCFDefaults(doc);
    const bodyElement = doc.querySelector('worldbody body');
    const geomElement = doc.querySelector('worldbody body geom');

    assert.ok(bodyElement);
    assert.ok(geomElement);

    const activeClassQName = resolveDefaultClassQName(defaults, bodyElement.getAttribute('childclass'));
    const resolved = resolveElementAttributes(defaults, 'geom', geomElement, activeClassQName);

    assert.equal(resolved.material, undefined);
    assert.equal(resolved.group, '3');
    assert.equal(resolved.contype, '1');
    assert.equal(resolved.conaffinity, '0');
});

test('keeps inherited defaults when explicit class is nested under the active class', () => {
    const doc = parseXmlDocument(`
        <mujoco model="nested-defaults">
          <default class="main">
            <geom material="visual" group="1" contype="0" conaffinity="1" />
            <default class="collision">
              <geom group="3" />
            </default>
          </default>
          <worldbody>
            <body name="pelvis" childclass="main">
              <geom class="collision" type="box" size="0.1 0.1 0.1" />
            </body>
          </worldbody>
        </mujoco>
    `);

    const defaults = parseMJCFDefaults(doc);
    const bodyElement = doc.querySelector('worldbody body');
    const geomElement = doc.querySelector('worldbody body geom');

    assert.ok(bodyElement);
    assert.ok(geomElement);

    const activeClassQName = resolveDefaultClassQName(defaults, bodyElement.getAttribute('childclass'));
    const resolved = resolveElementAttributes(defaults, 'geom', geomElement, activeClassQName);

    assert.equal(resolved.material, 'visual');
    assert.equal(resolved.group, '3');
    assert.equal(resolved.contype, '0');
    assert.equal(resolved.conaffinity, '1');
});

test('parses intrinsic euler and xyaxes orientations using compiler settings', () => {
    const doc = parseXmlDocument(`
        <mujoco model="orientation">
          <compiler eulerseq="zyx" />
        </mujoco>
    `);

    const settings = parseCompilerSettings(doc);
    const eulerQuat = parseOrientationAsQuat({ euler: '0 0 90' }, settings);
    const xyaxesQuat = parseOrientationAsQuat({ xyaxes: '0 0 -1 0 1 0' }, settings);

    assertCloseArray(eulerQuat, [0.70710678, 0.70710678, 0, 0], 1e-5);
    assertCloseArray(xyaxesQuat, [0.70710678, 0, 0.70710678, 0], 1e-5);
});

test('parses extrinsic uppercase euler sequences using MuJoCo semantics', () => {
    const doc = parseXmlDocument(`
        <mujoco model="orientation">
          <compiler eulerseq="ZYX" angle="degree" />
        </mujoco>
    `);

    const settings = parseCompilerSettings(doc);
    const quat = parseOrientationAsQuat({ euler: '90 0 0' }, settings);

    assertCloseArray(quat, [0.70710678, 0, 0, 0.70710678], 1e-5);
});

test('inherits texture-backed material defaults from asset declarations', () => {
    const doc = parseXmlDocument(`
        <mujoco model="materials">
          <compiler texturedir="assets" />
          <default>
            <material specular="0" shininess="0.25" />
          </default>
          <asset>
            <texture name="base" type="2d" file="base.png" />
            <material name="paint" texture="base" texrepeat="2 3" texuniform="true" />
          </asset>
        </mujoco>
    `);

    const defaults = parseMJCFDefaults(doc);
    const compiler = parseCompilerSettings(doc);
    const materials = parseMaterialAssets(doc, defaults);
    const textures = parseTextureAssets(doc, compiler, defaults);

    assert.deepEqual(textures.get('base'), {
        name: 'base',
        file: 'assets/base.png',
        type: '2d',
        builtin: undefined,
    });
    assert.deepEqual(materials.get('paint'), {
        name: 'paint',
        rgba: undefined,
        shininess: 0.25,
        specular: 0,
        reflectance: undefined,
        emission: undefined,
        texture: 'base',
        texrepeat: [2, 3],
        texuniform: true,
    });
});

test('parses mesh asset refquat and refpos metadata', () => {
    const doc = parseXmlDocument(`
        <mujoco model="mesh-refs">
          <asset>
            <mesh name="finger" file="finger.stl" refpos="1 2 3" refquat="0 0 0 1" />
          </asset>
        </mujoco>
    `);

    const meshes = parseMeshAssets(doc);

    assert.deepEqual(meshes.get('finger'), {
        name: 'finger',
        file: 'finger.stl',
        scale: undefined,
        refpos: [1, 2, 3],
        refquat: [0, 0, 0, 1],
    });
});
