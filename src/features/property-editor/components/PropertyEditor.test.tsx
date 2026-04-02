import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RobotState } from '@/types';
import { GeometryType, JointType } from '@/types';
import { translations } from '@/shared/i18n';
import { PropertyEditor } from './PropertyEditor.tsx';

function createRobot(): RobotState {
  return {
    name: 'demo',
    rootLinkId: 'base_link',
    selection: {
      type: 'link',
      id: 'base_link',
      subType: 'visual',
      objectIndex: 0,
    },
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.BOX,
          dimensions: { x: 0.4, y: 0.3, z: 0.2 },
          color: '#ff0000',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        visualBodies: [],
        collision: {
          type: GeometryType.BOX,
          dimensions: { x: 0.4, y: 0.3, z: 0.2 },
          color: '#00ff00',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [],
        inertial: {
          mass: 1,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
      thigh_link: {
        id: 'thigh_link',
        name: 'thigh_link',
        visible: true,
        visual: {
          type: GeometryType.BOX,
          dimensions: { x: 0.2, y: 0.2, z: 0.2 },
          color: '#0000ff',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        visualBodies: [],
        collision: {
          type: GeometryType.BOX,
          dimensions: { x: 0.2, y: 0.2, z: 0.2 },
          color: '#0000ff',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [],
        inertial: {
          mass: 1,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
        },
      },
    },
    joints: {
      hip_joint: {
        id: 'hip_joint',
        name: 'hip_joint',
        type: JointType.REVOLUTE,
        parentLinkId: 'base_link',
        childLinkId: 'thigh_link',
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        axis: { x: 0, y: 0, z: 1 },
        limit: { lower: -1, upper: 1, effort: 10, velocity: 5 },
        dynamics: { damping: 0, friction: 0 },
        hardware: {
          armature: 0,
          motorType: '',
          motorId: '',
          motorDirection: 1,
        },
      },
    },
  };
}

function renderPropertyEditor() {
  return renderToStaticMarkup(
    React.createElement(PropertyEditor as any, {
      robot: createRobot(),
      onUpdate: () => {},
      mode: 'editor',
      assets: {},
      onUploadAsset: () => {},
      motorLibrary: {},
      lang: 'en',
      theme: 'light',
    }),
  );
}

test('link selection stays link-scoped without rendering embedded joint properties', () => {
  const markup = renderPropertyEditor();

  assert.doesNotMatch(markup, new RegExp(translations.en.selectedJoint));
  assert.match(markup, /base_link/);
});

test('link selection does not leak the related joint into the property panel header or body', () => {
  const markup = renderPropertyEditor();

  assert.doesNotMatch(markup, new RegExp(translations.en.selectedJoint));
  assert.doesNotMatch(markup, /hip_joint/);
  assert.match(markup, /base_link/);
});
