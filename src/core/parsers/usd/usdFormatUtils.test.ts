import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isLikelyNonRenderableUsdConfigPath,
  pickPreferredUsdRootFile,
} from './usdFormatUtils.ts';

test('treats configuration sidecar USD files as non-root candidates', () => {
  assert.equal(
    isLikelyNonRenderableUsdConfigPath('Go2/usd/configuration/go2_description_physics.usd'),
    true,
  );
  assert.equal(
    isLikelyNonRenderableUsdConfigPath('Go2/usd/go2.usd'),
    false,
  );
});

test('prefers the top-level robot USD over configuration sidecars', () => {
  const files = [
    { name: 'Go2/usd/configuration/go2_description_physics.usd' },
    { name: 'Go2/usd/configuration/go2_description_sensor.usd' },
    { name: 'Go2/usd/go2.usd' },
    { name: 'Go2/usd/configuration/go2_description_base.usd' },
  ];

  const selected = pickPreferredUsdRootFile(files);
  assert.equal(selected?.name, 'Go2/usd/go2.usd');
});
