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

test('non-origin helper keeps the resolved selection target', () => {
  const result = resolveHelperSelectionPlan({
    fallbackType: 'link',
    fallbackId: 'base_link',
    helperKind: 'center-of-mass',
    linkObject: null,
  });

  assert.deepEqual(result.selectTarget, { type: 'link', id: 'base_link' });
});
