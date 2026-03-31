import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveActiveViewerJointKeyFromSelection } from './activeJointSelection.ts';

test('resolveActiveViewerJointKeyFromSelection resolves a controllable joint selection by key', () => {
  const joints = {
    hip_joint: {
      name: 'hip_joint',
      jointType: 'revolute',
      child: { name: 'upper_leg' },
    },
  };

  assert.equal(
    resolveActiveViewerJointKeyFromSelection(joints, { type: 'joint', id: 'hip_joint' }),
    'hip_joint',
  );
});

test('resolveActiveViewerJointKeyFromSelection resolves the parent joint for a selected child link', () => {
  const joints = {
    knee_joint: {
      name: 'knee_joint',
      jointType: 'continuous',
      child: { name: 'lower_leg' },
    },
  };

  assert.equal(
    resolveActiveViewerJointKeyFromSelection(joints, { type: 'link', id: 'lower_leg' }),
    'knee_joint',
  );
});

test('resolveActiveViewerJointKeyFromSelection resolves the parent joint for structured joints using childLinkId', () => {
  const joints = {
    ankle_joint: {
      id: 'ankle_joint',
      name: 'ankle_joint',
      type: 'revolute',
      childLinkId: 'foot_link',
    },
  };

  assert.equal(
    resolveActiveViewerJointKeyFromSelection(joints, { type: 'link', id: 'foot_link' }),
    'ankle_joint',
  );
});

test('resolveActiveViewerJointKeyFromSelection ignores non-controllable joints', () => {
  const joints = {
    base_fixed_joint: {
      name: 'base_fixed_joint',
      jointType: 'fixed',
      child: { name: 'base_link' },
    },
  };

  assert.equal(
    resolveActiveViewerJointKeyFromSelection(joints, { type: 'joint', id: 'base_fixed_joint' }),
    null,
  );
});
