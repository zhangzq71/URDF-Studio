import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAutoFrameRobotChange } from './cameraAutoFrame.ts';

test('auto-frames when the current model scope has not been framed yet', () => {
  assert.equal(
    shouldAutoFrameRobotChange({
      autoFrameOnRobotChange: true,
      currentScopeKey: 'robots/example.urdf',
      lastAutoFramedScopeKey: null,
      focusTarget: null,
      mode: 'detail',
    }),
    true,
  );
});

test('does not auto-frame again after the same model scope was already framed once', () => {
  assert.equal(
    shouldAutoFrameRobotChange({
      autoFrameOnRobotChange: true,
      currentScopeKey: 'robots/example.urdf',
      lastAutoFramedScopeKey: 'robots/example.urdf',
      focusTarget: null,
      mode: 'detail',
    }),
    false,
  );
});

test('skips auto-frame when a specific focus target is active', () => {
  assert.equal(
    shouldAutoFrameRobotChange({
      autoFrameOnRobotChange: true,
      currentScopeKey: 'robots/example.urdf',
      lastAutoFramedScopeKey: null,
      focusTarget: 'arm_link',
      mode: 'detail',
    }),
    false,
  );
});

test('keeps auto-frame enabled in detail mode when no focus target is active', () => {
  assert.equal(
    shouldAutoFrameRobotChange({
      autoFrameOnRobotChange: true,
      currentScopeKey: 'robots/example.urdf',
      lastAutoFramedScopeKey: null,
      focusTarget: null,
      mode: 'detail',
    }),
    true,
  );
});

test('skips auto-frame when the viewer layer is inactive', () => {
  assert.equal(
    shouldAutoFrameRobotChange({
      autoFrameOnRobotChange: true,
      currentScopeKey: 'robots/example.urdf',
      lastAutoFramedScopeKey: null,
      focusTarget: null,
      mode: 'detail',
      active: false,
    }),
    false,
  );
});
