import assert from 'node:assert/strict';
import test from 'node:test';
import { format } from 'node:util';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { GeometryType, type UrdfLink } from '@/types';
import { useSelectionStore } from '@/store/selectionStore';
import { GeometryRenderer } from './GeometryRenderer';

function withSilencedR3fDomWarnings(run: () => string) {
  const originalConsoleError = console.error;
  const expectedWarnings = [
    'Received `true` for a non-boolean attribute `visible`.',
    'React does not recognize the `userData` prop on a DOM element.',
    '<boxGeometry /> is using incorrect casing.',
  ];

  console.error = (...args: unknown[]) => {
    const message = format(...args);
    if (expectedWarnings.some((warning) => message.includes(warning))) {
      return;
    }

    originalConsoleError(...args);
  };

  try {
    return run();
  } finally {
    console.error = originalConsoleError;
  }
}

function createLink(): UrdfLink {
  return {
    id: 'base_link',
    name: 'base_link',
    visible: true,
    visual: {
      type: GeometryType.BOX,
      dimensions: { x: 0.4, y: 0.3, z: 0.2 },
      color: '#6b7280',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
    },
    visualBodies: [],
    collision: {
      type: GeometryType.BOX,
      dimensions: { x: 0.2, y: 0.2, z: 0.2 },
      color: '#a855f7',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
    },
    collisionBodies: [],
    inertial: {
      mass: 1,
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
    },
  };
}

test('GeometryRenderer renders skeleton visual geometry without unresolved skeleton-style refs', () => {
  useSelectionStore.getState().clearHover();
  useSelectionStore.getState().clearSelection();

  const markup = withSilencedR3fDomWarnings(() => renderToStaticMarkup(
    React.createElement(GeometryRenderer, {
      isCollision: false,
      link: createLink(),
      mode: 'skeleton',
      showGeometry: true,
      showCollision: true,
      modelOpacity: 1,
      interactionLayerPriority: ['visual'],
      assets: {},
      isSelected: false,
      onLinkClick: () => {},
    }),
  ));

  assert.match(markup, /boxgeometry/i);
  assert.match(markup, /group/i);
});
