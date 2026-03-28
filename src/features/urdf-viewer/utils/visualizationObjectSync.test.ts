import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  syncInertiaVisualizationForLinks,
  syncJointAxesVisualizationForJoints,
  syncOriginAxesVisualizationForLinks,
} from './visualizationObjectSync';

test('syncOriginAxesVisualizationForLinks is a no-op on the second identical pass', () => {
  const link = new THREE.Group() as THREE.Group & { isURDFLink?: boolean };
  link.isURDFLink = true;
  link.name = 'base_link';

  const firstChanged = syncOriginAxesVisualizationForLinks({
    links: [link],
    showOrigins: true,
    showOriginsOverlay: false,
    originSize: 0.2,
  });
  const secondChanged = syncOriginAxesVisualizationForLinks({
    links: [link],
    showOrigins: true,
    showOriginsOverlay: false,
    originSize: 0.2,
  });

  assert.equal(firstChanged, true);
  assert.equal(secondChanged, false);
  assert.equal(link.userData.__originAxes.visible, true);
});

test('syncJointAxesVisualizationForJoints is a no-op on the second identical pass', () => {
  const joint = new THREE.Group() as THREE.Group & {
    isURDFJoint?: boolean;
    jointType?: string;
    axis?: THREE.Vector3;
  };
  joint.isURDFJoint = true;
  joint.jointType = 'revolute';
  joint.axis = new THREE.Vector3(0, 0, 1);

  const firstChanged = syncJointAxesVisualizationForJoints({
    joints: [joint],
    showJointAxes: true,
    showJointAxesOverlay: true,
    jointAxisSize: 0.5,
  });
  const secondChanged = syncJointAxesVisualizationForJoints({
    joints: [joint],
    showJointAxes: true,
    showJointAxesOverlay: true,
    jointAxisSize: 0.5,
  });

  assert.equal(firstChanged, true);
  assert.equal(secondChanged, false);
  assert.equal(joint.userData.__jointAxisViz.visible, true);
});

test('syncInertiaVisualizationForLinks is a no-op on the second identical pass', () => {
  const link = new THREE.Group() as THREE.Group & { isURDFLink?: boolean };
  link.isURDFLink = true;
  link.name = 'base_link';
  link.userData.__cachedMaxLinkSize = 1;
  link.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));

  const robotLinks = {
    base_link: {
      inertial: {
        mass: 1,
        inertia: {
          ixx: 1,
          ixy: 0,
          ixz: 0,
          iyy: 1,
          iyz: 0,
          izz: 1,
        },
        origin: {
          xyz: { x: 0, y: 0, z: 0 },
          rpy: { r: 0, p: 0, y: 0 },
        },
      },
    },
  } as any;

  const firstChanged = syncInertiaVisualizationForLinks({
    links: [link],
    robotLinks,
    showInertia: true,
    showInertiaOverlay: true,
    showCenterOfMass: true,
    showCoMOverlay: true,
    centerOfMassSize: 0.01,
  });
  const secondChanged = syncInertiaVisualizationForLinks({
    links: [link],
    robotLinks,
    showInertia: true,
    showInertiaOverlay: true,
    showCenterOfMass: true,
    showCoMOverlay: true,
    centerOfMassSize: 0.01,
  });

  assert.equal(firstChanged, true);
  assert.equal(secondChanged, false);
  assert.equal(link.userData.__inertiaVisualGroup.visible, true);
});
