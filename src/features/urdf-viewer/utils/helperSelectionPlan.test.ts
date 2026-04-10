import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { resolveHelperSelectionPlan } from './helperSelectionPlan.ts';

function createUrdfLink(name: string): THREE.Group {
  const link = new THREE.Group() as THREE.Group & { isURDFLink?: boolean; type?: string };
  link.name = name;
  link.isURDFLink = true;
  link.type = 'URDFLink';
  return link;
}

test('origin-axes helper selects the parent joint when available', () => {
  const joint = new THREE.Group() as THREE.Group & { isURDFJoint?: boolean; type?: string };
  joint.name = 'hip_joint';
  joint.isURDFJoint = true;
  joint.type = 'URDFJoint';

  const link = createUrdfLink('thigh_link');
  joint.add(link);

  const result = resolveHelperSelectionPlan({
    fallbackType: 'link',
    fallbackId: 'thigh_link',
    helperKind: 'origin-axes',
    linkObject: link,
  });

  assert.deepEqual(result.selectTarget, { type: 'joint', id: 'hip_joint' });
});

test('origin-axes helper walks up through wrapper groups to find the owning joint', () => {
  const joint = new THREE.Group() as THREE.Group & { isURDFJoint?: boolean; type?: string };
  joint.name = 'knee_joint';
  joint.isURDFJoint = true;
  joint.type = 'URDFJoint';

  const wrapper = new THREE.Group();
  const link = createUrdfLink('shin_link');

  joint.add(wrapper);
  wrapper.add(link);

  const result = resolveHelperSelectionPlan({
    fallbackType: 'link',
    fallbackId: 'shin_link',
    helperKind: 'origin-axes',
    linkObject: link,
  });

  assert.deepEqual(result.selectTarget, { type: 'joint', id: 'knee_joint' });
});

test('origin-axes helper falls back to the first child joint when the link has no parent joint', () => {
  const fixedJoint = new THREE.Group() as THREE.Group & {
    isURDFJoint?: boolean;
    type?: string;
    jointType?: string;
  };
  fixedJoint.name = 'fixed_mount';
  fixedJoint.isURDFJoint = true;
  fixedJoint.type = 'URDFJoint';
  fixedJoint.jointType = 'fixed';

  const revoluteJoint = new THREE.Group() as THREE.Group & {
    isURDFJoint?: boolean;
    type?: string;
    jointType?: string;
  };
  revoluteJoint.name = 'hip_joint';
  revoluteJoint.isURDFJoint = true;
  revoluteJoint.type = 'URDFJoint';
  revoluteJoint.jointType = 'revolute';

  const link = createUrdfLink('base_link');
  link.add(fixedJoint);
  link.add(revoluteJoint);

  const result = resolveHelperSelectionPlan({
    fallbackType: 'link',
    fallbackId: 'base_link',
    helperKind: 'origin-axes',
    linkObject: link,
  });

  assert.deepEqual(result.selectTarget, { type: 'joint', id: 'hip_joint' });
});

test('non-origin helper keeps the resolved selection target', () => {
  const result = resolveHelperSelectionPlan({
    fallbackType: 'link',
    fallbackId: 'base_link',
    helperKind: 'center-of-mass',
    linkObject: null,
  });

  assert.deepEqual(result.selectTarget, { type: 'link', id: 'base_link' });
});
