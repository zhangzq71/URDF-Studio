import test from 'node:test';
import assert from 'node:assert/strict';

import { GeometryType, type RobotData } from '@/types';
import { syncRobotVisualColorsFromMaterials } from './materials';

test('syncRobotVisualColorsFromMaterials preserves additional visual body colors and collision bodies', () => {
  const robot: RobotData = {
    name: 'so100',
    rootLinkId: 'base',
    materials: {
      base: {
        color: '#ffd11e',
      },
    },
    links: {
      base: {
        id: 'base',
        name: 'base',
        visual: {
          type: GeometryType.MESH,
          meshPath: 'assets/Base.stl',
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#ffd11e',
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
        visualBodies: [{
          type: GeometryType.MESH,
          meshPath: 'assets/Base_Motor.stl',
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#1a1a1a',
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        }],
        collision: {
          type: GeometryType.MESH,
          meshPath: 'assets/Base.stl',
          dimensions: { x: 1, y: 1, z: 1 },
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
        collisionBodies: [{
          type: GeometryType.MESH,
          meshPath: 'assets/Base_Motor.stl',
          dimensions: { x: 1, y: 1, z: 1 },
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        }],
      },
    },
    joints: {},
  };

  const normalized = syncRobotVisualColorsFromMaterials(robot);

  assert.equal(normalized.links.base.visual.color, '#ffd11e');
  assert.equal(normalized.links.base.visualBodies?.[0]?.color, '#1a1a1a');
  assert.equal(normalized.links.base.collision.meshPath, 'assets/Base.stl');
  assert.equal(normalized.links.base.collisionBodies?.[0]?.meshPath, 'assets/Base_Motor.stl');
});

test('syncRobotVisualColorsFromMaterials still syncs the primary visual color from robot materials', () => {
  const robot: RobotData = {
    name: 'single_visual',
    rootLinkId: 'base_link',
    materials: {
      base_link: {
        color: '#123456',
      },
    },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visual: {
          type: GeometryType.BOX,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#abcdef',
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
        collision: {
          type: GeometryType.BOX,
          dimensions: { x: 1, y: 1, z: 1 },
          origin: {
            xyz: { x: 0, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
          },
        },
      },
    },
    joints: {},
  };

  const normalized = syncRobotVisualColorsFromMaterials(robot);

  assert.equal(normalized.links.base_link.visual.color, '#123456');
});
