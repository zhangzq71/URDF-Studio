import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  syncInertiaVisualizationForLinks,
  syncJointHelperInteractionStateForJoints,
  syncJointAxesVisualizationForJoints,
  syncLinkHelperInteractionStateForLinks,
  syncOriginAxesVisualizationForLinks,
} from './visualizationObjectSync.ts';

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

test('syncJointHelperInteractionStateForJoints promotes hovered joint-axis helpers', () => {
  const joint = new THREE.Group() as THREE.Group & {
    isURDFJoint?: boolean;
    jointType?: string;
    axis?: THREE.Vector3;
  };
  joint.isURDFJoint = true;
  joint.name = 'hip_joint';
  joint.jointType = 'revolute';
  joint.axis = new THREE.Vector3(0, 0, 1);

  syncJointAxesVisualizationForJoints({
    joints: [joint],
    showJointAxes: true,
    showJointAxesOverlay: true,
    jointAxisSize: 0.5,
  });

  const helper = joint.userData.__jointAxisViz as THREE.Object3D;
  const mesh = helper.children.find((child: any) => child.isMesh) as THREE.Mesh;
  const baseRenderOrder = mesh.renderOrder;

  const changed = syncJointHelperInteractionStateForJoints({
    joints: [joint],
    hoveredJointId: 'hip_joint',
  });

  assert.equal(changed, true);
  assert.equal(helper.scale.x, 1);
  assert.equal(helper.scale.y, 1);
  assert.equal(helper.scale.z, 1);
  assert.ok(mesh.renderOrder > baseRenderOrder);
  assert.equal((mesh.material as THREE.MeshBasicMaterial).color.getHex(), 0xfbbf24);
});

test('syncLinkHelperInteractionStateForLinks keeps hovered origin axes at a stable scale', () => {
  const link = new THREE.Group() as THREE.Group & { isURDFLink?: boolean };
  link.isURDFLink = true;
  link.name = 'base_link';

  syncOriginAxesVisualizationForLinks({
    links: [link],
    showOrigins: true,
    showOriginsOverlay: true,
    originSize: 0.2,
  });

  const originAxes = link.userData.__originAxes as THREE.Object3D;
  const originMesh = originAxes.children.find((child: any) => child.isMesh) as THREE.Mesh;
  const baseRenderOrder = originMesh.renderOrder;

  const changed = syncLinkHelperInteractionStateForLinks({
    links: [link],
    hoveredLinkId: 'base_link',
    hoveredHelperKind: 'origin-axes',
  });

  assert.equal(changed, true);
  assert.equal(originAxes.scale.x, 1);
  assert.equal(originAxes.scale.y, 1);
  assert.equal(originAxes.scale.z, 1);
  assert.ok(originMesh.renderOrder > baseRenderOrder);
});

test('syncLinkHelperInteractionStateForLinks boosts hovered inertia helpers', () => {
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

  syncInertiaVisualizationForLinks({
    links: [link],
    robotLinks,
    showInertia: true,
    showInertiaOverlay: true,
    showCenterOfMass: true,
    showCoMOverlay: true,
    centerOfMassSize: 0.01,
  });

  const comVisual = link.userData.__comVisual as THREE.Object3D;
  const comMesh = comVisual.children[0] as THREE.Mesh;
  const baseOpacity = (comMesh.material as THREE.MeshBasicMaterial).opacity;
  const baseRenderOrder = comMesh.renderOrder;

  const changed = syncLinkHelperInteractionStateForLinks({
    links: [link],
    hoveredLinkId: 'base_link',
  });

  assert.equal(changed, true);
  assert.ok(comVisual.scale.x > 1);
  assert.ok((comMesh.material as THREE.MeshBasicMaterial).opacity >= baseOpacity);
  assert.ok(comMesh.renderOrder > baseRenderOrder);
});

test('syncLinkHelperInteractionStateForLinks scopes hover to the active helper kind', () => {
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

  syncInertiaVisualizationForLinks({
    links: [link],
    robotLinks,
    showInertia: true,
    showInertiaOverlay: true,
    showCenterOfMass: true,
    showCoMOverlay: true,
    centerOfMassSize: 0.01,
  });

  const comVisual = link.userData.__comVisual as THREE.Object3D;
  const inertiaGroup = link.userData.__inertiaVisualGroup as THREE.Object3D;
  const inertiaBox = inertiaGroup.children.find((child) => child.name === '__inertia_box__') as THREE.Object3D;

  const changed = syncLinkHelperInteractionStateForLinks({
    links: [link],
    hoveredLinkId: 'base_link',
    hoveredHelperKind: 'center-of-mass',
  });

  assert.equal(changed, true);
  assert.ok(comVisual.scale.x > 1);
  assert.equal(inertiaBox.scale.x, 1);
});
