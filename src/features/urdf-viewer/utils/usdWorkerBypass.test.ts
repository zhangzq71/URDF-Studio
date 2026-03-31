import { describe, expect, test } from 'vitest';
import { shouldBypassUsdWorkerPipeline } from './usdWorkerBypass';

describe('shouldBypassUsdWorkerPipeline', () => {
  test('keeps every USD bundle on the same worker preparation path', () => {
    expect(shouldBypassUsdWorkerPipeline('/unitree_model/B2/usd/b2.usd')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('/unitree_model/B2/usd/b2.viewer_roundtrip.usd')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('/unitree_model/b2w/usd/b2w.usd?cache=1')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('b2.usd')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('b2.viewer_roundtrip.usd')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('B2W.USD')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('/unitree_model/Go2/usd/go2.usd')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline('/robots/custom/usd/demo.usd')).toBe(false);
    expect(shouldBypassUsdWorkerPipeline(null)).toBe(false);
  });
});
