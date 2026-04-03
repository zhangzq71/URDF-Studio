const USD_GROUND_ALIGNMENT_SETTLE_DELAYS_MS = [
  0,
  90,
  240,
  520,
  980,
  1500,
  2400,
  3200,
  4200,
  5600,
  7200,
] as const;

export function resolveUsdGroundAlignmentSettleDelaysMs(
  stageSourcePath: string | null | undefined,
): readonly number[] {
  void stageSourcePath;
  return USD_GROUND_ALIGNMENT_SETTLE_DELAYS_MS;
}
