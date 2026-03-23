import test from 'node:test';
import assert from 'node:assert/strict';

import { GeometryType, type RobotData, type RobotFile } from '@/types';
import { createUsdPlaceholderRobotData, resolveRobotFileData } from './importRobotFile';

function createUsdFile(name = 'robots/demo/demo.usd'): RobotFile {
  return {
    name,
    content: '',
    format: 'usd',
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

test('createUsdPlaceholderRobotData can synthesize a USD placeholder robot', () => {
  const result = createUsdPlaceholderRobotData(createUsdFile('robots/demo/scene.usdz'));

  assert.equal(result.name, 'scene');
  assert.equal(result.rootLinkId, 'usd_scene_root');
  assert.equal(result.links.usd_scene_root?.visual.type, GeometryType.NONE);
  assert.equal(result.links.usd_scene_root?.collision.type, GeometryType.NONE);
});
